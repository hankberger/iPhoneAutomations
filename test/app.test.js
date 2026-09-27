import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import app from '../src/worker.js';
import { createBilling } from '../src/billing.js';

// Fake Workers AI binding: records calls and reports fixed usage so billing is predictable.
function fakeAi() {
  const calls = [];
  const run = async (model, input) => {
    calls.push({ model, input });
    if (model === '@cf/meta/llama-3.1-8b-instruct-fp8-fast' && input.messages?.[0]?.content === 'fail') {
      throw new Error('AiError: 5006: bad input');
    }
    return { response: 'hi', usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } };
  };
  return { run, calls };
}

async function boot() {
  const db = memoryD1();
  const ai = fakeAi();
  const env = { DB: db, AI: ai, APP_URL: 'http://localhost' };
  let cookie = '';
  const req = async (path, opts = {}) => {
    const res = await app.fetch(new Request(`http://localhost${path}`, { redirect: 'manual', ...opts, headers: { cookie, ...opts.headers } }), env);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const form = (path, data) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
  return { db, ai, req, form };
}

test('pages render', async () => {
  const { req } = await boot();
  for (const p of ['/', '/automations', '/automations/reply-drafter', '/pricing', '/login', '/signup']) {
    assert.equal((await req(p)).status, 200, p);
  }
  assert.equal((await req('/automations/nope')).status, 404);
  assert.match((await req('/')).headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await req('/webhooks/stripe', { method: 'POST', body: '{}' })).status, 400, 'webhook refuses without config');
  assert.equal((await req('/account')).status, 302);
});

test('signup, login, csrf, keys and metered Cloudflare proxy', async () => {
  const { db, ai, req, form } = await boot();
  assert.equal((await form('/signup', { email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await form('/signup', { email: 'A@b.co', password: 'correct horse battery' })).status, 303);
  assert.equal((await form('/signup', { email: 'a@b.co', password: 'correct horse battery' })).status, 409);

  let html = await (await req('/account')).text();
  assert.match(html, /a@b\.co/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];

  assert.equal((await form('/account/keys', { csrf: 'wrong', name: 'x' })).status, 403);
  html = await (await form('/account/keys', { csrf, name: 'Phone' })).text();
  const key = html.match(/aa_live_[\w-]+/)[0];

  const post = (path, body, k = key) => req(path, {
    method: 'POST', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post('/api/v1/generate', { prompt: 'hi' }, 'aa_live_nope')).status, 401);
  assert.equal((await post('/api/v1/generate', { prompt: 'hi' })).status, 402, 'no credit');
  assert.equal(ai.calls.length, 0, 'no upstream call without credit');

  // Simulate a paid Stripe checkout.
  const billing = createBilling(db, { stripeKey: '' });
  const session = { id: 'cs_test_1', payment_status: 'paid', metadata: { user_id: '1', credit_micros: '5000000' } };
  assert.equal(await billing.fulfillCheckout(session), true);
  assert.equal(await billing.fulfillCheckout(session), false, 'idempotent');
  assert.equal(await billing.balance(1), 5_000_000, 'replay did not double-credit');

  // Shortcuts-friendly endpoint, default model (Llama 3.3 70B: $0.293 in / $2.253 out per M).
  let res = await post('/api/v1/generate', { prompt: 'Summarize', input: 'text', max_tokens: 500 });
  let json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.text, 'hi');
  // (1000 * 0.293 + 200 * 2.253) * 1.5 = 1115.4, rounded up to 1116 micro-dollars
  assert.equal(json.cost_usd, 0.001116);
  const call = ai.calls.at(-1);
  assert.equal(call.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.match(call.input.messages[0].content, /<input>\ntext\n<\/input>/);
  assert.equal(call.input.stream, false);

  // Pass-through endpoint mirrors Cloudflare's /ai/run/{model}.
  res = await post('/api/v1/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast', { messages: [{ role: 'user', content: 'hey' }] });
  json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.result.response, 'hi');
  // (1000 * 0.045 + 200 * 0.384) * 1.5 = 182.7 -> 183
  assert.equal(json.billing.cost_usd, 0.000183);
  assert.equal(ai.calls.at(-1).input.max_tokens, 1024, 'default max_tokens is explicit');

  // Upstream errors refund the reservation; unknown models and streaming are rejected before any call.
  const before = await billing.balance(1);
  res = await post('/api/v1/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast', { messages: [{ role: 'user', content: 'fail' }] });
  assert.equal(res.status, 400);
  assert.equal(await billing.balance(1), before);
  const n = ai.calls.length;
  assert.equal((await post('/api/v1/ai/run/@cf/black-forest-labs/flux-1-schnell', { prompt: 'x' })).status, 400);
  assert.equal((await post('/api/v1/generate', { prompt: 'x', stream: true })).status, 200, 'generate ignores stream');
  assert.equal((await post('/api/v1/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast', { prompt: 'x', stream: true })).status, 400);
  assert.equal(ai.calls.length, n + 1);

  assert.equal(await billing.balance(1), 5_000_000 - 1116 - 183 - 1116);
  const ledger = await billing.history(1);
  assert.equal(ledger.filter((l) => l.kind === 'usage').length, 3);

  assert.equal((await form('/logout', { csrf })).status, 303);
  assert.equal((await req('/account')).status, 302);
  assert.equal((await form('/login', { email: 'a@b.co', password: 'wrong password!' })).status, 401);
  assert.equal((await form('/login', { email: 'a@b.co', password: 'correct horse battery' })).status, 303);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { createBilling } from '../src/billing.js';

// Fake Anthropic client: fixed usage so billing is predictable.
const fakeClient = {
  messages: { create: async (p) => ({ model: p.model, stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: 'text', text: 'hi' }] }) },
  beta: { messages: { create: async (p) => ({ model: p.model, stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: 'text', text: 'hi' }] }) } },
};

async function boot() {
  const db = openDb(':memory:');
  const app = createApp({ db, appUrl: 'http://localhost', inferenceClient: fakeClient });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const req = async (path, opts = {}) => {
    const res = await fetch(base + path, { redirect: 'manual', ...opts, headers: { cookie, ...opts.headers } });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const form = (path, data) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });
  return { db, server, req, form };
}

test('pages render', async () => {
  const { server, req } = await boot();
  for (const p of ['/', '/automations', '/automations/reply-drafter', '/pricing', '/login', '/signup']) {
    assert.equal((await req(p)).status, 200, p);
  }
  assert.equal((await req('/automations/nope')).status, 404);
  assert.equal((await req('/account')).status, 302);
  server.close();
});

test('signup, login, csrf, keys and metered inference', async () => {
  const { db, server, req, form } = await boot();
  assert.equal((await form('/signup', { email: 'a@b.co', password: 'short' })).status, 400);
  const signup = await form('/signup', { email: 'A@b.co', password: 'correct horse battery' });
  assert.equal(signup.status, 303);
  assert.equal((await form('/signup', { email: 'a@b.co', password: 'correct horse battery' })).status, 409);

  let html = await (await req('/account')).text();
  assert.match(html, /a@b\.co/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];

  assert.equal((await form('/account/keys', { csrf: 'wrong', name: 'x' })).status, 403);
  html = await (await form('/account/keys', { csrf, name: 'Phone' })).text();
  const key = html.match(/aa_live_[\w-]+/)[0];

  const call = (body) => fetch(`http://localhost:${server.address().port}/api/v1/generate`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await call({ prompt: 'hi' })).status, 402, 'no credit');

  // Simulate a paid Stripe checkout.
  const billing = createBilling(db, { stripeKey: '' });
  const session = { id: 'cs_test_1', payment_status: 'paid', metadata: { user_id: '1', credit_micros: '5000000' } };
  assert.equal(billing.fulfillCheckout(session), true);
  assert.equal(billing.fulfillCheckout(session), false, 'idempotent');
  assert.equal(billing.balance(1), 5_000_000);

  const res = await call({ prompt: 'hi', model: 'claude-haiku-4-5', max_tokens: 500 });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.text, 'hi');
  // (1000 * $1 + 200 * $5) per MTok * 1.5 markup = $0.003
  assert.equal(json.cost_usd, 0.003);
  assert.equal(billing.balance(1), 5_000_000 - 3000);

  assert.equal((await form('/logout', { csrf })).status, 303);
  assert.equal((await req('/account')).status, 302);
  assert.equal((await form('/login', { email: 'a@b.co', password: 'wrong password!' })).status, 401);
  assert.equal((await form('/login', { email: 'a@b.co', password: 'correct horse battery' })).status, 303);
  server.close();
});

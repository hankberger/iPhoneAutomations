import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import { createAuth } from '../src/auth.js';
import { sealToken, openToken, deleteAccount } from '../src/privacy.js';
import app from '../src/worker.js';

const secret = 'a1'.repeat(32);
async function fixture() {
  const db = memoryD1();
  db.raw.exec("INSERT INTO users (id,email,password_hash,balance_micros,created_at) VALUES (1,'first@example.com','',5000000,0),(2,'second@example.com','',0,0)");
  const auth = createAuth(db);
  const key = await auth.createApiKey(1, 'app', { canMint: true });
  const shortcut = await auth.createApiKey(1, 'shortcut');
  const other = await auth.createApiKey(2, 'other', { canMint: true });
  const calls = [];
  const env = { DB: db, AI: { run: async (...args) => { calls.push(args); return { response: 'ok' }; } }, GATEWAY: { image: async () => { calls.push('image'); return {}; } } };
  const req = (path, body, bearer = key) => app.fetch(new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${bearer}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
  return { db, auth, req, key, shortcut, other, calls, env };
}

test('Apple token vault encrypts with unique nonces and binds ciphertext to the Apple subject', async () => {
  const a = await sealToken('private-refresh', secret, 'subject');
  const b = await sealToken('private-refresh', secret, 'subject');
  assert.notEqual(a, b);
  assert.ok(!a.includes('private-refresh'));
  assert.equal(await openToken(a, secret, 'subject'), 'private-refresh');
  await assert.rejects(openToken(a, secret, 'another-subject'));
  await assert.rejects(openToken(a, 'ff'.repeat(32), 'subject'));
  const [iv, cipher] = a.split('.');
  const changed = Buffer.from(cipher, 'base64'); changed[0] ^= 1;
  await assert.rejects(openToken(`${iv}.${changed.toString('base64')}`, secret, 'subject'));
  await assert.rejects(sealToken('token', '', 'subject'), /unavailable/);
});

test('account-wide consent blocks every inference path before upstream or debit, and cannot be granted by a shortcut key', async () => {
  const { req, db, calls, shortcut } = await fixture();
  const paths = ['/api/v1/generate', '/api/v1/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast', '/api/v1/run/ask-ai', '/api/v1/run/meeting-notes', '/api/v1/run/make-an-image'];
  for (const path of paths) assert.equal((await req(path, { input: 'private text' }, shortcut)).status, 403, path);
  assert.equal(calls.length, 0);
  assert.equal(db.raw.prepare('SELECT balance_micros FROM users WHERE id=1').get().balance_micros, 5_000_000);
  assert.equal((await req('/api/v1/account/privacy', { version: 1, allowed: true }, shortcut)).status, 403);
  assert.equal((await req('/api/v1/account/privacy', { version: 0, allowed: true })).status, 400);
  assert.equal((await req('/api/v1/account/privacy', { version: 1, allowed: true })).status, 200);
  assert.equal((await req('/api/v1/generate', { prompt: 'hello' }, shortcut)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await req('/api/v1/account/privacy', { version: 1, allowed: false })).status, 200);
  assert.equal((await req('/api/v1/generate', { prompt: 'private text' }, shortcut)).status, 403);
  assert.equal(calls.length, 1);
});

test('account routes require app authority, confirmation, ownership and valid signed purchase data', async () => {
  const { req, shortcut, other, db, env } = await fixture();
  for (const path of ['/api/v1/store', '/api/v1/account', '/api/v1/account/privacy']) {
    assert.equal((await req(path, undefined, shortcut)).status, 403);
    assert.equal((await req(path, undefined, 'invalid')).status, 401);
  }
  assert.equal((await req('/api/v1/account/delete', { confirmation: 'DELETE' }, shortcut)).status, 403);
  assert.equal((await req('/api/v1/account/delete', {})).status, 400);
  const response = await req('/api/v1/store');
  assert.match(response.headers.get('cache-control'), /no-store/);
  const config = await response.json();
  assert.equal(config.enabled, false);
  assert.equal(config.products.length, 4);
  assert.notEqual(config.app_account_token, (await (await req('/api/v1/store', undefined, other)).json()).app_account_token);
  assert.equal((await req('/api/v1/store/purchase', { signed_transaction: 'forged' })).status, 503);
  Object.assign(env, { APP_STORE_ISSUER_ID: 'test', APP_STORE_KEY_ID: 'test', APP_STORE_PRIVATE_KEY: 'unused', APP_STORE_APP_ID: '123' });
  assert.equal((await req('/api/v1/store/purchase', { signed_transaction: 'forged' })).status, 400);
  assert.equal((await req('/webhooks/apple', { signedPayload: 'forged' })).status, 400);
  const targetKey = db.raw.prepare('SELECT id FROM api_keys WHERE user_id=1').get().id;
  await req('/api/v1/account/keys/revoke', { id: targetKey }, other);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM api_keys WHERE id=?').get(targetKey).revoked_at, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 0);
});

test('deletion waits for Apple revocation, then removes personal data and unlinks transaction tombstones', async () => {
  const { db, auth, key, shortcut } = await fixture();
  const session = await auth.startSession(1);
  db.raw.exec("INSERT INTO identities(provider,subject,user_id,email,created_at) VALUES('apple','apple-sub',1,'first@example.com',0)");
  db.raw.exec("INSERT INTO analytics_events(event_name,user_id,created_at) VALUES('test',1,0)");
  db.raw.exec("INSERT INTO ledger(user_id,kind,amount_micros,description,created_at) VALUES(1,'usage',-1,'test',0)");
  db.raw.exec("INSERT INTO app_store_transactions(id,user_id,product_id,environment,credit_micros,created_at) VALUES('Production:1',1,'test','Production',5000000,0)");
  const apple = { clientId: 'service-id', clientSecret: async () => 'signed-client-secret' };
  const env = { TOKEN_ENCRYPTION_KEY: secret, ACCOUNT_DELETION_ENABLED: 'true' };
  await assert.rejects(deleteAccount(db, 1, {}, apple), /temporarily unavailable/);
  await assert.rejects(deleteAccount(db, 1, env, apple), /Sign in with Apple again/);
  db.raw.prepare("UPDATE identities SET revocation_token=? WHERE subject='apple-sub'").run(await sealToken('refresh-secret', secret, 'apple-sub'));
  await assert.rejects(deleteAccount(db, 1, env, apple, async () => new Response('', { status: 503 })), /retry/);
  assert.ok(await auth.apiKeyUser(key), 'failure preserves account and access');
  await deleteAccount(db, 1, env, apple, async (url, init) => {
    assert.equal(url, 'https://appleid.apple.com/auth/revoke');
    assert.equal(init.body.get('token'), 'refresh-secret');
    assert.equal(init.body.get('client_id'), 'service-id');
    return new Response('');
  });
  for (const table of ['identities', 'ledger', 'analytics_events', 'api_keys', 'sessions']) {
    assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=1`).get().n, 0, table);
  }
  assert.equal(await auth.apiKeyUser(key), null);
  assert.equal(await auth.apiKeyUser(shortcut), null);
  assert.equal(await auth.sessionUser(session.token), null);
  assert.equal(db.raw.prepare('SELECT user_id FROM app_store_transactions').get().user_id, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users WHERE id=2').get().n, 1);
});

test('native legal and sign-in pages have no external-checkout navigation', async () => {
  const { req } = await fixture();
  for (const path of ['/app/privacy', '/app/terms', '/app/pricing', '/login?next=%2Fapp%2Fconnect%3Fstate%3Dabcdefghijklmnop', '/signup?next=%2Fapp%2Fconnect%3Fstate%3Dabcdefghijklmnop']) {
    const response = await req(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.doesNotMatch(html, /href="\/(?:account|pricing|terms|privacy|automations)"/, path);
    assert.doesNotMatch(html, /href="\/"/, path);
  }
});

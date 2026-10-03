import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { memoryD1 } from './d1.js';
import { createAuth } from '../src/auth.js';
import { createBilling } from '../src/billing.js';
import { createInference } from '../src/inference.js';
import { deleteAccount } from '../src/privacy.js';
import app from '../src/worker.js';

const deletionEnv = { ACCOUNT_DELETION_ENABLED: 'true' }; // Test databases only.
const checkout = (userId, id = 'cs_live_safety_test') => ({
  id, payment_status: 'paid', customer: 'cus_safety_test',
  metadata: { user_id: String(userId), credit_micros: '5000000' },
});
const signup = async (auth, email = 'person@example.test') => {
  const result = await auth.signup(email, 'long test password');
  assert.ok(result.userId, result.error);
  return result.userId;
};
const usage = { description: 'test usage', model: 'test', input_tokens: 10, output_tokens: 5 };

test('account-ID migration preserves existing records and seeds the permanent allocation boundary', async () => {
  let original;
  const db = memoryD1({ beforeMigration(name, raw) {
    if (name !== '0009_account_id_safety.sql') return;
    raw.exec(`INSERT INTO users(id,email,password_hash,balance_micros,created_at)
      VALUES(3,'existing@example.test','hash',123456,100),(41,'highest@example.test','hash',654321,200);
      INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES('session',41,'csrf',999999);
      INSERT INTO ledger(user_id,kind,amount_micros,description,created_at) VALUES(41,'topup',654321,'existing',200);`);
    original = raw.prepare('SELECT * FROM users ORDER BY id').all();
  } });
  assert.deepEqual(db.raw.prepare('SELECT * FROM users ORDER BY id').all(), original);
  assert.deepEqual(db.raw.prepare('SELECT id FROM account_ids ORDER BY id').all().map(r => r.id), [3, 41]);
  assert.equal(db.raw.prepare('SELECT user_id FROM sessions').get().user_id, 41);
  assert.equal(db.raw.prepare('SELECT amount_micros FROM ledger').get().amount_micros, 654321);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
  await deleteAccount(db, 41, deletionEnv);
  assert.equal(await signup(createAuth(db)), 42, 'highest deleted ID stays reserved');
});

test('password and OAuth signups never reuse IDs, including after every account is deleted', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const first = await signup(auth);
  await deleteAccount(db, first, deletionEnv);
  const second = await signup(auth); // The same email is still allowed to re-register.
  assert.ok(second > first);
  await deleteAccount(db, second, deletionEnv);
  for (const provider of ['google', 'apple']) {
    const result = await auth.oauthLogin(provider, { subject: `${provider}-test`, email: `${provider}@example.test`, emailVerified: true });
    assert.equal(result.created, true);
    assert.ok(result.userId > second);
    assert.equal(await createBilling(db).balance(result.userId), 0);
    // Revocation is covered by account-privacy.test.js. Here exercise the final
    // database deletion without needing a synthetic provider token.
    db.raw.prepare('DELETE FROM users WHERE id=?').run(result.userId);
  }
  const last = await signup(auth, 'last@example.test');
  assert.equal(last, 5);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM account_ids').get().n, 5);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
});

test('ID guards reject reuse, legacy auto-allocation and mutation even with conflict overrides', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const first = await signup(auth);
  await deleteAccount(db, first, deletionEnv);
  for (const mode of ['', 'OR IGNORE', 'OR REPLACE']) {
    assert.throws(() => db.raw.exec(`INSERT ${mode} INTO users(id,email,password_hash,created_at) VALUES(1,'reused@example.test','',0)`), /already been used/);
    assert.throws(() => db.raw.exec(`INSERT ${mode} INTO users(email,password_hash,created_at) VALUES('legacy@example.test','',0)`), /already been used/);
  }
  const current = await signup(auth);
  assert.throws(() => db.raw.prepare('UPDATE users SET id=99 WHERE id=?').run(current), /cannot be changed/);
  assert.throws(() => db.raw.exec('DELETE FROM account_ids'), /must be retained/);
  assert.throws(() => db.raw.exec('UPDATE account_ids SET id=99 WHERE id=1'), /must be retained/);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(), []);
});

test('concurrent distinct signups allocate unique IDs and duplicate emails leave no partial account', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => i % 2
    ? auth.oauthLogin('google', { subject: `concurrent-${i}`, email: `person${i}@example.test`, emailVerified: true })
    : auth.signup(`person${i}@example.test`, 'long test password')));
  assert.equal(new Set(results.map(r => r.userId)).size, 8);
  assert.ok(results.every(r => r.userId));
  const duplicates = await Promise.all(Array.from({ length: 2 }, () => auth.signup('duplicate@example.test', 'long test password')));
  assert.equal(duplicates.filter(r => r.userId).length, 1);
  assert.equal(duplicates.filter(r => r.error).length, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM account_ids').get().n, 9);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 9);
});

test('late Stripe delivery and replay do not recreate deleted accounts, ledger rows or balances', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const billing = createBilling(db);
  const deleted = await signup(auth);
  const paid = checkout(deleted);
  assert.equal(await billing.fulfillCheckout(paid), true);
  assert.equal(await billing.fulfillCheckout(paid), false);
  await deleteAccount(db, deleted, deletionEnv);
  const replacement = await signup(auth);
  const late = checkout(deleted, 'cs_live_late_test');
  assert.deepEqual(await Promise.all([billing.fulfillCheckout(paid), billing.fulfillCheckout(late), billing.fulfillCheckout(late)]), [false, false, false]);
  assert.equal(await billing.balance(replacement), 0);
  assert.equal(db.raw.prepare('SELECT stripe_customer_id FROM users WHERE id=?').get(replacement).stripe_customer_id, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  // An unaffected account still receives exactly one top-up under simultaneous retries.
  const current = checkout(replacement, 'cs_live_current_test');
  const repeats = await Promise.all([billing.fulfillCheckout(current), billing.fulfillCheckout(current)]);
  assert.equal(repeats.filter(Boolean).length, 1);
  assert.equal(await billing.balance(replacement), 5000000);
  assert.equal((await billing.history(replacement)).length, 1);
});

test('Stripe delivery rejects malformed numeric account and credit metadata', async () => {
  const db = memoryD1();
  const id = await signup(createAuth(db));
  const billing = createBilling(db);
  for (const field of ['user_id', 'credit_micros']) {
    for (const value of ['0', '-1', '1.5', 'Infinity', '9007199254740992', 'not-a-number']) {
      const event = checkout(id);
      event.metadata[field] = value;
      assert.equal(await billing.fulfillCheckout(event), false);
    }
  }
  assert.equal(await billing.balance(id), 0);
  assert.equal((await billing.history(id)).length, 0);
});

test('signed Stripe webhook retries for deleted accounts acknowledge safely without delivering credit', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const deleted = await signup(auth);
  await deleteAccount(db, deleted, deletionEnv);
  const replacement = await signup(auth);
  const webhookSecret = 'whsec_local_synthetic_test_only';
  const timestamp = Math.floor(Date.now() / 1000);
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
    const payload = JSON.stringify({ id: 'evt_local_test', type, data: { object: checkout(deleted) } });
    const signature = createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
    const send = header => app.fetch(new Request('http://localhost/webhooks/stripe', {
      method: 'POST', headers: { 'stripe-signature': header }, body: payload,
    }), { DB: db, STRIPE_SECRET_KEY: 'sk_test_local_synthetic_only', STRIPE_WEBHOOK_SECRET: webhookSecret });
    assert.equal((await send(`t=${timestamp},v1=invalid`)).status, 400);
    for (let retry = 0; retry < 2; retry++) {
      const response = await send(`t=${timestamp},v1=${signature}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).received, true);
    }
  }
  assert.equal(await createBilling(db).balance(replacement), 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 0);
});

test('settlement remains atomic for live accounts and safely skips all deleted-account outcomes', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const billing = createBilling(db);
  const live = await signup(auth);
  await billing.fulfillCheckout(checkout(live));
  assert.equal(await billing.reserve(live, 1000), true);
  await billing.settle(live, 1000, 400, usage);
  assert.equal(await billing.balance(live), 4999600);
  assert.equal((await billing.history(live))[0].amount_micros, -400);
  assert.equal(await billing.reserve(live, 1000), true);
  // Force the second statement to fail, proving the refund rolls back with it.
  await assert.rejects(billing.settle(live, 1000, 400, { ...usage, description: null }), /NOT NULL/);
  assert.equal(await billing.balance(live), 4998600);
  await deleteAccount(db, live, deletionEnv);
  const replacement = await signup(auth);
  for (const actual of [0, 400, 1000]) await billing.settle(live, 1000, actual, usage);
  assert.equal(await billing.reserve(live, 1000), false);
  assert.equal(await billing.balance(replacement), 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 0);
});

test('an AI request finishing after deletion cannot charge or refund the next account', async () => {
  for (const failUpstream of [false, true]) {
    const db = memoryD1();
    const auth = createAuth(db);
    const billing = createBilling(db);
    const deleted = await signup(auth);
    await billing.fulfillCheckout(checkout(deleted));
    let release, reached;
    const paused = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { reached = resolve; });
    const inference = createInference(billing, { ai: { run: async () => {
      reached(); await paused;
      if (failUpstream) throw new Error('Synthetic upstream failure');
      return { response: 'ok', usage: { prompt_tokens: 10, completion_tokens: 5 } };
    } } });
    const pending = inference.generate({ id: deleted }, { prompt: 'Test' });
    await started;
    await deleteAccount(db, deleted, deletionEnv);
    const replacement = await signup(auth);
    release();
    const response = await pending;
    assert.equal(response.status, failUpstream ? 502 : 200);
    assert.equal(await billing.balance(replacement), 0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM ledger').get().n, 0);
  }
});

test('enabled local deletion route invalidates credentials and preserves the permanent ID', async () => {
  const db = memoryD1();
  const auth = createAuth(db);
  const deleted = await signup(auth);
  const key = await auth.createApiKey(deleted, 'app', { canMint: true });
  const session = await auth.startSession(deleted);
  const request = () => app.fetch(new Request('http://localhost/api/v1/account/delete', {
    method: 'POST', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ confirmation: 'DELETE' }),
  }), { DB: db, ...deletionEnv });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 401);
  assert.equal(await auth.sessionUser(session.token), null);
  assert.equal(await auth.apiKeyUser(key), null);
  assert.equal(db.raw.prepare('SELECT id FROM account_ids').get().id, deleted);
  assert.ok(await signup(auth) > deleted);
});

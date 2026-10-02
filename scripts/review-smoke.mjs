// Local workerd + D1 smoke test. First bundle with:
// npx wrangler deploy --dry-run --outdir /tmp/iphoneautomations-review-worker --env local
// No production configuration, network calls or payment credentials are used.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createAppStore } from '../src/app-store.js';
import { createAuth } from '../src/auth.js';
import { createBilling } from '../src/billing.js';

const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: await readFile('/tmp/iphoneautomations-review-worker/worker.js', 'utf8'),
  compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'],
  // Enabled only in this ephemeral test Worker; production configuration is untouched.
  bindings: { APP_URL: 'http://localhost', ACCOUNT_DELETION_ENABLED: 'true', APP_STORE_ISSUER_ID: 'test', APP_STORE_KEY_ID: 'test', APP_STORE_PRIVATE_KEY: 'unused', APP_STORE_APP_ID: '123' },
}));
try {
  const db = await mf.getD1Database('DB');
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    if (name === '0009_account_id_safety.sql') {
      // Exercise the populated-schema upgrade, not only a fresh database.
      await db.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES (1,'local@example.invalid','',0)").run();
    }
    // Use Wrangler's parser: splitting at semicolons breaks CREATE TRIGGER bodies.
    await db.batch(unstable_splitSqlQuery(sql).map(statement => db.prepare(statement)));
  }
  const key = 'aa_live_local_smoke_only';
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).toString('hex');
  assert.equal((await db.prepare('SELECT id FROM account_ids').first()).id, 1);
  await db.prepare("INSERT INTO api_keys(user_id,key_hash,prefix,name,created_at,can_mint) VALUES(1,?,'aa_live','local',0,1)").bind(hash).run();
  const req = (path, body) => mf.dispatchFetch(`http://localhost${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await req('/api/v1/store')).status, 200);
  assert.equal((await req('/api/v1/account/privacy')).status, 200);
  assert.equal((await req('/api/v1/run/ask-ai', { input: 'must not send' })).status, 403);
  assert.equal((await req('/api/v1/store/purchase', { signed_transaction: 'forged' })).status, 400);
  assert.equal((await req('/webhooks/apple', { signedPayload: 'forged' })).status, 400);
  assert.equal((await req('/api/v1/account/delete', {})).status, 400, 'confirmation is mandatory');
  assert.equal((await req('/api/v1/account/privacy', { version: 1, allowed: true })).status, 200);
  assert.equal((await (await req('/api/v1/account/privacy')).json()).allowed, true);
  // Exercise actual D1 batch/changes() behavior, not just the Node SQLite stand-in.
  // The Apple client here is an explicit test double; these are not real receipts.
  const tx = { transactionId: '987654', bundleId: 'com.iphoneadvanced.app', type: 'Consumable', inAppOwnershipType: 'PURCHASED', quantity: 1,
    productId: 'com.iphoneadvanced.app.credits5', environment: 'Production', signedDate: 1000 };
  const store = createAppStore(db, {}, { enabled: true, transaction: async () => ({ ...tx }) });
  tx.appAccountToken = await store.accountToken(1);
  assert.equal((await store.purchase(1, 'test-double')).balance_usd, 5);
  assert.equal((await store.purchase(1, 'test-double')).balance_usd, 5);
  await db.prepare('UPDATE users SET balance_micros=2000000 WHERE id=1').run();
  tx.revocationDate = 2000; tx.signedDate = 2000;
  assert.equal((await store.purchase(1, 'test-double')).balance_usd, 0);
  delete tx.revocationDate; tx.signedDate = 3000;
  assert.equal((await store.purchase(1, 'test-double')).balance_usd, 2);
  assert.equal((await store.purchase(1, 'test-double')).balance_usd, 2);
  const billing = createBilling(db);
  const checkout = (userId, id) => ({ id, payment_status: 'paid', customer: 'cus_local_test', metadata: { user_id: String(userId), credit_micros: '5000000' } });
  assert.equal(await billing.fulfillCheckout(checkout(1, 'cs_live_local_before_delete')), true);
  assert.equal(await billing.reserve(1, 1000), true);
  assert.equal((await req('/api/v1/account/delete', { confirmation: 'DELETE' })).status, 200);
  assert.equal((await req('/api/v1/account')).status, 401, 'deleted key must stop working');
  assert.equal((await db.prepare('SELECT user_id FROM app_store_transactions').first()).user_id, null);
  assert.equal((await db.prepare('SELECT id FROM account_ids').first()).id, 1, 'ID survives deletion');
  await assert.rejects(db.prepare("INSERT OR REPLACE INTO users(id,email,password_hash,created_at) VALUES(1,'reused@example.invalid','',0)").run(), /already been used/);
  await assert.rejects(db.prepare('DELETE FROM account_ids WHERE id=1').run(), /must be retained/);
  const auth = createAuth(db);
  const replacement = await auth.signup('local@example.invalid', 'local test password');
  assert.equal(replacement.userId, 2);
  const signups = await Promise.all(Array.from({ length: 4 }, (_, i) => auth.oauthLogin('google', {
    subject: `local-${i}`, email: `local${i}@example.invalid`, emailVerified: true,
  })));
  assert.equal(new Set(signups.map(r => r.userId)).size, 4);
  assert.ok(signups.every(r => r.userId > replacement.userId));
  for (const id of ['cs_live_local_before_delete', 'cs_live_local_after_delete']) {
    assert.equal(await billing.fulfillCheckout(checkout(1, id)), false);
  }
  for (const actual of [0, 400, 1000]) {
    await billing.settle(1, 1000, actual, { description: 'late usage', model: 'local', input_tokens: 1, output_tokens: 1 });
  }
  assert.equal(await billing.balance(replacement.userId), 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ledger').first()).n, 0);
  const delivered = await Promise.all(Array.from({ length: 3 }, () => billing.fulfillCheckout(checkout(replacement.userId, 'cs_live_local_current'))));
  assert.equal(delivered.filter(Boolean).length, 1);
  assert.equal(await billing.balance(replacement.userId), 5000000);
  assert.equal((await billing.history(replacement.userId)).length, 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  console.log('PASS: actual local workerd/D1 upgrade, account/consent routes, invalid Apple signatures, purchase/refund/reversal SQL, enabled test deletion, permanent IDs, concurrent signups, late Stripe delivery and late settlement');
} finally { await mf.dispose(); }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import { createAppStore, appleStoreClient } from '../src/app-store.js';

async function fixture(env = {}) {
  const db = memoryD1();
  db.raw.exec("INSERT INTO users (id,email,password_hash,created_at) VALUES (1,'a@example.com','',0),(2,'b@example.com','',0)");
  const tx = { transactionId: '123456789', bundleId: 'com.iphoneadvanced.app', type: 'Consumable', inAppOwnershipType: 'PURCHASED', quantity: 1,
    productId: 'com.iphoneadvanced.app.credits5', environment: 'Production', signedDate: 1000 };
  const client = { enabled: true, transaction: async () => ({ ...tx }), notification: async () => ({ notificationType: 'REFUND', data: { signedTransactionInfo: 'verified' } }) };
  const store = createAppStore(db, env, client);
  tx.appAccountToken = await store.accountToken(1);
  return { db, tx, store, balance: () => db.raw.prepare('SELECT balance_micros FROM users WHERE id = 1').get().balance_micros };
}

test('credits are atomic, account-bound and idempotent across purchase retries and notifications', async () => {
  const { store, balance } = await fixture();
  const token = await store.accountToken(1);
  assert.equal(await store.accountToken(1), token);
  assert.notEqual(await store.accountToken(2), token);
  await store.purchase(1, 'verified');
  await Promise.all([store.purchase(1, 'verified'), store.purchase(1, 'verified'), store.notification('verified')]);
  assert.equal(balance(), 5_000_000);
  await assert.rejects(store.purchase(2, 'verified'), /different.*account/);
  assert.equal(balance(), 5_000_000);
});

test('unapproved products, quantity, ownership, bundle and environments cannot grant credit', async () => {
  for (const override of [
    { productId: 'unknown' }, { quantity: 2 }, { inAppOwnershipType: 'FAMILY_SHARED' },
    { bundleId: 'another.app' }, { environment: 'Sandbox' }, { environment: 'Xcode' },
    { type: 'Non-Consumable' }, { appAccountToken: undefined }, { transactionId: 'bad/id' },
  ]) {
    const { store, tx, balance } = await fixture();
    Object.assign(tx, override);
    await assert.rejects(store.purchase(1, 'verified'));
    assert.equal(balance(), 0);
  }
  const { store, tx, balance } = await fixture({ APP_STORE_SANDBOX_USER_IDS: '1' });
  tx.environment = 'Sandbox';
  await store.purchase(1, 'verified');
  assert.equal(balance(), 5_000_000);
});

test('refunds remove only available credit, once; a refunded transaction cannot be replayed', async () => {
  const { store, tx, db, balance } = await fixture();
  await store.purchase(1, 'verified');
  db.raw.exec('UPDATE users SET balance_micros = 2000000 WHERE id = 1');
  tx.revocationDate = Date.now();
  tx.signedDate++;
  await store.notification('verified');
  await store.notification('verified');
  assert.equal(balance(), 0);
  assert.equal(db.raw.prepare("SELECT amount_micros FROM ledger WHERE kind='refund'").get().amount_micros, -2_000_000);
  await store.purchase(1, 'verified');
  assert.equal(balance(), 0);
});

test('refund before delivery and account deletion never resurrect a purchase', async () => {
  const { store, tx, db, balance } = await fixture();
  tx.revocationDate = Date.now();
  await store.notification('verified');
  await store.purchase(1, 'verified');
  assert.equal(balance(), 0);
  db.raw.exec('DELETE FROM users WHERE id = 1');
  await store.notification('verified');
  assert.equal(db.raw.prepare('SELECT user_id FROM app_store_transactions').get().user_id, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
});

test('verification rejects forged signed payloads before any request to Apple or balance mutation', async () => {
  const client = appleStoreClient({ APP_STORE_ISSUER_ID: 'issuer', APP_STORE_KEY_ID: 'key', APP_STORE_PRIVATE_KEY: 'unused', APP_STORE_APP_ID: '123' }, () => assert.fail('No network request for a forgery'));
  const payload = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"environment":"Production","bundleId":"com.iphoneadvanced.app"}').toString('base64url')}.`;
  await assert.rejects(client.transaction(payload), /verify/);
  await assert.rejects(client.notification(payload), /verify/);
  await assert.rejects(appleStoreClient({}).transaction(payload), /unavailable/);
});

test('refund reversals restore only removed credit, once, and stale results cannot overwrite newer state', async () => {
  const { store, tx, db, balance } = await fixture();
  await store.purchase(1, 'verified');
  db.raw.exec('UPDATE users SET balance_micros = 1200000 WHERE id = 1');
  tx.revocationDate = 2000;
  tx.signedDate = 2000;
  await store.notification('verified');
  assert.equal(balance(), 0);
  delete tx.revocationDate;
  tx.signedDate = 3000;
  await Promise.all([store.notification('verified'), store.purchase(1, 'verified')]);
  assert.equal(balance(), 1_200_000, 'spent credit is not minted again');
  tx.revocationDate = 2000;
  tx.signedDate = 2500;
  await store.notification('verified');
  assert.equal(balance(), 1_200_000, 'stale refund ignored');
  tx.signedDate = 4000;
  await store.notification('verified');
  assert.equal(balance(), 0, 'a second actual refund removes credit once');
  delete tx.revocationDate;
  tx.signedDate = 3500;
  await store.purchase(1, 'verified');
  assert.equal(balance(), 0, 'stale reversal cannot re-credit');
  tx.signedDate = 5000;
  await store.notification('verified');
  await store.notification('verified');
  assert.equal(balance(), 1_200_000);
});

test('reversal after a refund-before-delivery grants the original undelivered credit once', async () => {
  const { store, tx, balance } = await fixture();
  tx.revocationDate = 1000;
  await store.notification('verified');
  assert.equal(balance(), 0);
  delete tx.revocationDate;
  tx.signedDate++;
  await store.notification('verified');
  await store.purchase(1, 'verified');
  assert.equal(balance(), 5_000_000);
});

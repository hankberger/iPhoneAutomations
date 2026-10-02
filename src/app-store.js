import { Buffer } from 'node:buffer';
const Environment = { PRODUCTION: 'Production', SANDBOX: 'Sandbox' };

export const CREDIT_PRODUCTS = Object.freeze(Object.fromEntries([5, 10, 25, 50].map(amount =>
  [`com.iphoneadvanced.app.credits${amount}`, amount * 1_000_000])));
const BUNDLE_ID = 'com.iphoneadvanced.app';
// Apple PKI: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
const ROOT = `MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==`;

export class PurchaseError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const reject = message => { throw new PurchaseError(message); };
const b64 = value => Buffer.from(value).toString('base64url');

// Certificate verification uses Apple's library. The authoritative transaction is then
// fetched from Apple over authenticated HTTPS, so an old signed purchase cannot undo a refund.
export function appleStoreClient(env, fetchImpl = globalThis.fetch) {
  const enabled = Boolean(env.APP_STORE_ISSUER_ID && env.APP_STORE_KEY_ID && env.APP_STORE_PRIVATE_KEY && Number(env.APP_STORE_APP_ID));
  const verify = async (value, method) => {
    if (!enabled) throw new PurchaseError('App Store purchases are temporarily unavailable. Please try again later.', 503);
    if (typeof value !== 'string' || value.length > 32_768) reject('Invalid App Store transaction.');
    // Load just verification in request context; do not initialize unrelated API
    // client modules. Distinguish invalid signatures from runtime/config failures.
    const { SignedDataVerifier, VerificationException } = await import('@apple/app-store-server-library/dist/jws_verification.js');
    for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
      try {
        const verifier = new SignedDataVerifier([Buffer.from(ROOT, 'base64')], false, environment, BUNDLE_ID, Number(env.APP_STORE_APP_ID));
        return await verifier[method](value);
      } catch (error) {
        if (!(error instanceof VerificationException)) throw new PurchaseError('Apple verification is temporarily unavailable. Please retry.', 503);
      }
    }
    reject('Apple could not verify this purchase.');
  };
  async function authorization() {
    const now = Math.floor(Date.now() / 1000);
    const input = `${b64(JSON.stringify({ alg: 'ES256', kid: env.APP_STORE_KEY_ID, typ: 'JWT' }))}.${b64(JSON.stringify({
      iss: env.APP_STORE_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: BUNDLE_ID,
    }))}`;
    const pem = env.APP_STORE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Buffer.from(pem, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
    return `${input}.${b64(signature)}`;
  }
  async function transaction(signed) {
    const claim = await verify(signed, 'verifyAndDecodeTransaction');
    if (!/^\d{1,30}$/.test(claim.transactionId)) reject('Invalid transaction identifier.');
    const host = claim.environment === Environment.PRODUCTION ? 'api.storekit.itunes.apple.com' : 'api.storekit-sandbox.itunes.apple.com';
    const response = await fetchImpl(`https://${host}/inApps/v1/transactions/${claim.transactionId}`, {
      headers: { Authorization: `Bearer ${await authorization()}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new PurchaseError('Apple purchase confirmation is unavailable. Your purchase will be retried.', 503);
    const current = await verify((await response.json()).signedTransactionInfo, 'verifyAndDecodeTransaction');
    if (current.transactionId !== claim.transactionId || current.environment !== claim.environment) reject('Transaction mismatch.');
    return current;
  }
  return { enabled, transaction, notification: signed => verify(signed, 'verifyAndDecodeNotification') };
}

export function createAppStore(db, env, client = appleStoreClient(env)) {
  const sandboxAccounts = new Set(String(env.APP_STORE_SANDBOX_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
  async function accountToken(userId) {
    await db.prepare('UPDATE users SET app_account_token = ? WHERE id = ? AND app_account_token IS NULL').bind(crypto.randomUUID(), userId).run();
    return (await db.prepare('SELECT app_account_token FROM users WHERE id = ?').bind(userId).first())?.app_account_token;
  }
  function validate(tx, user) {
    if (!Number.isSafeInteger(tx.signedDate) || tx.signedDate <= 0) reject('Missing Apple transaction date.');
    if (tx.bundleId !== BUNDLE_ID || tx.type !== 'Consumable' || tx.inAppOwnershipType !== 'PURCHASED' || tx.quantity !== 1 || !CREDIT_PRODUCTS[tx.productId]) reject('Unsupported App Store purchase.');
    if (!/^\d{1,30}$/.test(tx.transactionId)) reject('Invalid transaction identifier.');
    if (!user?.app_account_token || tx.appAccountToken?.toLowerCase() !== user.app_account_token) reject('This purchase belongs to a different Advanced Automations account. Sign in to the account that bought it.');
    if (tx.environment !== 'Production' && !(tx.environment === 'Sandbox' && sandboxAccounts.has(String(user.id)))) {
      reject('Sandbox purchases require an authorized test account.');
    }
  }
  async function fulfill(tx, user) {
    validate(tx, user);
    const id = `${tx.environment}:${tx.transactionId}`;
    const credit = CREDIT_PRODUCTS[tx.productId];
    const revoked = tx.revocationDate != null;
    const existing = await db.prepare('SELECT user_id FROM app_store_transactions WHERE id = ?').bind(id).first();
    if (existing && existing.user_id !== user.id) reject('This transaction has already been assigned.');
    // A revision is applied exactly once in a single D1 transaction. A reversal
    // restores only the amount removed, not already spent credit. signedDate stops
    // older concurrently fetched Apple state overwriting a newer refund/reversal.
    await db.batch([
      // 2 is an internal undelivered state; no request can observe it outside this batch.
      db.prepare('INSERT INTO app_store_transactions (id, user_id, product_id, environment, credit_micros, revoked, created_at) VALUES (?, ?, ?, ?, ?, 2, ?) ON CONFLICT(id) DO NOTHING')
        .bind(id, user.id, tx.productId, tx.environment, credit, Date.now()),
      db.prepare(`UPDATE app_store_transactions SET
        balance_delta = CASE WHEN revoked = 2 THEN CASE WHEN ? = 1 THEN 0 ELSE credit_micros END
          WHEN ? = 1 THEN -MIN(credit_micros, (SELECT balance_micros FROM users WHERE id = ?)) ELSE removed_micros END,
        removed_micros = CASE WHEN ? = 1 THEN CASE WHEN revoked = 2 THEN credit_micros
          ELSE MIN(credit_micros, (SELECT balance_micros FROM users WHERE id = ?)) END ELSE 0 END,
        revoked = ?, last_signed_date = ?, state_revision = state_revision + 1
        WHERE id = ? AND user_id = ? AND revoked != ? AND last_signed_date < ?`)
        .bind(+revoked, +revoked, user.id, +revoked, user.id, +revoked, tx.signedDate, id, user.id, +revoked, tx.signedDate),
      db.prepare(`INSERT INTO ledger (user_id, kind, amount_micros, description, apple_event_id, created_at)
        SELECT user_id, CASE WHEN revoked = 1 THEN 'refund' ELSE 'topup' END, balance_delta,
          CASE WHEN revoked = 1 THEN 'App Store refund: unused credit removed' ELSE 'App Store credit or refund reversal' END,
          CASE WHEN state_revision = 1 AND revoked = 0 THEN 'purchase:' || id ELSE 'state:' || id || ':' || state_revision END,
          ? FROM app_store_transactions WHERE id = ? AND changes() = 1`)
        .bind(Date.now(), id),
      db.prepare('UPDATE users SET balance_micros = balance_micros + (SELECT balance_delta FROM app_store_transactions WHERE id = ?) WHERE id = ? AND changes() = 1')
        .bind(id, user.id),
      db.prepare('UPDATE app_store_transactions SET last_signed_date = MAX(last_signed_date, ?) WHERE id = ? AND user_id = ?')
        .bind(tx.signedDate, id, user.id),
    ]);
    const state = await db.prepare('SELECT revoked FROM app_store_transactions WHERE id = ?').bind(id).first();
    return { balance_usd: (await db.prepare('SELECT balance_micros FROM users WHERE id = ?').bind(user.id).first())?.balance_micros / 1e6, revoked: state.revoked === 1 };
  }
  async function purchase(userId, signed) {
    const tx = await client.transaction(signed);
    const user = await db.prepare('SELECT id, app_account_token FROM users WHERE id = ?').bind(userId).first();
    return fulfill(tx, user);
  }
  async function notification(signed) {
    const event = await client.notification(signed);
    if (event.notificationType === 'TEST') return;
    if (!['ONE_TIME_CHARGE', 'REFUND', 'REVOKE', 'REFUND_REVERSED'].includes(event.notificationType) || !event.data?.signedTransactionInfo) return;
    const tx = await client.transaction(event.data.signedTransactionInfo);
    const user = await db.prepare('SELECT id, app_account_token FROM users WHERE app_account_token = ?').bind(tx.appAccountToken?.toLowerCase() || '').first();
    if (!user) return; // Deleted accounts must not be recreated by delayed notifications.
    if (tx.environment === 'Sandbox' && !sandboxAccounts.has(String(user.id))) return;
    await fulfill(tx, user);
  }
  return { enabled: client.enabled, accountToken, purchase, notification };
}

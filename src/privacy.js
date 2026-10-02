import { Buffer } from 'node:buffer';

export const AI_CONSENT_VERSION = 1;
export const AI_DISCLOSURE = 'The text, images, audio and instructions you choose are sent to Advanced Automations and Cloudflare to answer your request. Make an Image also sends your description to OpenAI through Cloudflare AI Gateway. Shared content may include personal information from your messages, documents, calendar or reminders. We do not store your inputs or AI outputs in our database. Providers may retain data under their policies. Only share content you have permission to send.';
export const hasAIConsent = user => user.ai_consent_version === AI_CONSENT_VERSION;
export const consentRequired = appUrl => ({ status: 403, json: {
  error: 'Review and allow AI data sharing in Account → AI Privacy before running AI actions.',
  action_url: `${appUrl}/account/ai-privacy`,
} });
export async function setAIConsent(db, userId, allowed) {
  await db.prepare('UPDATE users SET ai_consent_version = ?, ai_consent_at = ? WHERE id = ?')
    .bind(allowed ? AI_CONSENT_VERSION : 0, allowed ? Date.now() : null, userId).run();
}

export class AccountError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
async function vaultKey(secret) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new AccountError('Account privacy configuration is temporarily unavailable.', 503);
  return crypto.subtle.importKey('raw', Buffer.from(secret, 'hex'), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealToken(value, secret, subject) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(subject) },
    await vaultKey(secret), new TextEncoder().encode(value));
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(bytes).toString('base64')}`;
}
export async function openToken(value, secret, subject) {
  const [iv, data] = value.split('.');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64'), additionalData: new TextEncoder().encode(subject) },
    await vaultKey(secret), Buffer.from(data, 'base64'));
  return new TextDecoder().decode(bytes);
}

export async function deleteAccount(db, userId, env, apple, fetchImpl = globalThis.fetch) {
  // Keep this rollout closed until the account-ID/late-payment safeguards have
  // been migrated and verified. Never enable on a live database without them.
  if (env.ACCOUNT_DELETION_ENABLED !== 'true') throw new AccountError('Account deletion is temporarily unavailable. Please try again later.', 503);
  const identity = await db.prepare("SELECT subject, revocation_token FROM identities WHERE user_id = ? AND provider = 'apple'").bind(userId).first();
  if (identity) {
    if (!identity.revocation_token) throw new AccountError('Sign in with Apple again before deleting this account so we can disconnect it from Apple.', 409);
    if (!apple) throw new AccountError('Apple account deletion is temporarily unavailable. Please try again.', 503);
    const token = await openToken(identity.revocation_token, env.TOKEN_ENCRYPTION_KEY, identity.subject);
    const response = await fetchImpl('https://appleid.apple.com/auth/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: apple.clientId, client_secret: await apple.clientSecret(), token }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new AccountError('Could not disconnect Sign in with Apple. Please retry account deletion.', 503);
  }
  // Explicitly remove analytics as well as cascading keys, sessions, identity and ledger
  // rows. Unlinked purchase IDs remain to prevent replay and for reconciliation.
  await db.batch([
    db.prepare('DELETE FROM analytics_events WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}

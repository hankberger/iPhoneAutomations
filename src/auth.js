import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'aa_session';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

// A fixed hash so unknown-email logins take as long as wrong-password ones.
const DUMMY_HASH = await hashPassword('timing-equaliser');

export function validateCredentials(email, password) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return { error: 'Enter a valid email address.' };
  if (String(password || '').length < 10) return { error: 'Use at least 10 characters for your password.' };
  if (String(password).length > 200) return { error: 'That password is too long.' };
  return { email: e, password: String(password) };
}

export function createAuth(db) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?) RETURNING id'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare(`SELECT s.csrf, s.expires_at, u.id, u.email, u.balance_micros, u.stripe_customer_id
                         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    keyLookup: db.prepare(`SELECT k.id AS key_id, u.id, u.email, u.balance_micros FROM api_keys k
                           JOIN users u ON u.id = k.user_id WHERE k.key_hash = ? AND k.revoked_at IS NULL`),
    touchKey: db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?'),
    insertKey: db.prepare('INSERT INTO api_keys (user_id, key_hash, prefix, name, created_at) VALUES (?, ?, ?, ?, ?)'),
    listKeys: db.prepare('SELECT id, prefix, name, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC'),
    revokeKey: db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?'),
  };

  async function signup(email, password) {
    if (q.userByEmail.get(email)) return { error: 'An account with that email already exists. Try logging in.' };
    const hash = await hashPassword(password);
    const { id } = q.insertUser.get(email, hash, Date.now());
    return { userId: id };
  }

  async function login(email, password) {
    const user = q.userByEmail.get(email);
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return { error: 'That email and password do not match.' };
    return { userId: user.id };
  }

  function startSession(userId) {
    const t = token();
    q.purge.run(Date.now());
    q.insertSession.run(sha256(t), userId, token(18), Date.now() + SESSION_DAYS * 864e5);
    return { token: t, maxAge: SESSION_DAYS * 864e5 };
  }

  function sessionUser(t) {
    if (!t) return null;
    const row = q.session.get(sha256(t));
    if (!row || row.expires_at < Date.now()) return null;
    return row;
  }

  const endSession = (t) => t && q.deleteSession.run(sha256(t));

  function createApiKey(userId, name) {
    const secret = `aa_live_${token(24)}`;
    q.insertKey.run(userId, sha256(secret), secret.slice(0, 12), name, Date.now());
    return secret;
  }

  function apiKeyUser(secret) {
    if (!secret?.startsWith('aa_live_')) return null;
    const row = q.keyLookup.get(sha256(secret));
    if (row) q.touchKey.run(Date.now(), row.key_id);
    return row || null;
  }

  return {
    signup, login, startSession, sessionUser, endSession, createApiKey, apiKeyUser,
    listKeys: (userId) => q.listKeys.all(userId),
    revokeKey: (userId, id) => q.revokeKey.run(Date.now(), id, userId),
  };
}

// Small fixed-window limiter for login and signup attempts.
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    h.n += 1;
    return h.n <= max;
  };
}

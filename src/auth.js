const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'aa_session';
// Workers caps PBKDF2 at 100k iterations; scrypt in pure JS would blow the CPU budget.
const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const token = (bytes = 32) => b64url(randomBytes(bytes));

export async function sha256(s) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string comparison.
export function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function pbkdf2(password, salt, iterations, bytes = 32) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bytes * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(key)}`;
}

export async function verifyPassword(password, stored) {
  const [alg, iter, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'pbkdf2-sha256') return false;
  const expected = unb64(keyB64);
  const key = await pbkdf2(password, unb64(saltB64), Number(iter), expected.length);
  return safeEqual(b64(key), b64(expected));
}

// A fixed hash so unknown-email logins take as long as wrong-password ones.
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword('timing-equaliser'));

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
    // Read the permanent registry, not MAX(users.id): deleting the highest (or
    // every) account must never let a delayed payment target a new person.
    // The insert trigger registers the ID atomically with this statement.
    insertUser: db.prepare(`INSERT INTO users (id, email, password_hash, created_at)
      VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM account_ids), ?, ?, ?) RETURNING id`),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare(`SELECT s.csrf, s.expires_at, u.id, u.email, u.email_verified_at, u.balance_micros, u.stripe_customer_id, u.ai_consent_version
                         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    keyLookup: db.prepare(`SELECT k.id AS key_id, k.can_mint, u.id, u.email, u.balance_micros, u.ai_consent_version FROM api_keys k
                           JOIN users u ON u.id = k.user_id WHERE k.key_hash = ? AND k.revoked_at IS NULL`),
    touchKey: db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?'),
    insertKey: db.prepare('INSERT INTO api_keys (user_id, key_hash, prefix, name, created_at, can_mint) VALUES (?, ?, ?, ?, ?, ?)'),
    listKeys: db.prepare('SELECT id, prefix, name, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC'),
    revokeKey: db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?'),
    identity: db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?'),
    insertIdentity: db.prepare('INSERT INTO identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)'),
    insertOauthUser: db.prepare(`INSERT INTO users (id, email, password_hash, email_verified_at, created_at)
      VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM account_ids), ?, '', ?, ?) RETURNING id`),
    // The password on an unconfirmed account may have been set by someone squatting the email,
    // so the first verified sign-in turns it off and ends its sessions.
    claimUser: db.prepare("UPDATE users SET password_hash = '', email_verified_at = ? WHERE id = ?"),
    verifyUser: db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    linkedProviders: db.prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider'),
  };

  async function signup(email, password) {
    if (await q.userByEmail.bind(email).first()) return { error: 'An account with that email already exists. Try logging in.' };
    const hash = await hashPassword(password);
    try {
      const { id } = await q.insertUser.bind(email, hash, Date.now()).first();
      return { userId: id };
    } catch (err) {
      // Two signups for the same email raced past the check above.
      if (/UNIQUE/i.test(err.message)) return { error: 'An account with that email already exists. Try logging in.' };
      throw err;
    }
  }

  async function login(email, password) {
    const user = await q.userByEmail.bind(email).first();
    const ok = await verifyPassword(password, user ? user.password_hash : await getDummyHash());
    if (!user || !ok) return { error: 'That email and password do not match.' };
    return { userId: user.id };
  }

  async function startSession(userId) {
    const t = token();
    await db.batch([
      q.purge.bind(Date.now()),
      q.insertSession.bind(await sha256(t), userId, token(18), Date.now() + SESSION_DAYS * 864e5),
    ]);
    return { token: t, maxAge: SESSION_DAYS * 86400 };
  }

  async function sessionUser(t) {
    if (!t) return null;
    const row = await q.session.bind(await sha256(t)).first();
    if (!row || row.expires_at < Date.now()) return null;
    return row;
  }

  // Signs in with a provider identity from src/oauth.js, creating the account or linking it
  // to an existing one with the same verified email.
  async function oauthLogin(provider, { subject, email, emailVerified }) {
    const linked = await q.identity.bind(provider, subject).first();
    if (linked) return { userId: linked.user_id };
    if (!email || !emailVerified) return { error: 'That account has no verified email address. Try another way to sign in.' };

    const now = Date.now();
    const user = await q.userByEmail.bind(email).first();
    if (user) {
      const unconfirmedPassword = !user.email_verified_at && user.password_hash !== '';
      await db.batch([
        q.insertIdentity.bind(provider, subject, user.id, email, now),
        ...(unconfirmedPassword
          ? [q.claimUser.bind(now, user.id), q.deleteUserSessions.bind(user.id)]
          : [q.verifyUser.bind(now, user.id)]),
      ]);
      return { userId: user.id, linked: true, passwordDisabled: unconfirmedPassword };
    }
    try {
      const { id } = await q.insertOauthUser.bind(email, now, now).first();
      await q.insertIdentity.bind(provider, subject, id, email, now).run();
      return { userId: id, created: true };
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) return { error: 'Something changed while signing you in. Please try again.' };
      throw err;
    }
  }

  const endSession = async (t) => t && q.deleteSession.bind(await sha256(t)).run();

  // canMint lets the key call POST /api/v1/keys. Only the iPhone app's own key gets it.
  async function createApiKey(userId, name, { canMint = false } = {}) {
    const secret = `aa_live_${token(24)}`;
    await q.insertKey.bind(userId, await sha256(secret), secret.slice(0, 12), name, Date.now(), canMint ? 1 : 0).run();
    return secret;
  }

  async function apiKeyUser(secret) {
    if (!secret?.startsWith('aa_live_')) return null;
    const row = await q.keyLookup.bind(await sha256(secret)).first();
    if (row) await q.touchKey.bind(Date.now(), row.key_id).run();
    return row || null;
  }

  return {
    signup, login, oauthLogin, startSession, sessionUser, endSession, createApiKey, apiKeyUser,
    listKeys: async (userId) => (await q.listKeys.bind(userId).all()).results,
    revokeKey: (userId, id) => q.revokeKey.bind(Date.now(), id, userId).run(),
    linkedProviders: async (userId) => (await q.linkedProviders.bind(userId).all()).results.map((r) => r.provider),
  };
}

// Small fixed-window limiter for login and signup attempts. State lives in the isolate,
// so it is per edge location and best effort; add a Rate Limiting binding for a hard cap.
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

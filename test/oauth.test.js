import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import app from '../src/worker.js';
import { decodeJwt } from '../src/oauth.js';

const b64url = (s) => Buffer.from(s).toString('base64url');
const idToken = (claims) => `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(claims))}.sig`;

async function applePem() {
  const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Stands in for the providers' token endpoints; `claims` is what the next ID token says.
function fakeProviders() {
  const calls = [];
  const state = { claims: {} };
  globalThis.fetch = async (url, init) => {
    const body = new URLSearchParams(init.body);
    calls.push({ url: String(url), body });
    return Response.json({ id_token: idToken(state.claims) });
  };
  return { calls, state };
}

async function boot(appUrl = 'http://localhost') {
  const db = memoryD1();
  const env = {
    DB: db, APP_URL: appUrl,
    GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret',
    APPLE_CLIENT_ID: 'com.iphoneadvanced.web', APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: await applePem(),
  };
  const jar = new Map();
  const req = async (path, opts = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await app.fetch(new Request(`http://localhost${path}`, { redirect: 'manual', ...opts, headers: { cookie, ...opts.headers } }), env);
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)];
      if (/Max-Age=0/i.test(c) || v === '') jar.delete(k); else jar.set(k, v);
    }
    return res;
  };
  const form = (path, data) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
  // Runs a whole sign-in: start, then the provider's redirect (or form_post) back to us.
  const signIn = async (provider, claims, fake, { next } = {}) => {
    const start = await req(`/auth/${provider}${next ? `?next=${encodeURIComponent(next)}` : ''}`);
    assert.equal(start.status, 302);
    const auth = new URL(start.headers.get('location'));
    fake.state.claims = { iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
      aud: env[`${provider.toUpperCase()}_CLIENT_ID`], exp: Date.now() / 1000 + 600, nonce: auth.searchParams.get('nonce'), ...claims };
    const params = { code: 'the-code', state: auth.searchParams.get('state') };
    return provider === 'apple' ? form('/auth/apple/callback', params) : req(`/auth/google/callback?${new URLSearchParams(params)}`);
  };
  return { db, env, jar, req, form, signIn };
}

test('login page shows provider buttons only when configured', async () => {
  const { req } = await boot();
  const html = await (await req('/login?next=/pricing')).text();
  assert.match(html, /href="\/auth\/google\?next=%2Fpricing"/);
  assert.match(html, /Continue with Apple/);
  const bare = await app.fetch(new Request('http://localhost/signup'), { DB: memoryD1() });
  assert.doesNotMatch(await bare.text(), /Continue with/);
  assert.equal((await req('/auth/github')).status, 404);
});

test('google authorize redirect uses state, nonce and PKCE', async () => {
  const { req } = await boot();
  const res = await req('/auth/google');
  const url = new URL(res.headers.get('location'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost/auth/google/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('state') && url.searchParams.get('nonce'));
  assert.match(res.headers.get('set-cookie'), /aa_oauth=.*HttpOnly.*SameSite=Lax/i);

  // Over HTTPS the flow cookie must survive Apple's cross-site form_post.
  const secure = await boot('https://example.com');
  const apple = await secure.req('/auth/apple');
  assert.match(apple.headers.get('set-cookie'), /Secure.*SameSite=None|SameSite=None.*Secure/i);
  assert.equal(new URL(apple.headers.get('location')).searchParams.get('response_mode'), 'form_post');
});

test('google sign-in creates an account, then signs back in by subject', async () => {
  const { req, signIn, db } = await boot();
  const fake = fakeProviders();
  let res = await signIn('google', { sub: 'g-1', email: 'New@Example.com', email_verified: true }, fake, { next: '/automations?q=café' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/automations?q=café');
  const exchange = fake.calls[0];
  assert.equal(exchange.url, 'https://oauth2.googleapis.com/token');
  assert.equal(exchange.body.get('client_secret'), 'g-secret');
  assert.ok(exchange.body.get('code_verifier'));
  assert.match(await (await req('/account')).text(), /new@example\.com · signs in with Google/);

  // A later sign-in finds the same account by subject even if the email changed.
  await req('/account'); // keeps the jar warm
  res = await signIn('google', { sub: 'g-1', email: 'renamed@example.com', email_verified: true }, fake);
  assert.equal(res.status, 303);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
});

test('apple sign-in signs a client secret and handles form_post', async () => {
  const { req, signIn } = await boot();
  const fake = fakeProviders();
  const res = await signIn('apple', { sub: '001.apple', email: 'x@privaterelay.appleid.com', email_verified: 'true' }, fake);
  assert.equal(res.status, 303);
  const secret = decodeJwt(fake.calls[0].body.get('client_secret'));
  assert.equal(secret.iss, 'TEAM123456');
  assert.equal(secret.sub, 'com.iphoneadvanced.web');
  assert.equal(secret.aud, 'https://appleid.apple.com');
  assert.match(await (await req('/account')).text(), /signs in with Apple/);
});

test('linking to an unconfirmed password account turns the password off', async () => {
  const { req, form, signIn, jar } = await boot();
  // Someone signs up with the victim's email and keeps a session.
  assert.equal((await form('/signup', { email: 'victim@example.com', password: 'squatter password' })).status, 303);
  const squatterSession = jar.get('aa_session');
  jar.clear();

  const fake = fakeProviders();
  const res = await signIn('google', { sub: 'g-victim', email: 'victim@example.com', email_verified: true }, fake);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/account?linked=google&password=off');
  assert.match(await (await req(res.headers.get('location'))).text(), /old password was turned off/);

  jar.clear();
  assert.equal((await form('/login', { email: 'victim@example.com', password: 'squatter password' })).status, 401);
  jar.set('aa_session', squatterSession);
  assert.equal((await req('/account')).status, 302, 'squatter session ended');
});

test('linking to a confirmed account keeps its password', async () => {
  const { form, signIn, jar } = await boot();
  const fake = fakeProviders();
  await signIn('apple', { sub: 'a-1', email: 'me@example.com', email_verified: true }, fake);
  jar.clear();
  const res = await signIn('google', { sub: 'g-1', email: 'me@example.com', email_verified: true }, fake);
  assert.equal(res.headers.get('location'), '/account?linked=google');
  jar.clear();
  // OAuth-only accounts cannot be logged into with any password.
  assert.equal((await form('/login', { email: 'me@example.com', password: 'anything at all' })).status, 401);
});

test('rejects bad state, wrong audience, stale nonce and unverified email', async () => {
  const { req, signIn } = await boot();
  const fake = fakeProviders();
  assert.equal((await req('/auth/google/callback?code=x&state=forged')).status, 400, 'no flow cookie');

  await req('/auth/google');
  assert.equal((await req('/auth/google/callback?code=x&state=forged')).status, 400, 'state mismatch');
  assert.equal((await req('/auth/google/callback?error=access_denied')).status, 400);

  for (const claims of [{ aud: 'someone-else' }, { nonce: 'replayed' }, { iss: 'https://evil.example' }, { exp: 1 }]) {
    const res = await signIn('google', { sub: 'g-2', email: 'a@example.com', email_verified: true, ...claims }, fake);
    assert.equal(res.status, 400, JSON.stringify(claims));
  }
  const res = await signIn('google', { sub: 'g-3', email: 'b@example.com', email_verified: false }, fake);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /no verified email/);
  assert.equal((await req('/account')).status, 302);
});

test('a new Google account gets starter credit once, and the Get flow lands on the install page', async () => {
  const { req, signIn, db } = await boot();
  const fake = fakeProviders();
  const next = '/automations/summarize-anything/install';
  const signup = await (await req(`/signup?next=${encodeURIComponent(next)}`)).text();
  assert.match(signup, /Get Summarize This/);
  assert.doesNotMatch(signup, /free credit/);
  let res = await signIn('google', { sub: 'g-9', email: 'fresh@example.com', email_verified: true }, fake, { next });
  assert.equal(res.headers.get('location'), next);
  const balance = () => db.raw.prepare('SELECT balance_micros AS b FROM users').get().b;
  assert.equal(balance(), 250_000);
  assert.equal(db.raw.prepare("SELECT description FROM ledger WHERE kind = 'topup'").get().description, 'Welcome credit');

  res = await req(next);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const html = await res.text();
  assert.match(html, /id="add" href="https:\/\/www\.icloud\.com\/shortcuts\/bab137385ec341bf8fe39c3e341c85af"/);
  assert.match(html, /data-key="aa_live_/);
  assert.match(html, /\$0\.25 of credit/);

  // Signing in again does not add more credit.
  await signIn('google', { sub: 'g-9', email: 'fresh@example.com', email_verified: true }, fake);
  assert.equal(balance(), 250_000);
});

test('starter credit can be turned off', async () => {
  const { env, signIn, db } = await boot();
  env.STARTER_CREDIT_USD = '0';
  await signIn('apple', { sub: 'a-9', email: 'x@example.com', email_verified: 'true' }, fakeProviders());
  assert.equal(db.raw.prepare('SELECT balance_micros AS b FROM users').get().b, 0);
});

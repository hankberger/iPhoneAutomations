import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createAuth, validateCredentials, rateLimiter, safeEqual, SESSION_COOKIE } from './auth.js';
import { createBilling } from './billing.js';
import { createAppStore, CREDIT_PRODUCTS, PurchaseError } from './app-store.js';
import { AI_CONSENT_VERSION, AI_DISCLOSURE, hasAIConsent, consentRequired, setAIConsent, sealToken, deleteAccount, AccountError } from './privacy.js';
import { createInference, restAi, aiGateway, MAX_AUDIO_BYTES } from './inference.js';
import { oauthProviders, startFlow, finishFlow } from './oauth.js';
import { findAutomation, CATEGORIES, publicCatalog } from './catalog.js';
import { MICROS } from './billing.js';
import * as views from './views.js';
import * as legal from './legal.js';
import { dashboardData, isAdmin, recordEvent } from './analytics.js';
import { admin } from './admin-view.js';

const FORM_LIMIT = 20 * 1024;
const JSON_LIMIT = 1024 * 1024;
const OAUTH_COOKIE = 'aa_oauth';
const STARTER_CREDIT_USD = 0.25;
const authLimit = rateLimiter({ windowMs: 15 * 60e3, max: 20 });

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'",
};

const app = new Hono();

// Plain http reaches the Worker on custom domains, so send it to https and pin it there with HSTS.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
app.use(async (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    url.protocol = 'https:';
    return c.redirect(url.toString(), c.req.method === 'GET' || c.req.method === 'HEAD' ? 301 : 308);
  }
  await next();
  if (url.protocol === 'https:') c.header('Strict-Transport-Security', 'max-age=31536000');
});

// Services are cheap wrappers over the bindings, so build them per request.
app.use(async (c, next) => {
  const appUrl = (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  const starterUsd = c.env.STARTER_CREDIT_USD === undefined ? STARTER_CREDIT_USD : Number(c.env.STARTER_CREDIT_USD);
  const starterMicros = Math.round((starterUsd || 0) * MICROS);
  const auth = createAuth(c.env.DB, { starterMicros });
  const billing = createBilling(c.env.DB, { stripeKey: c.env.STRIPE_SECRET_KEY, webhookSecret: c.env.STRIPE_WEBHOOK_SECRET, appUrl });
  c.set('ctx', {
    appUrl, auth, billing, db: c.env.DB,
    appStore: createAppStore(c.env.DB, c.env),
    inference: createInference(billing, {
      ai: c.env.AI ?? (c.env.CLOUDFLARE_API_TOKEN ? restAi(c.env.CLOUDFLARE_ACCOUNT_ID, c.env.CLOUDFLARE_API_TOKEN) : null),
      // GATEWAY lets tests swap in a fake. OPENAI_API_KEY is only needed until the key is stored in AI Gateway.
      gateway: c.env.GATEWAY ?? ((c.env.AI || c.env.CLOUDFLARE_API_TOKEN)
        ? aiGateway({ binding: c.env.AI, accountId: c.env.CLOUDFLARE_ACCOUNT_ID, apiToken: c.env.CLOUDFLARE_API_TOKEN, gatewayId: c.env.AI_GATEWAY_ID, openaiKey: c.env.OPENAI_API_KEY })
        : null),
    }),
    oauth: oauthProviders(c.env),
    starterMicros,
    apiUrl: `${appUrl}/api/v1/generate`,
    secure: appUrl.startsWith('https://'),
  });
  await next();
  // A route may set its own CSP (see /app/connect); the rest get the defaults.
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!c.res.headers.has(k)) c.header(k, v);
});

// Reads a form body with a size cap. Returns null when it is too large.
async function readForm(c) {
  const text = await c.req.text();
  if (text.length > FORM_LIMIT) return null;
  return Object.fromEntries(new URLSearchParams(text));
}

const loadUser = async (c, next) => {
  const { auth } = c.get('ctx');
  c.set('sessionToken', getCookie(c, SESSION_COOKIE));
  c.set('user', await auth.sessionUser(c.get('sessionToken')));
  if (c.get('user')) c.get('user').is_admin = isAdmin(c.get('user'), c.env);
  await next();
};

const setSession = async (c, userId) => {
  const { auth, secure } = c.get('ctx');
  const { token, maxAge } = await auth.startSession(userId);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure, maxAge, path: '/' });
};

// Requires a signed-in user, and for POSTs a valid CSRF token. The parsed form is on c.get('form').
const requireUser = async (c, next) => {
  const user = c.get('user');
  if (!user) return c.redirect(`/login?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`, 302);
  if (c.req.method === 'POST') {
    const form = await readForm(c);
    if (!form) return c.text('Form is too large.', 413);
    if (!safeEqual(form.csrf || '', user.csrf)) return c.text('Invalid form token. Reload the page and try again.', 403);
    c.set('form', form);
  }
  await next();
};

const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/account');

const track = (c, name, event) => recordEvent(c.env.DB, name, event);
const requireAdmin = async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  const user = c.get('user');
  if (!user) return c.redirect('/login?next=/admin', 302);
  if (!isAdmin(user, c.env)) return c.text('Not found.', 404);
  await next();
};

// Stripe needs the raw body to verify the signature.
app.post('/webhooks/stripe', async (c) => {
  try {
    const type = await c.get('ctx').billing.handleWebhook(await c.req.text(), c.req.header('stripe-signature'));
    return c.json({ received: true, type });
  } catch (err) {
    return c.text(`Webhook error: ${err.message}`, 400);
  }
});

// Inference API for Shortcuts. Callers authenticate with their own aa_live_ key;
// the Workers AI binding bills our Cloudflare account and no token leaves the server.
const bearerUser = async (c) => {
  const user = await c.get('ctx').auth.apiKeyUser((c.req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim());
  c.set('apiUser', user);
  return user;
};

// Record the final request outcome, including parse/validation errors and exceptions.
// Multi-model audio requests count once. Invalid keys are excluded to avoid bot traffic.
app.use('/api/v1/*', async (c, next) => {
  const started = Date.now();
  await next();
  const path = new URL(c.req.url).pathname;
  if (c.req.method !== 'POST' || !/^\/api\/v1\/(run\/[^/]+|generate|ai\/run\/.+)$/.test(path)) return;
  const user = c.get('apiUser');
  if (!user) return;
  const shortcut = path.startsWith('/api/v1/run/');
  const slug = shortcut ? (findAutomation(c.req.param('slug'))?.slug || 'retired-shortcut') : path.endsWith('/generate') ? 'custom-api' : 'raw-api';
  await track(c, c.res.status === 200 ? 'run_succeeded' : 'run_failed', {
    userId: user.id, slug, status: c.res.status, durationMs: Math.max(0, Date.now() - started),
    source: user.can_mint ? 'iphone-app' : shortcut ? 'shortcut-key' : 'api',
  });
});

// Returns { body } or { error: [json, status] }.
async function readJson(c) {
  if (c.req.method !== 'POST') return { body: {} };
  const text = await c.req.text();
  if (text.length > JSON_LIMIT) return { error: [{ error: 'Request is too large.' }, 413] };
  try {
    const body = text ? JSON.parse(text) : {};
    return { body: body && typeof body === 'object' ? body : {} };
  } catch {
    return { error: [{ error: 'Body must be JSON.' }, 400] };
  }
}

const api = (handler) => async (c) => {
  const user = await bearerUser(c);
  if (!user) return c.json({ error: 'Missing or invalid API key.' }, 401);
  const { body, error } = await readJson(c);
  if (error) return c.json(...error);
  const { status, json } = await handler(c, user, body);
  return c.json(json, status);
};
app.post('/api/v1/generate', api((c, user, body) => hasAIConsent(user) ? c.get('ctx').inference.generate(user, body) : consentRequired(c.get('ctx').appUrl)));
// Mirrors https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}
app.post('/api/v1/ai/run/:model{.+}', api((c, user, body) => hasAIConsent(user) ? c.get('ctx').inference.run(user, c.req.param('model'), body) : consentRequired(c.get('ctx').appUrl)));

// What the installed shortcuts call. A shortcut shows `error` in an alert as-is and offers to
// open `action_url`, so both are written for the person holding the phone.
app.post('/api/v1/run/:slug', async (c) => {
  const { appUrl, inference } = c.get('ctx');
  const user = await bearerUser(c);
  const a = findAutomation(c.req.param('slug'));
  if (!a) return c.json({ error: 'This shortcut has been retired. Tap OK to find its replacement.', action_url: `${appUrl}/automations` }, 404);
  const page = `${appUrl}/automations/${a.slug}`;
  if (!user) return c.json({ error: 'This shortcut’s key isn’t working. Tap OK to add it again with a fresh key.', action_url: page }, 401);
  if (!hasAIConsent(user)) { const result = consentRequired(appUrl); return c.json(result.json, result.status); }
  let result;
  if (a.audio) {
    // Audio shortcuts post the recording itself as the body.
    if (Number(c.req.header('content-length')) > MAX_AUDIO_BYTES) return c.json({ error: 'That recording is too long. Recordings up to about 45 minutes work.', action_url: page }, 413);
    result = await inference.runAudioAutomation(user, a, await c.req.arrayBuffer());
  } else {
    const { body, error } = await readJson(c);
    if (error) return c.json({ ...error[0], action_url: page }, error[1]);
    if (a.recipeVersion && body.recipe_version !== a.recipeVersion) {
      return c.json({ error: 'Update this shortcut before running it again. The new version lets you review nutrition estimates before saving to Health.', action_url: `${page}/install` }, 426);
    }
    result = await (a.makesImage ? inference.makeImage(user, a, body) : a.picksChoice ? inference.pickChoice(user, a, body) : inference.runAutomation(user, a, body));
  }
  const { status, json } = result;
  if (status === 402) return c.json({ ...json, error: 'You’re out of credit. Tap OK to top up.', action_url: `${appUrl}/account#balance` }, 402);
  if (status !== 200) return c.json({ ...json, error: json.error === 'Model provider rejected the request.' ? 'The AI couldn’t answer that one. Please try again in a moment.' : json.error, action_url: page }, status);
  return c.json(json);
});
// Mints a key for a shortcut the iPhone app is about to install, with the app's own key.
// Keys from shortcuts can't mint: they get shared inside .shortcut files.
app.post('/api/v1/keys', api(async (c, user, body) => {
  if (!user.can_mint) return { status: 403, json: { error: 'Only the iPhone app’s key can create keys.' } };
  if (!hasAIConsent(user)) return consentRequired(c.get('ctx').appUrl);
  const name = String(body.name || '').trim().slice(0, 60) || 'My iPhone';
  return { status: 201, json: { key: await c.get('ctx').auth.createApiKey(user.id, name) } };
}));

// The catalog for the iPhone app, so it lists the same shortcuts as the site without an update.
app.get('/api/v1/catalog', (c) => {
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(publicCatalog());
});
app.get('/api/v1/balance', api(async (c, user) => ({ status: 200, json: { balance_usd: (await c.get('ctx').billing.balance(user.id)) / 1e6 } })));

// Account controls cannot be used with shareable shortcut keys. These responses
// contain account identifiers and must never be cached by a browser or CDN.
const accountApi = handler => api(async (c, user, body) => {
  c.header('Cache-Control', 'private, no-store');
  if (!user.can_mint) return { status: 403, json: { error: 'Sign in through the iPhone app to manage your account.' } };
  try { return { status: 200, json: await handler(c, user, body) }; }
  catch (error) {
    if (error instanceof PurchaseError || error instanceof AccountError) return { status: error.status, json: { error: error.message } };
    // Never log token payloads or upstream request objects.
    return { status: 503, json: { error: 'Account service is temporarily unavailable. Please retry.' } };
  }
});
app.get('/api/v1/store', accountApi(async (c, user) => {
  const store = c.get('ctx').appStore;
  return { enabled: store.enabled, app_account_token: await store.accountToken(user.id),
    products: Object.entries(CREDIT_PRODUCTS).map(([id, credit]) => ({ id, credit_usd: credit / MICROS })) };
}));
app.post('/api/v1/store/purchase', accountApi((c, user, body) => c.get('ctx').appStore.purchase(user.id, body.signed_transaction)));
app.post('/webhooks/apple', async c => {
  const { body, error } = await readJson(c);
  if (error) return c.json(...error);
  try {
    await c.get('ctx').appStore.notification(body.signedPayload);
    return c.json({ received: true });
  } catch (error) {
    return c.json({ error: error instanceof PurchaseError ? error.message : 'Apple notification processing is temporarily unavailable.' }, error instanceof PurchaseError ? error.status : 503);
  }
});
app.get('/api/v1/account/privacy', accountApi(async (_c, user) => ({ allowed: hasAIConsent(user), version: AI_CONSENT_VERSION, disclosure: AI_DISCLOSURE })));
app.post('/api/v1/account/privacy', accountApi(async (c, user, body) => {
  if (typeof body.allowed !== 'boolean' || body.version !== AI_CONSENT_VERSION) throw new AccountError('Review the current AI disclosure before changing permission.');
  await setAIConsent(c.env.DB, user.id, body.allowed);
  return { allowed: body.allowed, version: AI_CONSENT_VERSION };
}));
app.get('/api/v1/account', accountApi(async (c, user) => ({
  email: user.email, keys: await c.get('ctx').auth.listKeys(user.id),
  history: await c.get('ctx').billing.history(user.id),
})));
app.post('/api/v1/account/keys/revoke', accountApi(async (c, user, body) => {
  if (!Number.isSafeInteger(body.id)) throw new AccountError('Invalid key.');
  await c.get('ctx').auth.revokeKey(user.id, body.id);
  return { revoked: true, signed_out: body.id === user.key_id };
}));
app.post('/api/v1/account/delete', accountApi(async (c, user, body) => {
  if (body.confirmation !== 'DELETE') throw new AccountError('Confirm permanent account deletion.');
  await deleteAccount(c.env.DB, user.id, c.env, c.get('ctx').oauth.apple);
  return { deleted: true };
}));

app.use(loadUser);

// Pages
// Starter credit only goes to Google and Apple sign-ins, so only mention it when they are on.

app.get('/', (c) => c.html(views.landing({ user: c.get('user') })));
app.get('/automations', (c) => {
  const q = c.req.query('category');
  const category = CATEGORIES.includes(q) ? q : '';
  return c.html(views.catalog({ user: c.get('user'), category, query: c.req.query('q') || '' }));
});
app.get('/automations/:slug', (c) => {
  const a = findAutomation(c.req.param('slug'));
  if (!a) return c.html(views.notFound({ user: c.get('user') }), 404);
  return c.html(views.automationDetail({ user: c.get('user'), a, apiUrl: c.get('ctx').apiUrl }));
});
// Creates a key for this shortcut and hands it over with the signed file. Keys are only stored
// hashed, so each visit makes a new one; the page is never cached.
app.get('/automations/:slug/install', requireUser, async (c) => {
  const a = findAutomation(c.req.param('slug'));
  if (!a) return c.html(views.notFound({ user: c.get('user') }), 404);
  const { auth, billing, appUrl } = c.get('ctx');
  const user = c.get('user');
  if (!hasAIConsent(user)) return c.redirect(`/account/ai-privacy?next=${encodeURIComponent(`/automations/${a.slug}/install`)}`, 302);
  const [key, balance] = await Promise.all([auth.createApiKey(user.id, a.name), billing.balance(user.id)]);
  await track(c, 'install_started', { userId: user.id, slug: a.slug, source: 'web' });
  c.header('Cache-Control', 'no-store');
  return c.html(views.install({ user, a, key, balance, fileUrl: `${appUrl}/download/${a.slug}` }));
});
// The signed file, as an attachment named after the shortcut: iOS names an imported shortcut
// after its file, so this makes it arrive as "Draft a Reply" rather than "reply-drafter".
app.get('/download/:slug', async (c) => {
  const a = findAutomation(c.req.param('slug'));
  if (!a || !c.env.ASSETS) return c.html(views.notFound({ user: c.get('user') }), 404);
  const file = await c.env.ASSETS.fetch(new URL(`/shortcuts/${a.slug}.shortcut`, c.req.url));
  if (!file.ok) return c.html(views.notFound({ user: c.get('user') }), 404);
  return new Response(file.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${a.slug}.shortcut"; filename*=UTF-8''${encodeURIComponent(`${a.name}.shortcut`)}`,
      'Cache-Control': 'public, max-age=300',
    },
  });
});
app.get('/pricing', (c) => c.redirect('/terms#rates', 301));
app.get('/terms', (c) => c.html(legal.terms({ user: c.get('user') })));
app.get('/privacy', (c) => c.html(legal.privacy({ user: c.get('user') })));
app.get('/app/terms', c => c.html(legal.terms({ appMode: true })));
app.get('/app/privacy', c => c.html(legal.privacy({ appMode: true })));
app.get('/app/pricing', (c) => c.redirect('/app/terms#rates', 301));

app.get('/admin', requireAdmin, async (c) => {
  return c.html(admin({ user: c.get('user'), data: await dashboardData(c.env.DB, c.req.query('days')) }));
});
app.get('/admin/export', requireAdmin, async (c) => {
  const data = await dashboardData(c.env.DB, c.req.query('days'));
  c.header('Content-Disposition', `attachment; filename="analytics-${data.days}d.json"`);
  return c.json(data);
});
app.get('/support', (c) => c.html(legal.support({ user: c.get('user') })));

// Auth
for (const mode of ['login', 'signup']) {
  app.get(`/${mode}`, (c) => (c.get('user') ? c.redirect(safeNext(c.req.query('next')), 302) : c.html(views.authPage({ mode, next: c.req.query('next'), providers: providerList(c) }))));
  app.post(`/${mode}`, async (c) => {
    const body = (await readForm(c)) ?? {};
    const render = (status, error) => c.html(views.authPage({ mode, error, email: body.email, next: body.next, providers: providerList(c) }), status);
    if (!authLimit(c.req.header('cf-connecting-ip') || 'local')) return render(429, 'Too many attempts. Wait a few minutes and try again.');
    const creds = validateCredentials(body.email, body.password);
    if (creds.error) return render(400, mode === 'login' ? 'That email and password do not match.' : creds.error);
    const result = await c.get('ctx').auth[mode](creds.email, creds.password);
    if (result.error) return render(mode === 'login' ? 401 : 409, result.error);
    await setSession(c, result.userId);
    await track(c, mode === 'login' ? 'login' : 'signup', { userId: result.userId });
    return c.redirect(safeNext(body.next), 303);
  });
}

// Sign in with Google / Apple. The state, nonce and PKCE verifier ride in a short-lived cookie,
// which binds the callback to the browser that started it. Apple posts the callback cross-site
// (form_post), so over HTTPS the cookie has to be SameSite=None.
const providerList = (c) => Object.entries(c.get('ctx').oauth).map(([id, p]) => ({ id, name: p.name }));
const redirectUri = (c, id) => `${c.get('ctx').appUrl}/auth/${id}/callback`;
const oauthCookie = (c) => ({ httpOnly: true, secure: c.get('ctx').secure, sameSite: c.get('ctx').secure ? 'None' : 'Lax', path: '/auth' });

app.get('/auth/:provider', async (c) => {
  const id = c.req.param('provider');
  const provider = c.get('ctx').oauth[id];
  if (!provider) return c.html(views.notFound({ user: c.get('user') }), 404);
  const { url, flow } = await startFlow(provider, redirectUri(c, id));
  const value = btoa(encodeURIComponent(JSON.stringify({ ...flow, provider: id, next: safeNext(c.req.query('next')) })));
  setCookie(c, OAUTH_COOKIE, value, { ...oauthCookie(c), maxAge: 600 });
  return c.redirect(url, 302);
});

app.on(['GET', 'POST'], '/auth/:provider/callback', async (c) => {
  const id = c.req.param('provider');
  const provider = c.get('ctx').oauth[id];
  if (!provider) return c.html(views.notFound({ user: c.get('user') }), 404);
  const params = c.req.method === 'POST' ? (await readForm(c)) ?? {} : c.req.query();
  const fail = (status, error) => c.html(views.authPage({ mode: 'login', error, next: flow?.next || '', providers: providerList(c) }), status);

  let flow;
  try {
    flow = JSON.parse(decodeURIComponent(atob(getCookie(c, OAUTH_COOKIE) || '')));
  } catch {
    flow = null;
  }
  deleteCookie(c, OAUTH_COOKIE, oauthCookie(c));
  if (params.error) return fail(400, params.error === 'access_denied' || params.error === 'user_cancelled_authorize'
    ? `${provider.name} sign-in was cancelled.` : `${provider.name} sign-in failed. Please try again.`);
  if (!flow || flow.provider !== id || !params.state || !safeEqual(params.state, flow.state) || !params.code) {
    return fail(400, 'That sign-in link expired. Please try again.');
  }
  if (!authLimit(c.req.header('cf-connecting-ip') || 'local')) return fail(429, 'Too many attempts. Wait a few minutes and try again.');

  let identity;
  let encryptedToken;
  try {
    identity = await finishFlow(provider, { code: params.code, redirectUri: redirectUri(c, id), flow });
    if (id === 'apple') {
      if (!identity.revocationToken) throw new Error('Apple did not return a revocation token.');
      encryptedToken = await sealToken(identity.revocationToken, c.env.TOKEN_ENCRYPTION_KEY, identity.subject);
    }
  } catch (err) {
    return fail(400, `${provider.name} sign-in failed. Please try again.`);
  }
  const result = await c.get('ctx').auth.oauthLogin(id, identity);
  if (result.error) return fail(400, result.error);
  if (encryptedToken) await c.env.DB.prepare("UPDATE identities SET revocation_token = ? WHERE provider = 'apple' AND subject = ? AND user_id = ?")
    .bind(encryptedToken, identity.subject, result.userId).run();
  await setSession(c, result.userId);
  await track(c, result.created ? 'signup' : result.linked ? 'oauth_linked' : 'login', { userId: result.userId, source: id });
  if (result.linked && !flow.next?.startsWith('/app/connect')) return c.redirect(`/account?linked=${id}${result.passwordDisabled ? '&password=off' : ''}`, 303);
  return c.redirect(safeNext(flow.next), 303);
});

// Signs the iPhone app in. The app opens this page in an ASWebAuthenticationSession, so the
// person signs in on the site as usual, confirms, and the new key goes back to the app through
// its URL scheme. `state` is the app's own nonce, echoed back so it can match the reply.
const APP_CALLBACK = 'iphoneadvanced://connect';
const appState = (s) => (typeof s === 'string' && /^[\w-]{16,64}$/.test(s) ? s : null);
// form-action is enforced by the page that holds the form, including where its POST redirects,
// so the Connect page itself has to allow the app's scheme. Set on the redirect alone, browsers
// block the hop to iphoneadvanced:// and the Connect button looks dead.
const APP_CONNECT_CSP = SECURITY_HEADERS['Content-Security-Policy'].replace("form-action 'self'", "form-action 'self' iphoneadvanced:");
app.get('/app/connect', requireUser, (c) => {
  const state = appState(c.req.query('state'));
  if (!state) return c.html(views.notFound({ user: c.get('user') }), 404);
  c.header('Cache-Control', 'no-store');
  c.header('Content-Security-Policy', APP_CONNECT_CSP);
  return c.html(views.appConnect({ user: c.get('user'), state }));
});
app.post('/app/connect', requireUser, async (c) => {
  const state = appState(c.get('form').state);
  if (!state) return c.text('That sign-in link expired. Go back to the app and try again.', 400);
  const key = await c.get('ctx').auth.createApiKey(c.get('user').id, 'iPhone app', { canMint: true });
  c.header('Content-Security-Policy', APP_CONNECT_CSP);
  return c.redirect(`${APP_CALLBACK}?${new URLSearchParams({ key, state })}`, 303);
});

app.post('/logout', requireUser, async (c) => {
  await c.get('ctx').auth.endSession(c.get('sessionToken'));
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.redirect('/', 303);
});

// Account
app.get('/account/ai-privacy', requireUser, c => {
  c.header('Cache-Control', 'private, no-store');
  return c.html(views.layout({ title: 'AI Privacy', user: c.get('user'), body: `<section class="wrap narrow page-head">
    <h1>AI data sharing</h1><p>${AI_DISCLOSURE}</p><p>You can browse without permission. Turning it off blocks future calls from all your keys; requests already sent cannot be recalled.</p>
    <p>Current setting: ${hasAIConsent(c.get('user')) ? 'Allowed' : 'Not allowed'}.</p>
    <form method="post"><input type="hidden" name="csrf" value="${views.e(c.get('user').csrf)}">
    <input type="hidden" name="version" value="${AI_CONSENT_VERSION}">
    <input type="hidden" name="next" value="${views.e(safeNext(c.req.query('next')))}">
    <button class="btn" name="allowed" value="true">Allow AI data sharing</button>
    <button class="btn" name="allowed" value="false">Turn off AI data sharing</button></form></section>` }));
});
app.post('/account/ai-privacy', requireUser, async c => {
  const form = c.get('form');
  if (Number(form.version) !== AI_CONSENT_VERSION || !['true', 'false'].includes(form.allowed)) return c.text('Review the current disclosure and try again.', 400);
  await setAIConsent(c.env.DB, c.get('user').id, form.allowed === 'true');
  return c.redirect(form.allowed === 'true' ? safeNext(form.next) : '/account/ai-privacy', 303);
});
app.get('/account/delete', requireUser, c => {
  c.header('Cache-Control', 'private, no-store');
  return c.html(views.layout({ title: 'Delete account', user: c.get('user'), body: `<section class="wrap narrow page-head">
    <h1>Permanently delete account</h1><p>This cannot be undone. Your data, sessions and keys will be removed. All shortcuts lose access and remaining credit is forfeited. This does not request a payment refund. Unlinked payment identifiers remain to prevent replay.</p>
    <p>Request any Apple refund through <a href="https://reportaproblem.apple.com">Apple</a> before deletion. Contact support for web-payment questions.</p>
    <form method="post"><input type="hidden" name="csrf" value="${views.e(c.get('user').csrf)}">
    <label>Type DELETE to confirm<input name="confirmation" required autocomplete="off"></label>
    <button class="btn" type="submit">Permanently delete account</button></form><a href="/account">Cancel</a></section>` }));
});
app.post('/account/delete', requireUser, async c => {
  if (c.get('form').confirmation !== 'DELETE') return c.text('Type DELETE to confirm permanent deletion.', 400);
  try {
    await deleteAccount(c.env.DB, c.get('user').id, c.env, c.get('ctx').oauth.apple);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.html(views.layout({ title: 'Account deleted', body: '<section class="wrap page-head"><h1>Your account has been deleted.</h1></section>' }));
  } catch (error) {
    if (error instanceof AccountError && error.status === 409) return c.redirect('/auth/apple?next=%2Faccount%2Fdelete', 303);
    return c.text(error instanceof AccountError ? error.message : 'Account deletion is temporarily unavailable. Please retry.', 503);
  }
});
const renderAccount = async (c, extra = {}, status = 200) => {
  c.header('Cache-Control', 'private, no-store');
  const { auth, billing, inference, apiUrl } = c.get('ctx');
  const user = c.get('user');
  const [balance, keys, history, linked] = await Promise.all([
    billing.balance(user.id), auth.listKeys(user.id), billing.history(user.id), auth.linkedProviders(user.id),
  ]);
  return c.html(views.account({
    user: { ...user, balance_micros: balance },
    keys, history, linked,
    billingEnabled: billing.enabled,
    inferenceEnabled: inference.enabled,
    apiUrl,
    ...extra,
  }), status);
};

app.get('/account', requireUser, async (c) => {
  let notice;
  const checkout = c.req.query('checkout');
  const linked = c.get('ctx').oauth[c.req.query('linked')];
  if (linked) {
    notice = { tone: 'positive', text: `${linked.name} is now linked to your account.` };
    if (c.req.query('password') === 'off') notice.text += ` Your old password was turned off because this email had not been confirmed. Use ${linked.name} to sign in.`;
  } else if (checkout === 'cancelled') notice = { tone: 'neutral', text: 'Checkout cancelled. You were not charged.' };
  else if (typeof checkout === 'string' && checkout.startsWith('cs_')) {
    try {
      await c.get('ctx').billing.confirmCheckout(checkout, c.get('user').id);
      notice = { tone: 'positive', text: 'Payment received. Your credit has been added.' };
    } catch {
      notice = { tone: 'neutral', text: 'Payment is processing. Your balance will update shortly.' };
    }
  }
  return renderAccount(c, { notice });
});

app.post('/account/topup', requireUser, async (c) => {
  try {
    const url = await c.get('ctx').billing.createCheckout(c.get('user'), Number(c.get('form').amount));
    return c.redirect(url, 303);
  } catch (err) {
    return renderAccount(c, { notice: { tone: 'negative', text: err.message } }, 400);
  }
});

app.post('/account/keys', requireUser, async (c) => {
  const name = String(c.get('form').name || '').trim().slice(0, 60) || 'My iPhone';
  return renderAccount(c, { newKey: await c.get('ctx').auth.createApiKey(c.get('user').id, name) });
});

app.post('/account/keys/:id/revoke', requireUser, async (c) => {
  await c.get('ctx').auth.revokeKey(c.get('user').id, Number(c.req.param('id')));
  return c.redirect('/account#keys', 303);
});

app.notFound((c) => c.html(views.notFound({ user: c.get('user') }), 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong.' }, 500);
});

export default app;

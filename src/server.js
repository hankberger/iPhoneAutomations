import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { openDb } from './db.js';
import { createAuth, validateCredentials, rateLimiter, SESSION_COOKIE } from './auth.js';
import { createBilling } from './billing.js';
import { createInference } from './inference.js';
import { findAutomation, CATEGORIES } from './catalog.js';
import * as views from './views.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function createApp({ db = openDb(), appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 8787}`, inference: inferenceOptions } = {}) {
  const auth = createAuth(db);
  const billing = createBilling(db, { appUrl });
  const inference = createInference(billing, inferenceOptions);
  const secure = appUrl.startsWith('https://');
  const apiUrl = `${appUrl}/api/v1/generate`;
  const heroImage = fs.existsSync(path.join(root, 'public/img/hero.png')) ? '/img/hero.png' : null;
  const authLimit = rateLimiter({ windowMs: 15 * 60e3, max: 20 });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'",
    });
    next();
  });

  // Stripe needs the raw body to verify the signature, so this goes before the body parsers.
  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    try {
      const type = billing.handleWebhook(req.body, req.get('stripe-signature'));
      res.json({ received: true, type });
    } catch (err) {
      res.status(400).send(`Webhook error: ${err.message}`);
    }
  });

  app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));

  app.use((req, res, next) => {
    req.sessionToken = cookies(req)[SESSION_COOKIE];
    req.user = auth.sessionUser(req.sessionToken);
    next();
  });

  const setSession = (res, userId) => {
    const { token, maxAge } = auth.startSession(userId);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge, path: '/' });
  };
  const requireUser = (req, res, next) => (req.user ? next() : res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`));
  const requireCsrf = (req, res, next) => {
    const a = Buffer.from(String(req.body.csrf || ''));
    const b = Buffer.from(req.user.csrf);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? next() : res.status(403).send('Invalid form token. Reload the page and try again.');
  };
  const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/account');

  // Pages
  app.get('/', (req, res) => res.send(views.landing({ user: req.user, heroImage })));
  app.get('/automations', (req, res) => {
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
    res.send(views.catalog({ user: req.user, category }));
  });
  app.get('/automations/:slug', (req, res) => {
    const a = findAutomation(req.params.slug);
    if (!a) return res.status(404).send(views.notFound({ user: req.user }));
    res.send(views.automationDetail({ user: req.user, a, apiUrl }));
  });
  app.get('/pricing', (req, res) => res.send(views.pricing({ user: req.user })));

  // Auth
  for (const mode of ['login', 'signup']) {
    app.get(`/${mode}`, (req, res) => (req.user ? res.redirect('/account') : res.send(views.authPage({ mode, next: req.query.next }))));
    app.post(`/${mode}`, async (req, res) => {
      const render = (status, error) => res.status(status).send(views.authPage({ mode, error, email: req.body.email, next: req.body.next }));
      if (!authLimit(req.ip)) return render(429, 'Too many attempts. Wait a few minutes and try again.');
      const creds = validateCredentials(req.body.email, req.body.password);
      if (creds.error) return render(400, mode === 'login' ? 'That email and password do not match.' : creds.error);
      const result = await auth[mode](creds.email, creds.password);
      if (result.error) return render(mode === 'login' ? 401 : 409, result.error);
      setSession(res, result.userId);
      res.redirect(303, safeNext(req.body.next));
    });
  }
  app.post('/logout', requireUser, requireCsrf, (req, res) => {
    auth.endSession(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect(303, '/');
  });

  // Account
  const renderAccount = (req, res, extra = {}) => res.send(views.account({
    user: { ...req.user, balance_micros: billing.balance(req.user.id) },
    keys: auth.listKeys(req.user.id),
    history: billing.history(req.user.id),
    billingEnabled: billing.enabled,
    inferenceEnabled: inference.enabled,
    apiUrl,
    ...extra,
  }));

  app.get('/account', requireUser, async (req, res) => {
    let notice;
    const checkout = req.query.checkout;
    if (checkout === 'cancelled') notice = { tone: 'neutral', text: 'Checkout cancelled. You were not charged.' };
    else if (typeof checkout === 'string' && checkout.startsWith('cs_')) {
      try {
        await billing.confirmCheckout(checkout, req.user.id);
        notice = { tone: 'positive', text: 'Payment received. Your credit has been added.' };
      } catch {
        notice = { tone: 'neutral', text: 'Payment is processing. Your balance will update shortly.' };
      }
    }
    renderAccount(req, res, { notice });
  });

  app.post('/account/topup', requireUser, requireCsrf, async (req, res) => {
    try {
      const url = await billing.createCheckout(req.user, Number(req.body.amount));
      res.redirect(303, url);
    } catch (err) {
      renderAccount(req, res.status(400), { notice: { tone: 'negative', text: err.message } });
    }
  });

  app.post('/account/keys', requireUser, requireCsrf, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60) || 'My iPhone';
    renderAccount(req, res, { newKey: auth.createApiKey(req.user.id, name) });
  });

  app.post('/account/keys/:id/revoke', requireUser, requireCsrf, (req, res) => {
    auth.revokeKey(req.user.id, Number(req.params.id));
    res.redirect(303, '/account#keys');
  });

  // Inference API for Shortcuts. Callers authenticate with their own aa_live_ key;
  // our Cloudflare token never leaves the server.
  const apiUser = (req) => auth.apiKeyUser((req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim());
  const api = (handler) => async (req, res, next) => {
    const user = apiUser(req);
    if (!user) return res.status(401).json({ error: 'Missing or invalid API key.' });
    try {
      const { status, json } = await handler(user, req);
      res.status(status).json(json);
    } catch (err) {
      next(err);
    }
  };
  const json = express.json({ limit: '1mb' });
  app.post('/api/v1/generate', json, api((user, req) => inference.generate(user, req.body || {})));
  // Mirrors https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}
  app.post('/api/v1/ai/run/*', json, api((user, req) => inference.run(user, req.params[0], req.body || {})));
  app.get('/api/v1/balance', api(async (user) => ({ status: 200, json: { balance_usd: billing.balance(user.id) / 1e6 } })));

  app.use((req, res) => res.status(404).send(views.notFound({ user: req.user })));
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createApp().listen(port, () => console.log(`Advanced Automations on http://localhost:${port}`));
}

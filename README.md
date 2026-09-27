# Advanced Automations

Free iPhone Shortcuts automations, with pay-as-you-go AI credit sold at a markup. Domain: iphoneadvanced.com.

Runs on Cloudflare Workers: [Hono](https://hono.dev) for routing, D1 for the database, the Workers AI binding for inference, and Workers static assets for `public/`.

- **Pages:** landing (`/`), catalog (`/automations`), automation detail, pricing, login, signup, account.
- **Login:** email and password, PBKDF2-SHA256 hashes (Web Crypto, 100k iterations), server-side sessions in an httpOnly cookie, CSRF tokens on every form, rate-limited login.
- **Payments:** Stripe Checkout top-ups ($5, $10, $25, $50). Credit is added by the `checkout.session.completed` webhook and again on the success redirect, both idempotent.
- **Inference proxy:** `POST /api/v1/generate` with `Authorization: Bearer aa_live_...`. It reserves the worst-case cost before calling Workers AI, then refunds the difference, so concurrent calls cannot overdraw. Every change lands in a ledger shown on the account page.

## Run locally

Needs Node 20 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in keys as you get them
npm run dev:local                # http://localhost:8787, local D1
npm test
```

`npm run dev:local` keeps everything local and calls Workers AI over the REST API with `CLOUDFLARE_API_TOKEN` from `.dev.vars` (a token with Workers AI: Read is enough). `npm run dev` uses the real AI binding through Wrangler's remote proxy instead, which needs `wrangler login` with Workers edit access.

The site runs without any keys. Top-up buttons and the API show a "not configured" state until they are set.

## Deploy

```bash
npx wrangler login
# D1 database advanced-automations already exists; its id is in wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # from the Stripe dashboard webhook endpoint
npm run deploy
```

Then add a Stripe webhook endpoint at `https://<your-domain>/webhooks/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. For the custom domain, add `iphoneadvanced.com` under the Worker's Settings > Domains & Routes and set `APP_URL` in `wrangler.jsonc` vars.

Schema changes go in a new file under `migrations/`.

## Stripe

```bash
stripe login
# Put your test secret key in .dev.vars as STRIPE_SECRET_KEY, then:
stripe listen --forward-to localhost:8787/webhooks/stripe
# Copy the whsec_... it prints into .dev.vars as STRIPE_WEBHOOK_SECRET and restart.
```

Test with card `4242 4242 4242 4242`, any future date and CVC. Use live keys and a dashboard webhook endpoint in production.

## Inference (Cloudflare Workers AI)

In production the Worker calls models through its `AI` binding, billed to the Cloudflare account it is deployed on, so no API token is stored. `MARKUP` in `wrangler.jsonc` vars sets the resale multiplier (default 1.5, so 50% over Cloudflare's price). Resold models and their prices are in `src/inference.js`; check them against Cloudflare's pricing page before launch.

Users authenticate with their own `aa_live_` key from the account page.

**Shortcuts-friendly:** `POST /api/v1/generate`

```json
{ "prompt": "Summarize this in three lines.", "input": "<text from the shortcut>", "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }
```

Response: `{ text, model, cost_usd, balance_usd, usage }`.

**Pass-through:** `POST /api/v1/ai/run/{model}` takes the same body as Cloudflare's `/ai/run/{model}` and returns `{ success, result, billing }`.

Each call reserves its worst-case cost first, then charges actual token usage and refunds the rest. `402` means not enough credit. Streaming is not supported yet, and `max_tokens` defaults to 1024 (cap 4096).

## Mockups with GPT-Image-2

```bash
OPENAI_API_KEY=... npm run mockups            # all
OPENAI_API_KEY=... npm run mockups -- hero    # one
```

Writes design references to `docs/mockups/` and `public/img/hero.png`. When `hero.png` exists the landing page uses it instead of the CSS phone. Check any generated people for malformed hands before shipping.

# Advanced Automations

Free iPhone Shortcuts automations, with pay-as-you-go AI credit sold at a markup. Domain: iphoneadvanced.com.

- **Pages:** landing (`/`), catalog (`/automations`), automation detail, pricing, login, signup, account.
- **Login:** email and password, scrypt hashes, server-side sessions in an httpOnly cookie, CSRF tokens on every form, rate-limited login.
- **Payments:** Stripe Checkout top-ups ($5, $10, $25, $50). Credit is added by the `checkout.session.completed` webhook and again on the success redirect, both idempotent.
- **Inference proxy:** `POST /api/v1/generate` with `Authorization: Bearer aa_live_...`. It reserves the worst-case cost before calling Claude, then refunds the difference, so concurrent calls cannot overdraw. Every change lands in a ledger shown on the account page.

## Run locally

Needs Node 22.13 or newer (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env     # fill in keys as you get them
npm start                # http://localhost:8787
npm test
```

The site runs without any keys. Top-up buttons and the API show a "not configured" state until the keys below are set.

## Stripe

```bash
stripe login
# Put your test secret key in .env as STRIPE_SECRET_KEY, then:
stripe listen --forward-to localhost:8787/webhooks/stripe
# Copy the whsec_... it prints into .env as STRIPE_WEBHOOK_SECRET and restart.
```

Test with card `4242 4242 4242 4242`, any future date and CVC. Use live keys and a dashboard webhook endpoint in production.

## Inference (Cloudflare Workers AI)

Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (a token with the Workers AI: Read permission) and `MARKUP` (default 1.5, so 50% over Cloudflare's price). Resold models and their prices are in `src/inference.js`; check them against Cloudflare's pricing page before launch.

Users authenticate with their own `aa_live_` key from the account page. The Cloudflare token stays on the server.

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

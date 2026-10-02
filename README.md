# Advanced Automations

Free iPhone Shortcuts automations, with pay-as-you-go AI credit sold at a markup. Domain: iphoneadvanced.com.

Runs on Cloudflare Workers: [Hono](https://hono.dev) for routing, D1 for the database, the Workers AI binding for inference, and Workers static assets for `public/`.

- **Pages:** landing (`/`), catalog (`/automations`), shortcut detail, install page (`/automations/<slug>/install`), pricing, login, signup, account.
- **Getting a shortcut:** Get → sign in (Google or Apple accounts start with $0.25 of credit, `STARTER_CREDIT_USD` to change) → the install page makes a key for that shortcut, copies it and opens `shortcuts://import-shortcut` with the signed file. Shortcuts asks for the key once, as an import question.
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

## Admin analytics

The private dashboard lives at `/admin`; its aggregate JSON export is `/admin/export`.
Set `ADMIN_EMAILS` to a comma-separated allowlist of **verified** operator emails (sign
in with Google or Apple), or `ADMIN_USER_IDS` to explicitly approved existing account
IDs. An unverified email/password registration never grants admin access. Both routes
require a browser session and send `private, no-store` and `noindex` headers.

Apply migrations `0005_analytics.sql` and `0006_analytics_quality.sql` before deploying.
For production, use `npx wrangler secret put ADMIN_EMAILS` and sign in with that account.
The Analytics navigation link appears only for authorized operators.

The primary KPI is **weekly repeat users**: people with successful results on at least
two distinct days in the last seven complete UTC days. Supporting KPIs cover 7-day
activation, week-1/week-4 retention, repeat-use rate, run success, workflow adoption,
credit blocks, successful-request P95 latency, and paid conversion. All rates show
denominators. Cohorts use signup-relative age and exclude immature users and users who
joined before instrumentation. The 7-day filter may not yet have mature signup cohorts;
use 30/90 days to inspect retention. The dashboard explains these definitions in place.

Purchased credit is face value from Stripe live checkouts and Apple production
transactions, not revenue or profit. Free/manual credit and sandbox purchases are
excluded. Today is shown separately from complete-day period comparisons. Comparisons
are withheld until enough event history exists; old billing rows are not reconstructed
as successful requests. Operator/test accounts are currently included in engagement.

Telemetry records only the account ID, workflow, credential type, final status,
duration and timestamp. Authenticated malformed/failed requests are included; invalid
keys and unrelated API endpoints are excluded. Multi-model audio requests count once.
No prompt, uploaded media, generated output, raw error, or key is stored. Event writes
are best-effort and log a generic failure without disrupting the product.

Run `node scripts/analytics-preview.mjs` for a synthetic, in-memory preview on
`http://127.0.0.1:8790` (`/empty` exercises no-history states). It never contacts production
or uses its credentials. `npm test` includes boundary, cohort, billing, telemetry and
admin-access regression tests.

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

## Sign in with Google and Apple

Each button shows up only when its secrets are set. Accounts are matched by provider subject first, then linked by verified email. When a provider signs in to an existing password account whose email was never confirmed, the old password is turned off and its sessions end, so nobody can pre-register someone else's email and keep access.

**Google.** In Google Cloud console, APIs & Services > Credentials, create an OAuth client ID of type Web application. Authorized redirect URI: `https://<your-domain>/auth/google/callback`. Then:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

**Apple.** In the Apple Developer portal (Certificates, Identifiers & Profiles): create a Services ID with Sign in with Apple enabled, add your domain and the return URL `https://<your-domain>/auth/apple/callback` (Apple does not accept localhost or plain http), and create a key with Sign in with Apple enabled. Then:

```bash
npx wrangler secret put APPLE_CLIENT_ID     # the Services ID, e.g. com.iphoneadvanced.web
npx wrangler secret put APPLE_TEAM_ID
npx wrangler secret put APPLE_KEY_ID
npx wrangler secret put APPLE_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
```

Run `npm run db:migrate:remote` once to add the `identities` table.

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

## Shortcut files

Each automation in `src/catalog.js` has a source file at `shortcuts/<slug>.cherri` in [Cherri](https://github.com/electrikmilk/cherri), a language that compiles to Shortcuts. `npm run shortcuts` wraps each one with the key import question and the API call, compiles it, signs it and writes `public/shortcuts/<slug>.shortcut`. On macOS, signing uses Apple's local `shortcuts sign` command without falling back to a third-party service. Other platforms use Cherri's configured signing service; building Log My Meal currently requires macOS `plutil` for its compiled-action validation. Commit the signed files.

The tested compiler revision includes the import-question index fix but still needs the Health quantity patch. Build it from the directory beside this repository:

```sh
git clone https://github.com/electrikmilk/cherri && cd cherri
git checkout a66db15b7f247f3121726c2a2b72becfeef3d96b
git apply ../iPhoneAutomations/scripts/cherri-health-quantity.patch
go build -o ./cherri .
```

iOS only imports straight into Shortcuts from an iCloud share link: `shortcuts://import-shortcut?url=` rejects every other URL. So the install page downloads the signed file from `/download/<slug>` (named after the shortcut) and Safari hands it to Shortcuts. For one-tap installs, add each shortcut on an iPhone, tap Share, then Copy iCloud Link, and put the link in the automation's `icloudUrl` in `src/catalog.js`. Make a new link whenever the .cherri file changes.

Set `CHERRI` to that binary's absolute path when running the build. The older `scripts/cherri-import-questions.patch` is only for older compiler revisions. Set `SHORTCUT_AUDIT_DIR` to retain compiled XML for inspection. Log My Meal's build verifies the cancellable estimate review and all four subsequent Health quantities, and updates `test/fixtures/meal-workflow.json` with source/artifact hashes. Commit that fixture with the signed file. Its `recipe_version: 2` request is mandatory; older installed versions receive an upgrade error without inference charges. The obsolete iCloud link has been removed. Structural tests do not establish nutrition accuracy or replace device testing.

Installed shortcuts call `POST /api/v1/run/<slug>` with `{ "input": "...", "choice": "...", "image": "<base64 JPEG>" }` (choice and image only where the automation uses them). Audio automations such as Summarize My Meeting Notes post the recording itself as the body instead; it is transcribed with Whisper, billed per minute, and the notes come back with the transcript underneath. The prompt and model come from the catalog, so they can change without anyone reinstalling. Errors return `{ error, action_url }`: the shortcut shows the message and offers to open the link (top up, or add the shortcut again with a fresh key). Shortcuts point at `https://iphoneadvanced.com` unless built with `SHORTCUT_API_BASE`.

## iPhone app

`ios/` is a SwiftUI app (iOS 17+) that lists the same automations as the site and adds the six building blocks to the Shortcuts app as native actions: Ask AI, Ask AI About an Image, Transcribe Audio, Pull Out Details, Pick a Category and Make an Image. They are App Intents in `ios/AdvancedAutomations/Intents/`, and each calls `POST /api/v1/run/<slug>` with the app's own key, the same request the Run Shortcut versions make, so prompts and models still change on the server without an app update.

- **Sign-in:** the app opens `/app/connect` in an `ASWebAuthenticationSession`. The person signs in on the site as usual (email, Google or Apple), taps Connect, and a new key named "iPhone app" comes back through `iphoneadvanced://connect`. The key lives in the Keychain.
- **Catalog:** fetched from `GET /api/v1/catalog`, cached, with `ios/AdvancedAutomations/Resources/catalog.json` bundled for first launch. Run `npm run ios:catalog` after changing `src/catalog.js`.
- **Getting a shortcut:** after explicit AI-sharing permission, the app mints a key through `POST /api/v1/keys`, copies it and opens the iCloud link or downloads the signed file directly in Safari.
- **Credit:** balance comes from `/api/v1/balance`; Add credit uses StoreKit consumables and retries unfinished purchases. Website Stripe checkout is separate.

Open `ios/AdvancedAutomations.xcodeproj`, pick your team under Signing & Capabilities, and run. To point it at `npm run dev:local`, change `API.baseURL` in `Services/API.swift`. The Xcode project uses folder-synchronized groups, so new files under `ios/AdvancedAutomations/` are picked up without editing the project.

## App Store readiness

App Store preparation and outstanding release gates are tracked in [docs/app-store-review.md](docs/app-store-review.md). The app is not submission-ready until those gates are closed.

The native client now buys consumable credit with StoreKit; Stripe remains on the independent website. `/api/v1/store/purchase` verifies account-bound transactions with Apple; `/webhooks/apple` handles signed App Store Server Notifications V2. See `.dev.vars.example` for server configuration. Never grant production inference credit to arbitrary sandbox accounts.

Before deploying this version, apply migrations through `0009` and provision `TOKEN_ENCRYPTION_KEY` (a separate 32-byte hex secret) alongside the Apple sign-in credentials. Apple provider tokens are encrypted at login for revocation during deletion. Existing accounts must explicitly approve AI sharing; native and downloaded shortcut calls are blocked until they do so.

Account deletion UI, routes and account-ID/late-payment safeguards are implemented but deletion **remains disabled by default**. Migration `0009` permanently retains issued numeric IDs; password/OAuth signup never recycle them, and late Stripe/usage ledger writes skip deleted accounts. Do not enable `ACCOUNT_DELETION_ENABLED` until migration, matching server deployment and staging/device tests in the checklist are complete. Never reset the ID registry or roll back to pre-safeguard auth/billing code after enabling deletion. Late Stripe payments do not trigger automatic refunds. No production migration or deployment is implied by these source changes.

Local Worker verification (no real credentials or upstream calls):

```sh
npx wrangler deploy --dry-run --outdir /tmp/iphoneautomations-review-worker --env local
node scripts/review-smoke.mjs
```

Standalone native consent and purchase-concurrency checks (no credentials or payments):

```sh
xcrun swiftc ios/AdvancedAutomations/Services/AIConsent.swift test/ai-consent.swift -o /tmp/iphoneautomations-consent-test
/tmp/iphoneautomations-consent-test
xcrun swiftc ios/AdvancedAutomations/Services/PurchaseDeliveryQueue.swift test/purchase-delivery.swift -o /tmp/iphoneautomations-purchase-delivery-test
/tmp/iphoneautomations-purchase-delivery-test
```

## Mockups with GPT-Image-2

```bash
OPENAI_API_KEY=... npm run mockups            # all
OPENAI_API_KEY=... npm run mockups -- hero    # one
```

Writes design references to `docs/mockups/` and `public/img/hero.png`. When `hero.png` exists the landing page uses it instead of the CSS phone. Check any generated people for malformed hands before shipping.

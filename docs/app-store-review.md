# App Store submission readiness

Audited October 2, 2026. This is a release checklist, not a claim that Apple has approved the app.
The app is **not ready to submit** while any release gate below remains open.

## Current implementation and remaining gates

| Area | Current evidence | Release gate |
| --- | --- | --- |
| Browse without an account | Welcome → Browse without an account; native library tabs | Exercise on iPhone and iPad, including large text |
| Native AI consent | Account → AI Privacy, named providers and data categories; both `API.run` overloads check consent before upload | Test sign-in, deny, allow, withdraw and different-account flows on device |
| Downloaded shortcut consent | Account-level versioned consent gates every inference path; native/web approval; withdrawal blocks all keys | Test real installed shortcuts with denied and withdrawn permission |
| Privacy manifest | Bundled `PrivacyInfo.xcprivacy`, no tracking, app-only UserDefaults reason | Generate archive privacy report and reconcile App Store Connect answers with production provider retention |
| AI Gateway retention | Image requests send `cf-aig-collect-log: false` and `cf-aig-skip-cache: true` | Verify binding and REST requests in the actual gateway; inspect and remove older stored payloads under the retention policy |
| In-app purchases | Native StoreKit, verified app-bound server delivery, notifications, refunds/reversals and unfinished-purchase recovery | Configure credentials/products and verify real sandbox purchases, refunds and reversals |
| Account deletion | Native/web confirmation, data deletion and encrypted Apple-token revocation implemented; disabled by default | Approve and implement account-ID non-reuse and late-payment/settlement guards before enabling deletion; test on device |
| External checkout links | Native StoreKit and key/history screens replace web links; app-safe legal/auth pages; direct shortcut downloads | Audit all success/error/auth/install links on device and each supported storefront |
| Login | Web authentication supports email, Apple and Google | Configure and test Apple in production whenever Google is offered; preserve return to app after account linking |
| Support | In-app support email and public `/support` page | Deploy and verify the page; confirm `support@iphoneadvanced.com` is monitored |
| Health-related shortcuts | Log My Meal estimates nutrition and writes it directly to Health | Show an estimate for confirmation before writing; rebuild/sign the shortcut and replace its iCloud link; disclose limitations and avoid accuracy/medical claims |
| Export compliance | `ITSAppUsesNonExemptEncryption = NO` for system HTTPS/keychain/hash usage | Recheck if custom encryption or cryptography is added |
| Review access | No reviewer-specific bypass | Create a real dedicated review account, fund it, provide credentials through App Store Connect and keep backend available |
| Distribution | Bundle ID `com.iphoneadvanced.app`, iOS 17+ | Set development team; archive and validate; configure App Store record, products, agreements, tax, banking and availability |

Payment/refund routes and encrypted Apple-token deletion were explicitly approved and implemented locally. Automatic safety review separately blocked the proposed global account-ID allocator and Stripe ledger guards as broader financial/database changes; that approval is still pending. Deletion remains deliberately disabled. Do not enable it while integer IDs can be recycled: a delayed checkout could otherwise credit a replacement account, and in-flight settlements can fail foreign-key checks. No production migration, deployment, App Store configuration, charge or live account deletion has been performed.

Local evidence: 38 Node tests pass, the standalone Swift consent checks pass, the iOS Release simulator build passes, and `scripts/review-smoke.mjs` passes against actual local workerd/D1. This checks migrations, account routes, consent, forged Apple payload rejection, and purchase/refund/reversal SQL using a test-double Apple client. It is not a successful signed sandbox purchase. Simulator visual QA remains open because the Mac was locked.

## Payment decision

AI credit unlocks digital functionality. For broad storefront availability, use **consumable in-app purchases** for credit sold inside iOS. Keep Stripe for the independent website. Existing server balances can remain shared, provided the corresponding purchase is also available through IAP. Purchased credit must not expire.

The U.S. storefront currently permits external purchase links without the special link entitlement. Other storefronts have different restrictions and agreements. Do not ship the current universal website top-up button under the assumption that the U.S. exception applies globally. A storefront-specific external purchase strategy requires its own implementation and review.

Proposed product IDs, matching the isolated server module:

| Consumable product ID | Account credit delivered | Suggested U.S. starting price |
| --- | ---: | ---: |
| `com.iphoneadvanced.app.credits5` | US$5 | US$5 |
| `com.iphoneadvanced.app.credits10` | US$10 | US$10 |
| `com.iphoneadvanced.app.credits25` | US$25 | US$25 |
| `com.iphoneadvanced.app.credits50` | US$50 | US$50 |

Retail prices are not configured by this repository. Choose available App Store price points, tax treatment and regional pricing in App Store Connect. Always show StoreKit's localized `displayPrice`; identify the separate USD-denominated service credit. Do not imply that the purchase currency equals the service-credit unit in every region.

Review profitability before enabling sales. With the existing 1.5× inference markup, a hypothetical 30% commission leaves 1.05× upstream cost before taxes and other costs; a 15% commission leaves 1.275×. Confirm the commission applicable to your account and programs. Do not change inference rates silently to compensate.

Implemented StoreKit behavior (still requires sandbox/device validation):

- Fetch products and display their localized price and delivered credit. Empty products/error states must have a retry action and must not open Stripe as a fallback.
- Obtain a stable server-generated UUID for `appAccountToken` before purchase. Bind every transaction to that account.
- Handle success, cancellation, pending/Ask to Buy, interrupted purchase, invalid verification, offline delivery and account changes.
- Send the signed transaction to the server. Finish it only after the server confirms delivery, including idempotent repeats.
- Listen to `Transaction.updates` at launch and reconcile `Transaction.unfinished` after login and on retry. Never transfer a pending purchase to another account.
- Consumables are not conventional restorable purchases. Provide purchase-delivery retry and refresh the account balance after sign-in on another device; do not promise StoreKit can restore already-consumed credit.
- Handle verified refunds/revocations without duplicate deduction. Reversals restore only removed credit, including refund-before-delivery; older signed state cannot overwrite newer state. Tests cover repeated refund/reversal cycles.

Backend configuration required before rollout:

| Name | Source |
| --- | --- |
| `APP_STORE_ISSUER_ID` | App Store Connect → Users and Access → Integrations → In-App Purchase |
| `APP_STORE_KEY_ID` | ID of the App Store server API signing key |
| `APP_STORE_PRIVATE_KEY` | Private `.p8` key, stored as a Worker secret, never in git |
| `APP_STORE_APP_ID` | Numeric Apple ID of the App Store record |
| `APP_STORE_SANDBOX_USER_IDS` | Explicit comma-separated server user IDs for dedicated testers/reviewers only |
| `TOKEN_ENCRYPTION_KEY` | 32 cryptographically random bytes, hex encoded; Worker secret held separately from the database |
| `ACCOUNT_DELETION_ENABLED` | Keep `false` until additional database safeguards and deletion release tests pass |

The sandbox account restriction prevents unlimited test purchases from funding real provider inference on arbitrary customer accounts. Supply reviewers a dedicated allowlisted account. Never broadly enable sandbox credits in production. Configure App Store Server Notifications V2 at `https://iphoneadvanced.com/webhooks/apple` for both environments. Verify Apple's TEST notification before launch. Never use real customer accounts for sandbox tests.

Apply migrations in order to staging, provision secrets, and deploy the server before distributing the new client. Existing accounts must explicitly approve AI sharing. Apple sign-in now requires `TOKEN_ENCRYPTION_KEY` and a provider token: provision the secret before deploying to avoid interrupting sign-in. Back it up securely; do not replace it without re-encrypting saved tokens. Tokens use AES-GCM, fresh 96-bit nonces and the Apple subject as authenticated additional data. Tokens and provider error bodies are never logged.

The service module validates Apple's certificate chain with the official library and retrieves current transaction data from Apple's authenticated server API before delivery. Tests cover forged signatures, transaction replay, cross-account claiming, invalid products/bundles/environments/quantities, refunds/reversals, stale state and deletion tombstones. Local runtime tests do not substitute for a complete valid signed transaction in the deployed Workers runtime.

## Account and privacy completion

Account deletion must remove the account and associated sessions, API keys, linked identities and usage data. Explain that installed shortcuts stop working, that remaining credit is forfeited, and that deletion itself is not an Apple refund request. Retain only narrowly justified transaction identifiers/payment records with account linkage removed, and state the retention policy accurately.

For Sign in with Apple, save an encrypted refresh or access token at login, revoke it through Apple's REST endpoint during deletion, and handle old accounts whose token was never stored through a fresh Apple sign-in. Do not claim a successful deletion while revocation or data deletion failed. Test cancellation, retry, revoked credentials, another account's credentials and concurrent inference/purchase deliveries.

The updated Terms and Privacy Policy describe IAP, Apple refunds, encrypted tokens, account-wide consent and deletion. Publish them only with the corresponding completed release; deletion is still gated. Obtain legal review and confirm provider retention; do not claim zero retention unless verified for every provider and route. Health data must not be used for ads, marketing or model training. Native actions use files passed by Shortcuts, so do not request blanket photo-library, microphone, contacts or Health access in the app when it does not access those APIs.

The manifest currently conservatively declares account email/ID, purchase history, product interaction, user-selected text/messages/photos/audio/health content and diagnostics as linked to the account, for app functionality, with no tracking. Confirm each category against the final feature set and actual retention before copying answers into App Store Connect. Apple's definition of collection includes third-party retention beyond servicing a request. The manifest is not a replacement for App Store Connect's questionnaire or the public policy.

Concurrent analytics work appeared during this audit (`analytics_events`, currently account-linked run outcomes). The manifest declares analytics as a purpose for user IDs and product interaction, and the public policy now describes first-party product activity and local AI consent. Reconcile the finished analytics implementation and its retention/deletion behavior with those disclosures before submission.

## App Store Connect package

- App name: **Advanced Automations** (under 30 characters).
- Suggested subtitle: **AI actions for your shortcuts** (under 30 characters).
- Primary category: Productivity. Do not select Kids.
- Support and privacy URLs must be public, complete and reachable. Provide reviewer contact details, not placeholders.
- Complete the current age-rating questionnaire honestly for unrestricted AI responses, health references and web access. Do not guess a rating or use the terms' minimum age as the rating.
- State that browsing/actions are free to install and AI execution consumes purchased credit. Avoid promising exact AI results or fixed per-run prices where tokens vary.
- Take actual screenshots of the current app on required iPhone/iPad sizes. Include the library, action details, privacy controls and purchase experience. Use fictional data. Do not submit design mockups or only the login screen.
- Provide IAP display names, descriptions and review screenshots. Submit new products with the version. Complete Paid Apps agreements, tax and banking, and any required EU trader information.
- Create a dedicated review account using the normal account flow; supply its credentials in App Store Connect's review fields, not in this file. Allow purchases in Apple's review sandbox for that account. Provide enough credit for all actions, including images/audio, and verify the backend is reachable.

Draft review notes (update to match the finished release before submission):

> The app provides native App Intents for Apple Shortcuts plus a curated library of installable shortcuts. Browse without an account from the welcome screen. Sign in using the review account to run AI actions and access the shared credit balance. Before running an action, open Account → AI Privacy and choose Allow AI data sharing. In Shortcuts, create a shortcut, select Advanced Automations, and add Ask AI. Input “Summarize this in one sentence” with a short sample text. The result is returned to the next action. The installed recipe catalog can also be inspected without executing it. [Add exact purchase and deletion paths only after implemented and tested.] Cloudflare processes AI input; image generation additionally uses OpenAI. Credits are consumables and do not expire. No public user-generated-content feed exists.

## Final release tests

1. Run Node tests, a Release iOS build, a local Worker bundle/runtime check, and Xcode archive validation. Inspect the archive's privacy report and entitlements.
2. On physical iPhone and iPad: fresh install; guest browsing; Apple/email/Google sign-in; provider cancel/error; offline catalog; small screen and largest accessibility text.
3. AI consent: denied means no input upload; approval allows intended content only; withdrawal blocks the next call. Test image, audio, text and separately installed shortcuts. Check privacy controls after sign-out/account change.
4. StoreKit sandbox: buy each pack, cancel, Ask to Buy, disable network after payment, force-quit, relaunch, retry, replay signed transaction, switch accounts, refund, revoke and reverse refund. Compare the account balance and ledger to expected amounts once per event.
5. Account deletion: confirmation cancel; deletion success; Apple revocation failure; all old sessions/keys invalid; no record resurrection on delayed Apple/Stripe notifications or in-flight inference. Verify the retention policy against the resulting database rows.
6. Execute every advertised native action and installed recipe. Confirm sign-in key import, URLs, permissions and output types. In particular, inspect health writes and reminder creation before accepting the release.
7. Verify every app-accessible link, including authentication/legal/install error pages, against the chosen payment policy for each storefront.
8. Run TestFlight with the submitted build, backend, products and review account. Keep services configured and available throughout review.

## Primary references

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): 1.4.1 health claims; 1.5 support; 2.1 completeness; 2.3 metadata; 3.1.1 and 3.1.3 payments; 4.2 minimum functionality; 4.8 login services; 5.1.1 account/privacy; 5.1.2 explicit AI sharing consent; 5.1.3 health data.
- [Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- [Apple's official App Store server library](https://github.com/apple/app-store-server-library-node).
- [Apple root certificates](https://www.apple.com/certificateauthority/).
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).
- [Adding privacy manifests](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk).
- [Cloudflare AI Gateway logging controls](https://developers.cloudflare.com/ai-gateway/observability/logging/).

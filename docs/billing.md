# Subscription management

Monthly BRL 9.90 and annual BRL 99.00 prices remain recurring. Authenticated users open `/assinatura` and submit a same-origin POST to `/assinatura/portal`. Customer IDs are resolved from their own subscriptions, never request parameters. Portal cancellation must be `at_period_end` and plan changes are disabled on the dedicated configuration.

`paid_through` is separate from the Stripe current billing period. Settled invoices extend it monotonically; subscription updates and failed payments cannot extend it. Cancellation and payment failures preserve access already paid for until this timestamp; expiry is checked on every protected request. Existing lifetime access and trial access remain supported. The one-time additive migration carries forward active entitlements previously granted by this application. App-only pre-deploy reconciliation checks existing linked subscriptions against Stripe.

Webhooks verify the raw-body signature before database work. Event IDs are inserted inside the same transaction as state updates. Duplicate deliveries are skipped; failures roll back and remain retryable. Current subscription state is fetched from Stripe instead of applying stale event payloads. Subscription rows are locked while processing updates. Checkout requests lock the user row and reject an existing nonterminal subscription or a recent pending checkout.

## Deployment

Keep the existing `node dist/scripts/init-db.js` pre-deploy command and append `node dist/scripts/setup-billing.js` on the web service only. Do not add billing setup to election importers. The setup validates both price IDs and the existing enabled webhook endpoint/events, provisions a dedicated portal configuration, and reconciles subscriptions. It does not create checkout sessions, charges, or modify subscriptions. Configuration failure blocks the new deployment while the previous service continues serving.

Required existing variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, and HTTPS `APP_ORIGIN`. Optional `STRIPE_PORTAL_CONFIGURATION` selects a preconfigured portal, which must allow cancellation at period end. Otherwise the dedicated configuration ID is stored in `billing_settings`. The Stripe key needs Prices read, Subscriptions read, Invoices read, Webhook endpoints read, Billing Portal configurations read/write and sessions write, plus Checkout sessions write.

Webhook endpoint `/webhooks/stripe` must receive checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid and invoice.payment_failed. Optional checkout.session.async_payment_succeeded is supported. API access cannot verify that the configured webhook signing secret is the correct secret for this endpoint; an actual signed delivery is necessary to prove that.

## Validation and limits

`npm run test:billing` covers both checkout plans/price rejection, duplicate subscription rejection, portal ownership and cancellation configuration, renewal/payment failure/cancellation reconciliation, unknown prices, out-of-order linkage retries, signed webhook duplication/signature rejection/rollback, paid access expiration, lifetime/trial preservation, and authentication/origin checks. Tests use controlled Stripe/database doubles and a real Stripe SDK signature. CI runs this suite alongside existing checks.

Before claiming the complete journey is production-validated, use an isolated Stripe test-mode environment and database with test prices and webhook secret. Exercise signup, card checkout with a Stripe test card, signed webhook delivery, paid access, renewal using a test clock, payment failure, portal cancellation and final expiry. Never submit test cards to live mode or make a live charge for verification. Local tests and successful deployment alone do not prove this end-to-end journey.

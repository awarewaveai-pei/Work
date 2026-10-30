# aware-wave-store

AwareWave's shop plugin. Installs on **aware-wave.com** (HMAC, shared secrets) or on a **reseller's checkout site** (ADR 017 4c-3: set a site key id in the settings page; the site then signs payment events and door handoffs with its own Ed25519 keys, header `X-AwareWave-Site: <key_id>`, and next-admin holds only the public keys on `/ops/sellers`). Never on a site that is not registered in `seller_sites`: `scripts/rollout-wp-bridge.ps1 -Plugin store` refuses it.

- WooCommerce / Subscriptions payments → signed events to `<target>/api/webhooks/payments/woo` (Action Scheduler queue, retries).
- Members confirm their email before checking out AwareWave products; My Account 「進入」 door buttons (`/api/auth/wp-handoff`).
- Settings: WooCommerce → AwareWave 付款與會員 (switch default OFF, target URL, two secrets, allowed payment methods, sign-up gift product).
- Sign-up gift (1.3.0, `WelcomeGift`): a verified member gets one zero-price order of the gift product once; it goes through the ordinary paid-order path. 「用 Google 註冊」 via Nextend Social Login counts as verified only for gmail.com / googlemail.com (`GoogleSignup`). Decision: `agency-os/reports/decisions/2026-10-30-customer-self-signup-email-google.md`.

Split out of `aware-wave-wp-bridge` 0.18.x (ADR 017 4b-2, WORKLOG 2026-10-25). Stored names are the bridge's:
options `aware_wave_payments_*`, user meta `aware_wave_email_verified*`, product meta `_awarewave_*`, order meta
`_awarewave_granted`, Action Scheduler hook `awbridge_send_payment_event`, link parameters `awbridge_*`. Renaming any
of them breaks queued events, sent verification links, or stored settings.

While wp-bridge <= 0.18.3 is installed (it still carries this code) the plugin stays dormant and says so in wp-admin.

- Daily reconciliation (1.3.1, `Reconcile`): signed read-only `GET /wp-json/aware-wave-store/v1/reconcile` lists the paid AwareWave orders of a window for next-admin `/ops/billing` (lib/payments/woo-reconcile.ts); signed with the payment secret under its own label.
- Several plans on one pack (`plan_keys`, 1.3.0) need next-admin with migration 0146 live first: an older next-admin keeps the credits and drops the plans without an error. Rollback in the reverse order (plugin first).
- Release: `bash scripts/release-wp-bridge.sh --plugin store` → release repo `awarewaveai-pei/aware-wave-store` (public: GitHub Actions run free only on public repos).
- Install / upgrade: `scripts/rollout-wp-bridge.ps1 -Plugin store` (first install: `-Install -Site lobster-wordpress`).
- Tests: `php -d extension=mbstring phpunit-9.6.phar` in this folder.

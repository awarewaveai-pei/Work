# aware-wave-store

AwareWave's own shop plugin. **Install only on aware-wave.com**, never on a client site.

- WooCommerce / Subscriptions payments → signed events to `<target>/api/webhooks/payments/woo` (Action Scheduler queue, retries).
- Members confirm their email before checking out AwareWave products; My Account 「進入」 door buttons (`/api/auth/wp-handoff`).
- Settings: WooCommerce → AwareWave 付款與會員 (switch default OFF, target URL, two secrets, allowed payment methods).

Split out of `aware-wave-wp-bridge` 0.18.x (ADR 017 4b-2, WORKLOG 2026-10-25). Stored names are the bridge's:
options `aware_wave_payments_*`, user meta `aware_wave_email_verified*`, product meta `_awarewave_*`, order meta
`_awarewave_granted`, Action Scheduler hook `awbridge_send_payment_event`, link parameters `awbridge_*`. Renaming any
of them breaks queued events, sent verification links, or stored settings.

While wp-bridge <= 0.18.3 is installed (it still carries this code) the plugin stays dormant and says so in wp-admin.

- Release: `bash scripts/release-wp-bridge.sh --plugin store` → private repo `awarewaveai-pei/aware-wave-store`.
- Install / upgrade: `scripts/rollout-wp-bridge.ps1 -Plugin store` (first install: `-Install -Site lobster-wordpress`).
- Tests: `php -d extension=mbstring phpunit-9.6.phar` in this folder.

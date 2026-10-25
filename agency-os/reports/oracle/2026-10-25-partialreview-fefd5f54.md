# codex-oracle review -- 2026-10-25 14:43:29 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/wp-bridge-plugin  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: wp-bridge 0.18.1 (WordPress plugin, PHP>=7.4): AwareWave subscription/credit-pack orders must grant rights only when paid by an operator-allowlisted payment method (default none). WooCommerce cash-on-delivery sets processing before money (woocommerce cod gateway), and 0.18.0 treated processing as paid. Adds Settings::allowedGateways, PaymentEvents gate (onPaymentComplete/renewal/switch; refunds skip non-allowlisted), CheckoutGate::narrowGateways via woocommerce_available_payment_gateways plus a classic-checkout posted-method check, and checkboxes on the settings page. Wire format to next-admin unchanged.
- exit: 0 | elapsed: 163839ms | answer: 2608B
- files-reviewed: lobster-factory/packages/wp-bridge-plugin/aware-wave-wp-bridge.php, lobster-factory/packages/wp-bridge-plugin/includes/Admin/BillingSettingsPage.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/BillingModule.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/CheckoutGate.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/PaymentEvents.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/Settings.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/Shop.php, lobster-factory/packages/wp-bridge-plugin/includes/Billing/WooShop.php, lobster-factory/packages/wp-bridge-plugin/tests/Billing/PaymentEventsTest.php
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Pre-upgrade queued events bypass the new allowlist.
  file:line   -> lobster-factory/packages/wp-bridge-plugin/includes/Billing/PaymentSender.php:76
  confidence  -> CONFIRMED
  scenario    -> Version 0.18.0 queues a credit-pack grant for an unpaid COD order; delivery receives HTTP 503 and schedules a retry at PaymentSender.php:104. Upgrade to 0.18.1 with billing enabled and the default empty allowlist. The retry sends the frozen grant without checking the order’s payment method, granting credits despite the new restriction.
  why missed  -> The allowlist guards event creation only. BillingModule.php:30 still delivers persisted jobs through PaymentSender, whose checks cover enablement, secrets, and ended subscriptions—not payment-method eligibility.

FINDING 2: Renewal eligibility checks the subscription’s gateway instead of the renewal order’s gateway.
  file:line   -> lobster-factory/packages/wp-bridge-plugin/includes/Billing/PaymentEvents.php:194
  confidence  -> CONFIRMED
  scenario    -> An on-hold subscription stores allowlisted `tappay`, while its latest pending renewal order uses non-allowlisted `cod`. When that order becomes processing, WooCommerce Subscriptions fires the renewal-payment hook. BillingModule.php:53 discards the renewal-order argument, and this guard checks `tappay`, so it emits `subscription_paid` for the disallowed COD renewal.
  why missed  -> The test gives both objects the same gateway. Upstream treats the processing transition as payment completion and supplies the actual renewal order as the hook’s second argument. [Renewal transition](https://github.com/Automattic/woocommerce-subscriptions-core/blob/trunk/includes/class-wc-subscriptions-renewal-order.php#L78-L104), [hook arguments](https://github.com/Automattic/woocommerce-subscriptions-core/blob/trunk/includes/class-wc-subscription.php#L1814-L1817).

FINDING 3: Removing a gateway silently disables refunds for rights already granted through it.
  file:line   -> lobster-factory/packages/wp-bridge-plugin/includes/Billing/PaymentEvents.php:142
  confidence  -> CONFIRMED
  scenario    -> A customer buys a credit pack through allowlisted `tappay` and receives credits. The operator subsequently removes `tappay` from the allowlist, then fully refunds that order. This early return suppresses the refund event, leaving the credited balance unchanged.
  why missed  -> The guard equates “currently disallowed” with “never granted.” Settings are mutable (BillingSettingsPage.php:126), but the refund decision records no historical grant eligibility.

TOTAL: 3 findings

# codex-oracle review -- 2026-10-29 23:02:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/__tests__/local.test.ts, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentEvents.php, lobster-factory/packages/aware-wave-store-plugin/includes/Shop.php, lobster-factory/packages/aware-wave-store-plugin/includes/WooShop.php, lobster-factory/packages/aware-wave-store-plugin/tests/PaymentEventsTest.php, lobster-factory/packages/aware-wave-store-plugin/aware-wave-store.php, lobster-factory/packages/db/migrations/0142_billing_seller_month_paid_at.sql, lobster-factory/packages/db/migrations/0142_billing_seller_month_paid_at.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 D4: the monthly seller report puts a sale in the month the buyer paid. aware-wave-store 1.2.0 sends paid_at taken from the WooCommerce order's own date_paid (never the plugin clock: the same hook firing twice must send the same bytes, the server rejects one event id with two bodies); next-admin toPaymentEvent accepts optional paid_at on subscription_paid and credit_pack; migration 0142 billing_seller_month believes paid_at only within 7 days before received_at, else received_at, through a safe cast helper.
- exit: 0 | elapsed: 248295ms | answer: 1140B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/__tests__/local.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts, lobster-factory/packages/aware-wave-store-plugin/aware-wave-store.php, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentEvents.php, lobster-factory/packages/aware-wave-store-plugin/includes/Shop.php, lobster-factory/packages/aware-wave-store-plugin/includes/WooShop.php, lobster-factory/packages/aware-wave-store-plugin/tests/PaymentEventsTest.php, lobster-factory/packages/db/migrations/0142_billing_seller_month_paid_at.down.sql, lobster-factory/packages/db/migrations/0142_billing_seller_month_paid_at.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A paid subscription switch can be reported in the month the event arrives instead of the month the buyer paid.
  file:line   -> lobster-factory/packages/aware-wave-store-plugin/includes/PaymentEvents.php:142
  confidence  -> CONFIRMED
  scenario    -> A buyer pays for a switch on September 30, and the queued event arrives October 2. `onSwitchedItem` emits `subscription_paid` without `paid_at`, so migration 0142 assigns it to October.
  why missed  -> The new `paid_at` paths cover initial payments and renewals, but this existing path also emits `subscription_paid`.

FINDING 2: The new parser accepts nonexistent calendar dates as valid `paid_at`.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts:59
  confidence  -> CONFIRMED
  scenario    -> A signed event sends `2026-02-31T12:00:00Z`. `Date.parse` returns a finite value, so the event is accepted and stored; the SQL safe cast rejects that date, and the report silently uses `received_at`.
  why missed  -> The test checks a non-date word, while JavaScript normalizes some calendar-invalid ISO dates.

TOTAL: 2 findings

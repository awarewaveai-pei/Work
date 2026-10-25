# codex-oracle review -- 2026-10-25 20:00:14 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0133_seller_sites.sql, lobster-factory/packages/db/migrations/0133_seller_sites.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 decision #12 (seller axis), cards 4c-4 and 4c-1. 4c-4: seller licence keys <product>.resell live in can.ts SELLER_LICENCES (NOT in products.ts features, because the door menu app/ProductDoorShell.tsx lists every feature and the 0118 all-features sweep lib/entitlements/tables.ts registeredFeatures grants every feature, which would make the managed client Soulful a reseller); decide() answers them: internal sells everything, a customer needs a live comp/contract row. 4c-1: migration 0133 adds seller_sites (one row per cash-register site, ed25519 public key or hmac-env for the legacy aware-wave.com row), customer_identities keyed per site, organizations.sold_by_organization_id, plans.owner_organization_id, payment_events.site_id, and billing_apply_payment_event gains p_site_id with refusals site_disabled / buyer_belongs_to_another_seller / plan_not_sellable_here / local_has_no_site; the function body is 0128's text plus four marked additions. Day one must change nothing for aware-wave.com. Not yet applied to prod; 4c-2 (route side) is not in this change. Look hardest at: money paths that could now refuse a legitimate aware-wave.com payment, replay handling, the down migration's safety, and any way a buyer or event can choose its seller.
- exit: 0 | elapsed: 246127ms | answer: 1383B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/db/migrations/0133_seller_sites.down.sql, lobster-factory/packages/db/migrations/0133_seller_sites.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 不同 Woo 網站的付款事件會共用同一個收件箱鍵。
  file:line   -> lobster-factory/packages/db/migrations/0133_seller_sites.sql:153
  confidence  -> CONFIRMED
  scenario    -> A、B 兩站各有訂單 7；外掛都產生 `wc:payment_complete:7:credit_pack`（`packages/aware-wave-store-plugin/includes/PaymentEvents.php:104`）。`payment_events` 仍以 `(provider, event_id)` 唯一（`packages/db/migrations/0120_payment_events.sql:32`）：第二筆若買家不同，會被拒為 `event_id_reused`；若內容相同，會被當成重播，實際付款不入帳。
  why missed  -> 0133 記錄了 `site_id`，但沿用單站時期的唯一鍵；新增測試替各站手寫了不同事件 ID。

FINDING 2: 點數包的訂單鍵也未按網站區分。
  file:line   -> lobster-factory/packages/db/migrations/0133_seller_sites.sql:285
  confidence  -> CONFIRMED
  scenario    -> 以不同 `event_id` 送入兩站各自的 `order_ref=7` 點數包。第一筆建立 `pack:woo:7`；第二站不同買家的付款因全域唯一的 ledger 鍵（`packages/db/migrations/0066_media_billing_and_provider_profiles.sql:22`）被拒為 `order_belongs_to_another_account`。即使修正 Finding 1，這筆合法付款仍無法入帳。
  why missed  -> 0133 複製了 0128 的點數包流程；原流程把 Woo 訂單編號視為跨網站唯一。

TOTAL: 2 findings

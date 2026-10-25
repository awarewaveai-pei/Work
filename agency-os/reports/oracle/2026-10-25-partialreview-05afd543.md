# codex-oracle review -- 2026-10-25 20:08:46 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0133_seller_sites.sql, lobster-factory/packages/db/migrations/0133_seller_sites.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/db/scripts/0133_seller_sites_down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 decision #12 (seller axis), cards 4c-4 and 4c-1. 4c-4: seller licence keys <product>.resell live in can.ts SELLER_LICENCES (NOT in products.ts features, because the door menu app/ProductDoorShell.tsx lists every feature and the 0118 all-features sweep lib/entitlements/tables.ts registeredFeatures grants every feature, which would make the managed client Soulful a reseller); decide() answers them: internal sells everything, a customer needs a live comp/contract row. 4c-1: migration 0133 adds seller_sites (one row per cash-register site, ed25519 public key or hmac-env for the legacy aware-wave.com row), customer_identities keyed per site, organizations.sold_by_organization_id, plans.owner_organization_id, payment_events.site_id, and billing_apply_payment_event gains p_site_id with refusals site_disabled / buyer_belongs_to_another_seller / plan_not_sellable_here / local_has_no_site; the function body is 0128's text plus four marked additions. Day one must change nothing for aware-wave.com. Not yet applied to prod; 4c-2 (route side) is not in this change. Round 2: findings 1-2 of partialreview-20ba3e0c (event ids and order numbers are per site) were fixed by an inbox key (provider, site_id, event_id) with old woo rows backfilled to aware-wave.com, and ledger/contract keys namespaced woo@<key_id> (aware-wave.com unchanged). Look hardest at: money paths that could now refuse a legitimate aware-wave.com payment, replay handling, the down migration's safety, and any way a buyer or event can choose its seller.
- exit: 0 | elapsed: 297442ms | answer: 1980B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/db/migrations/0133_seller_sites.down.sql, lobster-factory/packages/db/migrations/0133_seller_sites.sql, lobster-factory/packages/db/scripts/0133_seller_sites_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 首次付款會替 aware-wave.com 新會員建帳，卻無法記錄付款
  file:line   -> lobster-factory/packages/db/migrations/0133_seller_sites.sql:63
  confidence  -> CONFIRMED
  scenario    -> 0133 將 `customer_identities.site_id` 設為必填且沒有預設值；現有 `linkIdentity` 插入時未提供該欄（`lib/entitlements/identities.ts:64-71`）。新會員首付會先建立組織與邀請帳戶，接著身分寫入失敗；付款不入帳，重送仍失敗。
  why missed  -> 新增測試直接呼叫付款 SQL；既有付款測試走 local，沒有覆蓋 migration 後的 Woo 新會員首付。

FINDING 2: 賣家自有方案無法由操作員手動取消或退款
  file:line   -> lobster-factory/packages/db/migrations/0133_seller_sites.sql:185
  confidence  -> CONFIRMED
  scenario    -> 賣家網站已售出 `owner_organization_id` 指向該賣家的方案；操作員用 `record-payment.mjs` 送出 local 訂閱退款。local 沒有 site，`v_site.seller_organization_id` 為 NULL，擁有者比較必定拒絕 `plan_not_sellable_here`，合約與權利無法撤銷。同一檢查也擋手動取消。
  why missed  -> 測試只用 Woo 事件驗證賣家方案；local 測試使用擁有者為 NULL 的方案。

FINDING 3: 可更新的 `key_id` 使既有訂單失去退款與去重依據
  file:line   -> lobster-factory/packages/db/migrations/0133_seller_sites.sql:163
  confidence  -> CONFIRMED
  scenario    -> 賣家網站以 `key_id=seller-b` 售出訂單 7，帳本鍵為 `pack:woo@seller-b:7`。`seller_sites` 允許 UPDATE，且沒有阻止修改 `key_id`；改成 `seller-b-v2` 後，同站同訂單的退款會以新前綴查找（`:366-368`）並報 `unknown_order`。若另送不同 event ID 的同訂單付款，帳本鍵也變了，可再入帳一次。
  why missed  -> 收件箱以穩定的 `site_id` 去重，但帳本鍵改用了可變的 `key_id`；測試沒有覆蓋網站識別碼變更後的事件。

TOTAL: 3 findings

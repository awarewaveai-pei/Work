# codex-oracle review -- 2026-10-25 18:49:03 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0127_billing_account_views.sql, lobster-factory/packages/db/migrations/0129_drop_billing_overview.sql, lobster-factory/packages/db/migrations/0130_billing_ledger.sql, lobster-factory/packages/db/migrations/0130_billing_ledger.down.sql, lobster-factory/packages/db/scripts/0127_billing_account_views-local-verify.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/BillingTab.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-tab-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `5bdf7f9f9~1..44dd16561`
- context: /ops/billing for thousands of customer accounts (commits 5bdf7f9f9, 5ecfe0741, 44dd16561). 0127 adds billing_account(org) (detail; a brand resolves to its root) and billing_attention; 0129 drops 0120's billing_overview after the new build went live; 0130 adds billing_ledger(filter, query, limit, offset): totals over every root account with billing data + one page of rows; query (LIKE wildcards escaped) matches name, slug, member email (account and its brands), payment event_id, contract source_ref. All read-only, security invoker, service_role only. /ops/billing renders the ledger with filter buttons, GET search, 50 a page, ?account=<uuid> opens the detail on the page; the client hub has a 撣喳? tab gated by the ops/billing staff tool (not read when hidden). Staff tool enforcement is site-wide shadow mode by design (operator decides enforce). Verified on disposable Postgres with 3000 accounts / 300k ledger rows and real PostgREST e2e.
- exit: 0 | elapsed: 236979ms | answer: 1167B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/BillingTab.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-tab-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts, lobster-factory/packages/db/migrations/0127_billing_account_views.sql, lobster-factory/packages/db/migrations/0129_drop_billing_overview.sql, lobster-factory/packages/db/migrations/0130_billing_ledger.down.sql, lobster-factory/packages/db/migrations/0130_billing_ledger.sql, lobster-factory/packages/db/scripts/0127_billing_account_views-local-verify.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 後續點數包的訂單編號可能搜尋不到
  file:line   -> lobster-factory/packages/db/migrations/0130_billing_ledger.sql:53
  confidence  -> CONFIRMED
  scenario    -> 同一帳戶第二次購買同方案點數包，`event_id` 與 `order_ref` 不同。付款 SQL 將新訂單編號寫入帳本 `reference_id`（0128_pack_usage_rights_open_ended.sql:180），沿用既有合約時不更新其 `source_ref`（同檔:208）。搜尋新訂單編號時，查詢只比對 `payment_events.event_id` 與合約 `source_ref`，結果為零。
  why missed  -> 驗證案例只搜尋付款事件 ID 和合約來源編號，沒有搜尋第二筆點數包的帳本訂單編號。

FINDING 2: 從帳務明細開啟「客戶頁」不會進入帳務分頁
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx:98
  confidence  -> CONFIRMED
  scenario    -> 操作者在帳務明細點「客戶頁」；連結沒有 `?tab=帳務`，客戶頁依 ClientHubTabs.tsx:2642 的預設值顯示「維護」。
  why missed  -> 已加入 `initialTab` 支援，但這個連結沒有傳入分頁參數。

TOTAL: 2 findings

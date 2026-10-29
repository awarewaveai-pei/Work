# codex-oracle review -- 2026-10-29 23:13:03 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0143_entitlement_staff_grants.sql, lobster-factory/packages/db/migrations/0143_entitlement_staff_grants.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/staff-grants.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/staff-grants.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/staff-grants.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/entitlement-actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/staff-grant-outcome.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/StaffGrantsCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/BillingTab.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/__tests__/staff-grant-outcome.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 4b-10: owner/admin staff give or take a product (comp rows, one per registered feature) or a seller licence (<product>.resell, separate) on the client hub 帳務 tab. Migration 0143 adds entitlement_staff_grant/revoke (service_role, same per-account advisory lock as the payment function 0120/0133, audit row in the same transaction, revoke only ends staff:% comp rows). Comp only because a manual contract row would block the customer's own payment (0120 feature_in_another_contract) and be suspended by chargebacks. Check guard bypasses (server action exports), stale-form overwrites, invariant breaks against 0120/0133/0118, and PostgREST filter correctness in staffGrantView.
- exit: 0 | elapsed: 184030ms | answer: 1197B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/BillingTab.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/StaffGrantsCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/__tests__/staff-grant-outcome.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/entitlement-actions.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/staff-grant-outcome.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/staff-grants.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/staff-grants.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/staff-grants.ts, lobster-factory/packages/db/migrations/0143_entitlement_staff_grants.down.sql, lobster-factory/packages/db/migrations/0143_entitlement_staff_grants.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 尚未生效的授權列會擋住立即贈送產品
  file:line   -> lobster-factory/packages/db/migrations/0143_entitlement_staff_grants.sql:61
  confidence  -> CONFIRMED
  scenario    -> 帳戶已有一筆明天才開始的 `active` 功能列；0110 允許未來的 `starts_at`，實際授權查詢會檢查開始時間。員工今天贈送該產品時，0143 把這筆列當成已生效而略過該功能，客戶今天仍無法使用。
  why missed  -> 新函式檢查了狀態與結束時間，卻沒有沿用既有授權查詢對 `starts_at` 的判斷。

FINDING 2: 舊表單可以收回另一位員工後來重新贈送的產品
  file:line   -> lobster-factory/packages/db/migrations/0143_entitlement_staff_grants.sql:89
  confidence  -> CONFIRMED
  scenario    -> A 開頁時產品已贈送；B 隨後收回並重新贈送；A 用舊頁面取消勾選並儲存。表單只提交舊布林狀態，撤銷函式則收回該產品所有目前有效的 `staff:%` 列，因此 B 的新贈送也被收回。
  why missed  -> 變更判斷只比較頁面顯示時的勾選值，沒有識別當時的授權列；測試未涵蓋收回後重新贈送的交錯操作。

TOTAL: 2 findings

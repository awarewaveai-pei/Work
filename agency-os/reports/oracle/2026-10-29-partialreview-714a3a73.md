# codex-oracle review -- 2026-10-29 23:11:41 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/__tests__/page.sidebar.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to partialreview-5c89e1db: /ops/billing now shows last month and this month of billing_seller_month (0142 moves a sale back at most 7 days, so every sale received this month is in one of the two), via previousMonthStart in lib/entitlements/tables.ts.
- exit: 0 | elapsed: 147051ms | answer: 713B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/__tests__/page.sidebar.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/tables.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 月初的上月合計尚未結算，頁面卻直接指示用它開發票
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx:198
  confidence  -> CONFIRMED
  scenario    -> 9 月 30 日付款的事件因傳送失敗，到 10 月 2 日才收到。會計在 10 月 1 日依「開發票看上個月」使用 9 月合計開票；該筆交易當時尚未入表，發票少計一筆。事件收到後又會回填 9 月合計。
  why missed  -> 作者確認了跨月事件會回填上月，卻把「顯示上月」當成「上月數字已可結算」；`PaymentSender.php:19-21` 的重試設定允許月初繼續收到上月付款。

TOTAL: 1 findings

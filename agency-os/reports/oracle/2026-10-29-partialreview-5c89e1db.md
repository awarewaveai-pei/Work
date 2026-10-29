# codex-oracle review -- 2026-10-29 23:07:33 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/__tests__/local.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to partialreview-dce49ed8 finding 2: ISO instants (period_end and the new optional paid_at) now also require the calendar date to exist (Date.parse rolls 2026-02-31 over); the /ops/billing monthly seller note now says the month follows the buyer's paid time (0142) within 7 days of receipt.
- exit: 0 | elapsed: 218868ms | answer: 621B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/__tests__/local.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/provider.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 跨月才送達的付款會從帳務頁的月結合計中消失
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx:74`
  confidence  -> CONFIRMED
  scenario    -> 買家 9 月 30 日付款，網站 10 月 2 日送達；migration `0142_billing_seller_month_paid_at.sql:46-49` 將它計入 9 月，但帳務頁只查當前月份，10 月看不到，也沒有入口重查 9 月。會計因此漏計這筆賣家銷售。
  why missed  -> 改動檢查了月份歸屬，卻未檢查頁面能否查詢付款延遲送達後的前一個月。

TOTAL: 1 findings

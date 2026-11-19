# codex-oracle review -- 2026-11-19 13:51:39 +08:00

- mode: `review`
- scope: whole repo
- target: `5e0b0792f..0432b7927`
- context: FX2 vendor-bill reconciliation on /ops/costs 月報: append-only vendor_invoices (migration 0166, trigger refuses UPDATE/DELETE), pure reconcileMonth (estimate USD from ai_call_logs byVendor vs invoice USD vs paid NT$; implied rate = paid/invoice, fee% = implied/accounting rate - 1; unregistered vendor -> estimate x rate x (1+CARD_FEE_RATE 1.5%) flagged), API owner/admin, monthly card + form + CSV invoice section. Check: vendor key normalisation vs ai_call_logs.vendor values, division by zero, months with unavailable/partial fx, CSV columns, route ownership (STAFF_API_OWNERS /api/ops/costs covers it), anything that lets an estimate be shown as paid.
- exit: 0 | elapsed: 120144ms | answer: 1597B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CostsTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/costs/vendor-invoices/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/costs/vendor-invoices/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/vendor-invoices.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/vendor-invoices-loader.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/vendor-invoices.ts, lobster-factory/packages/db/migrations/0166_vendor_invoices.down.sql, lobster-factory/packages/db/migrations/0166_vendor_invoices.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 有帳單但沒有用量的月份無法在月報查看或匯出
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/page.tsx:77
  confidence  -> CONFIRMED
  scenario    -> 某月有已登錄帳單，但沒有 `ai_call_logs` 紀錄；`monthlyReports` 只從用量建立月份，該月不會出現在月報選擇器，帳單及 CSV 都無法從頁面取得。
  why missed  -> 帳單讀取涵蓋 13 個月，但月份清單仍沿用原本只依用量建立的資料流。

FINDING 2: 尚未付款的發票可被列為「已登錄實付」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/vendor-invoices.ts:136
  confidence  -> CONFIRMED
  scenario    -> 登錄發票 USD 100、實付 NT$0；API 接受零金額，對帳將廠商標為 `registered`，以 NT$0 計入合計，且不再列入未登錄估算。表格的「實付 NT$」因此把尚未付款呈現為已對帳的實付。
  why missed  -> 驗證檢查了除以零，卻沒有區分「已收到發票」與「已付款」。

FINDING 3: GET 宣稱回傳全部帳單，超過讀取上限時會靜默漏列
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/costs/vendor-invoices/route.ts:33
  confidence  -> CONFIRMED
  scenario    -> 最近 13 個月有 1001 筆帳單；PostgREST 單次讀取上限為 1000 筆時，GET 回傳 `ok: true` 和前 1000 筆，漏掉的帳單沒有錯誤或截斷標記。
  why missed  -> 頁面 loader 有滿額拒絕機制，新增的 GET 路由沒有沿用。

TOTAL: 3 findings
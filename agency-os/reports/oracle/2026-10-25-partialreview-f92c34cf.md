# codex-oracle review -- 2026-10-25 19:54:31 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: /ops/billing: the accounts table becomes a left sidebar like /ops/clients (operator asked; no color dots). Server component, read-only; selection ?account= now persists across filter/search/paging. Check broken URL/state handling, lost information, and that payments.e2e.test.ts still covers it.
- exit: 0 | elapsed: 124414ms | answer: 1325B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 個別帳戶的近 30 天加點、扣點總數從頁面消失
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx:103
  confidence  -> CONFIRMED
  scenario    -> 某帳戶近 30 天有超過 20 筆點數交易時，側欄只顯示餘額與處理原因；右側明細也只取得最近 20 筆帳本紀錄（lib/entitlements/tables.ts:162）。操作者無法再讀到該帳戶的 30 天加點、扣點總數，雖然 `billing_ledger` 仍回傳這兩個欄位。
  why missed  -> 改動檢查了側欄保留哪些欄位，卻未對照明細查詢的 20 筆上限。

FINDING 2: 現有 e2e 測試無法偵測選取帳戶在篩選、搜尋或換頁時遺失
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts:185
  confidence  -> CONFIRMED
  scenario    -> 若任一側欄連結或搜尋表單漏帶 `account`，測試仍會通過：它只分別檢查清單、搜尋結果與直接帶 `account` 開啟的頁面，沒有檢查產生的連結或表單欄位。一般 `npm test` 還會因未設定 `ENTITLEMENTS_REST` 而跳過整組測試（同檔第 13、18 行）。
  why missed  -> 測試涵蓋舊頁面的基本顯示，沒有加入這次新增的狀態保留斷言。

TOTAL: 2 findings

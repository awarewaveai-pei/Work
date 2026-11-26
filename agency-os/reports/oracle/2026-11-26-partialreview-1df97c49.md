# codex-oracle review -- 2026-11-26 11:46:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: not a fix: /tools/ai-models?tab=measured split into one sub-tab per test (?test=<key>) grouped by category, overview cards, row layout; data rows unchanged except new key/category/question/conclusion fields and rank extracted from result text. Check: conclusions/questions must not claim anything the row data does not say; CSS must only use tokens; unknown ?test= falls back to overview.
- exit: 0 | elapsed: 104010ms | answer: 1282B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 文章配圖頁把對照組誤說成用了相同的英文畫面描述
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx:214`
  confidence  -> CONFIRMED
  scenario    -> 開啟 `?tab=measured&test=article-image`，頁面以「每個模型做的事」宣稱各列用了同一句英文描述；但對照組實際只用了中文替代文字（`agency-os/reports/model-bakeoff/2026-11-article-image/build_image_page.cjs:41`），讀者會誤以為對照結果是在相同輸入下取得。
  why missed  -> 各列的 `asked` 文字相同，`shared()` 因而將它提升為全組共用說明，沒有核對對照組的實際輸入。

FINDING 2: 「次實測」統計的是資料列數，少報實際執行次數
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx:136`
  confidence  -> CONFIRMED
  scenario    -> 破框影片頁顯示「4 次實測」（`:208`），但 Runway 一列明載真跑 5 次（`:85`），Luma 與 Seedance 也各記錄兩次（`:87`、`:89`）；總覽及導覽列沿用同一錯誤計數。
  why missed  -> 新統計把一列當成一次執行，原有資料列卻會合併多次執行。

TOTAL: 2 findings
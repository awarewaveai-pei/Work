# codex-oracle review -- 2026-11-26 11:59:22 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/__tests__/bakeoff-pages.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: not a fix: /tools/ai-models?tab=measured split into one sub-tab per test (?test=<key>) grouped 文字/圖片/影片/音訊. Prior review round fixed: control row no longer counted as a model (control flag), 八種文案 date from its data commit 4066ff696. Invariant: every number/date shown means what its label says (models = distinct models run, excluding 待測 and control rows). Check that invariant across all groups; conclusions claim nothing the data does not say.
- exit: 0 | elapsed: 95170ms | answer: 1205B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/__tests__/bakeoff-pages.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 「語音與音效」把四項 API 測試標成四個已測模型
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx:187
  confidence  -> CONFIRMED
  scenario    -> 四列分別是 Scribe v2、配音、音效、人聲分離 API（同檔:147、151–154）；頁面卻以列數顯示「已測模型 4 個」。配音等列沒有記錄實際模型，無法支持四個不同模型的計數。
  why missed  -> 共用計數函式假設每列都是一個模型；語音組的列實際代表 API 功能。

FINDING 2: 橫幅總覽推薦省略了使用前必須替換虛構優惠的條件
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/ai-models/MeasuredRuns.tsx:109
  confidence  -> CONFIRMED
  scenario    -> 操作者依「哪個模型寫得能直接用」的總覽推薦採用 Sonnet 文案，會用到未提供的「85折」、免費抽牌或加贈服務（BannerCopyBakeoff.tsx:13–18）；完整頁面才提醒優惠數字須換成真實資料（同檔:163–166）。
  why missed  -> 結論從完整比較頁摘出時，漏了限制推薦成立的條件。

TOTAL: 2 findings
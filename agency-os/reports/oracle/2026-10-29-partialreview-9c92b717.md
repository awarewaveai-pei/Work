# codex-oracle review -- 2026-10-29 15:03:40 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/plan.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/__tests__/images-prompt.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: One site language resolver (siteLanguage) for topic plan, article and video; an unset site wrote English articles from Chinese topics. Article prompt asks for images only when images are requested (auto pipeline drafts had invented example.com images) and drops the PUBLISH_DATE marker nothing replaced.
- exit: 0 | elapsed: 168899ms | answer: 1282B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/__tests__/images-prompt.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/plan.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 未設定語言的網站會用美國地區參數搜尋繁中文章的外部來源
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts:188
  confidence  -> CONFIRMED
  scenario    -> 網站未設定 `language`，`siteLanguage` 回傳「繁體中文」；自動文章沒有提供外部連結，因此執行來源搜尋。但此處只辨識英文語言名稱，搜尋請求改用英文查詢詞與 `gl: "us"`，繁中文章取得的來源與目標地區不符。
  why missed  -> 新測試檢查題目與文章的語言，沒有檢查文章生成時的來源搜尋參數。

FINDING 2: 禁止圖片後，SEO 檢查仍把沒有圖片計為失敗，可能卡住自動發布
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/seo/rankmath-checker.ts:359
  confidence  -> CONFIRMED
  scenario    -> 自動管線未要求圖片，新提示明令不產生圖片；此檢查便固定失敗。若文章原本有 18/22 項通過、評為綠燈，移除圖片後只剩 17/22 項，評為橘燈；`articleChecks` 要求綠燈，`publishReviewed` 因而留下草稿。
  why missed  -> 改動移除了生成提示的圖片要求，沒有同步檢查下游評分及發布門檻。

TOTAL: 2 findings

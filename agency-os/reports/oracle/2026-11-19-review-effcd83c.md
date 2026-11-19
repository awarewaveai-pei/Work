# codex-oracle review -- 2026-11-19 19:11:46 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: N1b round 2: requiredBlocks must-carry paragraphs; fixes Codex 274b1c6e F1 (publishDrafts refuses when the site now requires a paragraph the article was not checked for -- artifacts.article.required) and F2 (only reader-visible text counts)
- exit: 0 | elapsed: 119852ms | answer: 1338B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/SiteManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/sites/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/review.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/embed-in-post.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/embed-in-post.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 隱藏的 SEO metadata 可以讓必附段落檢查誤判通過  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts:15`  
  confidence  -> CONFIRMED  
  scenario    -> `CONTENT_META_START` 與 `CONTENT_META_END` 之間的 `META_DESC` 含必附聲明，正文沒有；`bodyText()` 只移除註解標記，`articleChecks()` 因而判定聲明存在，但 WordPress 發文轉換會移除整個 metadata 區塊（`lib/content/markdown-to-blocks.ts:87`、`lib/content/publish/wordpress-core.ts:110`）。文章可通過審核並發布，讀者卻看不到聲明。  
  why missed  -> 新檢查沿用了既有的 `bodyText()`，沒有對照發文時的 metadata 移除規則。

FINDING 2: 分散在不同段落的文字可以通過「必附段落」檢查  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts:40`  
  confidence  -> CONFIRMED  
  scenario    -> 必附段落設為「如有立即危險，請撥1925」；文章在一段末尾寫「如有立即危險，」，下一段開頭寫「請撥1925」。`norm()` 移除換行與空白後，`includes()` 判定通過，但文章沒有完整的必附段落。  
  why missed  -> 測試驗證了字元與空白的正規化，沒有驗證段落邊界。

TOTAL: 2 findings
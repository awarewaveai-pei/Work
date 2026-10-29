# codex-oracle review -- 2026-10-29 15:13:02 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/plan.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/__tests__/images-prompt.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/image/make-image.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/make-images.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 after Codex F1/F2. (1) One site language resolver siteLanguage for topic plan, article, video. (2) Article prompt asks for images only when requested; dropped PUBLISH_DATE marker nothing replaced. (3) F2: automatic articles now get real images: image code moved from app/api/content/image/route.ts into lib/content/image/make-image.ts (makeContentImage), make.ts asks 3 placeholders and fills them via fillArticleImages (failed ones removed), first image is the featured image. (4) F1: one isCjkLanguage for source-search region and RankMath CJK rules.
- exit: 0 | elapsed: 225179ms | answer: 2393B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/__tests__/images-prompt.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/image/make-image.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/make-images.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/plan.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 有文章權限、沒有配圖權限的客戶，無法再產生自動文章  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts:90  
  confidence  -> CONFIRMED  
  scenario    -> 客戶有 `content.article`、沒有獨立的 `content.image` 權限 → 文章文字生成成功後，`grantFor("content.image")` 拋錯，題目變成失敗，WordPress 草稿也不會建立。  
  why missed  -> 新增配圖步驟時，沒有對照既有的獨立功能授權契約。

FINDING 2: R2 未設定或上傳失敗時，系統宣稱圖片成功，發布時卻會丟掉圖片  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/image/make-image.ts:121  
  confidence  -> CONFIRMED  
  scenario    -> 圖片生成成功，但 R2 未設定或 `putDesignObject` 失敗 → `makeContentImage` 仍以 `ok: true` 回傳 `data:` URL；自動流程把它當作已完成圖片，但 Bridge 與一般 REST 的發布轉換器都只接受 `http(s)` 圖片，最後文章沒有該圖片。  
  why missed  -> 共用圖片函式沿用了適合互動式 API 的 data URL 備援，沒有檢查 WordPress 發布端的 URL 契約。

FINDING 3: 非 Bridge 網站的首張圖片不會成為精選圖片  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts:99  
  confidence  -> CONFIRMED  
  scenario    -> 自動文章發往一般 WordPress REST 網站 → 流程傳入 `featuredImageUrl: images[0]`，但一般 REST 發文 payload 沒有使用此欄位或設定 `featured_media`；草稿及後續發布的文章都沒有精選圖片。  
  why missed  -> 作者確認了呼叫端有傳首張圖片，未追到另一條 WordPress 發布路徑。

FINDING 4: 日文網站的來源搜尋被改成台灣地區及中文查詢詞  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts:188  
  confidence  -> CONFIRMED  
  scenario    -> 網站語言設為 `日本語` 且有 Serper API key → 新的 CJK 判斷命中後，搜尋使用 `gl: "tw"` 與「權威來源」中文詞，而非日本地區及日文來源；文章取得的參考來源會偏向台灣結果。  
  why missed  -> 把 SEO 的 CJK 分詞判斷直接共用於搜尋地區選擇，但兩者需要不同的語言對應規則。

TOTAL: 4 findings

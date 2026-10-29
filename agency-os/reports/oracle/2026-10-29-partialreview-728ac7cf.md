# codex-oracle review -- 2026-10-29 15:18:34 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/plan.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/__tests__/images-prompt.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/image/make-image.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/make-images.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. Round-2 findings addressed: F1 images optional via optionalImageGrant (EntitlementRequired -> article without images, other errors still throw); F2 makeContentImage returns stored, automatic pipeline takes only stored https images; F4 source search region per language (zh tw, ja jp, ko kr, else us). F3 (REST non-bridge path ignores featuredImageUrl) is pre-existing for the manual tool too and left out of scope. Report only new defects.
- exit: 0 | elapsed: 205072ms | answer: 1355B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/__tests__/images-prompt.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/brand-voice.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/image/make-image.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/make-images.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/plan.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/plan.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 未設定 R2 時，自動文章仍付費生成圖片，隨後把圖片全部刪除
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts:95
  confidence  -> CONFIRMED
  scenario    -> 組織有 `content.image` 權限，但未設定 `R2_API_TOKEN` 或 `R2_ACCOUNT_ID`；管線要求並生成 3 張圖片，`makeContentImage` 回傳 `stored: false`，第 103 行將網址轉成 `null`，第 62 行刪除所有佔位符。圖片費用已產生，文章卻沒有圖片。
  why missed  -> 測試涵蓋無圖片權限與單張生成失敗，沒有涵蓋「有權限但無法儲存」；R2 設定條件位於另一個模組。

FINDING 2: 三張圖片同時送往 Replicate，低餘額帳戶可能因突發速率限制而遺失圖片
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts:57
  confidence  -> PLAUSIBLE
  scenario    -> Replicate 帳戶餘額低於 US$5，適用圖片生成模組註明的 `burst=1` 限制；3 個請求同時發出，受限請求在相近時間各重試一次，若再次收到 429，對應的佔位符便被刪除，草稿少於要求的 3 張圖片。
  why missed  -> `fillArticleImages` 的測試使用不受速率限制的 mock；Replicate 的突發限制與單次重試寫在共用生成器中。

TOTAL: 2 findings

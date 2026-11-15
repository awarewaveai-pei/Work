# codex-oracle review -- 2026-11-15 11:54:40 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/embed-in-post.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/embed-poster.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.8 round 2. Round-1 fixes (52914185): once-check alreadyEmbedded() also matches the attribute-escaped url inside the video block (& as &amp;); coverForRelease (in lib/content/video/cover.ts, already on main dee6e6c03 in its first form; the working tree version adds a videoUrl argument) now returns a poster only when the Release's candidate row object_url equals the embedded videoUrl, so another video's Release never puts its cover on this one; the default-cover rule no longer depends on candidate index 0.
- exit: 0 | elapsed: 136306ms | answer: 1295B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/embed-in-post.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/embed-poster.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 封面查詢未確認 Release 仍獲批准
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/cover.ts:66
  confidence  -> CONFIRMED
  scenario    -> `MEDIA_PRODUCTION_PERSISTENCE_ENABLED=false`，同組織的 Release 已標記為 `withdrawn`，但候選影片 URL 未變；呼叫嵌入 API 並傳入該 Release ID，仍會取得其封面並寫入 WordPress。收據的批准狀態檢查只在持久化啟用時執行（`delivery-receipts.ts:18-20`、`embed-in-post.ts:85`）。
  why missed  -> 新測試的 Release 假資料沒有 `status` 欄位，無法檢查撤回狀態。

FINDING 2: `once` 檢查把文章中的連結誤認為已嵌入影片
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/embed-in-post.ts:31
  confidence  -> CONFIRMED
  scenario    -> 文章含 `<a href="https://cdn/v.mp4?a=1&amp;b=2">下載</a>` 和 `<!-- VIDEO_PLACEHOLDER -->`，嵌入呼叫使用相同影片 URL 且 `once=true`；`alreadyEmbedded` 回傳 true，`embedVideoInPost` 於第 150 行直接成功返回，佔位符未被替換，影片沒有嵌入。
  why missed  -> 測試只檢查裸 URL、影片區塊和完全不相關的內容，沒有檢查其他 HTML 屬性中的相同 URL。

TOTAL: 2 findings

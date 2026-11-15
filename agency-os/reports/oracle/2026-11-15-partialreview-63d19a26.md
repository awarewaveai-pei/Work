# codex-oracle review -- 2026-11-15 11:36:48 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/release-copy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/release-copy.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/fake-db.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.3 + VD.9 on the release page. VD.3: /api/video/cover GET lists each ratio row's covers (newest 30 + the chosen one from lib/content/video/cover.ts chosenCover), POST json chooses one (writes metadata.chosenAt on the COVER row only, after checking it is a cover of that video in that org), POST multipart uploads the user's own JPG/PNG <= 2 MB with rights confirmed as a chosen upload cover (R2 content-addressed key, media_assets real_footage row). Org access via assertOrgAccess before any DB read. Panel shows chosen cover + candidate buttons + upload with a rights checkbox. VD.9: a newly ticked channel's text starts free with title + script first line (defaultCopy); the AI rewrite button shows NT$ from the cost model's syndicate feature at TWD_RATE (no second rate).
- exit: 0 | elapsed: 232335ms | answer: 2810B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/fake-db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/release-copy.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/release-copy.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 封面上傳在檢查權限與 2 MB 上限前，就解析整份 multipart 請求
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts:83
  confidence  -> CONFIRMED
  scenario    -> 已登入使用者向影片站送出遠大於 2 MB 的檔案；該站的 Nginx 上限為 500 MB（`nginx/default.conf:559`）。請求先由 `formData()` 完整解析，才在第 85 行檢查權限、第 93 行拒絕大小，佔用伺服器資源。
  why missed  -> 測試只驗證回傳 413，沒有檢查拒絕前已處理多少請求內容。

FINDING 2: 同內容的並行上傳會因版本唯一鍵衝突而讓其中一筆失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts:112
  confidence  -> CONFIRMED
  scenario    -> 同一組織同時把相同圖片上傳給兩支影片；兩個請求都讀到同一個最新版本，並插入相同的下一版。`0038_media_assets_reconcile.sql:106` 的唯一索引使其中一筆回傳 502，雖然其 R2 PUT 已成功。
  why missed  -> 測試依序上傳；既有 workbench 匯入路徑則有針對此衝突的重試。

FINDING 3: 換影片後，新勾選的頻道可能沿用上一支影片的文案
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:223
  confidence  -> CONFIRMED
  scenario    -> 為影片 A 勾選頻道並產生預設文案，取消勾選後按「換一支」選影片 B；切換影片未清除 `texts`（第 172 行），再次勾選時此行保留 A 的非空文案，存草稿會送出錯誤影片的文字。
  why missed  -> 預設文案測試只測純函式，未涵蓋同一頁面切換影片的狀態。

FINDING 4: 只含檔頭的損壞圖片會被接受為封面
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cover/route.ts:95
  confidence  -> CONFIRMED
  scenario    -> 上傳內容僅為 `89 50 4E 47` 的檔案並標示 `image/png`；四位元組檢查通過，API 將它登記為已選封面，但瀏覽器及後續平台無法解碼圖片。
  why missed  -> 測試只用全零位元組驗證錯誤檔案，未測有效檔頭後截斷的內容。

FINDING 5: 較慢的舊影片封面查詢會覆蓋新影片的結果
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:89
  confidence  -> CONFIRMED
  scenario    -> 影片 A 的封面 GET 尚未完成時切換到 B；B 的 GET 先完成並顯示封面，隨後 A 的回應執行此行，以只含 A 的資料覆蓋 `covers`，B 被誤顯示為沒有封面。
  why missed  -> 查詢沒有取消或比對當前影片；現有測試未涵蓋回應順序顛倒。

TOTAL: 5 findings

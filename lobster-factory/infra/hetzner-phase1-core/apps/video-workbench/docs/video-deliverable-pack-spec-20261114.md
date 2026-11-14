# 成片交付包規格（VD 卡）— 2026-11-14

起因：社群工具貼文清單影片縮圖全黑（影片開頭是黑畫面，系統沒有「封面」）。操作者要求：生成影片時自動產生吸引人的封面，並列出一支影片還該有什麼。
路徑前綴：`apps/` = `lobster-factory/infra/hetzner-phase1-core/apps/`。行號以 origin/main `2b3bd0596` 為準。
產品規則：付費＝按鈕上標 NT$（`next-admin/public/editor-shared/image-models.js:18` TWD_RATE 32）；免費做法優先且是預設；不用下拉選單；不用中國公司 AI 模型。

## 1. 交付包清單（現況 → 決定）

| # | 項目 | 現況（file:line） | 缺 | 免費做法（預設） | 付費做法（NT$） | 用到的平台 | 決定 |
|---|---|---|---|---|---|---|---|
| 1 | 封面圖 | 只有工作台素材縮圖：第 1 秒、360p `thumb.jpg`（`video-workbench/backend/media-store.cjs:153-160`），不登記主系統；社群清單用影片第 1 秒畫面（`next-admin/app/(shell)/tools/social/VideoFrame.tsx:1-14`） | 沒有封面這個資料；沒有傳給任何平台 | ffmpeg 挑非黑、有代表性的格子＋標題字，影片本身尺寸，3 張候選 | AI 依畫面重新設計背景（AI 不寫字，標題仍由 ffmpeg 疊）；`image-models.js` 的 fill 列：FLUX 2 Klein 4B 約 NT$0.06、Nano Banana 2.1 約 NT$1.82、GPT-Image-2.6 約 NT$1.92／張（`image-models.js:34,46,54`） | YouTube、IG Reel、WordPress、社群工具清單 | 做：VD.1–VD.8 |
| 2 | 標題／說明／hashtag | 標題＝剪輯專案標題，經 release-text 存 `media_assets.metadata.title/script`（`next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:63-66`）；各平台文案只有 AI 按鈕（`next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:177`，hashtag 規則在 `next-admin/lib/social/write-posts.ts:14-32`） | 文案框預設空白；AI 按鈕標 US$（違反 NT$ 規則） | 每個勾選頻道的文案預設帶入標題＋腳本第一段 | 現有 AI 文案，按鈕改標 NT$ | 全部社群 | 做：VD.9 |
| 3 | 字幕檔 SRT/VTT | 剪輯器可下載（`video-workbench/backend/api.cjs:1388-1390` → `subtitle-export.cjs`，格式函式 `next-admin/lib/content/video/caption-formats.ts:34,39`）；送審只把字幕句子拿去做 caption QA，不存檔（`next-admin/lib/content/video/caption-qa-persistence.ts:9-30`） | 成片沒有附字幕檔；**Postiz v2.25.1 三個 provider 都不上傳字幕**（§3 A4） | 送審時存 SRT＋VTT 到 R2，送審頁給下載連結（手動貼到 YouTube Studio／FB）；WordPress 嵌入帶 `<track>` | 無 | YouTube、FB（手動）、WordPress | 做：VD.10；自動上傳平台＝不做（Postiz 不支援，要自己接 `captions.insert`／`/{video}/captions`，另議） |
| 4 | 長片章節 | 無（剪輯器沒有章節標記） | — | — | — | YouTube（說明欄 00:00 起、≥3 段、每段 ≥10 秒，§3 B4） | 不做：目前成片多為短片；要先有剪輯器章節標記功能，另開卡 |
| 5 | 響度 | 剪輯匯出母帶 −16 LUFS、真峰值 ≤ −1 dBTP 並驗證（`video-workbench/backend/editor-export.cjs:466,919,971-978`）；目標可調 −24～−9（`video-workbench/shared/editor-model.js:153-156`）；專業剪輯同樣 −16（`video-workbench/backend/api.cjs:1033-1036`） | — | 維持 −16 | — | 全部 | 不改：四個平台都**沒有官方公布的 LUFS 目標**（§3 B5），−14 只是非官方慣例且來源互相矛盾；要更大聲的人已能在「整片設定 › 音訊」自己調 |
| 6 | 替代文字（無障礙） | 社群貼文媒體已有 `alt_text` 欄位（`lobster-factory/packages/db/migrations/0105_social_v16.sql:517`），compose 會送 `alt`（`next-admin/lib/social/compose.ts:110`）；影片草稿存檔時沒帶（`next-admin/lib/content/video/social-drafts-deps.ts:36`） | 影片草稿 alt 空白 | alt＝標題 | — | 支援 alt 的平台（Postiz MediaDto `alt`） | 做：併入 VD.5 |
| 7 | 片尾 CTA | 工作台已有 CTA 疊圖工具（`video-workbench/backend/media.cjs:163-234`，指定時段疊 CTA 圖） | — | 已有 | — | 全部 | 已有，不做 |
| 8 | 各平台比例版本 | 匯出對話框依平台出比例（`video-workbench/scripts/editor-export-dialog.js:54-63`）；平台取用比例表（`next-admin/lib/content/video/platform-ratio.ts:5-18`）；每支登記帶 ratio（`video-workbench/backend/main-system.cjs:156-163`） | — | 已有 | — | 全部 | 已有，不做 |
| 9 | 版權與來源紀錄 | 登記時存 `rightsSources`、`parentAssetIds`、`costUsd`、`vwJobId`（`next-admin/app/api/internal/video/workbench/assets/route.ts:216-222`，來源由工作台自己重建 `video-workbench/backend/main-system.cjs:150-155`）；rights QA（`next-admin/lib/content/video/editorial-rights-persist.ts`）；核准閘要四項 QA（`next-admin/lib/content/video/release-evidence.ts:5`） | — | 已有 | — | — | 已有，不做 |

## 2. 封面資料模型（決定）

- 封面＝一列 `media_assets`（image/jpeg），`metadata.coverOf = <影片列 id>`、`metadata.coverKind = auto | ai | upload`。工作台產的走既有登記路由，`asset_domain`：auto=`workbench_render`、ai=`ai_generated`、upload=`real_footage`（rights 記 upload confirmed）。
- 選中的封面＝影片列 `metadata.coverAssetId`。第一張 auto 候選登記時若影片列還沒有 coverAssetId 就設它；之後只由使用者「換一張」改。
- 每個比例列各有自己的封面（從該比例影片本身截，尺寸＝影片尺寸：16:9→1920×1080、9:16→1080×1920、4:5→1080×1350）。不另外裁切。
- 封面不在 Release 的 checksum 裡：換封面不讓 QA 失效；社群草稿、WordPress 嵌入取「當下選中的」封面。
- 不變量：封面只能指向同組織、同一支影片的列（路由驗證 coverOf 與 coverAssetId 的 org 與 coverOf 一致），客戶端傳來的 URL 一律不信，伺服器用 id 查 `object_url`。
- JPEG ≤ 2 MB（YouTube 行動版上限，§3 B6）：品質由 q=3 起往下調到符合。
- 免費自動挑格（VD.1）：取 1 秒到 min(長度, 120 秒) 每秒一格，`signalstats` 量 YAVG，丟掉 YAVG < 24（黑）或 > 235（白）的格；剩下的用 `thumbnail` 濾鏡挑代表格，取前 3 張且彼此相隔 ≥ 2 秒；全被丟掉時退回影片中點那格。標題用 `drawtext` 疊在下方帶狀底（字型＝`vendor/fonts` 釘住的思源黑體，與燒字幕同一份，`video-workbench/backend/subtitle-burn.cjs:77`），字級依寬度自動縮；沒有標題就不疊字。

## 3. 官方文件事實（2026-11-14 查，Postiz 讀 v2.25.1 tag 原始碼）

- A1 Postiz YouTube：`thumbnail?: MediaDto`（選填）`youtube.settings.dto.ts:82-84`；provider 用 `settings.thumbnail.path` 呼叫 `thumbnails.set`（`youtube.provider.ts:635`），失敗時影片仍上傳、回「could not set the thumbnail」（`:184-240`，帳號未驗證也是這條）。https://raw.githubusercontent.com/gitroomhq/postiz-app/v2.25.1/libraries/nestjs-libraries/src/dtos/posts/providers-settings/youtube.settings.dto.ts
- A2 Postiz IG：Reel 有 `m.thumbnail`（媒體項目上的 URL 字串）→ `cover_url`，否則 `thumb_offset`（`instagram.provider.ts:738-748`）。https://raw.githubusercontent.com/gitroomhq/postiz-app/v2.25.1/libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts
- A3 Postiz Facebook：影片貼文不送縮圖（provider 只送 file_url/description/title）。FB 封面＝不支援，退回平台自選。https://raw.githubusercontent.com/gitroomhq/postiz-app/v2.25.1/libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts
- A4 Postiz 字幕：youtube/instagram/facebook provider 都不上傳字幕；上游 PR #1787 未 merge。https://github.com/gitroomhq/postiz-app/pull/1787
- A5 Postiz `MediaDto`：`id`、`path`、`alt?`、`thumbnail?`（`@IsUrl` 字串）（`media.dto.ts:15-21`）。https://raw.githubusercontent.com/gitroomhq/postiz-app/v2.25.1/libraries/nestjs-libraries/src/dtos/media/media.dto.ts
- B1 YouTube `thumbnails.set`：jpeg/png，API 上限 50 MB。https://developers.google.com/youtube/v3/docs/thumbnails/set ；`captions.insert` 400 配額、SRT/VTT 皆可 https://developers.google.com/youtube/v3/docs/captions/insert
- B2 IG Reels `cover_url`／`thumb_offset`，封面建議 9:16，非 9:16 取中央 9:16 裁切。https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
- B3 FB `POST /{video_id}/thumbnails`（≤10 MB）、`/{video_id}/captions`（SRT，檔名 `name.locale.srt`，≤200K）。https://developers.facebook.com/docs/graph-api/reference/video/thumbnails/ ・ https://developers.facebook.com/docs/graph-api/reference/video/captions/
- B4 YouTube 章節：00:00 起、至少 3 個、每段 ≥ 10 秒。https://support.google.com/youtube/answer/9884579
- B5 響度：YouTube／IG／FB／TikTok 皆查無官方 LUFS 目標；−14 LUFS 為非官方慣例。
- B6 YouTube 縮圖：最小寬 640、建議 JPG/PNG、行動版 2 MB、自訂縮圖需帳號驗證。https://support.google.com/youtube/answer/72431

## 4. 卡片（依序做；每張：gate 或 `npx tsc --noEmit`＋指名測試＋`/codex-review`＋push main，不部署）

**VD.1 工作台：匯出時產生免費封面候選**（video-workbench）
- 改：新增 `video-workbench/backend/cover.cjs`（§2 挑格＋疊字＋≤2 MB）；`video-workbench/backend/api.cjs:623-634`（editor-export 成功後）與 `:1101-1123`（engine-render）呼叫，候選檔經 `mediaStore.ingest` 存，`job.result.covers = [{url, kind:"auto"}]`。
- 完成：匯出開頭 1.5 秒全黑的影片，3 張候選都不是黑圖、尺寸＝影片尺寸、各 ≤ 2 MB、有標題時畫面有字。
- 測試：`video-workbench/tests/cover.cjs`（ffmpeg 合成黑頭＋彩條影片；全黑影片退回中點；無標題不疊字），加進 gate。

**VD.2 登記封面到 media_assets**（video-workbench main-system＋next-admin assets 路由）
- 改：`video-workbench/backend/api.cjs:110-140` settleOnce 在影片登記後登記候選（`vwJobId = cover:<jobId>:<i>`，失敗記 `coverError`、下次 GET 重試，比照 releaseText）；`video-workbench/backend/main-system.cjs:141-188` ingest 帶 `coverOf/coverKind`；`next-admin/app/api/internal/video/workbench/assets/route.ts:59-97` parseMeta 收 `coverOf`(uuid)/`coverKind`，`:206-222` 寫 metadata，驗 coverOf 同 org 且是影片，影片列無 coverAssetId 時設第一張。
- 完成：一次匯出 → 1 影片列＋3 封面列，影片列 `coverAssetId` 指第 1 張；重送不重複。
- 測試：`next-admin/app/api/internal/video/workbench/assets/route.test.ts` 加：他 org 的 coverOf 被拒、第二張不覆蓋已選、非影片 coverOf 被拒；工作台既有 main-system 測試加 cover 重試一案。

**VD.3 送審頁：預覽與換封面**（next-admin）
- 改：新增 `next-admin/app/api/video/cover/route.ts`（GET 候選＋已選；POST `{organizationId, assetId, coverAssetId}` 換選；POST multipart 上傳自己的圖 → R2＋`coverKind:"upload"` 列；全部 `assertOrgAccess`，比照 `next-admin/app/api/video/release/route.ts:20`）；`ReleaseDeliveryPanel.tsx:143-166` 每個比例列顯示選中封面＋候選小圖按鈕（點＝選）＋「上傳自己的封面」按鈕。
- 完成：送審頁看得到封面、點候選即換、上傳後成為選中。
- 測試：`next-admin/app/api/video/cover/route.test.ts`（他影片的封面被拒、他 org 被拒、換選寫入 coverAssetId）。

**VD.4 工作台：AI 設計封面（付費）**（video-workbench）
- 改：成片卡（`video-workbench/shared/jobs-view.js` 送審按鈕旁）加「AI 設計封面」按鈕列，每個模型一顆按鈕、`data-paid="video.image" data-paid-model=<row>` 顯示 NT$（`video-workbench/shared/paid-price.js:28-29`）；後端用 `video-workbench/backend/image-edit.cjs` 的 fill 列對全畫面選區改圖（指令：保留主體、做吸睛封面背景、不寫任何字），再由 `cover.cjs` 疊標題；結果走 VD.2 登記為 `coverKind:"ai"`、帶 costUsd，經既有 permit＋settle 扣點一次。
- 完成：按鈕上有 NT$；沒有許可被拒且不呼叫廠商；成功後多一張 ai 候選並扣點一次。
- 測試：`video-workbench/tests/cover-ai.cjs`（fetch stub：價格來自 capabilities、無 permit 不呼叫、成功只 settle 一次、輸出有疊字）。

**VD.5 社群草稿帶封面與 alt**（next-admin social＋migration）
- 改：migration `lobster-factory/packages/db/migrations/0162_social_media_cover.sql`（＋down）：`social_media.cover_media_id uuid`，FK `(cover_media_id, organization_id) → social_media(id, organization_id)`；`next-admin/lib/social/store.ts:846-860` addVideo 收 coverUrl → `uploadMedia`（`next-admin/lib/content/postiz.ts:149`）存成 image 列並回寫 cover_media_id；`next-admin/lib/content/video/social-drafts.ts:16-17,42-43` releases 帶 coverUrl、savePost 帶 alt；`social-drafts-deps.ts:18-38` 從影片列 coverAssetId 查 object_url，alt＝標題。
- 完成：存草稿後影片 media 有 cover_media_id；沒有封面時行為同今天。
- 測試：`next-admin/lib/content/video/__tests__/social-drafts.test.ts`（每比例帶自己的封面；無封面不上傳圖；alt＝標題）。

**VD.6 發送時把封面交給 Postiz**（next-admin social）
- 改：`next-admin/lib/social/dispatch-store.ts:19,27` select 加 `cover:social_media!cover_media_id(postiz_media_id, postiz_path)`；`next-admin/lib/social/compose.ts:17-26,104-133`：youtube → `settings.thumbnail = {id, path}`（§3 A1）；instagram／instagram-standalone → 媒體項目 `thumbnail: <cover postiz_path>`（§3 A2/A5）；facebook 與其他 → 不帶（§3 A3）。
- 完成：預覽與發送同一函式，YouTube/IG 帶封面、FB 不帶、無封面同今天。
- 測試：`next-admin/lib/social/__tests__/compose.test.ts` 四案（YT 有封面、IG 有封面、FB 有封面不帶、無封面不變）。

**VD.7 社群工具清單縮圖改用封面**（next-admin social UI）
- 改：`next-admin/lib/social/store.ts:820-828` listMedia 回 `cover_path`；`next-admin/app/(shell)/tools/social/api.ts:70` MediaItem 加 `cover_path`；`Calendar.tsx:57-67` Thumb：影片有 cover_path → `<img>`，沒有才 `VideoFrame`。抽純函式 `stillOf(item)` 讓清單、行事曆、媒體庫共用。
- 完成：有封面的影片貼文清單顯示封面；舊影片仍顯示第 1 秒畫面。
- 測試：`next-admin/app/(shell)/tools/social/__tests__/still-of.test.ts`。

**VD.8 WordPress 嵌入帶 poster**（next-admin）
- 改：`next-admin/lib/content/video/embed-in-post.ts:134-143`：有封面時插 `core/video` 區塊 `<!-- wp:video --><figure class="wp-block-video"><video controls poster="…" src="…"></video></figure><!-- /wp:video -->`（屬性跳脫），沒有封面維持裸 URL；封面由伺服器從 releaseId → 影片列 coverAssetId → object_url 查，不收客戶端 URL；`once` 判斷仍以 videoUrl。
- 完成：新草稿文章的影片有 poster；無封面行為同今天。
- 測試：`next-admin/app/api/video/embed-to-wp/route.test.ts` 加：有封面含 poster、無封面為裸 URL、URL 含 `"` 被跳脫。

**VD.9 文案免費預設＋NT$ 標價**（next-admin）
- 改：`ReleaseDeliveryPanel.tsx:91-112,177`：勾選頻道時文案預設＝標題＋腳本第一段（免費）；AI 按鈕標價改 NT$（用 `image-models.js:20` `nt()` 換算，同一個匯率）。
- 完成：沒按 AI 也有可存的文案；按鈕無 US$。
- 測試：抽 `defaultCopy(title, script)` 純函式，`next-admin/lib/content/video/__tests__/default-copy.test.ts`。

**VD.10 字幕檔隨成片存檔**（next-admin，選做：最後一張）
- 改：`next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:63-75`：captions 非空 → `toSrt/toVtt`（`caption-formats.ts:34,39`）存 R2 `<影片 key>.srt/.vtt`，metadata `captionFiles`；送審頁列「下載字幕 SRT／VTT」；VD.8 區塊加 `<track kind="captions">`（先確認 R2 公開網域 CORS，否則不加 track）。只取字幕軌的句子（實作前 grep 剪輯器字幕軌 kind；`release-text.cjs` 目前收所有可見文字）。
- 完成：有字幕的成片可下載 SRT/VTT。
- 測試：release-text `route.test.ts` 加：有字幕存兩檔、無字幕不存。

## 5. 不做（理由已在 §1）
章節（#4）、響度改 −14（#5）、字幕自動上傳平台（#3）、FB 自訂縮圖（Postiz 不支援，§3 A3）、社群編輯器手動貼文選封面（另議）。

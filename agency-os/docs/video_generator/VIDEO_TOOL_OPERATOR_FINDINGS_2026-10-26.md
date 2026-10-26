# 影片工具操作者實測問題 — 2026-10-26

狀態：**只記錄、未修**（操作者：「先記下來，還要繼續討論」）。前案 [`VIDEO_WORKBENCH_UX_RECONCILIATION_AUDIT_2026-09-10.md`](VIDEO_WORKBENCH_UX_RECONCILIATION_AUDIT_2026-09-10.md) 已判「developer control panel」並列出替代 IA 驗收閘，至今未做；本檔問題多數是同一根因的實測症狀。
路徑縮寫：`V/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/`，`NA/` = `apps/next-admin/`。

## 根因（一句）

10 步 stepper 只是把既有面板串起來（`V/VideoPipeline.tsx:17-29`），各步沒有共用的「專案」：客戶、腳本、成片、比例都不往下傳，④之後的閘門（QA/Release）在真實資料上從未能通過。

## Prod 實證（ks-aw-01，2026-10-26 唯讀查詢）

| 事實 | 證據 |
|---|---|
| `media_releases`=0、`media_delivery_attempts`=0、`media_outcome_snapshots`=0 筆（史上） | psql count |
| `media_transcription_jobs` 只有 2026-09-09 canary 1 筆 | psql |
| 操作者今日成片 `b1730ab3` 實際有 16x9 **和** 4x5 兩支（R2 皆 206） | `media_assets.metadata.formats` |
| 該片 QA：technical=warned（black 80%）、editorial=failed（缺 script）、rights=failed（無授權紀錄） | `media_qa_reports` |
| `MEDIA_TRANSCRIBE_*` 在 `/root/lobster-phase1/.env:214-216` 有值，但容器內 `printenv` 三個都不存在（compose 未傳）；worker `video-whisper.aware-wave.com/health` → 530（筆電 worker 未開） | docker exec printenv；curl |
| nginx：今日 4 次 `regenerate-image` 皆 200；4 次 `transcription/dispatch` 皆 503 | access log |

## 問題清單（S=嚴重／M=中／m=小）

### 腳本（步驟①／`/tools/script-forge`）
- **M1 動態預覽視窗被切掉、關閉鍵在畫面外**：外框 `position:fixed` 置中、無 `maxHeight`/`overflow:auto`；內含 480px 畫面＋控制列＋場景清單＋底部「關閉預覽」(`V/ScriptForge.tsx:341-342,421`)；視窗矮於內容就切頭尾、不能捲。也無 Esc／點背景關閉。
- **M2 多平台轉換是「只能看」**：結果只顯示卡片 (`V/ScriptForge.tsx:490`)；四顆送出按鈕永遠送原版 `script` (`:492-495`)；轉換版不能採用、不能複製、按下一個平台就覆蓋上一版（`setRepurposed(null)` `:452`）。操作者要的是「原版／各平台版並存可選」。
- **M3 多平台轉換沒有平台規則**：prompt 只說「改寫成 X 版本」(`NA/lib/script-forge/modules.ts:289`)，無字數、hashtag、@ 規則；輸出形狀也沒有 hashtags 欄。既有規則正本 `NA/lib/social/limits.ts:10-22`（Postiz 各平台上限）未被引用。
- m4 頂部「目標平台」= 寫腳本時指定的主平台（進 prompt）；底部「多平台轉換」= 寫完後另產其他平台版本。畫面未說明兩者差異。
- 前則已記：兩顆送影片按鈕（計畫 P5.27 只要一顆）、Remotion 名不副實、第 2 步換模式資料變空、送社群漏 hashtag、三次選租戶、兩頁重複放 24 模組。

### ④⑥ 生成／渲染
- **S5 成片看不到**：渲染完成 `onRenderComplete` 立刻 `goto(5)`，VideoStudio 被卸載 (`V/VideoPipeline.tsx:157`)，成品畫面一閃即逝。
- **S6「可以關閉頁面，完成後在生成記錄」是假承諾**：文字在 `V/VideoStudio.tsx:1495`；stepper 內 tab 列隱藏（`embedded`，`:676`），生成記錄只在 `?advanced=1`；關頁 stepper 狀態全失（全為 React state，無專案持久化）。
- **M7 重新生成拿到同一張**：B-roll／Pexels 場景永遠取搜尋結果第一張 (`NA/lib/content/video/pexels.ts:55-69`)，同關鍵字＝同圖。AI 生圖場景會換圖。
- **M8 重新生成只改正在看的比例**：只更新 `activeFormat` (`V/VideoStudio.tsx:518,539-543`)，另一比例保留舊圖。
- **M9 多比例「只送一個」是下游問題**：渲染端兩比例都有產出（見 prod 實證），但一個 `media_assets` 列只登 16x9 checksum；QA、Release、Postiz URL map（預設 `{"16x9":""}`）只認一個比例。

### ⑤ Timeline
- **M10 三種模式是假步驟**：quick_video／short_drama／remotion 不產 Timeline，直接自動放行 (`V/TimelineGateStep.tsx:56`)；只有實拍剪輯真驗。

### ⑦ 字幕
- **S11 永遠 503**：dispatch 要三個 env (`NA/app/api/video/transcription/dispatch/route.ts:25`)，容器內不存在（compose 沒傳）；就算傳了，worker 是筆電隨開隨用（`VIDEO_WHISPER_WORKER_DEPLOYMENT.md`），目前 530。

### ⑧ QA
- **S12 QA 結果被藏起來**：editorial/rights 實際已跑且 failed，但 reports API 只回 `passed|warned` (`NA/app/api/video/qa/reports/route.ts:24`)，畫面顯示「尚無證據」而非「未通過＋原因」。
- **S13 四類 QA 在 quick video 結構上不可能通過**：technical 見 S14；caption 見 S11；editorial 需 `metadata.script`，render-draft 從不寫（該片 metadata 鍵：title source formats outputMeta renderedAt sceneCount formatCount selectedFormats serviceCapability）；rights 需逐素材 `rights_status=cleared`＋licenseRef＋sourceRef，AI 生圖／Pexels 從不寫。Release 只收四類皆 passed (`NA/lib/content/video/release-gate.ts:16-17`) ⇒ Release 史上 0 筆。
- **S14 黑畫面偵測器參數寫錯（誤報）**：`blackdetect=d=0.5:pix_th=0.98` (`apps/video-service/server.py:214`)。`pix_th` 是「像素多暗算黑」（預設 0.10），0.98 ⇒ 幾乎所有像素都算黑；本意應是 `pic_th`。實測該片每 3 秒取樣亮度 YAVG 54–153（正常），`pix_th=0.10` 偵測 0 段黑畫面；QA 報 80%。所有 technical QA 因此永遠 warned。
- m15 QA 步驟無說明四類差異、無任何編輯介面；操作者問「全自動時 QA 在哪編輯、會出現在影片哪裡」——QA 是出片前的檢查報告，不會出現在影片裡，目前也沒有地方可以看到或修正原因。

### ⑨ Release
- **S16 整頁是工程測試面板**：租戶第 N 次選、SHA-256、`平台貼文 JSON`、`影片 URL map JSON`、Site ID／Post ID／成片 URL 手填 (`V/ReleaseDeliveryPanel.tsx:99-101`)；2026-09-10 決策 D6 明知保留裸輸入。社群草稿仍走舊 `/api/content/social-publish` (`:89`)，與社群產品（Postiz 唯一 adapter、`TASKS.md` 社群 V1 條目）重複。

### ⑩ 營運
- **M17 沒有作用**：只有「載入」按鈕讀方案／點數與成效快照 (`V/MediaOperationsPanel.tsx:13-30`)；成效快照史上 0 筆（Postiz analytics 未接，`CURRENT_IMPLEMENTATION_STATUS.md`「Outcome feedback」）。

## 處理狀態（2026-10-26 同日）

- 已修（repo）：S14 黑畫面參數、M1 預覽視窗、S12 QA 未通過顯示原因（含字幕 QA `violations`）、M7／M8 重新生成與上傳改到每個比例、S11 compose 傳入 `MEDIA_TRANSCRIBE_*`。
- 未上線：next-admin 隨每日 03:00 自動部署；video-service 與主機 compose 不在自動部署內（主機 compose 走 `safe-infra-patch.sh compose`，High）；Whisper worker 仍需筆電開著。
- 新發現、未修：技術 QA 判 `failed`（如音量 −35 LUFS，`apps/video-service/quality.py:83-84`）時 worker 在 `server.py:263` 拋錯，`NA/lib/content/video/finalize.ts:101-108` 只在成功時寫 QA → 失敗原因不會進 QA 頁（Codex 審查 2026-10-26）。歸 [`VIDEO_TOOL_REDESIGN_2026-10-26.md`](VIDEO_TOOL_REDESIGN_2026-10-26.md) R3。
- 其餘（S5、S6、M9、M10、S13、S16、M17、腳本頁問題）＝重新設計範圍，見 [`VIDEO_TOOL_REDESIGN_2026-10-26.md`](VIDEO_TOOL_REDESIGN_2026-10-26.md)。

## 操作者已表態的需求（討論輸入，未定案）
1. 每步可參與很好，但要「真的能編輯」；④ 要能選「接下來我參與」或「全自動到底」。
2. 要有一個看成片的結果頁；生成記錄不該藏在進階。
3. 多平台：原版與各平台版並存、可選；照各平台規則（字數、#、@…）。
4. 腳本頁與影片頁要分清楚或整合，客戶只選一次。

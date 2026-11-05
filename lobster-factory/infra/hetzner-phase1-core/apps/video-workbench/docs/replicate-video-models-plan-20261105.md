# 影片模型接 Replicate（卡 RV）— R0 七段計畫

2026-11-05。`VW` = `apps/video-workbench`，`NA` = `apps/next-admin`。狀態只在監工台 `data.mjs`；本檔不寫狀態。等操作者說「開始」才寫程式。

## 1. 任務理解

VW 影片生成只接 OpenAI sora-2，模型由環境變數決定、每個任務不能選。NA 已有四個實測過的 Replicate 影片模型（Runway Gen-4 Turbo、Veo 3.1 Fast、Veo 3.1、Luma Ray 3.2，都是美國公司）。根本問題：**模型清單與輸入格式只該有一份**，VW 要直接用 NA 那份，不抄第二份。

## 2. 現況（file:line，2026-11-05 grep 驗過）

- 模型是整個服務一個，不是每個任務一個：`VW/backend/generation-policy.cjs:10` `models(env).video`；`VW/backend/api.cjs:136` `providerModels` 開機算一次；送出 `api.cjs:590-593` 用 `providerModels.video`，**不讀** `input.settings.model`。前端送的 `settings.model`（`scripts/index-0.js:1054`、`generator-director.js:139`、`generator-product.js:268`）目前只是紀錄。
- provider 寫死：`generation-policy.cjs:5`；`capabilities()` `:11-24` 全域 `videoDurations [4,8,12]`、`videoRatios`、`videoQualities ["720p"]`、`maxVideoImages 1`；`validate()` `:25-44`。
- OpenAI 影片流程：送出 `api.cjs:584-607`（`job.providerId = video.id`），輪詢＋下載＋算錢 `api.cjs:647-677`（`costs.videoUsd(providerModels.video, …)` `:674`），重開時 `api.cjs:155-159` 只留有 `providerId` 的任務，取消 `api.cjs:999-1004` 擋已送出的。錯誤遮罩 `api.cjs:152` 不含 `REPLICATE_API_TOKEN`。
- 價格：`VW/backend/provider-cost.cjs:37-41` `videoUsd` 只查 `OPENAI_VIDEO_RATES`；`priceOf` `:58-66`；付費前檢查 `api.cjs:712-714`。
- NA SSOT：`NA/lib/tarot/video-motion-gen.ts:42-85`（`VideoMotionModel`、`MOTION_MODELS` slug＋`buildInput`），但它 import `./image-gen` 與 `@/lib/ai/gateway`（`:17-19`），VW 不能 require（同 `VW/backend/bg-remove.cjs:2-3` 的理由）。價格 `NA/lib/ai/cost-model.ts:172-178` `VIDEO_MOTION_RATES`；登錄 `:151-157` `MEDIA_MODELS`；sora 價 `:277-280` `OPENAI_VIDEO_RATES`。登錄測試 `NA/lib/ai/__tests__/model-registry.test.ts:95-99` 掃 NA `lib/app/scripts` 的 slug，**不掃 VW**。
- VW 讀 NA 檔的機制：`VW/awarewave-files.txt`（打包清單，已有 `lib/ai/cost-model.ts`）＋`VW/backend/appearance.cjs:3-9` `resolveSource`；Replicate 用法前例 `VW/backend/bg-remove.cjs`（data URL 送圖 `:87`，取消 `:49-56`）。輸出網址守門 `NA/lib/tarot/image-gen.ts:323-329`（只信 `replicate.delivery`）。
- 前端寫死 sora：`scripts/index-0.js:32-40`（`model` 預設表）、`:586-600` 模型面板只列一顆、`:1176` 用 capabilities 蓋掉；`scripts/projects-0.js:225` `<select>` 只有 `["sora-2"]`（違反「不用下拉」）、`:359`、`:766` 新專案預設、`:66-67` 舊值遷移；`scripts/templates-0.js:38`。全域時長／比例讀取點：`generator-controls.js:73,193,205-216`、`generator-conversation.js:11,39`、`generator-product.js:116`、`index-0.js:569-571`。影片生成按鈕目前**不顯示價格**（只有去背有，`shared/assets-ui.js:33-38`）。
- 許可：`VW/backend/main-system.cjs:34-40` 影片＝`video.motion`；用量 `:307-311` 收 `costUsd`。
- 主機設定（repo 對照檔）：`docker-compose.yml:701` video-workbench 已有 `REPLICATE_API_TOKEN`；實際以 `docker exec <container> printenv REPLICATE_API_TOKEN` 為準。
- Replicate 模型規格（2026-11-05 免費 GET `/v1/models/<slug>` 讀 schema）：

| NA id | 必填 | 時長 | 比例 | 解析度 |
|---|---|---|---|---|
| `runway-gen4-turbo` | prompt＋**image** | 5／10 | 16:9、9:16 等 | 無欄位 |
| `veo-3-1-fast`／`veo-3-1` | prompt | 4／6／8 | 16:9、9:16 | 720p／1080p，**預設 1080p** |
| `luma-ray-3-2` | prompt | 5／10（有起始圖只准 5） | 有起始圖時忽略 | 540p／720p／1080p |

## 3. 風險

- R1 **NA 現有 Veo 可能少算錢**：`video-motion-gen.ts:65-78` 沒送 `resolution`，Veo 會跑 1080p；`cost-model.ts:174-175` 的價是否為 1080p 價未查。RV.1 先查 Replicate 頁面價目，再釘 `resolution:"720p"`（VW 只開 720p）。
- R2 抽出共用檔改到 NA 的 Tarot／內容影片流程（`lib/content/blocks/video-pipeline.ts:24,469`、`app/api/video/draft/route.ts:62`）：純搬移，`npx tsc --noEmit`＋NA 影片相關測試守；推上 main 即當晚 03:00 上線。
- R3 舊專案 `settings.model:"sora-2"`、未知值、`"VideoWorkbench V3"`（`projects-0.js:66-67`）必須照舊跑 sora；未知 id 回 sora 並在畫面顯示「已改用 sora-2」，不靜默換付費模型。
- R4 重開不丟錢：Replicate 任務也存 `providerId`＋`provider:"replicate"`，重開後續輪詢；取消改成可呼叫 Replicate cancel（`bg-remove.cjs:49-56` 同式）。
- R5 參考圖用 data URL 送（同去背）；大圖可能超過 Replicate 請求上限 → 先縮到 ≤1MB 再送，或失敗時明示，不重試付費。
- R6 Runway 一定要圖：沒參考圖時按鈕不可按，並說明原因。

## 4. 方案比較

- **A 最小**：VW 新增 `backend/replicate-video.cjs` 抄四個 slug＋輸入欄位，測試用 regex 比對 NA 原始檔（去背的做法）。rollback：刪檔＋還原 api.cjs。缺點：第二份清單，NA 加模型 VW 不會自動有。
- **B 完整（建議）**：把 NA `MOTION_MODELS` 搬到無 import 的 `NA/lib/ai/video-motion-models.ts`（slug、時長、比例、是否必須帶圖、`buildInput`、輸出網址守門），`video-motion-gen.ts` 與 `cost-model.ts:172` 型別都改 import 它；VW 經 `awarewave-files.txt`＋`resolveSource` 直接 require。一份清單，NA 登錄測試 (d) 自動涵蓋。rollback：`git revert` 該 commit（NA 行為不變，VW 回 sora 單模型）。

## 5. 建議

B。理由：「不另建模型清單」是需求本身；A 正是被禁止的第二份清單。

## 6. 實作計畫（卡 RV，一次一項）

- **RV.1 NA 共用模型檔**：新檔 `NA/lib/ai/video-motion-models.ts`（從 `video-motion-gen.ts:42-85` 原樣搬，加 `durations`、`ratios`、`requiresImage`、`resolution`；`isAllowedOutputUrl` 從 `image-gen.ts:323-329` 搬來並由 image-gen 轉出）；`video-motion-gen.ts` 改 import；`cost-model.ts:172` 型別改指新檔。先查 `replicate.com/google/veo-3.1-fast`、`/google/veo-3.1` 720p 價，價不同就更新 `VIDEO_MOTION_RATES` 並在 `buildInput` 送 `resolution:"720p"`。驗收：`npx tsc --noEmit` 綠；`model-registry.test.ts` 綠；新測試：VIDEO_MOTION_RATES 鍵 = 模型檔鍵。
- **RV.2 VW 後端**：`awarewave-files.txt` 加新檔；`generation-policy.cjs` 改成模型表＝sora（OpenAI）＋NA 四個（Replicate），`capabilities().videoModels[id] = {label, vendor, provider, durations, ratios, requiresImage, usdPerSec, available}`（available：sora 看 OPENAI_API_KEY、其他看 REPLICATE_API_TOKEN），頂層 `videoDurations` 等保留為 sora 值給舊前端；`validate()` 依任務的 `settings.model` 檢查；`api.cjs` 依任務模型分流（新 `backend/replicate-video.cjs`：建立、輪詢、下載≤80MB 串流擋、只信 replicate.delivery、取消）；`provider-cost.cjs` `videoUsd` 先查 OPENAI 再查 `VIDEO_MOTION_RATES`；`aiOrigin` 記任務實際模型與廠商；`api.cjs:152` 遮罩加 REPLICATE_API_TOKEN。驗收：`tests/replicate-video.cjs`（假 fetch）：送出 body 的 slug 與欄位＝NA 模型檔 `buildInput` 結果、重開續輪詢、取消呼叫 cancel、未知模型回 sora、`settings.model:"sora-2"` 走 OpenAI 且送出內容與改前相同；`tests/p6-main-system.cjs` 用量回報＝`usdPerSec×秒數`。
- **RV.3 VW 前端**：模型面板（`index-0.js:586-600`）列 `videoModels` 全部，每顆按鈕顯示「名稱 · US$x.xx（N 秒）」，不可用的灰掉並寫原因；`projects-0.js:225` `<select>` 改成同款按鈕；`index-0.js:32-40`、`:1176`、`templates-0.js:38` 預設仍 sora-2；時長／比例讀取點（`generator-controls.js:73,193,205-216`、`generator-conversation.js:11,39`、`generator-product.js:116`、`index-0.js:569-571`）改讀選定模型的限制；生成按鈕顯示價格（sora 也是）。驗收：既有 UI 測試綠＋新斷言：模型面板無 `<select>`、每顆按鈕有 US$、選 Runway 無圖時生成按鈕停用、舊專案 sora-2 開啟後仍選 sora-2。
- **RV.4 真打一次**：主機 `docker exec <vw> printenv REPLICATE_API_TOKEN` 確認有；部署後用員工帳號以 **Runway Gen-4 Turbo 5 秒（US$0.25，四個裡最便宜）** 帶一張小圖生一支；看成品能播、素材帳冊 `origin.model = runwayml/gen4-turbo`、用量回報 0.25。部署屬 High，要你說 go。

## 7. 驗證計畫

- 實測：RV.1 `npx tsc --noEmit`＋`npx vitest run lib/ai/__tests__/model-registry.test.ts`；RV.2–3 VW 指名測試（`node tests/replicate-video.cjs` 等）；RV.4 真打一次（上列）。
- Review：`/codex-review`（Claude 寫）；金流相關（算錢、用量）抽查 `videoUsd`、`priceOf`、用量回報三處。
- 抓蟲：grep `sora-2`、`providerModels.video`、`videoDurations`、`VIDEO_MOTION_RATES`、`MOTION_MODELS`，範圍含 `agency-os`、`scripts`、NA、VW。
- WORKLOG：四行證據。

不做：中國公司模型（Kling、Hailuo、Wan、Seedance 等）不列；首尾幀、動作參考、1080p、10 秒仍不開（schema 有，但 NA 沒驗過價，之後另議）。

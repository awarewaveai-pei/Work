# S1 去配樂・重配音效：計費＋兩條看畫面的路（operation `sfx`）

App＝`VW/`＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`；`NA/`＝同層 `next-admin/`。先讀 `COMMON.md`、`../PLAN.md`、`../RESEARCH.md`（§0、§B、§C 全讀）。
操作者 2026-11-25：A、B 兩條路都要。分兩個 commit：**S1a 先做完並自測，再做 S1b**。

## 現況
`VW/backend/audio-tools.cjs`：`sfx` 只有一列 ElevenLabs（人聲分離＋照文字生成音效，不看畫面）；價格 0 才算可用（`:31`），付費一律拒絕（`:47`）。沒有付費功能鍵。

## 不變量（兩張卡共用）
- B1 會花錢的列：有功能鍵授權才可跑；成功才扣，金額＝實際成本（`result.ai.costUsd` → `api.cjs:835` → settle `api.cjs:232-235`，settle 不改）；失敗不扣。
- B2 ElevenLabs 免費方案不可商用（`RESEARCH.md` F2）：`audio-tools.cjs` 裡任何用到 ElevenLabs 的列，帳號是免費方案時 `available:false`，說明寫「ElevenLabs 免費方案不可商用，升級後可用」。**`separate` 的 ElevenLabs 列同樣適用**（同一類問題一起關）。`separate` 的 `local` 列不變、仍免費。
- B3 聲音／畫面送到哪一家，照 `VW/backend/audio-policy.cjs` 既有機制回報正確的廠商名；此客戶規定不外送時，外送列不可用（既有 `soundOut`）。
- B4 原片畫面不動（`-c:v copy`）；對白保留；上限 2 分鐘不變。
- B5 送出鈕顯示價格（`data-paid`），`/generations/quote` 先給估價。
- B6 新廠商金鑰只從環境變數讀；沒有金鑰＝該列不可用（503 在送出前），不得 fallback 到別家。

## S1a 計費鍵＋B 路（Gemini 看片 → ElevenLabs 生成）
1. 功能鍵 `video.audio-tools`（`separate`、`sfx` 兩個工具的付費列共用）。照 `RESEARCH.md` §C 第 1–14 項逐項做（該表寫的是 `video.sfx`，鍵名一律改用 `video.audio-tools`）；每項動手前 grep 驗 `file:line` 仍對。
2. `VW/backend/elevenlabs.cjs` `soundEffect`：帶 `model_id: "eleven_text_to_sound_v3"`；單段上限照官方 30 秒（F3）。
3. 新 `VW/backend/video-describe.cjs`：把影片（降解析、去聲）送 Gemini，回傳帶時間的音效提示 `[{ start, end, prompt }]`（英文 prompt、不含音樂與對白）。仿 `VW/backend/transcribe.cjs:199-209` 的 Interactions 呼叫；模型用 `NA/lib/ai/cost-model.ts` `TEXT_RATES` 已有的最便宜 Gemini Flash-Lite 列；成本照 `provider-cost.cjs` 既有 token 計價（注意 §C 末段 `total_input_tokens` 那條）。回傳嚴格驗（時間在片長內、不重疊、段數上限 12）。
4. `sfx` 的 ElevenLabs 列改為 B 路並取代原列（id `elevenlabs` 保留，舊草稿仍可用）：人聲分離 → Gemini 提示（使用者有寫 `sfxPrompt` 就當成額外指示一起送）→ 每段呼叫 `soundEffect` → FFmpeg 依 `start` 用 `adelay` 放到時間點、與人聲混音。沒聲音的片跳過分離。
5. 說明文字照實寫：「每秒看一格畫面，音效對時到秒；快動作可能對不準」。

## S1b A 路（Mirelo SFX 2.0）
1. 新 `VW/backend/mirelo.cjs`：官方 API（`https://mirelo.ai/api-docs.md`，先讀文件再寫；不經 fal）。金鑰 `MIRELO_API_KEY`。上傳影片 → 生成 1 個版本 → 輪詢 → 下載。參數 `preserve_speech:false`、`separate_speech:true`：拿它回的純音效與分離人聲，自己用 FFmpeg 混回（B4）。逾時、取消、下載大小上限照 `VW/backend/video-enhance.cjs` 的寫法。
2. `audio-tools.cjs` `sfx` 加一列 `mirelo`（排在前面＝預設），價格列進 `cost-model.ts`（每輸出秒美元；註明查價日期與來源網址）。
3. `audio-policy.cjs`：這一列外送的是**影片＋聲音**到 Mirelo。
4. 沒有金鑰時：列出但 `available:false`，說明「尚未設定 Mirelo 金鑰」。

## 檔案
- 新：`VW/backend/video-describe.cjs`、`VW/backend/mirelo.cjs`、`VW/tests/sfx-billing.cjs`
- 改：`RESEARCH.md` §C 列的檔；`VW/backend/elevenlabs.cjs`；`VW/scripts/tools-workflows.js` 只動 sfx 區塊（`:108-112`）與 separate 區塊的按鈕；`VW/package.json`（`test:sfx`）
- 不動：`VW/scripts/tools-0.js`、`VW/backend/face-privacy.cjs`、`VW/backend/media.cjs` 的 `supported`、`VW/backend/api.cjs:836` 與 `jobTimeoutMs`（別的卡在改）

## 驗收
- `node tests/sfx-billing.cjs`（假 fetch）：B1 成功扣實際成本／失敗不扣；B2 免費方案下 `separate`、`sfx` 的 ElevenLabs 列不可用；B6 沒金鑰不 fallback；Gemini 回傳驗證（越界、重疊、過多各一）。
- 突變（擁有權／計費守衛，各一次）：拿掉 B1 的功能鍵檢查 → 指名測試紅 → 還原綠；拿掉 B2 → 紅 → 還原綠。
- 更新既有測試 `VW/tests/p6-main-system.cjs`、`VW/tests/elevenlabs-free-tier.cjs`（§C 第 14 項）；`node tests/backend.cjs`、`node tests/services.cjs` 仍綠。
- `NA/`：`npx tsc --noEmit` 綠；跑受影響的 vitest 檔（列出檔名與結果）。
- 實跑 B 路一次（10 秒 CC0 片；Gemini 成本 < US$0.01）：回報 Gemini 回了哪些段、成品音軌實際聽不到就用 `ffmpeg volumedetect`／`astats` 證明各段時間點有聲。ElevenLabs 若是免費方案，B2 會擋住生成——那就只實跑到 Gemini 那一步，寫進 RISKS，不要繞過 B2。
- A 路沒有金鑰：只跑假 fetch 測試，寫進 RISKS「等操作者提供 `MIRELO_API_KEY` 後實跑」。
- 不部署、不改正式機、不動 DB migration。若發現功能鍵需要 DB migration 或種子資料，停下寫進 RISKS。

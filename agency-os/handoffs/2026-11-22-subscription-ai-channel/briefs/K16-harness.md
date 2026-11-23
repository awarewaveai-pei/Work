# K16 八種文案實測：產出資料（工人）→ 並排頁（監工）

目標：八種寫文案的功能，各用**該功能自己的提示詞產生程式**和一個真實感的輸入，讓「現用模型」與 `gpt-6.2-sol` 各寫一次，結果存成一個 JSON。不改任何產品程式、不 commit 產品檔、不部署、不碰正式站與正式資料庫。

## 怎麼跑（全部在本機）
- Claude 那一邊（現用模型）：`claude -p --model <opus|haiku> --system-prompt-file <檔> --tools "" --setting-sources "" --strict-mcp-config --disable-slash-commands --no-session-persistence --output-format json`，prompt 走 stdin，子行程環境拿掉 `ANTHROPIC_API_KEY`（走訂閱，同一個模型）。寫法照 `scripts/codex-image-worker.mjs` 的 `textCommand`（claude 分支）。
- OpenAI 那一邊：`POST https://api.openai.com/v1/chat/completions`，`model`、`max_completion_tokens`、`messages:[system,user]`，金鑰只從環境變數 `OPENAI_API_KEY` 讀（沒有就停下回報，不找金鑰檔、不印任何金鑰）。每次呼叫記 `usage`。
- 取得提示詞：用 vitest 當 TypeScript 執行器（暫時的 `*.test.ts`，跑完刪掉，不進 commit），import 各功能的提示詞產生函式，把 `{ system, user }` 寫到暫存 JSON；再用一支暫時的 `.mjs` 逐一呼叫兩邊。提示詞產生函式若沒有匯出、寫死在 route 裡：在暫時測試檔裡照原文重建並在結果的 `promptSource` 欄寫 `file:line`，不要改產品檔去匯出。
- 兩邊拿到的 system＋user 必須逐字相同。

## 八種（先 grep 驗真位置；`現用` 以程式實際送出的 model 為準）
| key | 功能 | 位置（起點） | 輸入 |
|---|---|---|---|
| script-forge | 劇本工坊 | `app/api/tools/script-forge/route.ts`、`lib/script-forge/` | 手動模式產一份完整腳本；主題「職場倦怠的 5 個警訊」 |
| video-script | 影片腳本（回 JSON） | `lib/content/video/video-script-core.ts` | 文章＝`agency-os/reports/model-bakeoff/2026-11-article/drafts.jsonl` 裡 `model=="gpt-6.2-sol"` 那篇；6 場景 |
| product-copy | POD 商品文案 | `lib/studio/product-copy.ts` | 一件 T 恤，設計描述「水彩風格的山與月亮，寫著 breathe」，繁中 |
| humanize | AI 去味 | `app/api/content/humanize/route.ts` | 同上那篇文章的前 1,500 字 |
| market-analysis | 競業與痛點分析 | `app/api/content/market-analysis/route.ts` | 關鍵字「職場倦怠」 |
| content-plan | 每月選題（回 JSON） | `lib/content/topics/plan.ts` | 品牌：身心療癒／藝術療癒部落格，台灣讀者，繁中；月份 2026-12 |
| syndicate | 社群多平台改寫（回 JSON 或分段） | `lib/social/write-posts-claude.ts`、`lib/social/write-posts.ts` | 同上那篇文章；平台 Facebook、Instagram、Threads |
| outreach-mail | 開發信第一封 | `lib/outreach/`（寫信的提示詞；`ai-openai.ts`／`generate`） | 虛構但合理的名單：台北一間 12 人的瑜伽教室「晨光瑜伽」，網站提到團體課與企業包班；我方服務＝內容行銷代操。標明是範例資料 |
比較的模型：每種＝現用模型＋`gpt-6.2-sol`；`outreach-mail` 另加 `gpt-6.1-terra`。現用模型若已是 OpenAI（開發信），就用 OpenAI 那一邊跑。

## 輸出
`agency-os/reports/model-bakeoff/2026-11-copy/results.json`：陣列，每筆
`{ surface, label, model, isCurrent, ms, inputTokens, outputTokens, costUsd, text, formatOk, formatNote, promptSource, input }`
- `costUsd`：OpenAI 用 `usage`×`lib/ai/cost-model.ts` `TEXT_RATES`；Claude 訂閱那邊用 CLI 回報的 tokens×`TEXT_RATES`（＝若走 API 的價格），並加 `viaSubscription:true`。
- `formatOk`：回固定格式的功能，用**該功能自己的解析函式**（如 `parseScriptJson`、選題與社群的解析）驗；其餘填 `null`。
- 回固定格式的三種（video-script、content-plan、syndicate）每個模型**各跑 3 次**，`formatNote` 寫通過次數（例 `3/3`）；`text` 留第一次的。其餘各跑 1 次。
同資料夾另存 `prompts.json`（每種的 system、user 與 `promptSource`）。

## 邊界
- 預估 OpenAI 花費 < NT$15；單次 `max_completion_tokens` 照該功能現行設定。超過就停下回報。
- 暫時檔全部刪掉；`git status` 只剩 `agency-os/reports/model-bakeoff/2026-11-copy/` 兩個新檔。commit 這兩個檔（pathspec），不 push。
- 某一種跑不起來（提示詞拿不到、解析函式沒有）：跳過那一種，在回報的 RISKS 寫原因與 `file:line`，其餘照做。

回報（繁體中文）：FILES／每種各模型一行（ms、tokens、NT$、formatNote）／COMMITS／RISKS／一句結論。

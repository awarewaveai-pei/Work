# K20 四種文案的預設模型換成 gpt-6.2-sol

先讀 `briefs/COMMON.md`。操作者 2026-11-23 看完 K16 比較後定案「照建議開卡」。
- 換：影片腳本、社群改寫、開發信寫信、AI 去味。
- 不換（不要動）：劇本工坊、競業分析、商品文案、每月選題。
實測資料：`agency-os/reports/model-bakeoff/2026-11-copy/results.json`、`prompts.json`。

## 現況（已驗；動手前自己再 grep 一次）
| 功能 | 位置 | 現況 |
|---|---|---|
| 影片腳本 | `lib/content/video/video-script-core.ts:16,222,259` | 只打 Claude；`:222` OpenAI id 被擋回 `CLAUDE_DEFAULT_MODEL` |
| 社群改寫 | `lib/social/write-posts-claude.ts:15`（呼叫端 `lib/content/syndicate.ts` 等） | 只打 Claude `CLAUDE_FAST_MODEL`，上限 2000 |
| 開發信 | `lib/outreach/ai-openai.ts:13-14,32` | 已是 OpenAI，`gpt-5.4-mini`，可被 env `OPENAI_OUTREACH_MODEL` 蓋掉 |
| AI 去味 | `app/api/content/humanize/route.ts:85-86` | 只打 Claude（串流），上限 6144 |
文章生成已有 OpenAI 路徑與「沒 OpenAI key 就退回 Claude」的作法：`lib/ai/text-model-options.ts` `resolveArticleTextModel`、`lib/content/article/generate-core.ts`。**沿用同一套呼叫與記帳，不另寫第二個 OpenAI client。**

## 不變量（整類一次關掉）
1. 每個功能的預設模型只在一處宣告：把 `DEFAULT_ARTICLE_TEXT_MODEL`／`resolveArticleTextModel` 推廣成「功能 → 預設模型」一張表（文章、影片腳本、社群改寫、AI 去味、開發信），同一個 resolve 函式：操作者選過的模型不被取代；沒選用該功能預設；沒有 OpenAI key（買斷安裝）退回該功能原本的 Claude 模型。文章現有行為與測試不變。
2. **gpt-6.x 的思考用量算在輸出上限內**（實測：商品文案上限 1,200 時三次有一次全部用在思考、回空字串，`finish_reason: "length"`，見 `agency-os/reports/model-bakeoff/2026-11-copy/product-copy-retest.json`）。所以：(a) 走 OpenAI 時每個功能的上限要留得下思考（先看文章路徑怎麼設，照同一規則；不要每處各寫一個魔術數字）；(b) 空字串或 `finish_reason: "length"`＝這一段失敗，退回該功能原本的 Claude 模型重跑一次，並記進帳本／skipped，**不得把空白或截斷結果當成功交回**。
3. 固定格式的功能（影片腳本、社群改寫、開發信）仍用各自原有的解析函式驗；解析失敗的處理照原本路徑。
4. 訂閱鏈不受影響：影片腳本的 `runTextChain` 路徑照舊，改的只是 API 那一段可以是 OpenAI。
5. 開發信：預設常數改 `gpt-6.2-sol`；env 覆寫機制保留。主機容器有沒有設 `OPENAI_OUTREACH_MODEL` 由監工查（你不要 ssh）。開發信目前整個功能是關著的，不要打開。

## 測試（只寫這些；不做無效益測試）
- resolve 表：每個功能「選過／沒選／沒 OpenAI key」三種。
- 每個換掉的功能：OpenAI 回空或 `length` → 退回 Claude 且不回傳空結果（一個守衛一次突變：拔掉退回 → 該測試紅 → 還原）。
- 既有測試跟著改到綠。`npx tsc --noEmit`＋相關 vitest。
- **真跑**（本機、金鑰只從環境變數 `OPENAI_API_KEY` 讀、不印金鑰、不碰正式站與正式 DB）：四種功能各用 `prompts.json` 的輸入經改完的程式路徑跑 **3 次**，全部非空、固定格式全部解析通過。OpenAI 花費上限 NT$15，超過就停。結果寫 `agency-os/reports/model-bakeoff/2026-11-copy/k20-verify.json`（每次：功能、模型、ms、tokens、reasoning tokens、finish_reason、formatOk）。暫時檔刪掉。

## 邊界
不改提示詞內容、不改不換的四種、不動訂閱 worker／bridge、不部署、不 push。commit（pathspec）。任何一種做不成（例如串流路徑沒有可沿用的 OpenAI 實作）：其餘照做，那一種停下並在 RISKS 寫 `file:line` 與原因，不要硬湊。

回報（繁體中文）：FILES／TESTS／真跑每種一行（3 次的 ms、reasoning tokens、formatOk、NT$）／COMMITS／RISKS／一句結論。

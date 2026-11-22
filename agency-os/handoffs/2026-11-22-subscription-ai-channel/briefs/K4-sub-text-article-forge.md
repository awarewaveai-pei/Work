# K4 `sub-text` 入口＋文章＋劇本工坊

前置：K1、K3 已在 main。合約＝PLAN §3「一個入口」、I5 I6。

## 檔案
- 新 `lib/ai/sub-text.ts`＋`lib/ai/__tests__/sub-text.test.ts`
- `lib/content/article/generate-core.ts`（`streamArticleGeneration` 分流 `:694`；`generateArticleMarkdown` `:762`；`prepareArticleGeneration` 的 model 正規化 `:624`）
- `app/api/content/generate/route.ts`、`app/(shell)/tools/content/ContentStudio.tsx`（只動送出與讀回應那一段）
- `app/api/tools/script-forge/route.ts`（Claude 分支 `:196`、OpenAI 分支 `:239`）、`app/(shell)/tools/video/ScriptForge.tsx`（同上）
- 前端輪詢沿用 `lib/studio/codex-wait.ts`（先讀；能直接用就用，不另寫一份）

## 要做
1. `runSubText({ grant, model, system, prompt, lane, signal, route, tool, jobId })`：`subTextSpec(model)` → `runSubJob`（K1）→ 成功時 `logAiCall`（model＝sub id、usage 進 metadata，K3）回 `{ ok:true, text, answeredModel, usage }`；失敗回 `{ ok:false, error }`，不記帳。`lane:"owner"` 時 actor 不是擁有者（`codexAllowed(grant.actor)` 為 false）→ `{ ok:false, error:"sub_operator_only" }`，不入佇列。
2. `runTextChain(models, { runSub, runApi })`（`models`＝K3 `resolveTextChain()` 的輸出）：依序試；sub 段失敗 → 記 `{ model, error }` 換下一段；API 段的結果即最終結果，帶 `skipped`。單一 API 模型＝長度 1 的鏈，行為與今天相同。
3. 文章：`streamArticleGeneration` 在 OpenAI 分支之前攔 sub 模型：一次 yield 全文，尾端照現有格式 yield `[COST_JSON]`（usd 0、vendor `訂閱`、model＝sub id）；被跳過的段落寫進 `[COST_JSON]` 的 `skipped` 欄（前端顯示成一行提示「Claude 訂閱：筆電離線 → 改用 …」，文字取自 `sub-text.ts` 的 `sub_*` 繁中對照表）；不往正文加任何註解行。`config` 加 `chain?: TextChain`、`claudeModel?: string`、`lane?: SubLane`（預設 owner），由 request body 與呼叫端帶入；現有的 `model` 欄＝鏈最後一段的 API 模型。
   已在 main 的介面（照用，不改）：`runSubJob(input: SubTextJobInput, signal): Promise<SubTextOutcome>`、`subWorkerStatus()`、`codexAllowed(actor)`（`lib/tarot/codex-bridge.ts`）；`TEXT_CHAINS`、`isTextChain`、`resolveTextChain({ chain, apiModel, claudeModel })`、`isSubTextModel`、`subTextSpec`（`lib/ai/text-model-options.ts`）；`logAiCall` 的 `answeredModel`＋`metadata`（`lib/ai/log-ai-call.ts`）。request body 的 `chain` 不是 `api` 而 actor 非擁有者 → 當成 `api`（不報錯，訂閱段不存在於他的畫面）。
4. I5：`/api/content/generate` 的鏈含訂閱段且擁有者 → `deferCodexWork(actor, async () => Response.json({ ok:true, markdown }))`，回 202；ContentStudio 收到 202 用既有輪詢取回 `markdown`，當成一個 chunk 餵進現有的處理流程（成本、meta 解析同一條路）。非 sub 模型的回應逐位元不變。
5. 劇本工坊：同 3、4 的做法；`used(usd)` 回報 0；run-budget（`lib/script-forge/run-budget.ts`）對 sub 模型估 0。
6. 等待中的畫面文字：「筆電寫作中… 已 N 秒」；離線／額度用完顯示對照表的句子＋現成的「啟動筆電」鈕（`app/CodexLaptopButton.tsx`）。

## 既有資料／行為
- 舊的已存請求（沒有 `chain`）＝ `api`。排程呼叫 `generateArticleMarkdown` 不經 route：sub 模型時在函式內直接等（lane 由 K7 傳入），本卡先讓它在 `lane:"owner"` 下可用即可。
- GPT／Claude API 路徑的串流、成本標記、截斷標記不變（既有測試斷言不改）。

## 測試（只這些）
- `runTextChain`：四條鏈；前段全失敗落到 API；第一段成功不碰後段。
- `runSubText`：非擁有者 owner lane → `sub_operator_only` 且未入佇列。**突變**：拔掉此守衛 → 必紅 → 還原。
- 文章：sub 成功 → 全文＋usd 0 的 COST_JSON、`ai_call_logs` 寫入一次；`claude+codex+api` 兩段皆離線 → API 產出且 `skipped` 有兩筆。
- route：sub＋擁有者 → 202＋job header；非 sub → 與改前相同的串流。

驗收：`npx tsc --noEmit`；`npx vitest run lib/ai lib/content/article app/api/content/generate app/api/tools/script-forge lib/script-forge`；預覽開文章頁，啟動筆電 worker（K2 版，`--lane owner`），用「Claude 訂閱 Haiku」實寫一篇短文，截圖。

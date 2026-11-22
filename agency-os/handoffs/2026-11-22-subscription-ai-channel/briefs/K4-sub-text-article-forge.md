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
2. `withSubFallback({ model, allow, runSub, runApi })`：非 sub 模型 → 直接 `runApi(model)`；sub 成功 → 回其結果；sub 失敗且 `allow` → `runApi(apiFallback)` 並帶 `fellBack: <error>`；sub 失敗且不 allow → 回該錯誤。
3. 文章：`streamArticleGeneration` 在 OpenAI 分支之前攔 sub 模型：一次 yield 全文，尾端照現有格式 yield `[COST_JSON]`（usd 0、vendor `訂閱`、model＝sub id）；失敗 yield 現有的 `<!-- GENERATION_ERROR: … -->` 格式（訊息用 `sub_*` 對應的繁中短句，集中在 `sub-text.ts` 一個對照表）；fallback 時照 API 路徑串流並在最前面 yield 一行 `<!-- SUB_FELL_BACK: <error> -->`（前端顯示成一行提示，不進文章內容；確認現有的 meta 解析不會把它當正文——若會，改在 `[COST_JSON]` 多帶 `fellBack` 欄，不加註解行）。`config` 加 `subFallback?: boolean`、`lane?: SubLane`（預設 owner），由 request body `subFallback` 與呼叫端帶入。
4. I5：`/api/content/generate` 選了 sub 模型且擁有者 → `deferCodexWork(actor, async () => Response.json({ ok:true, markdown }))`，回 202；ContentStudio 收到 202 用既有輪詢取回 `markdown`，當成一個 chunk 餵進現有的處理流程（成本、meta 解析同一條路）。非 sub 模型的回應逐位元不變。
5. 劇本工坊：同 3、4 的做法；`used(usd)` 回報 0；run-budget（`lib/script-forge/run-budget.ts`）對 sub 模型估 0。
6. 等待中的畫面文字：「筆電寫作中… 已 N 秒」；離線／額度用完顯示對照表的句子＋現成的「啟動筆電」鈕（`app/CodexLaptopButton.tsx`）。

## 既有資料／行為
- 舊的已存請求（沒有 `subFallback`）＝ false。排程呼叫 `generateArticleMarkdown` 不經 route：sub 模型時在函式內直接等（lane 由 K7 傳入），本卡先讓它在 `lane:"owner"` 下可用即可。
- GPT／Claude API 路徑的串流、成本標記、截斷標記不變（既有測試斷言不改）。

## 測試（只這些）
- `withSubFallback` 四種情形。
- `runSubText`：非擁有者 owner lane → `sub_operator_only` 且未入佇列。**突變**：拔掉此守衛 → 必紅 → 還原。
- 文章：sub 成功 → 全文＋usd 0 的 COST_JSON、`ai_call_logs` 寫入一次；sub 離線＋allow → 走 `apiFallback`；sub 離線不 allow → GENERATION_ERROR。
- route：sub＋擁有者 → 202＋job header；非 sub → 與改前相同的串流。

驗收：`npx tsc --noEmit`；`npx vitest run lib/ai lib/content/article app/api/content/generate app/api/tools/script-forge lib/script-forge`；預覽開文章頁，啟動筆電 worker（K2 版，`--lane owner`），用「Claude 訂閱 Haiku」實寫一篇短文，截圖。

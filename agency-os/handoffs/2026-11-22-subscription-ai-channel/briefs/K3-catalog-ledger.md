# K3 目錄＋價目＋帳本

目標：訂閱模型成為文字模型目錄的正式成員，價 0，帳本認得。只加資料與純函式，不接任何呼叫點（K4 做）。合約＝PLAN §3「模型目錄即通道」、I6。

## 檔案
- `lib/ai/text-model-options.ts`（整檔讀）
- `lib/ai/cost-model.ts`（`TEXT_RATES` `:54`、`TextRate` `:28`）
- `lib/ai/text-model-pricing.ts`
- `lib/ai/log-ai-call.ts`（整檔讀；`logAiCall` 寫入 `:159`）
- `lib/ai/__tests__/model-registry.test.ts`（必須仍綠；它規定 active id 的來源）
- 既有測試只在斷言「目錄恰為某幾個」時才改，改動列入回報 `CHANGED_ASSERTS:`

## 要做
1. `AI_TEXT_MODELS` 加四列，group `"訂閱"`：`sub-codex`「Codex 訂閱」、`sub-claude-haiku`「Claude 訂閱 Haiku」、`sub-claude-sonnet`「Claude 訂閱 Sonnet」、`sub-claude-opus`「Claude 訂閱 Opus」。
2. 同檔新增（純函式、browser-safe）：
   - `SUB_TEXT_MODELS: Record<id, { tool: "codex"|"claude"; cliModel: string|null }>`：codex → `cliModel:null`；claude haiku/sonnet/opus → `cliModel:"haiku"|"sonnet"|"opus"`。
   - 鏈（2026-11-22 合約變更）：`TEXT_CHAINS = ["claude+codex+api","claude+api","codex+api","api"] as const`、`TextChain`、`isTextChain`、`DEFAULT_TEXT_CHAIN = "api"`、`resolveTextChain({ chain, apiModel, claudeModel }): AiTextModel[]`（claude 段＝`claudeModel`，須為 claude 的 sub id，預設 `sub-claude-opus`；codex 段＝`sub-codex`；api 段＝`normalizeAiTextModel(apiModel)`，`apiModel` 是 sub id 時用 `DEFAULT_AI_TEXT_MODEL`；最後一個恆為 API 模型）。
   - `isSubTextModel(model)`、`subTextSpec(model)`。
   - `isOpenAiTextModel` 對 sub 模型回 false（現有呼叫點靠它分流；sub 由 K4 在它之前攔）。
3. `TEXT_RATES` 加同名四列：`inputPerM:0, outputPerM:0, cacheReadMult:1, cacheWriteMult:1, vendor:"訂閱", status:"active"`（`fallback` 只在 `model-registry.test.ts` 要求時填 `gpt-5.4`）。`TextRate.vendor` union 加 `"訂閱"`。註解一行：價 0 的原因與來源（PLAN §2）。
4. `text-model-pricing.ts`：sub 模型的標籤回 `NT$0（訂閱額度）`，摘要回 `訂閱 · 不按量計費`。
5. `logAiCall`：呼叫端傳入的 `model` 為 sub id 時，vendor＝`訂閱`、`cost_usd` 0；`metadata` 併入呼叫端給的 `usage`（tokens、`codex_5h_used_pct` 等，鍵名沿用 `lib/tarot/codex-bridge.ts` `CODEX_USAGE_KEYS`）與 `answered_model`。不新增欄位、不動 migration。先讀現有參數形狀，用現有的 metadata 通道；沒有就加一個選用參數 `meta?: Record<string, number|string|boolean>`。
6. 確認 `normalizeAiTextModel("sub-codex") === "sub-codex"`、`resolveSavedAiTextModel` 不把它改寫。

## 既有資料／行為
- 沒選訂閱模型的任何路徑輸出不變。`DEFAULT_AI_TEXT_MODEL` 不變。
- 使用 `AI_TEXT_MODELS` 畫按鈕的四個元件（ContentStudio、StudioWorkbench、ScriptForge、ImageEditPromptPanel）此卡後會多出四顆按鈕但還不能用：在本卡用一個匯出 `PICKABLE_TEXT_MODELS = AI_TEXT_MODELS.filter(非 sub)` 讓這四處暫時只列 API 模型（各改一個 import 名），K6 再放出來。這四處若各自寫了過濾邏輯就照其寫法最小改動。

## 測試（只這些）
- 四個 sub id：`isSubTextModel` true、`isOpenAiTextModel` false、`TEXT_RATES` 價 0。四條鏈各自展開正確；`apiModel` 給 sub id 時最後一段仍是 API 模型。
- `textCallCostUsd`（或現行計價函式）對 sub id 回 0。
- `model-registry.test.ts` 綠。

驗收：`npx tsc --noEmit`；`npx vitest run lib/ai`。

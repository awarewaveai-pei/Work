# K17 Codex 訂閱可選模型

先讀 `briefs/COMMON.md`。操作者 2026-11-23：「讓 ChatGPT 訂閱也能選模型」（例 GPT-6.2 sol）。

## 現況（已驗）
- `lib/ai/text-model-options.ts:71` 只有 `"sub-codex"`（`cliModel: null`＝CLI 預設）；Claude 那段已有三個 id＋`claudeModel` 一路傳。
- worker 已支援：`scripts/codex-image-worker.mjs:237` `...(job.cliModel ? ["-m", job.cliModel] : [])`。**worker 不用改**。
- 訂閱實際可用模型（`~/.codex/models_cache.json`，2026-11-23 抓）：含 `gpt-6-luna`、`gpt-6.1-terra`、`gpt-6.2-sol`、`gpt-6.2-astra`。

## 做法（與 Claude 段完全對稱，不另造機制）
1. 目錄：`sub-codex` 換成四個 id，`cliModel` 填上列 slug：`sub-codex-luna`／`sub-codex-terra`／`sub-codex-sol`／`sub-codex-astra`，label「Codex 訂閱 GPT-6.2 sol」這種。匯出 `DEFAULT_SUB_CODEX_MODEL = "sub-codex-sol"`、`DEFAULT_SUB_CLAUDE_MODEL = "sub-claude-opus"`（把散落的 `"sub-claude-opus"` 字面值一併收進來）。`"sub-codex"` 這個 id 刪除，不留別名。
2. `resolveTextChain` 加 `codexModel?: unknown`，規則同 claude 段（不是 codex 的 sub id → 預設）。
3. `codexModel` 沿 `claudeModel` 的每一個傳遞點加上（grep `claudeModel|textClaudeModel` 逐點對照，不可漏）：`ChainControl` 型別、`TextChainButtons`（codex 段被選到時多一排模型按鈕，樣式照 Claude 那排；不用下拉）、ContentStudio、ScriptForge、三個 route、`generate-core.ts`、`video-pipeline.ts`、`video-script-core.ts`、`video/start.ts`、`topics/make.ts`、每站設定 `textCodexModel`（`brand-voice.ts` `TEXT_ROAD_FIELDS`、`sites/[id]/route.ts` allowed 清單、`text-road-guard.ts` `wantsSub`、`TextModelButtons.tsx` 存檔與「目前設定」文字）。
4. 帳本：新列的 model 是新 id。`lib/ai/codex-usage.ts:50,54` 與其他以 `"sub-codex"` 精確比對處改成「codex 工具的全部 sub id ＋ 舊值 `sub-codex`」（由目錄導出清單，舊值常數註明＝2026-11-23 前的歷史列）。成本頁訂閱用量卡照舊能加總新舊列。
5. 既有資料：站設定沒存過 codex 模型（只有 `textChain`）→ 缺值走預設，無 migration。

## 測試（只寫這些）
- `resolveTextChain`：codex 段取 `codexModel`；給 claude id／垃圾值 → 預設。
- `sites/[id]` PATCH：`textCodexModel` 合法存、非法 400、非自有組織被 `subscriptionRoadDenied` 擋（一次突變：拔掉 `wantsSub` 的新條件 → 該測試紅 → 還原）。
- `codex-usage`：舊 `sub-codex` 列與新 id 列都計入。
- 既有測試裡的 `"sub-codex"` 字面值跟著改。不做無效益測試。

## 邊界
不改 worker、bridge wire contract、API 目錄、預設鏈；不部署；Codex 額度到 11-24 11:02 前封鎖，**不得呼叫 codex**（真跑留給 M1）。`npx tsc --noEmit`＋相關 vitest 綠；commit（pathspec）不 push。

回報（繁體中文）：FILES／TESTS／COMMITS／RISKS／一句結論。

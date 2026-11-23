# K21 每一個 OpenAI 呼叫的輸出上限都留思考用量

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 症狀（正式站實測 2026-11-23，部署版 fd0f023d6）
`POST /api/content/generate`，不選模型、`articleSize` 走 4096 那一級（`lib/content/article/generate-core.ts:17,634`），`gpt-6.2-sol` 回 200 但結尾是 `<!-- GENERATION_TRUNCATED … -->`，正文停在 FAQ 一半、沒有結論（80 秒、US$0.042）。中文小標與帳本模型都正確。

## 根因
gpt-6.x 的思考 tokens 算在 `max_completion_tokens` 內。K20 立了規則 `openAiCompletionBudget(功能上限)`（`lib/ai/text-model-options.ts:51-56`）並用在 `lib/ai/openai-text.ts`，但還有三處自己打 OpenAI、直接送功能上限：
- `lib/content/article/generate-core.ts:880` `max_completion_tokens: config.maxTokens`（文章；K15 起預設就是 gpt-6.2-sol → 短文章現在會被截斷）
- `app/api/tools/script-forge/route.ts:271` `max_completion_tokens: MAX_TOKENS`（劇本工坊選 OpenAI 模型時）
- `lib/studio/image-edit-prompt.ts:146` `max_completion_tokens: 350`
動手前 `grep -rn "max_completion_tokens" lib app` 重驗，以 grep 結果為準。

## 不變量
1. 送給 OpenAI 的 `max_completion_tokens` 只能來自 `openAiCompletionBudget(...)`，全 repo 一條規則。加一個結構測試守住：非測試檔裡 `max_completion_tokens:` 的值不是 `openAiCompletionBudget(` 開頭、或該檔沒有經過它 → 紅（寫法照 repo 既有的結構測試，例如 `lib/portal/__tests__/registry-code.test.ts` 的讀檔方式）。
2. 預留／估價跟著走：凡是用功能上限算「最壞花費」的地方（文章：`lib/content/topics/budget.ts` 與其呼叫的估價；劇本工坊：`lib/script-forge/run-budget.ts` `forgeCallUpperTwd`；其他 grep 得到的），模型是 OpenAI 時上限要用同一個 `openAiCompletionBudget`。K20 已為社群改寫做過（`lib/social/write-posts-claude.ts` `writerCallUpperUsd`），照同一作法，不另發明。「預留 ≥ 最壞實際花費」各加一個測試。
3. 截斷的處理不改：文章與劇本工坊原本就會標出截斷，照舊；本卡只是讓它不再因為思考用量而截斷。
4. Claude 路徑完全不動（`claudeParams` 的上限不變）。

## 測試（只寫這些）
- 結構測試（不變量 1）。
- 文章、劇本工坊：送出的 OpenAI 請求 body 的 `max_completion_tokens` = 功能上限 + headroom（各一個）。
- 預留守衛（不變量 2）各一個；一次突變（拿掉 headroom → 預留測試紅 → 還原）。
- `npx tsc --noEmit`＋相關 vitest。
- 真跑一次（本機，`OPENAI_API_KEY` 只從環境讀、不印）：用改完的文章串流函式產一篇 4096 那一級的繁中文章，結果沒有 `GENERATION_TRUNCATED`、有結論小標。花費上限 NT$5。記下 completion tokens 與 reasoning tokens。

## 邊界
不改提示詞、不改預設模型、不改 SIZE_TOKENS 數值、不部署、不 push。commit（pathspec）。
回報（繁體中文）：FILES／TESTS／真跑一行／COMMITS／RISKS／一句結論。

# K6 四種走法的按鈕元件＋狀態 API（不改任何頁面）

前置：K1、K3 已在 main。本卡只新增檔案；把元件裝進頁面是 K4b／K7 的事。

## 檔案（全部新檔）
- `components/tools/TextChainButtons.tsx`
- `components/tools/__tests__/TextChainButtons.test.tsx`（照 `components/` 既有元件測試的寫法與 runner；先 grep 找一個當範本）
- `app/api/tools/sub-worker/route.ts`＋`route.test.ts`（照 `app/api/tools/codex-laptop/route.ts` 與其測試的寫法）

## 已在 main 的介面（照用，不改）
- `lib/ai/text-model-options.ts`：`TEXT_CHAINS`、`TextChain`、`DEFAULT_TEXT_CHAIN`、`SUB_TEXT_MODELS`、`SUB_TEXT_COST_LABEL`
- `lib/tarot/codex-bridge.ts`：`subWorkerStatus()` → 每 lane `{ online, tools, quotaBlockedUntil }`；`codexAllowed(actor)`
- `app/CodexLaptopButton.tsx`（「啟動筆電」鈕，直接用）

## 要做
1. `GET /api/tools/sub-worker?lane=owner|schedule`（預設 owner）：非擁有者（`codexAllowed(requestActor(req))` 為 false）→ 403 `{ ok:false, error:"sub_operator_only" }`；擁有者 → `{ ok:true, lane, tools, online, quotaBlockedUntil }`（取 `subWorkerStatus()[lane]`），`Cache-Control: no-store`。
2. `TextChainButtons`（client component）props：
   `{ chain: TextChain; claudeModel: string; onChange(next: { chain: TextChain; claudeModel: string }): void; lane: "owner" | "schedule"; disabled?: boolean }`
   - 掛載時打一次第 1 點的 API。403 → 只畫「只用 API」一顆（已選、不可換），其餘完全不輸出。
   - 擁有者：一排四顆按鈕（`aria-pressed`），文字：`Claude 訂閱 → Codex 訂閱 → API`／`Claude 訂閱 → API`／`Codex 訂閱 → API`／`只用 API`。
   - 所選走法含 claude → 多一排三顆等級按鈕 Haiku／Sonnet／Opus（值＝`sub-claude-haiku|sonnet|opus`）。
   - 所選走法的每個訂閱段下方一行小字狀態：該 tool 在 `tools` 內且 `online` 且未被額度擋 → 「可用 · NT$0（訂閱額度）」；不在線 → lane owner 顯示「筆電離線，這一段會跳過」＋`<CodexLaptopButton />`，lane schedule 顯示「主機沒有登入這一家，這一段會跳過」；額度擋 → 「額度用完，M/D HH:mm 恢復，這一段會跳過」（台北時間）。
   - 離線或額度用完**不反灰**：鏈會自動往下走，只是告知。
   - 樣式只用 `app/globals.css` 既有的按鈕 class 與 token（先看 `app/(shell)/tools/content/sites/PublishModeButtons.tsx` 怎麼寫按鈕組，照它）。零色碼、不用下拉。
3. 文字集中在檔內一個 `COPY` 物件。

## 測試（只這些）
- route：非擁有者 403。**突變**：拔掉擁有者檢查 → 此測試必紅 → 還原。擁有者回傳所選 lane 的狀態。
- 元件：403 時只有「只用 API」；選含 claude 的走法才出現等級按鈕；離線時顯示跳過的句子且四顆按鈕仍可按；`onChange` 帶出 `{ chain, claudeModel }`。

驗收：`npx tsc --noEmit`；`npx vitest run components/tools app/api/tools/sub-worker`。

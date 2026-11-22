# K1 bridge：kind／tool／lane／額度狀態

目標：`lib/tarot/codex-bridge.ts` 的佇列能載文字 job、分兩條 lane、記每個 tool 的額度封鎖；圖的行為不變。合約＝PLAN §2 I1 I2 I5 I7、§3 wire contract。

## 檔案
- `lib/tarot/codex-bridge.ts`（整檔讀；現況 `Bridge` `:60`、`codexAllowed` `:72`、`workerOnline` `:79`、`runOnLaptop` `:90`、`claimJob` `:121`、`workerLeft` `:148`、`completeJob` `:155`、`WORKER_STOPS_ON` `:35`）
- `app/api/internal/codex-images/worker-auth.ts`、`claim/route.ts`、`complete/route.ts`
- `lib/tarot/__tests__/codex-bridge.test.ts`（既有斷言不改；只加新案例）
- 新測試可加在同目錄；不動 `lib/tarot/image-gen.ts` 的對外行為（它呼叫 `runOnLaptop`，簽名若要變，改成內部轉呼叫，呼叫端不改）

## 要做
1. 型別：`SubTool = "codex"|"claude"`、`SubLane = "owner"|"schedule"`。Job 變成 union：image（現狀欄位）＋ text `{ kind:"text", tool, cliModel: string|null, system: string, prompt: string }`；兩者都有 `lane`。圖 job 一律 `tool:"codex"`、`lane:"owner"`。
2. worker 註冊表以 lane 為鍵：`{ lastPollAt, tools: SubTool[], quotaBlockedUntil: Partial<Record<SubTool, number>> }`。`workerOnline(lane="owner", tool="codex", now)`：預設參數維持既有呼叫語意（`app/api/tools/codex-laptop/route.ts` 等不改）。
3. `worker-auth.ts`：回傳 lane 而非 boolean——`CODEX_WORKER_SECRET` → `owner`；`SUB_WORKER_HOST_SECRET` → `schedule`；皆 timing-safe；未設定的那把＝無人可用（fail closed）。兩把值相同時只認 `owner`。
4. `claimJob(lane, tools, waitMs)`：只取「job.lane === lane 且 tools 含 job.tool 且該 tool 未被額度擋」的最舊 job；其餘留在佇列。`schedule` lane 的 worker 即使自報有 `claude` 也永遠拿不到 claude job（I1：入佇列時就拒 `lane:"schedule"`＋`tool:"claude"`，回 `sub_lane_refused`）。
5. 新 `runSubJob(input, signal)`（文字用）：無相符且在線的 worker → 立刻 `sub_worker_offline`；該 tool 額度封鎖中 → 立刻 `sub_quota_exhausted`；逾時碼用 `sub_*`。`runOnLaptop` 保持為圖的入口與既有錯誤碼。
6. `completeJob`：text 成功帶 `{ text, usage?, answeredModel? }`；失敗若 `error === "codex_quota_exhausted" || "sub_quota_exhausted"`：圖沿用現行（worker 視為離線、佇列中的圖一併回錯）；文字改為記 `quotaBlockedUntil[tool] = quotaResetsAt ?? now+5h`，該 lane 佇列中同 tool 的文字 job 一併回 `sub_quota_exhausted`，worker 仍在線。封鎖到期自動解除。
7. `claim/route.ts`：讀 `tools`（缺＝`["codex"]`）；`complete/route.ts`：接受 `text`（字串、≤ 400,000 字元、非空）與 `quotaResetsAt`（有限正數）；`usage` 沿用 `usageOf`，另收 `input_tokens`／`output_tokens`（有限非負）。
8. 匯出一個讀取用函式 `subWorkerStatus()` → 每 lane `{ online, tools, quotaBlockedUntil }`，供 K6／K8 顯示。
9. 檔頭註解更正職責（一段，不寫歷史）。

## 既有資料／行為
- 舊 worker（不送 `tools`、收到沒有 `kind` 的 job）必須照常畫圖：claim 回的 image job 形狀＝現狀再加 `kind:"image"`。
- 既有測試檔斷言一行不改全綠。

## 測試（只這些）
- host secret 的 claim 拿不到 owner lane 的 job；owner secret 拿不到 schedule lane 的 job。
- `lane:"schedule"`＋`tool:"claude"` 入佇列即 `sub_lane_refused`。**突變**：拔掉這個守衛 → 此測試必紅 → 還原。
- worker 只報 `["codex"]` 時，claude 文字 job 留在佇列且 `runSubJob` 對 claude 立刻 `sub_worker_offline`。
- 文字額度封鎖：complete 帶 quota 錯誤 → 後續同 tool 立刻 `sub_quota_exhausted`、另一 tool 不受影響、到期解除、worker 仍 online。
- 兩把 secret 相同時 lane＝owner；未設定 host secret 時以空字串無法通過。

驗收：`npx tsc --noEmit`；`npx vitest run lib/tarot app/api/internal/codex-images app/api/tools/codex-laptop`。

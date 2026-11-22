# K2 worker：文字 job、無工具、憑證掃描、lane

目標：`scripts/codex-image-worker.mjs` 能做文字 job（Codex、Claude 兩種 CLI），可當筆電 worker（owner lane）或主機常駐 worker（schedule lane）。合約＝PLAN §2 I3 I4 I7、§3 wire contract。K1 同時進行：不要等它，照合約寫；用本檔自帶的假伺服器測。

## 檔案
- `scripts/codex-image-worker.mjs`（整檔讀；`runCodex` `:92`、`usageOf` `:112`、`draw` `:142`、`main` `:196`）
- `scripts/codex-image-worker-install.ps1`（只在參數有變時動）
- 測試：沿用該腳本現有測試的位置與 runner（先 grep `codex-image-worker` 找到既有測試檔；沒有就建 `scripts/__tests__/codex-image-worker.test.mjs`，用 `node --test`）

## 要做
1. 參數：`--lane owner|schedule`（預設 owner）。schedule：secret 讀 `SUB_WORKER_HOST_SECRET`、不讀 Windows 登錄檔、鎖檔與 idle 預設 0（常駐）；owner 現行為不變。
2. 啟動時偵測有哪些 CLI（`codex`、`claude` 是否可執行）→ claim body 帶 `tools`。兩條 lane 都照偵測結果回報（2026-11-22 合約變更：排程可選 Claude）。
3. claim 回的 job：`kind` 缺或 `"image"` → 現行 `draw`；`"text"` → `write(job)`。
4. `write(job)`：空白暫存目錄當 cwd；system＋prompt 經 stdin，不經 shell、不進命令列參數。
   - `tool:"claude"`：`claude -p --model <cliModel> --system-prompt <system> --tools "" --setting-sources "" --strict-mcp-config --disable-slash-commands --no-session-persistence --output-format json`，子行程環境拿掉 `ANTHROPIC_API_KEY`（否則走 API 計費）。讀 JSON 的 `result`、`usage.input_tokens/output_tokens`、`modelUsage` 的鍵當 `answeredModel`；`is_error` 或 `subtype !== "success"` → 錯誤。Windows 上 system 過長時改用 `--system-prompt-file`（先 `claude --help` 確認旗標存在；不存在就把 system 併進 stdin 的最前段並以明確分隔行隔開）。2026-11-22 筆電實測此組旗標可用（haiku，wall 11.9 s）。
   - `tool:"codex"`：`codex exec --json --sandbox read-only --skip-git-repo-check -c mcp_servers={} --disable shell_tool --disable unified_exec --disable browser_use --disable computer_use --disable apps --disable plugins --disable image_generation --disable view_image -o last.txt [-m <cliModel>] -`（先 `codex exec --help` 確認 `--disable` 寫法；不是就改用 `-c features.<name>=false`，並確認啟動訊息沒有「ignoring unrecognized configuration」）。文字取 `last.txt`；tokens 與額度 % 沿用 `usageOf`。Codex 額度到 11-24 才恢復：這條路只做到「參數被 CLI 接受、額度錯誤被正確轉成 `sub_quota_exhausted`＋`quotaResetsAt`」，實跑留給 M1，RISKS 註明。
5. I4 憑證掃描：交回前收集本機憑證字串——`~/.codex/auth.json` 內所有長度 ≥ 20 的字串值、`~/.claude/.credentials.json` 同理、兩把 worker secret、環境變數名含 `KEY|TOKEN|SECRET|PASSWORD` 且值長度 ≥ 16 者；輸出含任一 → `sub_output_blocked`，不送文字。純函式 `leaks(text, secrets)`，單獨匯出可測。
6. 錯誤碼：額度 → `sub_quota_exhausted`（從訊息解析 `try again at <時間>` 成 epoch ms 放 `quotaResetsAt`；解析不出就不帶）；未登入 → `sub_not_logged_in`；空輸出 → `sub_empty_output`；其餘 `sub_exec_failed`。圖沿用 `codex_*`。
7. I7：文字 job 遇額度錯誤**不結束行程**（圖的現行 exit 3 行為不變）。未登入在 schedule lane 也不結束，每 10 分鐘最多回報一次。
8. 逾時＝`min(內建上限, job.timeLeftMs)`，逾時殺子行程樹（沿用現有 `stop`）。

## 既有資料／行為
- 不帶新參數啟動＝今天的筆電生圖 worker，一行行為不變（鎖檔、30 分鐘自關、`--once`）。

## 測試（只這些）
- `leaks`：含 token 子字串 → true；不含 → false。**突變**：讓 `write` 跳過掃描 → 測試必紅 → 還原。
- 額度訊息 `You’ve hit your usage limit … try again at Nov 24th, 2026 11:02 AM.` → `sub_quota_exhausted`＋正確 `quotaResetsAt`。
- 機器上沒有某個 CLI 時，claim body 的 `tools` 不含它。
- claude 文字 job 的子行程環境沒有 `ANTHROPIC_API_KEY`、參數含 `--tools ""`。
- 實測一次（筆電、Claude haiku）：起一個本機假伺服器回一個 text job，worker `--once` 交回非空文字與 tokens；把終端輸出貼進回報。

驗收：`node --check` 等價檢查（ESM：複製成 `.mjs` 已是）；`node --test <測試檔>`。

# Execution Dashboard (Agency OS + Lobster Factory)

> 目的：用**一頁**掌握「完整建置系統、目前進度、尚未完成、下一步、硬性 Gate」並降低遺漏與重工。
>
> `<WORK_ROOT>` 例子：筆電可能是 `D:\Work`；公司桌機可能是 `C:\Users\USER\Work`。

## 0) 你每天只需要看什麼
- **狀態**：`LAST_SYSTEM_STATUS.md`
- **進度板（唯一真實來源）**：`TASKS.md`
- **發生了什麼（證據/日誌）**：`WORKLOG.md`
- **可續接摘要（AO-RESUME/AO-CLOSE）**：`memory/CONVERSATION_MEMORY.md`
- **今日細節**：`memory/daily/YYYY-MM-DD.md`
- **綜合報告（單檔拼裝，建議書籤）**：`reports/status/integrated-status-LATEST.md`  
  - 產生方式見 `docs/overview/INTEGRATED_STATUS_REPORT.md`（`scripts/generate-integrated-status-report.ps1`）
- **邊做邊學／將來自己當家**：`docs/overview/LEARNING_PATH_AI_AND_SYSTEMS.md`（具體問法、四週路線、每日 15 分鐘、**§17 五連問：注意·推演·為什麼·效益差錯·檢查預防**）
- **密鑰管理與復原手冊**：`docs/operations/local-secrets-vault-dpapi.md`（新機/重灌/換帳號時必看）
- **MCP 新增快速手冊（常用）**：`docs/operations/mcp-add-server-quickstart.md`
- **Cursor 企業級規則（版控、可交付）**：`docs/operations/cursor-enterprise-rules-index.md`（與 `AO` 流程牴觸時以 `agency-os/.cursor/rules/00`／`30`／`40` 為準）

## 1) 系統全貌（分層）
### A. Agency OS（治理 + 執行 + 證據）
- **治理文件**：`docs/**`
- **執行腳本**：`scripts/**`
- **排程/自動化**：`automation/**`
- **租戶包**：`tenants/**`
- **證據輸出**：`reports/closeout/**`、`reports/health/**`、`reports/guard/**`

### B. Lobster Factory（「一人跨國公司」底座工程）
- **工程本體**：`<WORK_ROOT>\lobster-factory\`
- **規格來源**：`<WORK_ROOT>\docs\spec\raw\`
- **主追蹤清單**：`<WORK_ROOT>\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST.md`
- **整合路線圖**：`<WORK_ROOT>\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`

## 2) 目前進度（你要掌握的結論版）
### 已完成（Phase 1 底座已落地）
- `lobster-factory` Phase 1 scaffold：migrations + manifest + workflow skeleton + validators
- 已建立 dry-run + acceptance gate（失敗即停）
- 已推送 GitHub，跨電腦 `pull` 可取得完整工程內容

### 尚未完成（下一段工程主線 — 細項以 `TASKS.md` + 龍蝦 `MASTER_CHECKLIST` 為準）
- **全自動建站**：真 hosting 長期治理（非僅 `mock` / `http_json` 控制面）、WordPress 從零 install 仍待與 hosting 對齊
- **A9 治理細節**：artifacts 生命週期、存取控管、長期留存政策（`remote_put` / `local` 已可用）
- **A10**：可運營 E2E（新客戶到驗收）與固定證據鏈仍待收斂（已有 staging regression + drill 模板）
- **Enterprise 正式串接**：Clerk / Cloudflare WAF / Sentry ingest / PostHog 等（選型已有，落地見 `TASKS.md` Next）
- **營運**：用 1 個新客戶實跑 `tenants/NEW_TENANT_ONBOARDING_SOP.md`

> 已完成摘要（避免本頁過期）：C1 寫入鏈路、`http_json` hosting、`remote_put` artifacts、H3–H6 baseline、C3 release gate、營運 runbook — 見 `WORKLOG.md` 近期條目。

## 3) 硬性 Gate（避免錯誤擴散）
### 工程 Gate（lobster-factory）
- `bootstrap-validate.mjs` / `validate-manifests.mjs` / `validate-governance-configs.mjs`
- `dryrun-apply-manifest.mjs` + `validate-dryrun-apply-manifest.mjs --mode=strict|fast`

### 一鍵跑滿「工程 + 治理」閘道（monorepo 根）
- `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`
  - 先跑 `lobster-factory` 的 `bootstrap-validate.mjs`（含 doc integrity），再跑 `agency-os\scripts\system-health-check.ps1`

### 治理 Gate（agency-os）
- `scripts/doc-sync-automation.ps1 -AutoDetect`（closeout 報告）
- `scripts/system-health-check.ps1`（Critical Gate 必須 PASS）
- `scripts/system-guard.ps1 -Mode manual`（狀態檔與告警）

## 4) 每日 Runbook（最短路徑）
### 開工（AO-RESUME）
0. **單一真相**：開工流程與 30 秒自檢統一看 `docs/overview/REMOTE_WORKSTATION_STARTUP.md` — **新機 §1.5**、**例行 §2**、§2.3；**日內 Git（checkpoint / 收工 push）**只看 **§2.5**（本頁不重複第二套敘述）。  
   **雙機／每日正式開工**：在 **monorepo 根**跑 **`powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1`**（**預設**：fetch、behind 時 ff-only pull、`verify-build-gates`、workflows 依賴、`print-open-tasks`、**`machine-environment-audit -FetchOrigin -Strict`**）。**僅在 exit 0 後**再在 Cursor 輸入 **`AO-RESUME`**（代理依 `.cursor/rules/30-resume-keyword.mdc` 第 3 節**五段式**回覆，含待辦全列與實質風險盤點）。**Exit 非 0** 時依 **`REMOTE` 2.5.1** 整理髒樹／衝突後重跑，勿只先手動 pull 卻略過閘道／Strict。  
   **可選人類掃視**：`LAST_SYSTEM_STATUS.md`、`TASKS.md`、`reports/status/integrated-status-LATEST.md`（不取代 Exit 0）。  
1. 打開 `TASKS.md`，只做 Next/Backlog 最高優先（或由 **`print-open-tasks`** 已在終端列出）。  
2. 需要工程驗收就跑（Strict 或 Fast）：參考 `memory/CONVERSATION_MEMORY.md` 的 Runbook Commands。

### 收工（AO-CLOSE）
- **單一真相**：`docs/operations/end-of-day-checklist.md`（操作）+ `.cursor/rules/40-shutdown-closeout.mdc`（關鍵字；**單打 AO-CLOSE 即授權代理**寫 **`WORKLOG`** **`- AUTO_TASK_DONE:`**）。`ao-close.ps1` 內含 **recap**、閘道、**`apply-closeout-task-checkmarks`**、push；本頁不重複逐步指令。

### 公司機／他處電腦（對齊後）
**完整清單請固定看：`docs/overview/REMOTE_WORKSTATION_STARTUP.md`。** **新機／筆電第一次**用該檔 **§1.5**；**之後每次**用 **§2** 或單跑 **`scripts/ao-resume.ps1`（預設）** 覆蓋同等檢查。摘要（與 §2 一致；手動分步僅補強理解）：
1. monorepo 根：`git fetch`；僅 behind>0 時 `git pull --ff-only origin main`（或 **`ao-resume.ps1`** 代為處理）
2. `lobster-factory\packages\workflows`：`npm ci`（或由 **`ao-resume.ps1`** 偵測後代跑）
3. 可選：`mcp-local-wrappers` → `npm ci`
4. `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`（**`ao-resume.ps1` 預設**已含）
5. **`machine-environment-audit.ps1 -FetchOrigin -Strict`**（**`ao-resume.ps1` 預設**已含）
6. 綜合狀態以 **`agency-os/reports/status/integrated-status-LATEST.md`** 為準（勿與根目錄 `reports/status` 混淆）
- 手動核銷：仍可依 `docs/operations/end-of-day-checklist.md` 逐項打勾（與 §1b 對齊）。

### 離席會斷網（吃飯前）
1. 在 **monorepo 根** `<WORK_ROOT>` 開終端機
2. 若只暫停：直接離開；回來在 monorepo 根跑 **`scripts/ao-resume.ps1`** 或手動 `git pull --ff-only` 後再打 **`AO-RESUME`**
3. 若要安全收工再離開：`powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1 -SkipPush`

### 每週（建議固定一天，例如週一）
- **週期總檢**：`powershell -ExecutionPolicy Bypass -File .\scripts\weekly-system-review.ps1`（於 `agency-os`，或於 `<WORK_ROOT>` 跑 `.\scripts\weekly-system-review.ps1`）
  - 內容：`verify-build-gates.ps1`（龍蝦 bootstrap + 治理 health）→ 重新產生 `reports/status/integrated-status-LATEST.md` → 在 `WORKLOG.md` 附錄**機器產生**的一小節（英文，方便編碼穩定）。
  - 僅刷新綜合報告、不跑閘道：加 `-ReportOnly`；不重寫 WORKLOG：加 `-SkipWorklog`；**不在閘道失敗時寫告警檔**：加 `-NoAlert`。
  - 若 **verify-build-gates 失敗**（且未 `-ReportOnly`、未 `-NoAlert`），會在 agency-os 根目錄寫入 **`ALERT_REQUIRED.txt`**（與收工清單 §0 對齊）；修復後請手動刪除該檔。
  - 同一天若跑第二次，會再新增一個同日 `## 日期` 區塊；可自行合併或保留完整稽核軌跡。
  - **路徑（junction/symlink）**：若 `agency-os` 以連結掛在磁碟根目錄（顯示路徑的父目錄可能是 `D:\` 而非 monorepo 根），週檢腳本會解析**實體目錄**，並向上尋找**同時**具備 `lobster-factory\scripts\bootstrap-validate.mjs` 與 monorepo `scripts\verify-build-gates.ps1` 的目錄（避免誤把僅含腳本複本的 `agency-os` 當成 monorepo 根，也避免誤找 `D:\scripts\...`）。
- **排程（選用）**：`powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1 -WorkspaceRoot <WORK_ROOT>\agency-os`  
  - 使用 **`Register-ScheduledTask`**（比 raw `schtasks` 在本機較穩）。預設：**每週一 09:00**、互動使用者 **Interactive** 登入型。需改背景行為：加 **`-NoInteractive`**（**S4U** 主體）。可改：`-DayOfWeek SUN -StartTime 20:00`。移除：`-RemoveOnly`。註冊後會 **Get-ScheduledTask** 立即驗證。
- **防呆**：`system-health-check` 含 **§1b Script sanity**（檢查 `generate-integrated-status-report.ps1` 是否仍為「完整產報器」、非誤覆蓋成 wrapper）。

## 5) 防漏 / 防重工規則（你要我遵守的）
- **單一真實來源**：任務狀態只認 `TASKS.md`
- **事實 vs 狀態**：做了什麼寫 **`WORKLOG.md`**；**預設 Autopilot** 以 **`WORKLOG`** **`- AUTO_TASK_DONE:`** + 收工 **`apply-closeout-task-checkmarks`** 同步到 **`TASKS.md`**（見 **40／50**）；手動改 `TASKS` 仍允許
- **Gate 先行**：未通過 gate 不進下一步（避免把錯誤帶到後面）
- **收工必留證據**：closeout/health/guard report 檔名要寫進 `daily note`
- **龍蝦工廠主軸固定追蹤**：每次 AO-RESUME 必須同步回報 Milestone（M1~M5）/ 今日 DoD / 阻塞
- **變更一致性檢查**：每次修改前後都要檢查重複、矛盾、舊路徑與跨檔狀態不一致

## Related Documents (Auto-Synced)
- `../README.md`
- `automation/REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1`
- `docs/operations/end-of-day-checklist.md`
- `docs/overview/INTEGRATED_STATUS_REPORT.md`
- `docs/overview/LEARNING_PATH_AI_AND_SYSTEMS.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `memory/CONVERSATION_MEMORY.md`

_Last synced: 2026-04-09 05:52:22 UTC_


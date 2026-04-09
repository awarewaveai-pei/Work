# AGENTS.md - Agency Operating Rules

## 語言與輸出
- 預設使用繁體中文
- 先給結論，再給執行步驟
- 回覆需包含下一步
- 使用者與客戶視為新手（小白）時，操作說明必須改成「去哪裡、做什麼動作」格式
- 避免只講概念；每個操作至少要有：路徑/畫面位置 + 點擊/貼上動作 + 預期結果
- 指令能貼就貼完整可執行版本（避免使用者自行補路徑）
- 使用者授權 Autopilot 時，進度以「對話視窗即時回報」為主，不要求持續寫入專用進度檔

## 長任務回報防呆（固定執行）
- 採用「3 層防呆」避免使用者呆等：
  1. 開工先報：開始前先回覆「正在做什麼 + 預估下一次回報時間」
  2. 固定心跳：長任務進行中，按約定頻率回報進度
  3. 事件即時：遇到錯誤/阻塞/需要決策時，不等心跳立即回報
- 目前約定心跳頻率：每 **15 分鐘** 回報一次
- 使用者輸入 `進度?` 時，需立即回覆「目前在做什麼 / 有無阻塞 / 下一步」

## MCP／外掛分工（何時用哪個工具）
- **完整表**（與 repo 根 `mcp.json` 鍵對齊、含 LLM 分流與龍蝦 Routing 對照）：**`docs/operations/cursor-mcp-and-plugin-inventory.md`**。
- **龍蝦自動化強制規格**（誰可 orchestrate、核准、rollback）：`../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（**不**被 IDE MCP 清單取代）。

## Session 啟動順序（每次都做）
1. 讀 `README.md`（本目錄）；若工作區含整個 monorepo，一併讀 `../README.md`（根目錄導覽：龍蝦工廠 + AO + `verify-build-gates`）
2. 讀 `AGENTS.md`
3. 讀 `memory/CONVERSATION_MEMORY.md`（長期記憶）
4. 讀 `memory/daily/` 的今日與昨日筆記（若存在）
5. 讀 `TASKS.md` 與 `WORKLOG.md`
6. 讀龍蝦工廠主軸文件（若存在）：
   - `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`
   - `../lobster-factory/docs/LOBSTER_FACTORY_COMPLETION_PLAN_V2.md`
7. 先輸出啟動摘要（固定格式）：
   - **一般開場**（非 `AO-RESUME`）：`Yesterday Recap`（Completed/Pending/Risks）、`Today Plan`（Priority 1/2/3）、`Confirm`：「今天先做哪一項？」
   - **關鍵字 `AO-RESUME`**：**優先**依 **`.cursor/rules/30-resume-keyword.mdc` 第 3 節**（五段式：**已完成／目前進度／未完成待辦全列／選填其他提醒／下一步**）。**禁止**用極短回覆取代「**每一條** `- [ ]` 待辦逐條列出」與「**實質**阻塞／風險盤點」（見該規則）。

## 快速續接關鍵字
- 跨系統運作模型（AO 治理 + 龍蝦執行）：`docs/overview/ao-lobster-operating-model.md`（作為事件節奏與責任分工的總入口）。
- 使用者輸入 `AO-RESUME` 時：**可執行終端下**須先跑 **`scripts/ao-resume.ps1`（預設完整）至 exit 0**，再依 **`.cursor/rules/30-resume-keyword.mdc`** 讀取記憶、**`agency-os/.agency-state/open-tasks-snapshot.md`**（與 `print-open-tasks` 同步）與進度檔並回覆；**無終端**時改手動 Git 自檢並在回標註落差（見該規則第 1 節）。
- **雙機協作硬性說明**：`AO-RESUME` 對應腳本 **`scripts/ao-resume.ps1`** 會 **`git fetch`**，且**僅在落後 `origin/main`（behind>0）** 時 **`git pull --ff-only origin main`**；若**落後且工作樹仍髒**，預設**不**自動 stash 可能失敗（見 `REMOTE` **2.5.1**）。**預設**同一腳本在 preflight 後會跑 **`machine-environment-audit -FetchOrigin -Strict`**（與 **`align-workstation.ps1`** 相同）；**Exit 0**＝機器裁決可開工，無需目視 `LAST_SYSTEM_STATUS`／`integrated-status`。完整開工順序、30 秒自檢：`docs/overview/REMOTE_WORKSTATION_STARTUP.md` — **新機 §1.5**、**例行 §2**。
- 若已啟用 Autopilot Phase1，開機會自動執行 `scripts/ao-resume.ps1 -SkipVerify -SkipStrictEnvironmentAudit -AllowUnexpectedDirty`（輕量 preflight；**不**跑完整閘道與 Strict 環境稽核；**不**取代你在桌機手動跑的完整 **`ao-resume.ps1`**）。
- 回覆格式固定為 **`AO-RESUME` 五段式**（見 **`30-resume-keyword.mdc` 第 3 節**）：`已完成`、`目前進度`（含龍蝦 Milestone／今日 DoD／**實質**阻塞風險盤點＋Git 裁決一句）、**`未完成待辦（TASKS）` 逐條全列**、選填其他提醒、`下一步`。
- **`阻塞／風險` 禁止**只回「無」二字；須依該規則綜合盤點並說明依據，或分點列出具體風險。
- 使用者輸入 **`AO-CLOSE`**（關鍵字不變）或明確表達要關機/收工時，必須先執行 **closeout**，再輸出：`今日完成`、`今日未完成`、`連動檢查`、`明日優先`。
  - **只打 AO-CLOSE 即含義完整**：等同授權代理在跑 **`ao-close.ps1` 前**主動依**當輪對話 + `TASKS.md` 開放項**（＋必要時 **print-today-closeout-recap**）補齊 **`WORKLOG.md`** 當日 **`- AUTO_TASK_DONE: …`**（**不要**求使用者再加一句「照對話全寫進 AUTO_TASK_DONE」）；證據不足時**只問一題**。
  - **建議一鍵**（更新 **`WORKLOG` / `memory/**`**；**`TASKS` 打勾**多由腳本依 **`AUTO_TASK_DONE`** 套用）：**正本** monorepo 根 **`.\scripts\ao-close.ps1`**；**`.\agency-os\scripts\ao-close.ps1`** 僅 **thin wrapper** 轉發參數（**勿**複製業務邏輯以免分叉）  
    → 預設依序：`verify-build-gates`（龍蝦 + 治理 health）→ `system-guard`（內含 doc-sync + health + guard）→ `generate-integrated-status-report` → **PASS 後** `git commit`／`git push`（公司機 `pull` 即完整）。不推：`-SkipPush`；略過龍蝦閘（不建議）：`-SkipVerify`。
  - 預設收工門檻：`system-health-check` **100%**（未達 100% 先修復再收工；僅在使用者明確允許時可放寬）。
  - **單一真相**：AO-CLOSE 的操作步驟以 `docs/operations/end-of-day-checklist.md` 為準，關鍵字行為以 `.cursor/rules/40-shutdown-closeout.mdc` 為準。
  - **或分部手動**（與一鍵擇一）：`doc-sync-automation -AutoDetect` → `system-health-check` → `system-guard -Mode manual` → 再自行 `git push`（見 `docs/operations/end-of-day-checklist.md`）。

## Git：checkpoint 與收工（不要與他處各寫一套）
- **人類可讀單一流程表**：`docs/overview/REMOTE_WORKSTATION_STARTUP.md` **§2.5**（`AO-RESUME` → 日內里程碑 → `AO-CLOSE`）。
- **代理何時自動本機 commit、何時略過**：`.cursor/rules/50-operator-autopilot.mdc` §7（與 repo 根 `.cursor/rules` 同檔應同文）；實作腳本：`scripts/commit-checkpoint.ps1`（**由代理代跑**，你不必手動；無可提交內容時會安靜結束）。
- **收工 push**：仍只預設在 **`AO-CLOSE`**（`ao-close.ps1`）閘道 PASS 後；例外為你**明確一句話**要求立即推送。

## First Run
- 若有 `BOOTSTRAP.md`，先照檔案完成初始化再開始任務。

## 記憶制度
- 日記型記憶：`memory/daily/YYYY-MM-DD.md`（原始過程）
- 長期記憶：`memory/CONVERSATION_MEMORY.md`（濃縮版本）
- 任一對話很長（約 8000+ 中文字）時，必須濃縮回寫長期記憶
- 禁止寫入敏感資訊原文（API keys、密碼、個資）

## 文件同步規範
- 決策更新：`WORKLOG.md`
- 任務狀態更新：`TASKS.md`
- 里程碑與脈絡更新：`memory/CONVERSATION_MEMORY.md`
- 當日原始脈絡更新：`memory/daily/YYYY-MM-DD.md`
- 文件關聯同步：修改治理文件時，必查 `docs/CHANGE_IMPACT_MATRIX.md`
- **新增或大幅改版「重要 md」（治理／對外／會給客戶看）**：必讀並依序處理 **`docs/operations/new-doc-linkage-checklist.md`**；寫入 **`change-impact-map.json` + 矩陣** 可半自動：`scripts/register-new-governance-doc.ps1`（仍須指定要連動的 `-Targets`；**README 入口與內文語意**無法替你判斷，請補齊後跑 doc-sync / health）。

## 文件治理規則
- **檔名可讀性規範（強制）**：檔名必須讓人一眼看出用途，建議結構為 `TYPE_SCOPE_PURPOSE[_CLIENT/PROJECT].md`（例：`PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md`）。禁止 `new.md`、`temp.md`、`v2-final-final.md` 這類不具語意命名。
- **最高原則（除非必要）**：**一份內容只能有一個主人（Owner File）**。
- 非 Owner 檔案只放「一句摘要 + 連結」，不得複製完整內容（尤其流程圖、SOP 指令塊、規格正文）。
- 必要副本（法遵/審計/對外交付）必須在檔頭標註原因與 Owner 路徑，並指定同步責任人。
- **Cursor（可賣／可版控）IDE 規則索引**：`docs/operations/cursor-enterprise-rules-index.md`（匯流 `63`–`66` `.mdc`、MCP inventory、龍蝦 `MCP_TOOL_ROUTING_SPEC`；與 `AO-RESUME`／`AO-CLOSE` 衝突時以本 repo 之 **00／30／40** 規則為準）
- 治理/標準/模板文件優先放 `docs/` 分類目錄
- 新增文件時必須在 `README.md` 增加入口
- 任務結束前必做關聯檢查，避免只改單一文件造成不同步
- 文件更新後，執行：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
- 重大改版後，執行：`powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`
- 會話結束前，執行：`powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`
- `system-health-check` 的 Critical Gate 必須 PASS（連動缺漏不允許帶過）
- 所有腳本讀寫檔案必須顯式使用 UTF-8，避免亂碼與編碼漂移
- 每次變更前必須完整閱讀目標檔與直接關聯的 source-of-truth；變更後必做衝突檢查（重複、矛盾、路徑舊值、狀態不一致）

## 長期營運紀律（30 年級）
- **憲章級原則（短、可對照閘道）**：`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`
- **重大分岔留下 ADR 骨架**：`docs/architecture/decisions/README.md`（採輕量格式；細節仍回寫 `WORKLOG`）

## 執行安全
- 不做不可逆破壞操作
- 生產環境操作前先列風險與回滾方案
- 客戶新增需求先判定是否需走 `docs/operations/scope-change-policy.md`

## Related Documents (Auto-Synced)
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/10-memory-maintenance.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `.cursor/rules/63-cursor-core-identity-risk.mdc`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `docs/operations/system-guard-and-notification.md`
- `docs/operations/system-operation-sop.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `README.md`
- `scripts/register-new-governance-doc.ps1`

_Last synced: 2026-04-09 09:29:25 UTC_


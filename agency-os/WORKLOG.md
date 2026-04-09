# Worklog

> Historical snapshot note: this file records decisions/events by date. For current operating rules and commands, use the event SSOT docs: `docs/overview/REMOTE_WORKSTATION_STARTUP.md` (startup/AO-RESUME) and `docs/operations/end-of-day-checklist.md` + `.cursor/rules/40-shutdown-closeout.mdc` (shutdown/AO-CLOSE).

## 2026-04-09

### 雙機對齊反覆失敗：腳本根因與文件閉環
- **根因**：`scripts/check-three-way-sync.ps1` 的 `-AutoFix` 曾對長串「known noise」路徑執行 **`git restore`**，會**靜默丟棄**未提交變更（含 `ao-resume`、`check-three-way-sync`、autopilot 等），與「多機靠 `origin/main` + 本機 commit」目標衝突。
- **修正**：移除 AutoFix **`git restore`**；「不阻擋 AO-RESUME」的白名單縮為 **`agency-os/settings/local.permissions.json`** 單一路徑。`TASKS` 雙機項、**`30-resume-keyword`**（agency-os + monorepo 根鏡像）、**`REMOTE`** §1.5（收尾加跑 audit）、§2.5.1、§6.2、**`LONG_TERM_OPERATING_DISCIPLINE`**、**`MARIADB_MULTI_MACHINE_SYNC`** 與 **`machine-environment-audit -FetchOrigin -Strict`**（無 WARN 方得勾雙機）對齊。
- **可發現性**：新增 **`agency-os/scripts/machine-environment-audit.ps1`** wrapper（與 `ao-resume` 同模式），避免僅開 `agency-os` 資料夾時找不到稽核腳本。
- **追加**：`check-three-way-sync` 改以 **`git rev-list --left-right --count HEAD...origin/main`** 判斷——**僅在 behind>0 時**才 `pull --ff-only`（本機 checkpoint **超前**不再誤觸發 pull，避免 PowerShell 將 **git stderr** 當成終止錯誤）；同步將腳本內 **`$ErrorActionPreference` 設為 `Continue`** 以降低誤判。

### 零手動對照狀態檔（機器裁決）
- **`scripts/ao-resume.ps1`（預設）**：preflight（含 `verify-build-gates`）與依賴、`print-open-tasks` 後，再跑 **`machine-environment-audit -FetchOrigin -Strict`**；**Exit 0**＝不必目視 `LAST_SYSTEM_STATUS`／`integrated-status`。**`-SkipStrictEnvironmentAudit`** 僅給 Autopilot／極速路徑。
- **`scripts/align-workstation.ps1`**：與預設 **`ao-resume.ps1`** 同行為（別名）。
- **2026-04-09 晚**：將 **Strict 環境稽核**併入 **`ao-resume.ps1` 預設**（關鍵字 **`AO-RESUME`**＝同一支腳本完整檢查）；**`-SkipStrictEnvironmentAudit`** 僅 Autopilot／刻意輕量；**`-AutoVerifyAll`** 旗標已移除以避免「兩套流程」認知。

### AO-RESUME 敘述掃齊（與「先手動 pull」脫鉤）
- **目標**：所有活 SSOT 與 **GitHub `origin/main` 單一真相**一致——**桌機正式開工**＝monorepo 根 **`ao-resume.ps1` exit 0**（含 behind 時 ff-only pull、閘道、Strict）後再打 **`AO-RESUME`** 讀檔；**非**「必先手動 pull 再看狀態檔」。
- **已改**：**`REMOTE_WORKSTATION_STARTUP`**（§0、§1.5 做完後、§2 捷徑、§2.2、§6.1）、**`EXECUTION_DASHBOARD`** §4、**`RESUME_AFTER_REBOOT.md`**、**`CONVERSATION_MEMORY`** Runbook、**`AGENTS`**（關鍵字順序）、**`00-session-bootstrap`**（agency-os + 根鏡像）、**`30-resume-keyword`** 第 5 點、**`end-of-day-checklist`** 註、**`LONG_TERM_OPERATING_DISCIPLINE`** 表、**`INTEGRATED_STATUS_REPORT`**、**`30_YEAR_*` 憲章**、根 **`README`** 他機條；**`verify-build-gates`** 已 PASS（含規則鏡像）。

### AO-RESUME「最完整」閉環（快照 + 規則鏡像）
- **`print-open-tasks.ps1`**：預設寫入 **`agency-os/.agency-state/open-tasks-snapshot.md`**（已 **gitignore**），分段 Markdown + **Total open**，供代理 **Read** 與聊天「全列」交叉核對；**`-NoSnapshot`** 可略過。
- **`sync-enterprise-cursor-rules-to-monorepo-root.ps1`**：鏡像清單擴充 **`00-session-bootstrap` + `30-resume-keyword`**；根目錄 **`00`/`30`** 經 **`Apply-MonorepoRootCursorPathTransforms`**；**`-VerifyOnly`** 對 **`00`/`30`** 改為「轉換後內容」字串比對（非與正本同 hash）。
- **`system-health-check`**（agency-os 與 monorepo **`scripts/`** 兩份）：檢查名稱更新為 **00 + 30 + 50 + 63-66**。**`verify-build-gates`** 日誌字樣同步。
- **`REMOTE` §2.5.1**、**`AGENTS`**、**`CONVERSATION_MEMORY`**、**`.gitignore`** 已補交叉引用。

### AO-RESUME 回覆豐富度（使用者回饋）
- **根因**：**`30-resume-keyword`** 曾要求 **concise**；**`print-open-tasks`** 僅終端輸出，聊天裡易省略；**阻塞／風險**允許單字「無」→ 代理傾向過短。
- **修正**：**`30-resume-keyword` 第 3 節**改為**五段式**（含 **TASKS 每一條 `- [ ]` 全文複製＋區塊標題**、**實質**阻塞／風險盤點禁止只寫「無」）；**`AGENTS.md`** 區分一般開場 vs **`AO-RESUME`**；**`.cursor/rules/README`** 索引一句更新；**monorepo 根** **`00`／`30`** 已納入 **`sync-enterprise-cursor-rules-to-monorepo-root.ps1`**（含路徑轉換），無需再手動複製。

### AO-CLOSE（本輪）：`40-shutdown-closeout` 自動鏡像 + 敘事一致
- **`scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`**：鏡像清單再納入 **`40-shutdown-closeout.mdc`**；根目錄版經轉換（**checklist** 句：先 **`agency-os/docs/operations/end-of-day-checklist.md`**，再註明僅開 **`agency-os` 子資料夾時為 **`docs/operations/...`**）；轉換以 **ASCII／`[char]` 拼 regex**，避免主機編碼毀掉 CJK pattern；**「與」**允許 **U+8207／U+4E0E** 兩種碼位。
- **正本**：**`agency-os/.cursor/rules/40-shutdown-closeout.mdc`** line 29 之 **`（與`** 已與全文繁體「與」對齊（曾出現隱形同形字導致鏡像比對失敗）。
- **單一主人**：**`agency-os/scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 改為 **轉呼叫** monorepo **`scripts/`** 正本，避免兩份邏輯漂移。
- **對外敘述**：根 **`README.md`**（monorepo 根 `.cursor` 鏡像說明）、**`system-health-check`**／**`verify-build-gates`** 日誌與註解改為 **00 + 30 + 40 + 50 + 63–66**；**`verify-build-gates`** 已 **PASS（100% health）**；本機 checkpoint **`9c7b15d`**。

## 2026-04-07

### AO-CLOSE（本輪）收工前同步
- 今日已完成：AO-RESUME 全待辦列印、AO-CLOSE 今日 recap、自動 `TASKS` 勾選（`WORKLOG` `AUTO_TASK_DONE` 驅動）、`AO-CLOSE` 關鍵字即授權代理代寫。
- SSOT 對齊：`40/50/30`（agency-os 與 monorepo 根鏡像）+ `AGENTS` + `README` + `EXECUTION_DASHBOARD` + `end-of-day-checklist` 已統一。
- 本輪檢查：`doc-sync-automation -AutoDetect` 與 `system-health-check` 皆 PASS（100%）。

### AO-RESUME／AO-CLOSE 文件與規則掃齊（避免分叉）
- **根因**：monorepo 根 `.cursor/rules/40-shutdown-closeout.mdc` 曾落後 **`agency-os`** 正本，與 **AO-CLOSE** 實際腳本順序矛盾。
- **處理**：正本 **`agency-os/.cursor/rules/40`** 補齊 **`ao-close.ps1` 內部 8 步**；根目錄 **鏡像同文**；**`end-of-day-checklist`§1a**、**`EXECUTION_DASHBOARD`**、**`AGENTS`**（wrapper 敘述）、**`30-resume-keyword`**（**`print-open-tasks`**）、根 **`README` 收工**、**`LAST_AO_RESUME_BRIEF`**（改為非 SSOT 占位）、**`CONVERSATION_MEMORY`** 今日列同步；**health 100%**。

### AO-CLOSE 關鍵字內含授權（代理代寫 AUTO_TASK_DONE）
- 規則：**只打 `AO-CLOSE`／收工同義詞**即等同要求代理在跑 **`ao-close.ps1` 前**主動從**當輪對話 + TASKS 開放項**（＋必要時 recap）補 **`WORKLOG`** 之 **`- AUTO_TASK_DONE:`**；**禁止**要求使用者再加一句「照對話全寫進…」。正本：**`40-shutdown-closeout.mdc`**、**`50-operator-autopilot.mdc`**、**`AGENTS.md`**、**`TASKS.md`** 待辦原則。

### AO-CLOSE：今日完成「外接記憶」（給記性差／易斷線者）
- **`scripts/print-today-closeout-recap.ps1`**：`AO-CLOSE` 預設**開頭**印 **今日 Git commit**、`git status`、**`WORKLOG`** 當日 `## yyyy-mm-dd` 區塊、`memory/daily` 尾端——**不必靠腦記**今天做過什麼；亦可單獨先跑再補四份進度檔。**`-SkipTodayRecap`** 可略過。

### AO-RESUME／AO-CLOSE：待辦可見性 + 全自動打勾（WORKLOG 驅動）
- **`scripts/print-open-tasks.ps1`**：`AO-RESUME` 預設列出 **`TASKS.md`** 全部 `- [ ]`；**`-SkipOpenTasksList`** 可略過。
- **`scripts/apply-closeout-task-checkmarks.ps1`**：`AO-CLOSE` 在 **`git add` 前**讀 **當日 `WORKLOG`** 之 **`- AUTO_TASK_DONE: <子字串>`**（＋選用 **`pending-task-completions.txt`**），將命中之 `- [ ]`→`- [x]`；`WORKLOG` 標記改為 **`AUTO_TASK_DONE_APPLIED`**；已 `[x]` 者 idempotent。legacy 呼叫仍可用 **`apply-pending-task-checkmarks.ps1`**（僅 pending 檔）。

### TASKS.md：未完成／已完成分區 + 待辦原則
- 檔首 **待辦原則**：單一清單、轉向寫 **`WORKLOG`**；**預設不必手動勾 `TASKS`**（見 **`50-operator-autopilot`**、`TASKS` 檔首）。
- **Next／Backlog** 拆分為 **「未完成」**與 **「已完成歷程」**，使 **14** 條開放待辦（Next 11 + Backlog 3）一目可見，避免長列表埋沒 `- [ ]`。

### AO-CLOSE（收工推送）
- 本日累積 **3** 顆本機 checkpoint（`bf567ab`、`fe6aeb0`、`cf307d4`）經 **`ao-close.ps1`**：`verify-build-gates` → `system-guard` → integrated-status；**PASS** 後 **push `origin/main`**。

### 文件／wrapper 對齊複查（AO-RESUME／AO-CLOSE）
- 修正 **`REMOTE`** §2.2「不取代 git pull」舊句（與 **`check-three-way-sync`/2.5.1** 矛盾）；補 **wrapper 參數**（`agency-os/scripts/ao-resume.ps1`、`ao-close.ps1` 與根腳本同旗標）；**`memory`** Runbook／`ao-close` 敘述與 **`-AllowPushWhileBehind`**；**`end-of-day-checklist`** 補例外旗標；**`40-shutdown-closeout.mdc`**（agency-os + 根）pull/npm ci 敘述與 REMOTE 一致。

### AO-RESUME：小白友善的 workflows `npm ci`
- 新增 **`scripts/ensure-lobster-workflows-deps.ps1`**：`AO-RESUME` 在 Git 同步通過後會自動呼叫（可用 **`-SkipWorkflowsDeps`** 略過）；缺 `node_modules` 或 `package-lock.json` 較新時自動 **`npm ci`**；終端機為**英文簡訊**（編碼相容），**繁中說明**見 **REMOTE §2**「`npm ci` 是什麼」。
- **`REMOTE_WORKSTATION_STARTUP.md`** §2 補「小白：`npm ci` 是什麼」；**2.5.1** 補一句與本腳本對照。

### AO-RESUME／AO-CLOSE：雙機與 `origin/main` 強制一致（減少靜默 stash／未 pull 即 push）
- **`scripts/check-three-way-sync.ps1`**：`AutoFix` 預設在「落後且工作樹髒」時 **不**自動 stash（改為明確 FAIL）；`-AllowStashBeforePull` + `-AllowPendingStash` 給 Autopilot／明示鬆綁。pull 改為 **`git pull --ff-only origin main`**，fetch／pull 錯誤可見。移除「未預期髒檔→靜默 stash」；改 **FAIL** 或 `-AllowAutoStashUnexpected`（alert 自動修復）。**Stash drift guard**：若本次 run 新增 stash 且未 `-AllowPendingStash` → FAIL 並寫 `agency-os/.agency-state/ao-resume-stash-warning.txt`。
- **`scripts/ao-resume.ps1`**：`-AllowUnexpectedDirty` 時連帶傳遞 `-AllowStashBeforePull`、`-AllowPendingStash`；另可加手動 `-AllowStashBeforePull`／`-AllowPendingStash`。
- **`scripts/ao-close.ps1`**：push 前 **`git fetch`**；若目前分支落後 **`origin/<分支>`** → **中止**（`-AllowPushWhileBehind` 跳過）。
- **`agency-os/scripts/check-three-way-sync.ps1`**：改為 **wrapper** 呼叫 monorepo 根正本（修正舊版錯用 `agency-os` 為 WorkRoot 的風險）。
- **`autopilot-phase1.ps1`**（根與 agency-os）：alert 同步補 **`-AllowStashBeforePull -AllowAutoStashUnexpected -AllowPendingStash`**。
- **文件**：`docs/overview/REMOTE_WORKSTATION_STARTUP.md` 新增 **2.5.1**（腳本行為與單一真相）。

## 2026-04-02

### platform-templates：`wc-core.json` 與龍蝦權威對齊；移除無 SSOT 對應之舊範例
- **`woocommerce/manifests/wc-core.json`** 與 **`lobster-factory/packages/manifests/wc-core.json`** 一致；刪除 **`wc-ai`／`wc-crm`／`wc-facet`／`wc-loyalty`／`wc-membership`**（龍蝦 packages 無對應檔、且舊 schema 易誤導）；**`SYNC_EXAMPLES_FROM_LOBSTER.md`** 改為 **迴圈複製所有龍蝦 `wc-*.json`**；**manifests/README** 說明 playbook 暱稱 vs 目錄範例。

### platform-templates：SSOT 一頁連結 + 手動同步 playbook + 理想自查
- **功能重申**：輔材（範例 manifest、`client-base` 一頁紙）；權威在龍蝦與 `tenants/`。
- **新增**：`platform-templates/SSOT_LINKS.md`、`SYNC_EXAMPLES_FROM_LOBSTER.md`；根 **README** 補「現在功能三句／理想自查表」、修正 manifest 路徑為 **monorepo 根** 相對；**client-base** 對齊 **project-kit**；**woocommerce/manifests/README** 連同步 playbook；**CHANGE_IMPACT_MATRIX** 列 `platform-templates/README.md` Owner；**repo-template-locations** Related 補連結。

### LONG_TERM：新增 §9「AI 與自動化」、執行節奏改 §10
- **`LONG_TERM_OPERATING_DISCIPLINE.md`**：補 **Coding／PM／MCP 輔助邊界**（非權威、Routing Spec、閘道定稿）；原 **§9 執行節奏** 遞延為 **§10**；Related 補 MCP 對照。

### LONG_TERM：新增 30 年級 AI/coding/專案管理短憲章（跨國企業對外版）
- 新增對外文件：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`（管理層決定 + 工程層執行口徑；AI 協作邊界與閘道驗證一致）。
- 新增客戶精簡鏡像：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`（非權威快速版；權威仍在主憲章）。
- 補齊文件索引：`README.md`、`docs/README.md`；並在 `docs/CHANGE_IMPACT_MATRIX.md` 登記連動必查檔。

### 工具退役：完全移除 Linear（含歷史文字）
- 依使用者決策：永遠不再使用 Linear，避免任何 401/衝突與殘留入口。
- 已移除：腳本（push/sync/debug）、治理文件、報表產物（`reports/linear/*`）、`mcp.json` Linear server、以及歷史 daily/憲章/raw spec 的所有 Linear 字樣。
- 驗證：全 repo 搜索 `Linear/LINEAR_/linear.app` = **零命中**；`doc-sync` + `system-health-check` 100% + `verify-build-gates` PASS；並已推送 `origin/main`。

### System Guard：FAIL 後保守 auto-repair（doc-sync + health check 一次）
- 修改 `scripts/system-guard.ps1`：當第一次 health/連動檢查 FAIL 時，若未傳 `-DisableAutoRepair`，會先保守重跑一次 `doc-sync-automation -AutoDetect` + `system-health-check`；仍 FAIL 才產生 `ALERT_REQUIRED.txt`。

### platform-templates：對齊 Agency OS／龍蝦定位（三十年級邊界）
- **決策**：維持 **輔材層**（教學／示例／一頁紙），權威仍在 **`lobster-factory/packages/manifests/`**、**`lobster-factory/templates/woocommerce/scripts/`**、`tenants/*`；避免與 ADR 001／003 分叉。
- **執行**：改寫 **`platform-templates/README.md`**（系統平面對照表）；新增 **`woocommerce/README.md`**、`manifests/README.md`、`scripts/README.md`；改寫 **`client-base/README.md`**、`docs/OPENING.md`（檢查清單連回 SOP／ADR／閘道）；**`repo-template-locations.md`** 表格列補「非 SSOT」語意。

### GitHub：正式移除 `company-a` + 退役 `agency-os/templates/`
- **確認**：`company-a` 已由 **`company-p1-pilot`／活躍試點**取代（TASKS／memory 已敘述）；`agency-os/templates/` 已收斂為 **`agency-os/platform-templates/`**（與 manifest SSOT 分工一致）。
- **已執行**：`git` 以 **rename** 將 `templates` → `platform-templates`（保留歷史）；**刪除** `tenants/company-a/**`；更新 **`CHANGE_IMPACT_MATRIX`**、**`agency-os-complete-system-introduction.md`**；**`verify-build-gates` PASS** 後 **commit `99b3209` 並 `push origin main`**（連同先前未推之 commits 一併上遠端）。

### Release checklist：多租戶／Supabase 閘道
- **`tenants/templates/core/RELEASE_GATES_CHECKLIST.md`**：Pre-Deployment 新增 **Data / multi-tenant Gate**（條件式必勾：schema／RLS／Clerk 對照／越戶風險時 staging migration + 雙租戶抽測 + JWT org claim）；連結 ADR 006 與 **0010** migration。

### 長期紀律 §10（執行節奏表；舊稿曾標 §9）
- **執行節奏表**現為 **`LONG_TERM_OPERATING_DISCIPLINE.md` §10**；內容仍為 **verify-build-gates／ADR／釋出／開收工／雙機／audit** 與 **12 個月 ADR 006 錨點**。

### ADR 006 + verify-build-gates 內建 ADR 索引
- **006（DB 落地）**：新增 migration **`lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`** — `clerk_organization_mappings`、`current_clerk_org_id_from_jwt()`、`user_has_org_membership()`、擴充 **`user_has_org_access`**（JWT org + 對照表 或 membership）；`profiles`／memberships／roles／`user_role_assignments` 與 `workflow_runs`、`package_install_runs`、agents／incidents 軸、V3／H4／H5 業務表 **SELECT RLS**。JWT 須帶 `org_id`／`clerk_org_id`（或 metadata 後備）— 見 ADR 006 更新段。
- **006（原則）**：**Supabase RLS／租戶鍵** + **Clerk 組織對照表**；service role 須自帶 tenant scope。
- **`verify-build-gates.ps1`**（根與 `agency-os/scripts` 鏡像）：在 `system-health-check` 前執行 **`verify-adr-index.ps1`**，避免 ADR 漏登。

### ADR 004／005（編排邊界 + 資料 SoR）
- **004**：耐久編排 **Trigger.dev**；**n8n** 僅 webhook／通知／低風險同步；規範衝突以 **`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`** 為準。
- **005**：**Supabase** 為工廠／核准／workflow 等 **SoR**；**WordPress DB** 為 **執行期**；禁止以 WP meta 作編排唯一真相（豁免須 ADR）。
- **可執行**：新增 **`agency-os/scripts/verify-adr-index.ps1`**（ADR 檔必須出現在 `decisions/README.md`）；`decisions/README.md` 已附執行方式。

### ADR 002／003（身分邊界 + manifest 同步策略）
- **002**：應用層預設 **Clerk**；**SoR** 仍 **Supabase／API／RLS**；**不**預設取代客戶 **WP 終端帳號**；換 IdP 須新 ADR。
- **003**：**否決** `platform-templates` ↔ `packages/manifests` **自動雙向同步**；僅允許權威在 packages、輔材手動或未來 **單向 CI** + 新 ADR。

### ADR 001：WordPress manifest + install shell SSOT
- 新增 **`docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`**：權威 manifest 在 **`lobster-factory/packages/manifests/`**；install／rollback shell 在 **`lobster-factory/templates/woocommerce/scripts/`**；**`agency-os/platform-templates/woocommerce/manifests/`** 僅輔材。已更新 **`decisions/README.md`** 索引列、`CHANGE_IMPACT_MATRIX` 連動列。

### 長期營運紀律 + ADR 骨架（30 年級）
- 新增 **`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`**（boring tech、Single Owner、平面分界、節奏／證據、相容退役、祕密、觀測、bus factor）。
- 新增 **`docs/architecture/decisions/README.md`**（輕量 ADR 格式；重大分岔必留痕，其餘 `WORKLOG`）。
- 已接入 **`AGENTS.md`**、**`README.md`**、**`docs/README.md`**、**`CHANGE_IMPACT_MATRIX.md`**、**`repo-template-locations.md`**；**`memory/CONVERSATION_MEMORY.md`** 一行摘要。

### 範本索引（不必遍歷改名 docs/templates）
- 新增 **`docs/overview/repo-template-locations.md`**：列舉 `tenants/templates`、`platform-templates`、`docs/templates`、`docs/product/templates`、`lobster-factory/templates` 等分工；**建議**保留合約範本目錄既有命名，僅用索引消除認知負擔。
### 範本目錄收斂（避免兩個都叫 templates）
- 將 `agency-os/templates/` **改名**為 **`agency-os/platform-templates/`**（Woo 範例／`client-base`）；與 **`tenants/templates/`**（租戶複製）分工；新增 `platform-templates/README.md`、`README.md`／`tenants/README.md` 導覽；`ecommerce-project-playbook.md` 路徑已更新並註明 manifest SSOT 在 `lobster-factory/packages/manifests/`。

### 試點租戶 core 實填（Soulful + P1 Pilot）
- `company-soulful-expression/core/`：新增 `DEPARTMENT_COVERAGE_MATRIX.md`、`CROSS_BORDER_GOVERNANCE.md`；補齊先前缺少之 `RELEASE_GATES_CHECKLIST.md`、`BACKUP_RESTORE_PROOF.md`；`PROFILE`／`FINANCIAL_LEDGER` 對齊幣別／語系附註。
- `company-p1-pilot/core/`：新建全套 `ENVIRONMENT_REGISTRY`、`RELEASE_GATES`、`BACKUP`、`DEPARTMENT_COVERAGE_MATRIX`、`CROSS_BORDER_GOVERNANCE`（標註 drill／N/A）；`PROFILE`／`FINANCIAL_LEDGER` 小幅對齊模板。

### Tenants templates v1（長期可擴、單一真相）
- **決策**：不把「17–20 部門」拆成多部重複長文；以 **`tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`** 做部門簇 → 租戶檔案路由；跨境／外包／外部審閱索引集中在 **`core/CROSS_BORDER_GOVERNANCE.md`**（不提供法律／稅務結論，只收事實與狀態）。
- **落地**：強化 `tenant-template/PROFILE.md`（語系、幣別）、`FINANCIAL_LEDGER.md`（多幣別列）；`NEW_TENANT_ONBOARDING_SOP.md`、`tenants/README.md`、`TASKS.md` 已接線；試點實填回饋留待 v2。

## 2026-04-01

### AO-CLOSE 穩定性優化（timeout + deterministic closeout）
- `scripts/generate-integrated-status-report.ps1` 新增 optional script timeout 包裝（避免外部因素卡住 closeout）。
- `agency-os/scripts/system-health-check.ps1` 的 generator sanity check 允許「full generator」或「intentional wrapper」，避免 Single Owner 設計被誤判為故障。

### Next-Gen 升級藍圖 v1 已落地（使用者同意直接衝高階版）
- 新增 `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`，定義 3 里程碑（M1 環境標準化、M2 gate/回滾自動化、M3 控制台化）與 2-4 週節奏。
- 文件包含：建議改動檔案、腳本清單、DoD 驗收標準、風險對策與本週啟動順序。
- `README.md`、`TASKS.md` 已新增入口/待辦，供 AO-RESUME 與每日執行直接引用。

### Next-Gen M1 試點名單已鎖定
- **既有站接手**：Soulful Expression Art Therapy（台灣辦公，既有網站運行中，規劃跨國）。
- **新站建置**：Scenery Travel Mongolia（蒙古在地團隊，國際客群，目前僅 IG）。
- 已把兩案寫入 `NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`（第 6 節）與 `TASKS.md`（M1 待辦），下次 AO-RESUME 可直接沿試點推進而不重判定。

### 使用者確認：17/20 部門跨國企業目標不可丟
- 已在 `NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` 新增「1.1 對齊說明」：M1/M2/M3 與 17/20 部門目標為同一路徑，不是降級目標。
- `TASKS.md` 已新增對齊待辦：M3 控制台輸出需映射到 17/20 部門責任矩陣與模板欄位。

### 使用者要求改為「上線版」與「檔名可讀性」
- 已建立兩份 production-ready runbook（檔名可直接看懂用途）：
  - `docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md`
  - `docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md`
- `AGENTS.md` 已新增檔名規範：使用語意化命名（`TYPE_SCOPE_PURPOSE[_CLIENT/PROJECT].md`），禁止無語意檔名。
- `TASKS.md` 已新增兩個「上線版 Day 1」可執行待辦，後續 AO-RESUME 可直接接續實作。

### Phase 1 直接落地：模板硬化（從陽春升級到可上線控制）
- 新增 Core 模板（tenant 必填控制文件）：
  - `tenants/templates/core/ENVIRONMENT_REGISTRY.md`
  - `tenants/templates/core/RELEASE_GATES_CHECKLIST.md`
  - `tenants/templates/core/BACKUP_RESTORE_PROOF.md`
- 升級既有模板：
  - `tenants/templates/tenant-template/ACCESS_REGISTER.md`（MFA/Secret Location/Rotation Due/Approver/Audit Evidence）
  - `tenants/templates/tenant-template/SITES_INDEX.md`（staging/prod URL、備份與還原測試欄位）
  - `tenants/templates/tenant-template/OPERATIONS_SCHEDULE.json`（owner/retry/timeout/evidence_output）
- 升級 onboarding SOP：
  - `tenants/NEW_TENANT_ONBOARDING_SOP.md` 改為強制複製與填寫 `core/*` 控制文件，並納入完成檢查清單。

### Phase 1.5 直接落地：產業 Overlay（travel + therapy）
- 新增旅遊產業模板：
  - `tenants/templates/industry/travel/REGULATORY_AND_OPERATIONAL_REQUIREMENTS.md`
  - `tenants/templates/industry/travel/MANDATORY_QA_SCENARIOS.md`
- 新增療癒/治療服務模板：
  - `tenants/templates/industry/therapy/REGULATORY_AND_TRUST_REQUIREMENTS.md`
  - `tenants/templates/industry/therapy/MANDATORY_QA_SCENARIOS.md`
- 已接入：
  - `tenants/README.md`（結構與新增流程）
  - `tenants/NEW_TENANT_ONBOARDING_SOP.md`（強制套用至少一組 overlay）
  - `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`（M1 交付物/DoD 補齊）

### Pilot A 實填啟動：Soulful Expression（既有站接手）
- 已建立實際 tenant 工作目錄：`tenants/company-soulful-expression/`
- 已落地首批實填檔案（非空白模板）：
  - `PROFILE.md`
  - `SITES_INDEX.md`
  - `core/ENVIRONMENT_REGISTRY.md`
  - `industry/therapy/MANDATORY_QA_SCENARIOS.md`
  - `projects/2026-011-existing-site-handover-soulful/00_PROJECT_BRIEF.md`
- 未知資訊統一標記 `待補`，等待 Day 1 權限盤點（Hostinger/DNS/WP admin/backup）後回填。

### WordPress 雲端優先交付 SOP（既有站 + 新站）落地
- 新增 `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`：統一兩種業務模式（既有站接手 / 新站從零），以「**雲端 Staging 優先**、Production 受控變更、跨機同一真相」為核心。
- 文檔包含：分流決策樹、Staging -> Production gate、回滾準則、跨機同步原則（流程同步優先、非 DB 檔案直拷）、AO-RESUME/AO-CLOSE 操作準則與 DoD。
- `README.md`、`docs/operations/tools-and-integrations.md`、`docs/overview/REMOTE_WORKSTATION_STARTUP.md` 已新增入口連結，避免之後每案重複口頭說明。

### A10-2 本機 staging 管線 4/4（DRY）+ 可重現性修復
- **Preflight**：修正 monorepo 根執行時 `agency-os` 解析（`scripts/preflight-onboarding-a10-2-readiness.ps1`；`agency-os/scripts` 鏡像一併防呆）。
- **Regression**：`npm run regression:staging-pipeline -- --wpRootPath=C:\Users\USER\Work\.scratch\wp-dummy` **4/4 PASS**。
- **Windows**：`execute-apply-manifest-staging.mjs` 自動尋找 `C:\Program Files\Git\bin\bash.exe`；`install-from-manifest.sh` 在 **DRY_RUN** 時不強制 `wp-cli`（仍印出預定 wp 指令）。
- **Drill 報告**：`emit-staging-drill-report.mjs` 新增 `--wpRootPath=`，產出 `agency-os/reports/e2e/staging-pipeline-drill-20260401-113446.md`。
- **證據**：`reports/e2e/onboarding-a10-2/20260331-215507-company-p1-pilot-2026-010-p1-pilot/02-a10-2-evidence.md`、`03-run-id-map.md` 已更新。**Production / Trigger 真實 ID** 仍待下一輪。

### AO-RESUME：雙機 §1.5 + audit 強制口頭提醒
- 使用者要求在未完成另一台 §1.5 與 `machine-environment-audit.ps1 -FetchOrigin` PASS 前，**每次** `AO-RESUME` 的「下一步」須提醒；已寫入 `memory/CONVERSATION_MEMORY.md` 與 **`.cursor/rules/30-resume-keyword.mdc` 第 7 點**（根目錄規則檔同步）。

### 環境「完美」可驗證定義 + 稽核腳本
- 新增 `scripts/machine-environment-audit.ps1`：檢查 monorepo 結構、Git main／乾淨度／與 origin 對齊（可 `-FetchOrigin`）、Node／npm、`lobster-factory\packages\workflows` 的 `node_modules`（與實際 lockfile 位置一致）、可選 `mcp-local-wrappers`、`gh` 登入占位、DPAPI vault／Cursor `mcp.json` 是否存在（不讀密鑰）。可選 `-RunVerifyGates`、`-Strict`。
- `REMOTE_WORKSTATION_STARTUP.md` 新增 **§6.2**（完美環境表 + 稽核命令）；修正 §1.5／§2／§6.1：依賴還原改為 **`packages\workflows` `npm ci`**（根目錄無 lockfile 之實情）。
- 對齊 **EXECUTION_DASHBOARD**、**INTEGRATED_STATUS_REPORT**、**AGENTS**、**TASKS**、**RESUME_AFTER_REBOOT**、**40-shutdown-closeout**（根與 agency-os）之敘述，避免「錯目錄 npm ci」。
- 本機已執行 `packages\workflows` 之 `npm ci` 以補齊 Trigger 依賴目錄。

## 2026-03-31

### AO + Lobster event flow diagram landed
- 已將 AO + Lobster 事件流 Mermaid 圖落地到 `docs/overview/ao-lobster-operating-model.md`，作為「開工 -> 執行 -> 收工 -> 他機續接」單一視覺化流程。
- `TASKS.md` 對應待辦已標記完成，避免口頭承諾與任務板狀態不一致。

### Single Owner policy hardened
- 將「除非必要，一份內容只能有一個主人（Owner File）」提升為最高執行原則：寫入 `.cursor/rules/63-cursor-core-identity-risk.mdc`（含 `agency-os/.cursor/rules` 鏡像）與 `AGENTS.md`。
- `README.md` 取消複製 AO+Lobster 圖內容，改為只保留 SSOT 入口連結。
- `scripts/doc-sync-automation.ps1` 新增 Single Owner 檢查機制；規則由 `docs/operations/single-owner-registry.json` 管理，檢出重複即在 closeout 報告標示並阻擋流程。
- 第 2 階段擴充 registry：新增 AO-RESUME 主流程、AO-RESUME 30 秒自檢、AO-CLOSE 硬性 Gate 三條 owner 規則，避免開工/收工關鍵段落回流到索引頁。

### Lobster A9 governance baseline completed
- 新增 A9 IAM 邊界文件：`lobster-factory/docs/operations/ARTIFACTS_IAM_BOUNDARY.md`。
- 新增可機器驗證政策：`lobster-factory/policies/artifacts/artifacts-governance-baseline.json`。
- 新增治理腳本：`lobster-factory/scripts/validate-artifacts-governance.mjs`（gate）與 `lobster-factory/scripts/audit-artifacts-governance.mjs`（報告）。
- `bootstrap-validate.mjs` 已納入 A9 治理驗證；`package.json` 新增 `validate:artifacts-governance` / `audit:artifacts-governance`。

### A9 provider strategy locked (AWS-ready, no lock-in)
- A9 政策已升級為「portable single provider」：目前主路徑 Cloudflare R2、相容 AWS S3，契約統一為 `presigned_put_http`。
- 已更新 policy / docs / validator / audit，確保未來切換供應商只需改 broker + IaC，不改 workflow payload contract。

### R2 -> S3 migration runbook landed
- 新增 `lobster-factory/docs/operations/R2_TO_S3_MIGRATION_RUNBOOK.md`，涵蓋 preflight、切換步驟、驗證、回滾與 post-cutover hardening。
- `validate-artifacts-governance` 與 `bootstrap-validate` 已納入 runbook 存在/關鍵章節檢查，避免策略有寫但無可執行遷移路徑。

### P1/P2 acceleration runway completed
- 新增 `docs/operations/ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md`，統一 tenant/project/workflow/package/logs_ref/commit 的證據對照欄位。
- 新增 `scripts/preflight-onboarding-a10-2-readiness.ps1`，會先驗證 onboarding/A10-2 必要文件與 Lobster gate（bootstrap + artifacts governance）。
- 新增 `scripts/init-onboarding-a10-2-evidence-skeleton.ps1`，可一鍵建立 onboarding/A10-2 證據骨架。
- 舊名稱（`p1-p2-*` 與 `P1_P2_*`）保留為相容入口，避免既有指令中斷。

### P1 minimum real drill completed
- 依使用者要求先清除舊客戶與不適用證據：`tenants/company-a/**` 與舊版 onboarding evidence 目錄已刪除。
- 新建實跑租戶：`tenants/company-p1-pilot/`（含 site/project/core guides/schedule/queue）。
- 修復一處舊路徑連結：`docs/overview/PROGRAM_TIMELINE.md` 客戶 Discovery 連結已改到新實跑專案。
- P1 證據已落地：`reports/e2e/onboarding-a10-2/20260331-215507-company-p1-pilot-2026-010-p1-pilot/01-onboarding-evidence.md`。

### 30-minute closeout-ready update
- 已補齊本輪 onboarding evidence checklist 與 run-id map（status=completed，A10-2 欄位標註待下一輪填入）。
- 已再次執行 `scripts/preflight-onboarding-a10-2-readiness.ps1`，結果 PASS，可直接銜接下一步 A10-2。
- 已預填 `02-a10-2-evidence.md` 的執行步驟與必填證據欄位，下一輪可直接按表執行並回填 run IDs。

## 2026-02-27

### 今日建立
- 建立 Agency OS v1 文件骨架
- 建立跨會話記憶規則與記憶檔
- 建立接案模板套裝（從 Discovery 到維運成長）
- 建立 tenants v2（template + company-a 示範）
- 建立 site-template（profile/requirements/ops-growth）
- 建立 company-b/company-c 初始檔案（含各 2 個 site）
- 依最新營運範圍收斂為 `company-a` 單一 tenant，其他示範 tenant 已移除
- 新增完整系統介紹文件：`docs/overview/agency-os-complete-system-introduction.md`（含總司令/客戶使用方式）
- 新增續接關鍵字規則：`.cursor/rules/30-resume-keyword.mdc`（輸入 `AO-RESUME` 自動回顧進度與下一步）
- 完成資料夾搬移：`C:\Users\soulf\agency-os` -> `D:\Work\Projects\agency-os`
- 建立相容路徑：`D:\agency-os` (junction)
- 清理 npm cache，釋放本機快取空間
- 開立第一個正式案：`company-a/projects/2026-001-website-system`
- 完成 `2026-001` Discovery 初版（`10_DISCOVERY.md`）與里程碑日期初版
- 新增 `2026-001` Discovery 訪談問卷與會議紀錄模板
- 新增全系統操作手冊 `SYSTEM_OPERATION_SOP.md`
- 新增新客戶導入 SOP `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- 新增服務方案標準 `SERVICE_PACKAGES_STANDARD.md`
- 新增 CR 核價規則 `CR_PRICING_RULES.md`
- 新增標準合約模板 `MSA_TEMPLATE.md`、`SOW_TEMPLATE.md`、`CR_TEMPLATE.md`
- 新增 `WORDPRESS_CUSTOM_DEV_GUIDELINES.md`
- 新增 `N8N_WORKFLOW_ARCHITECTURE.md`
- 新增 `KPI_MARGIN_DASHBOARD_SPEC.md`
- 完成文件重構：治理文件移至 `docs/` 分類目錄
- 新增 `docs/CHANGE_IMPACT_MATRIX.md`，建立文件連動同步規則
- 新增 `DOC_SYNC_AUTOMATION.ps1`（AutoDetect/Watch 模式 + closeout 報告）
- 新增 `.cursor/rules/20-doc-sync-closeout.mdc`，強制治理改動後跑同步
- 修復 `system-operation-sop.md` 亂碼，並修正自動同步腳本 UTF-8 讀寫
- 建立每公司排程系統（schedule + queue + runner + register + enqueue）
- 建立 `company-a` 自動排程設定與 adhoc 佇列檔
- 建立國際化治理文件（global delivery/compliance/multi-currency policy）
- 建立交付品質放行制度（`docs/quality/delivery-qa-gate.md`）
- 建立 `SYSTEM_HEALTH_CHECK.ps1`，可一鍵檢查完整性與關聯性
- 補齊 `company-a` 缺少的 `SERVICE_CATALOG.md`、`FINANCIAL_LEDGER.md`、`ACCESS_REGISTER.md`
- 完成健康檢查：100%（73/73）
- 建立 `SYSTEM_GUARD.ps1`（會話結束/關機前/每日守護、告警輸出）
- 建立 `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`（Daily + OnLogoff + OnStartup）
- System Guard 新增桌面彈窗提醒（PASS/FAIL）與 ALERT/LAST_STATUS 提示
- 修復 docs 殘留亂碼文件並加入防亂碼檢測機制（health + sync）
- 建立產品化文件：`docs/product/resell-package-blueprint.md`、`docs/product/buyer-handover-checklist.md`
- 建立打包腳本：`BUILD_PRODUCT_BUNDLE.ps1`（輸出可販售 bundle）
- 完成最新健康檢查：100%（83/83）
- 新增英文化模板：Proposal/SOW/Monthly Report
- 新增客戶風險評分模型與外包評分卡
- 新增 leads/scraping 合規檢查清單並接入國際合規基線
- 新增 release 管理文件：release notes、upgrade path、migration checklist
- 新增總控中心架構文件與 WordPress-first 多平台架構文件
- 新增 end-to-end linkage checklist，強化整套系統連動驗證
- 完成基礎安全健檢（Defender、啟動項、排程、遠端工具、連線）
- 確認 RDP 關閉、Lenovo Now 已移除
- 啟動 Defender 掃描流程（即時防護維持啟用）
- 完成根目錄治理重構：政策文件移至 `docs/operations/`、核心腳本移至 `scripts/`，並同步更新排程與連動映射

### 目前共識
- 核心技術：WordPress + Supabase + GitHub + n8n + Replicate + DataForSEO
- 業務模式：多公司網站建置、維運管理、行銷整合、客製系統開發
- 必要治理：財務、外包、人力、事件應變、變更管理、客戶邊界

### 待確認
- 第一批導入的客戶數量與服務分級
- 目前是否已有固定外包團隊
- 報價策略偏「套裝價」或「工時價」
- 明文憑證輪替完成日
- `2026-001` 客戶決策者/窗口與簽核流程

## Related Documents (Auto-Synced)
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/airtable-to-supabase-migration-playbook.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/releases/release-notes.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-04-09 09:29:25 UTC_

## 2026-03-20

### 今日調整
- 修復 `AgencyOS-*` Windows 排程路徑，統一指向 `D:\Work\agency-os`
- 修復排程註冊腳本路徑引號問題（`REGISTER_SYSTEM_GUARD_TASKS.ps1`、`REGISTER_TENANT_TASKS.ps1`）
- 新增健康檢查中的排程路徑存在性檢查，避免「文件健康但排程壞掉」盲點
- 停用架構期不需要的 adhoc 輪詢（`adhoc_enabled: false` + 移除 adhoc task）
- 調整 workspace 載入與監看排除，降低 Cursor OOM 風險
- 修正 `RESUME_AFTER_REBOOT.md` 路徑為 `D:\Work\agency-os`，續接指令收斂為 `AO-RESUME`
- 新增 reports 歸檔腳本 `scripts/archive-old-reports.ps1`（預設 preview，`-Apply` 才搬移）

### 收工檢查
- `doc-sync-automation -AutoDetect`：PASS（`reports/closeout/closeout-20260320-205301.md`）
- `system-health-check`：PASS，100%（`reports/health/health-20260320-205311.md`）
- `system-guard -Mode manual`：PASS（`reports/guard/guard-20260320-205318.md`）



## 2026-03-25

### 今日建立
- 修復會話層關鍵 Critical Gate FAIL（在 `agency-os/.cursor` 建 junction 指向 `D:\Work\.cursor`）
- 落地 `lobster-factory` Phase 1：Supabase multi-tenant migrations、`wc-core` manifest、durable workflow（`create-wp-site` / `apply-manifest`）安全骨架
- 補齊 manifest/governance 結構驗證腳本並建立本機 bootstrap 健檢（`scripts/bootstrap-validate.mjs`）
- 恢復 `agency-os/memory/CONVERSATION_MEMORY.md`，並加入 Runbook commands 方便 `AO-RESUME/AO-CLOSE` 快速操作
- 設定收工三步 closeout 流程並確認 Critical Gate PASS

### 收工檢查
- `doc-sync-automation -AutoDetect`：PASS（生成 `reports/closeout/closeout-20260325-223356.md`）
- `system-health-check`：PASS，100%（Critical Gate PASS；`reports/health/health-20260325-223403.md`）
- `system-guard -Mode manual`：PASS（`reports/guard/guard-20260325-223414.md`）

### 二次收工確認（跨電腦 pull 相容後）
- `doc-sync-automation -AutoDetect`：PASS（`reports/closeout/closeout-20260325-231338.md`）
- `system-health-check`：PASS，100%（Critical Gate PASS；`reports/health/health-20260325-231344.md`）
- `system-guard -Mode manual`：PASS（`reports/guard/guard-20260325-231349.md`）



## 2026-03-26

### Periodic system review + 週期總檢基建（合併同日紀錄）
- 01:30–01:35：首次週檢後修復 `generate-integrated-status-report.ps1`（完整實作 + WORKLOG `-Tail 60`）；`integrated-status-LATEST` 已刷新
- 01:36：週檢 `verify-build-gates` PASS；綜合報告已刷新
- **排程**：`REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1` 使用 `Register-ScheduledTask` → 工作 **AgencyOS-WeeklySystemReview**（預設週一 09:00；`-NoInteractive` = S4U）
- **Health §1b**：產報／週檢腳本 script sanity（防 wrapper 覆蓋）；`health-20260326-014630.md` Critical Gate PASS
- 儀表板／學習路徑已掛每週儀式與排程說明

### AO-CLOSE（今日補強）
- 已將 AO-CLOSE 預設門檻改為 health 100% 才可完成收工（例外需明確授權 `-AllowNonPerfectHealth`）。
- 已同步更新規則、操作文件與雙路徑 `ao-close.ps1`，確保公司機 `pull` 後行為一致。

### AO-CLOSE（2026-03-26 晚）
- `doc-sync-automation -AutoDetect`：無新變更偵測；沿用 closeout `reports/closeout/closeout-20260326-015712.md`
- `system-health-check`（`D:\Work`）：PASS，100%（265/265），`reports/health/health-20260326-020219.md`，Critical Gate PASS
- `system-guard -Mode manual`：PASS，`reports/guard/guard-20260326-020220.md`
- **Git**：依本人指示改明天再 commit／push（見 §1b 與對話約定）
- `ALERT_REQUIRED.txt`：無

- **GitHub 同步（公司機用）**：自 `.git` 索引移除 `.claude/`（含 OAuth 憑證檔）與 `mcp-local-wrappers/node_modules`，新增 `.gitignore`；`verify-build-gates` PASS 後已 `git push origin main`（`f6a19e6`）。**舊 commit 歷史仍可能含已外洩憑證，請至 Anthropic／Claude 端撤銷並重新登入。**

### AO-CLOSE 關鍵字不變 + 關機前新增一鍵推遠端（2026-03-26 收工）
- 新增 `D:\Work\scripts\ao-close.ps1`：`system-guard`（內含 doc-sync + health）PASS 後自動 `git commit`／`git push`；**FAIL 不推**；`-SkipPush` 可關推送。
- `system-guard.ps1`：失敗時 `exit 1`，供 `ao-close` 判斷。
- `.cursor/rules/40-shutdown-closeout.mdc`、`AGENTS.md`、`end-of-day-checklist.md`、`EXECUTION_DASHBOARD.md` 已對齊說明（**AO-CLOSE 仍為同一關鍵字與四段回覆格式**）。
- 本回合收工：執行 `ao-close.ps1`（含 push）並記錄報告檔名於 `memory/daily/2026-03-26.md`。
- **修正**：`ao-close.ps1` 改為**單一邏輯**（自動判斷從 `Work\scripts` 或 `agency-os\scripts` 啟動），兩處各保留**同內容**複本，避免 wrapper 誤指 `D:\scripts`；已再驗證雙入口 `-SkipPush` PASS。
- **修正**：`ao-close.ps1` 在 `system-guard` PASS 後補跑 **`generate-integrated-status-report.ps1`**，否則 `reports/status/` 只會在週檢時更新；例：`integrated-status-20260326-083247.md`。
- **強化**：`ao-close.ps1` 預設開頭加跑 **`verify-build-gates`**（龍蝦 bootstrap + Agency health），收工 push 後公司機 `pull` 可對齊「工程 + 治理」完整閘道；`-SkipVerify` 僅供加速、不建議跨機前使用。

## 2026-03-27

### 匯入新規格：LOBSTER_FACTORY_MASTER_V3
- 已從 `D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md` 匯入新資料，並建立落地整合文件：
  - `D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`
- 已更新 `D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST.md`，新增 **H) MASTER V3 整合追蹤** 區段。
- 整合策略：不打斷現行 C1 執行主線，先完成 C1-2/C1-3，再進行 V3 缺口模組骨架衝刺（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）。
- 已補齊連動：
  - `lobster-factory/README.md` 增加 V3 整合入口
  - `lobster-factory/scripts/validate-doc-integrity.mjs` 增加 V3/Completion canonical 檔案驗證
  - `agency-os/docs/overview/EXECUTION_DASHBOARD.md` 更新 Lobster 尚未完成項，對齊 C1-2/C1-3 + V3 skeleton sprint

### Lobster Factory - C1-2 execute 驗證成功（同日）
- 已以新專案 URL 執行 `validate-package-install-runs-flow.mjs --execute=1` 並成功：
  - `installRunId: 206bd6ee-f5e0-4b6a-810c-bbb9914844f4`
  - lifecycle：`pending -> running -> completed`
- 先前阻塞（`environment_id` FK 不存在）已解：補入 `environments` fixture（`55555555-5555-5555-5555-555555555555`）並對齊 `workflowRunId`（`a5230339-c820-46ad-9eec-41f1d152c3ad`）後通過。
- 已同步更新：
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`（C1-2 勾選完成）
  - `agency-os/TASKS.md`

### Lobster Factory - C1-3 execute 驗證成功（同日）
- 已以 vault 自動注入 Supabase 憑證執行：
  - `.\scripts\secrets-vault.ps1 -Action run -Names LOBSTER_SUPABASE_URL,LOBSTER_SUPABASE_SERVICE_ROLE_KEY -Command "node D:\Work\lobster-factory\scripts\validate-db-write-resilience.mjs --execute=1"`
- execute 結果：
  - `ok: true`
  - `traceId: resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`
  - `insertedWorkflowRunId: 77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`
- 已同步更新：
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`（C1-3 勾選完成）
  - `agency-os/TASKS.md`

### Lobster Factory - H3 skeleton sprint（Batch 1）完成
- 已落地 V3 缺口模組骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）：
  - `lobster-factory/packages/db/migrations/0007_v3_skeleton_modules.sql`
  - `lobster-factory/packages/shared/src/types/v3-skeleton.ts`
  - `lobster-factory/packages/workflows/src/contracts/v3-module-skeleton-workflows.ts`
  - `lobster-factory/docs/V3_MODULE_SKELETONS.md`
- 已同步勾選：
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` 的 `H3`
  - `agency-os/TASKS.md`

### Lobster Factory - H4 Decision Engine baseline 完成
- 已新增 recommendations baseline schema：
  - `lobster-factory/packages/db/migrations/0008_decision_engine_recommendations.sql`
- 已新增 baseline recommendation contract：
  - `lobster-factory/packages/workflows/src/contracts/decision-engine-baseline.ts`
- 文件同步：
  - `lobster-factory/docs/V3_MODULE_SKELETONS.md`
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`（H4 勾選）
  - `agency-os/TASKS.md`

### Lobster Factory - H5 CX retention/upsell baseline 完成
- 已新增 CX baseline schema（workflow_runs 串接）：
  - `lobster-factory/packages/db/migrations/0009_cx_retention_upsell_baseline.sql`
- 已新增 CX baseline contract：
  - `lobster-factory/packages/workflows/src/contracts/cx-retention-upsell-baseline.ts`
- 文件同步：
  - `lobster-factory/docs/V3_MODULE_SKELETONS.md`
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`（H5 勾選）
  - `agency-os/TASKS.md`

### Secrets 治理（零成本落地）
- 新增本機加密祕密庫腳本（Windows DPAPI）：
  - `agency-os/scripts/secrets-vault.ps1`
  - `scripts/secrets-vault.ps1`（root 入口）
- 能力：`init / set / set-prompt / list / get(masked) / remove / run(with env)`
- 新增文件：
  - `docs/operations/local-secrets-vault-dpapi.md`
- 已同步更新：
  - `docs/operations/security-secrets-policy.md`
  - `docs/operations/mcp-secrets-hardening-runbook.md`
  - `README.md`（核心文件入口）
- 已完成 vault 實際初始化與匯入：
  - `secrets-vault -Action import-mcp -McpPath D:\Work\mcp.json`
  - 另補 `LOBSTER_SUPABASE_URL`、`LOBSTER_SUPABASE_SERVICE_ROLE_KEY`、`AGENCY_OS_SLACK_WEBHOOK_URL`
  - 目前可用 key 清單已可由 `secrets-vault -Action list` 查詢（僅顯示名稱與時間，不顯示明文）
- 已補「操作 + 復原」手冊：
  - `docs/operations/local-secrets-vault-dpapi.md`（建置架構、換機復原、故障排除）
  - `EXECUTION_DASHBOARD.md`、`REMOTE_WORKSTATION_STARTUP.md` 已新增揭示入口
- 已新增高頻操作入口：
  - `docs/operations/mcp-add-server-quickstart.md`（mcp.json 新增 + vault 匯入一鍵流程）
  - 已同步揭示到 `README.md`、`EXECUTION_DASHBOARD.md`、`REMOTE_WORKSTATION_STARTUP.md`
- 已新增「小白操作格式」持久規則：
  - `AGENTS.md` 補充新手輸出規範（去哪裡 -> 做什麼 -> 看到什麼）
  - `.cursor/rules/60-beginner-operation-format.mdc`（root + agency-os）
  - `mcp-add-server-quickstart.md` 已補小白快速版段落
- 依使用者偏好，已把 `quickstart / 修復 / 重灌` 三段都改為同一種步驟句格式：
  - `docs/operations/mcp-add-server-quickstart.md`
  - `docs/operations/local-secrets-vault-dpapi.md`
  - `docs/operations/mcp-secrets-hardening-runbook.md`
- 依使用者要求，三份手冊的指令已改為「純貼上內容」：移除 `powershell -ExecutionPolicy ...` 前綴，統一為 `.\scripts\...`。

### Autopilot 可見性修正（同日）
- 問題：使用者感知「代理停下來」，但實際上代理已完成部分任務，缺少可見進度看板。
- 修正：
  - 新增 `AUTOPILOT_PROGRESS.md`（即時進度）
  - 在 `README.md`、`docs/overview/EXECUTION_DASHBOARD.md` 增加入口
  - 新增規則：`.cursor/rules/61-autopilot-visibility.mdc`（root + agency-os）
  - `AGENTS.md` 補充可見性要求

### 長任務呆等防呆（同日強化）
- 已把「3 層防呆」寫入 `AGENTS.md`（開工先報 / 固定心跳 / 事件即時）
- 心跳頻率已調整為每 **15 分鐘**
- 新增規則：
  - `.cursor/rules/62-progress-heartbeat-15min.mdc`
  - `agency-os/.cursor/rules/62-progress-heartbeat-15min.mdc`

### Lobster Factory - H6 合規/治理 gate baseline 完成
- 已新增可執行 gate policy：
  - `lobster-factory/packages/policies/approval/v3-governance-gate-policy.json`
- 已新增 gate runner：
  - `lobster-factory/scripts/run-v3-governance-gates.mjs`
- 已擴充治理驗證：
  - `lobster-factory/scripts/validate-governance-configs.mjs`（新增 V3 gate policy schema 檢查）
- 已整合到 bootstrap：
  - `lobster-factory/scripts/bootstrap-validate.mjs`（presence + run V3 governance gates）
- 已新增文件：
  - `lobster-factory/docs/V3_GOVERNANCE_GATES.md`
- 已同步勾選：
  - `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` 的 `H6`

### Lobster Factory - C3-3 release gate baseline 完成
- 已新增 PR gate workflow：
  - `.github/workflows/release-gate-main.yml`
- 已更新 prod deploy workflow（先 gate 再 deploy）：
  - `.github/workflows/release-trigger-prod.yml`
  - `deploy` 需通過 `gate` job
- gate 內容：
  - 於 `lobster-factory` 執行 `npm run validate`
  - CI 使用 `LOBSTER_SKIP_AGENCY_CANONICAL=1`（單 repo runner 場景）

### Trigger deploy / MCP 連動修復（同日）
- 已完成 Trigger deploy 鏈路修復並通過 GitHub Actions：
  - `project ref` 對齊為 `proj_rqykzzwujizcxdzgnedn`
  - 補齊缺失檔：`lobster-factory/packages/workflows/src/utils/uid.ts`
  - `release-trigger-prod.yml` 完成相容性調整（checkout v5 / node 22 / Node24 actions 相容）
  - Actions 結果：`Deploy to Trigger.dev (prod)` `gate` + `deploy` 皆綠燈
- 已修復 Cursor `user-trigger` MCP 啟動錯誤：
  - 根因：錯用 `--api-key`（Trigger MCP CLI 不支援）
  - 修正：`C:\Users\user1115\.cursor\mcp.json` 改為呼叫 `scripts/start-trigger-mcp.ps1`，並用 vault 注入 `TRIGGER_ACCESS_TOKEN`

### Tool routing / WordPress Factory 固定通道（同日）
- 新增工具分工與強制 routing 規格：
  - `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- 新增機器可讀風險矩陣：
  - `lobster-factory/workflow-risk-matrix.json`
- 連動更新：
  - `lobster-factory/README.md`（新增規格入口）
  - `lobster-factory/docs/ROUTING_MATRIX.md`（指向新規格與 JSON policy）

### WordPress Factory 細部執行規格（同日）
- 已新增可執行細部規格：
  - `lobster-factory/docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md`
- 內容包含：
  - step-by-step 固定通道（staging -> apply -> smoke -> approval -> production）
  - failure/rollback handling
  - approval payload 最小欄位
  - audit trail 強制要求（`workflow_runs` / `approvals` / `incidents` / `artifacts`）
- 入口同步：
  - `lobster-factory/README.md`

### WordPress Factory 規範可執行化（同日）
- 新增 policy JSON：
  - `lobster-factory/packages/policies/approval/wordpress-factory-execution-policy.json`
- 新增驗證腳本：
  - `lobster-factory/scripts/validate-workflow-routing-policy.mjs`
- 已整合至 bootstrap gate：
  - `lobster-factory/scripts/bootstrap-validate.mjs`
  - `lobster-factory/package.json`（`validate:routing`）
- 文件同步：
  - `lobster-factory/docs/V3_GOVERNANCE_GATES.md`
  - `lobster-factory/README.md`
- 驗證結果：
  - `npm run validate` PASS（含 `Workflow routing policy validation PASSED`）

### 報表單一路徑收斂（同日）
- 問題根因：同一組腳本可從 `D:\Work\scripts` 與 `D:\Work\agency-os\scripts` 兩種入口執行，舊版 root resolve 在根目錄執行時會將報表寫入 `D:\Work\reports`，造成多路徑。
- 修復：
  - `scripts/system-health-check.ps1`
  - `scripts/doc-sync-automation.ps1`
  - `scripts/system-guard.ps1`
  - `scripts/generate-integrated-status-report.ps1`
  - `scripts/archive-old-reports.ps1`
  以上統一加入 monorepo guardrail：若偵測到 `D:\Work\agency-os\scripts\...` 存在，強制以 `agency-os` 為 workspace root。
- Git 路徑治理：
  - `.gitignore` 新增 root `reports/*` 產物忽略規則（健康/closeout/status timestamp）。
  - 從版本控制移除歷史 root 報表檔（保留 `reports/status/README.md` 作相容說明）。
- 文件同步：
  - `reports/status/README.md` 明確標註 root `reports/` 已退役。
  - `docs/overview/REMOTE_WORKSTATION_STARTUP.md` 將 `Work/reports/status` 標註為退役路徑。

### AO-CLOSE（2026-03-28）
- 收工前已更新 `TASKS.md`、`WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`memory/daily/2026-03-28.md`。
- 執行 `D:\Work\scripts\ao-close.ps1`：`verify-build-gates` **PASS** → `system-guard` **PASS** → `generate-integrated-status-report` **OK** → `git commit` / `git push origin main` **OK**。
- **證據**：`reports/health/health-20260328-012900.md`、`reports/guard/guard-20260328-012904.md`、`reports/status/integrated-status-20260328-012912.md`、`LAST_SYSTEM_STATUS.md`（皆在 `agency-os/` 下）。
- **Git**：`e31966c` `chore: AO-CLOSE sync 2026-03-28 0129`（已推送 `main`）。

### Lobster Factory A9 `remote_put` artifacts（2026-03-28）
- `LOBSTER_ARTIFACTS_MODE=remote_put`：presign POST 或 `LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON`，對 R2/S3 presigned 做 PUT（無 AWS SDK）。
- 新增 `artifactMode.ts`、`remotePutArtifactSink.ts`、`REMOTE_PUT_ARTIFACTS.md`；`apply-manifest` 成功／失敗路徑皆支援；`npm run validate` PASS。

### Lobster Factory `http_json` hosting adapter（2026-03-28）
- `LOBSTER_HOSTING_ADAPTER=http_json`：POST 控制面 JSON，回傳 `environmentId`／`wpRootPath`／URLs；`create-wp-site` → `vendor_staging_provisioned`，欄位 `vendorStaging`。
- 新增 `packages/workflows/src/hosting/providers/httpJsonStagingAdapter.ts`、`docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`；`resolveStagingProvisioning` 改 **async**；閘道與 `npm run validate` PASS。

### Lobster Factory 營運 Runbook + operator:sanity + apply-manifest payload（2026-03-28）
- `docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`（每日檢查、payload、環境變數、排查順序）。
- `npm run operator:sanity`（validate + regression）；`npm run payload:apply-manifest`；`print-apply-manifest-payload.mjs`。
- README 頂部「營運一鍵」；E2E payload／MASTER_CHECKLIST／integrations 閘道已連動；`npm run validate` PASS。

### Lobster Factory hosting providers 合約 + create-wp-site payload CLI（2026-03-28）
- `packages/workflows/src/hosting/providers/stagingProvisionContract.ts`、`README.md`（`StagingProvisionAdapter`；真 vendor 實作入口）。
- `scripts/print-create-wp-site-payload.mjs`、`npm run payload:create-wp-site`；`STAGING_PIPELINE_E2E_PAYLOAD.md` 補 `create-wp-site` 範例；`HOSTING_ADAPTER_CONTRACT.md` 指向 providers。
- 結構閘道／bootstrap 已納入；`npm run validate` 預期 PASS。

### Lobster Factory hosting 合約 + A9 local artifacts（2026-03-28）
- `resolveStagingProvisioning`：`none` / `mock` / `provider_stub`（缺 env 或 Phase1 未實作 → `blocked_hosting_configuration`）／未知 adapter blocked。
- `create-wp-site` 早退不寫 DB；`HOSTING_ADAPTER_CONTRACT.md`、`providerStubAdapter.ts`。
- `localArtifactSink`：`LOBSTER_ARTIFACTS_MODE=local` 寫 `agency-os/reports/artifacts/lobster/apply-manifest/<id>/`，PATCH `logs_ref` + `output_snapshot.logsRef`；`LOCAL_ARTIFACTS_SINK.md`、`reports/artifacts/lobster/README.md`。
- 閘道：`validate-workflows-integrations-baseline.mjs`（取代 mock-only validate）；bootstrap／regression 已接。

### Lobster Factory C2-1 mock hosting + C3-2 drill report（2026-03-28）
- `LOBSTER_HOSTING_ADAPTER=mock`：`maybeProvisionMockStaging`、`create-wp-site` → `mock_staging_provisioned` + 可傳 `apply-manifest` 的 `environmentId`／`wpRootPath`（合成）。
- 演練報告：`emit-staging-drill-report.mjs`、`STAGING_PIPELINE_DRILL_REPORT_TEMPLATE.md`、`npm run drill:staging-report` → `agency-os/reports/e2e/`（含 `README.md`）。
- 回歸腳本增驗 `validate-workflows-integrations-baseline.mjs`；bootstrap 納入；`MASTER_CHECKLIST` 更新 A6／C2-1／C3-2。

### Lobster Factory C3-1（staging 管線回歸 + payload，2026-03-28）
- 新增 `docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`（固定 tenant UUID、Trigger body 範例、環境變數索引）。
- 新增 `scripts/run-staging-pipeline-regression.mjs`（結構閘道 + dryrun 合約 + 可選 `execute-apply-manifest-staging --execute=0`）；`npm run regression:staging-pipeline`；bootstrap 納入檔案存在檢查。
- `MASTER_CHECKLIST`：C3-1、A8 勾選；A7/A9 補註；`TASKS.md` 已勾對應項。

### Lobster Factory M3 + C2-3（staging 執行 + DB 終態 + rollback baseline，2026-03-28）
- 執行器：`installManifestStaging.ts`、`execute-apply-manifest-staging.mjs`；`apply-manifest` 可選 `LOBSTER_EXECUTE_MANIFEST_STEPS` + `LOBSTER_MANIFEST_EXECUTION_MODE`；回傳 `shellExecution` / `staging_shell_*`。
- DB：`supabaseRestPatch`；啟用 shell 且寫 DB 時先 insert **`running`**，shell 成功 **PATCH `completed`**（`output_snapshot` / `result_summary`），失敗 **PATCH `failed`**；`writeExecution.patchedFinalStatus`。
- Rollback：`rollback-from-manifest.sh`、`rollback-apply-manifest-staging.mjs`（反向 deactivate；`ROLLBACK_DEEP` 可 uninstall；theme／完整還原仍快照）。
- 文件與閘道：`README`、`WORDPRESS_FACTORY_EXECUTION_SPEC`、`MASTER_CHECKLIST`（C2-2／C2-3）、`COMPLETION_PLAN_V2`；`bootstrap-validate` 含結構檢查。

### Git：`commit`／`push` 節奏（政策，2026-03-28）
- 使用者共識：**平常進行中**代理不主動 `git commit`／`git push`；**預設**僅 **`AO-CLOSE`**（`ao-close.ps1`）統一做 commit + push；**例外**：使用者明確一句話要求立即提交／推送。
- 已寫入：`AGENTS.md`（§Git 推送節奏）、repo 根 `.cursor/rules/50-operator-autopilot.mdc` §7（並去除該檔先前整段重複貼上）；`agency-os/.cursor/rules/50-operator-autopilot.mdc` 與根規則對齊。

### Git：checkpoint + 收工 push（政策更新，2026-04-02）
- **Supersedes** 上列 2026-03-28「平常不 commit」：改為 **里程碑本機 checkpoint**（代理自動跑 `scripts/commit-checkpoint.ps1`，不 push）+ **`AO-CLOSE`** 閘道 PASS 後 **commit（收斂殘留）+ push**。
- **單一真相（人類）**：`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §2.5；**代理細節**：`50-operator-autopilot.mdc` §7；**入口摘要**：`AGENTS.md`「Git：checkpoint 與收工」。

### Lobster A10-2 前置：SOP Step 7 + presign 範例（2026-03-28）
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`：新增 **Step 7**（Lobster／A10-2）+ Go/No-Go 勾選；連結 `OPERABLE_E2E_PLAYBOOK`、`STAGING_PIPELINE_E2E_PAYLOAD`、PRESIGN／lifecycle。
- `PRESIGN_BROKER_MINIMAL.md`、`templates/lobster/presign-response.success.example.json`；`REMOTE_PUT` Related 已掛。
- `validate-operable-e2e-skeleton.mjs`：斷言 SOP 含 Step 7 + `OPERABLE_E2E_PLAYBOOK.md`，並解析 presign example JSON。
- `npm run validate` PASS。

### Lobster A10-1 operable E2E + A9 lifecycle policy（2026-03-28）
- `docs/e2e/OPERABLE_E2E_PLAYBOOK.md`：固定步驟（sanity → payload → regression → 可選 DB／artifacts → drill → AO 紀錄）。
- `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`：留存／存取／presign 原則（實作自動化仍 backlog）。
- `scripts/validate-operable-e2e-skeleton.mjs` + `npm run validate:operable-e2e`；已接入 `bootstrap-validate.mjs`；`validate-doc-integrity` canonical、`validate-workflows-integrations-baseline`、runbook／README／`ARCHITECTURE_CANONICAL_MAP` 已連動。
- `MASTER_CHECKLIST`：A10 拆 A10-1 ✅／A10-2 ⏳；A9 文案對齊政策層。
- `npm run validate` PASS。

### Monorepo 總覽 + 儀表板對齊現況（2026-03-28）
- 新增 repo 根 [`README.md`](../README.md)（`agency-os`／`lobster-factory`／`scripts\verify-build-gates.ps1` 一頁導覽）。
- 龍蝦：`README.md` 補 `http_json`／`REMOTE_PUT` 連結；`LOBSTER_FACTORY_MASTER_CHECKLIST.md` 修正 A6（含 `http_json`）、B5 列 `remote_put` + `HTTP_JSON` 檔案。
- AO：`agency-os/README.md` 指向上層 monorepo README；`AGENTS.md` session 啟動補讀 `../README.md`；`docs/overview/EXECUTION_DASHBOARD.md` §2 改為與 `TASKS`/現況一致（避免「C1-2 未完成」等過期敘述）。
- 驗證：`D:\Work\scripts\verify-build-gates.ps1` **PASS**（bootstrap + health **100%** 269/269，`health-20260328-192715.md`）；`doc-sync-automation -AutoDetect` **PASS**（`reports/closeout/closeout-20260328-192729.md`）。

### AO-CLOSE（2026-03-28 晚）
- 收工前已更新 `TASKS.md`、`WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`memory/daily/2026-03-28.md`。
- 執行：`powershell -ExecutionPolicy Bypass -File D:\Work\scripts\ao-close.ps1`（`verify-build-gates` → `system-guard` → `generate-integrated-status-report` → commit + `git push`）。
- **連動檢查**：`verify-build-gates` **PASS**；`system-health-check` **100%（269/269）**（`reports/health/health-20260328-201757.md`）；`system-guard` **PASS**（`reports/guard/guard-20260328-201801.md`）；綜合狀態 `reports/status/integrated-status-20260328-201809.md` 與 `integrated-status-LATEST.md`；`LAST_SYSTEM_STATUS.md` 已刷新。
- **Git**：`chore: AO-CLOSE sync 2026-03-28 2018` → **`e04be6f`**；已 **`push origin main`**。

## 2026-03-30

### AO-CLOSE（晚）
- 收工前更新：`TASKS.md`（明日 **四份 spec 原文整理** 提醒項）、`WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`memory/daily/2026-03-30.md`。
- 執行：`powershell -ExecutionPolicy Bypass -File D:\Work\scripts\ao-close.ps1`。
- **連動檢查**：`verify-build-gates` **PASS**；`system-health-check` **100%（286/286）**（`reports/health/health-20260330-024902.md`）；`system-guard` **PASS**（`reports/guard/guard-20260330-024905.md`）；綜合狀態 `reports/status/integrated-status-20260330-024914.md`、`integrated-status-LATEST.md`。
- **Git**：`chore: AO-CLOSE sync 2026-03-30 0249` → commit **`10fe5df`**；已 **`push origin main`**。
- **資安後續（同日補救）**：`hostinger-recovery-codes.txt` 曾被 `git add -A` 一併入庫並推送；已 **刪檔 + `.gitignore` + commit `c2bb268` push**。**請使用者至 Hostinger 立即作廢並重新產生復原碼**（歷史提交仍可能含有該檔；若 repo 公開建議評估 history purge）。

### Company OS 四份原文與導覽（同日）
- 新增 **`docs/overview/company-os-four-sources-integration.md`**（四檔分工、閱讀順序、與 AO／龍蝦關係）；**`company-os-twenty-modules.md`** 改為 §三跳表並指向整合頁。
- **`docs/spec/raw`**：`ENTERPRISE_BASE_STACK.md`、`CURSOR_PACK_V1.md` 命名；根 **`Work-Monorepo.code-workspace`**；`docs/spec/README.md`、根／AO `README` 連動。
- **明日排程**：使用者要求順便提醒——**整理四份原文**（已寫入 `TASKS.md` unchecked + 本日 `memory/daily`）。

### Airtable 淘汰 → Supabase
- 決策：**不再使用 Airtable**／其 MCP；**同一類功能**（表格式營運資料、清單、視圖／自動化）**預設承接至 Supabase**（+ RLS、Storage、Webhook／**n8n**／必要時 **Trigger**）。**拔除 MCP ≠ 已完成資料遷移**。
- 已從 repo 根 **`mcp.json`**、**`.claude.json`** 移除 **airtable** 伺服器條目；並新增 **`docs/operations/airtable-to-supabase-migration-playbook.md`**（能力對照、執行順序、盤點模板）。
- 同步更新：`cursor-mcp-and-plugin-inventory.md`、`tools-and-integrations.md`、`mcp-secrets-hardening-runbook.md`、`settings/local.permissions.template.json`。
- **待辦（本機）**：Cursor 若仍有 **airtable** MCP 請手動刪除；**revoke** 舊 **Airtable PAT**；依 playbook **§5** 填 base／表／n8n 依賴後再開 **Supabase migration**。

### cursor-mcp-and-plugin-inventory：Supabase 自足敘述、零他牌表格式工具字樣
- `docs/operations/cursor-mcp-and-plugin-inventory.md`：移除一切該類工具名稱與「墓碑」列；**supabase** 單列擴寫 **SoR／RLS／Storage／Webhook、MCP vs 生產寫入、`read_only` 意義**，Routing 對齊 **Trigger** 與 **`crm_sync`／`webhook_ingress`／`notifications`**。§6 SSOT 與 Related 剔除該 migration 檔連結。**`docs/change-impact-map.json`**：inventory 與 **`airtable-to-supabase-migration-playbook`** 不再互為 map target。
- 驗證：`doc-sync-automation -AutoDetect` → `reports/closeout/closeout-20260330-015915.md`；`system-health-check` **100%（284/284）** → `reports/health/health-20260330-015922.md`。

## 2026-03-29

### 排程單一來源 + AO-CLOSE 聯動甘特
- **`docs/overview/PROGRAM_SCHEDULE.json`**：三流（AO／LF／PJ）任務與日期；可複製到客戶專案或 `project-kit` 範本。
- **`scripts/render-program-timeline-from-schedule.ps1`**：UTF-8 JSON → `PROGRAM_TIMELINE.md` 標記區（表 + Mermaid）；腳本本體 **ASCII-only** 以相容 PS 5.1。
- **`generate-integrated-status-report.ps1`** 末尾**單次**呼叫渲染；**AO-CLOSE** 路徑因此每次收工會重渲時間軸（仍以 TASKS／Checklist／Discovery 為完成真相）。

### 續接驗證（使用者授權「進行」）
- `git pull origin main`：**Already up to date**。
- `verify-build-gates.ps1`：**PASS**；health **100%（269/269）**（`reports/health/health-20260329-221913.md`）。
- `lobster-factory`：`npm run operator:sanity` **PASS**（staging regression 第 4 步未帶 `wpRootPath` → **SKIPPED**，屬預期）。

### AO-CLOSE（2026-03-27）
- 已完成收工前進度同步（`TASKS.md`、`WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`memory/daily/2026-03-27.md`）。
- 準備執行 `D:\Work\scripts\ao-close.ps1` 一鍵閘道與推送。

### 他處電腦開機須知 + 缺席使用者授權之 AO-CLOSE
- 新增 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**（公司機／換機：`git pull`、`verify-build-gates`、`npm ci`、`integrated-status` 路徑說明、與根目錄 `reports/status` 區別）。
- 更新 **`RESUME_AFTER_REBOOT.md`**（區分：同機重開 vs 他處開機）、**`README.md`**、**`EXECUTION_DASHBOARD.md`** 指向該須知。
- 使用者授權代理於不在現場時執行 **`ao-close.ps1`**（含 push）；證據見本日 `memory/daily/2026-03-27.md`。
- **AO-CLOSE 產出（agency-os/reports/）**：`health/health-20260326-084302.md`、`guard/guard-20260326-084306.md`、`closeout/closeout-20260326-084303.md`、`status/integrated-status-20260326-084315.md`；**Git**：主提交 `f726ce9`，補登 daily `70114fc`，TASKS 勾選 `5a7841b`（均已 `push origin main`）。

### Lobster Factory - C1-1 execute 驗證成功
- Supabase `EdD Art-based` 已完成 `0001_core.sql` ~ `0006_seed_catalog.sql` 套用。
- `validate-workflow-runs-write.mjs --execute=1` 實跑成功，回傳：`ok: true`、`insertedId: 1e53ec18-1c01-4547-9593-20feee6bdc2c`。
- 已將 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` 的 `C1-1` 由未完成改為完成。

### Enterprise 工具層（C5）落地決策與授權驗收
- 已安裝與可用：`Cloudflare`、`Sentry`、`PostHog`、`Slack`、`Clerk`（`Supabase` plugin OAuth 仍有 `Unrecognized client_id`，暫用既有 `mcp.json` 連線）。
- C5 選型定稿：`Identity = Clerk`；`Secrets` 先採 `env/mcp`（`1Password` 因付費方案先不阻塞）。
- 使用順序定稿：`Clerk + Cloudflare`（先安全）-> `Sentry + PostHog`（可觀測）-> `Slack`（通知）-> `Supabase plugin` 待 OAuth 修復切回官方授權流。

### Operator Autopilot（Phase 1）完成
- 新增規則：`.cursor/rules/50-operator-autopilot.mdc`（含 `agency-os/.cursor/rules` 同步副本）。
- 新增腳本：`ao-resume`、`check-three-way-sync`、`autopilot-phase1`、`autopilot-alert-loop`、`notify-ops`、`register-autopilot-phase1`、`install-autopilot-startup-fallback`（root + agency-os 雙路徑）。
- 啟動策略：優先嘗試排程註冊；若系統拒絕註冊（權限/IT 限制），自動改用 Startup fallback（本機已完成安裝）。
- Slack：`AGENCY_OS_SLACK_WEBHOOK_URL` 已設置並測試通知成功（建議後續輪替 webhook）。

## 2026-03-30

### Lobster Factory - 本機複核（公司桌機 `C:\Users\USER\Work`）
- 主線 C1-2/C1-3 已於 **2026-03-27** WORKLOG 紀錄（見上）；此為桌機再次 execute 複核。
- `validate-package-install-runs-flow.mjs --execute=1`：PASS（`ok: true`）；`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`、`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`；`bootstrap-validate.mjs`：PASS。
- **Git**：`git push` 遭拒後需 `git pull --rebase origin main` 合併遠端再推；合併衝突已手動收斂。

### Cursor 企業規則、`00-CORE` 與本機外掛（2026-03-30 晚）
- **`docs/spec/raw/.../00-CORE.md`**：完整版 SSOT（含 Downloads 長文）；**`63-cursor-core-identity-risk.mdc`**：精簡 alwaysApply，與 AO／`AGENTS`／十一段輸出分工；**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`**：`verify-build-gates`／`doc-sync` Apply 時自動鏡像 `63–66`；**`system-health-check`** 增 SHA256 對齊檢查（343 項）。
- **根因**：monorepo 根僅載入 `Work/.cursor/rules`，須與 `agency-os` 正本同步（已文件化於 `README-部署說明`、`cursor-enterprise-rules-index`）。
- **1Password**：repo 不採用；已刪 **`%USERPROFILE%\.cursor\plugins\cache\cursor-public\1password`**；使用者宜於 Cursor Plugins **關閉**該外掛以免快取再下載。
- **推送**：`78d836b`…`c27132d`、`d8e1943` 等已於本段對話期間 `push origin main`（詳 Git 日誌）。

### P1：`docs/spec/raw` 四份原文維護索引（對齊四源整合頁）
- 新增 `docs/spec/raw/README-four-sources-maintenance.md`（分工表、大段錨點、SSOT 對照、勿雙軌手抄）。
- 四檔首段加維護區塊（V3／Spec v1／ENTERPRISE／CURSOR_PACK）；`docs/spec/README.md` 與 `agency-os/docs/overview/company-os-four-sources-integration.md` 連回維護索引；`TASKS.md` 勾選完成。

### 雙機環境對齊（待辦；AO-RESUME 口頭提醒）
- 使用者要求桌機與筆電「執行與功能一致」。
- 已入 **`TASKS.md` → Next** 第一則未勾項 **「（AO-RESUME 提醒）雙機環境對齊」**；並在 **`memory/CONVERSATION_MEMORY.md` → Current Operating Context** 註明：之後每次 **`AO-RESUME`** Agent 須列出該待辦，直到勾選完成。
- 要點摘要：`gh` + `gh auth login`（筆電）；Node／`lobster-factory\packages\workflows` `npm ci`；**DPAPI vault 與 MCP 每台各自設定**；開工見 `REMOTE_WORKSTATION_STARTUP.md`。
- **最短指令正本**：`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md` **§1.5**（筆電／新機複製貼上序列）；根 `README.md` 他機接線條目已連到 §1.5；`TASKS` 雙機項已連回 §1.5。
- **2026-04-01 整合** — 避免 §1／§1.5／§2 重工與邏輯矛盾：`§1` 僅剩「已 clone 之 `pull`」並指向 §1.5；`§2` 例行步驟補上 **`packages/workflows` `npm ci`**（與 lockfile 位置一致；非舊的錯誤 `lobster-factory` 根目錄 `npm ci`）；`§2.1`／`§6`／`§5` 與 **§1.5 做完後** 指引對齊；**EXECUTION_DASHBOARD**（公司機摘要）、**RESUME_AFTER_REBOOT**（換機段）、**AGENTS**（雙機）、**CONVERSATION_MEMORY**、根 **README** 一併與 `REMOTE_WORKSTATION_STARTUP` 單一真相對齊。


























































































































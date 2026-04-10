# Agency OS v1

這是一套給多客戶網站建置、客製系統、維運與行銷整合的營運框架。

與 **Lobster Factory** 同庫時，monorepo 總覽見上層 [`../README.md`](../README.md)（含 `verify-build-gates`、龍蝦 README 入口）。  
**整體公司 OS**：四份規格原文在上層 [`../docs/spec/README.md`](../docs/spec/README.md)；**四份怎麼整合、先讀誰** 見本目錄 [`docs/overview/company-os-four-sources-integration.md`](docs/overview/company-os-four-sources-integration.md)；**V3 §三 跳行表** 見 [`docs/overview/company-os-twenty-modules.md`](docs/overview/company-os-twenty-modules.md)。

## 文件導覽（可點連結；編輯器內 Ctrl+Click／Mac Cmd+Click 開檔）

若目錄太多會眼花，**只要記三個入口**：

- [**docs 總索引**](docs/README.md)（整棵 `docs/` 地圖）
- [**operations 分類導覽**](docs/operations/README.md)（SOP／Runbook／基礎建設／資安，已分類＋可點）
- [**overview 分類導覽**](docs/overview/README.md)（全貌／雙機／紀律／時程，已分類＋可點）

## 每天開工必看（固定開工卡，可點）

- **總入口**：[AO＋龍蝦運作模型](docs/overview/ao-lobster-operating-model.md)
- **開工事件 SSOT**：[REMOTE 雙機開工](docs/overview/REMOTE_WORKSTATION_STARTUP.md)
- **收工事件 SSOT**：[收工 Checklist](docs/operations/end-of-day-checklist.md)
- **工具交付一頁追溯**：[TOOLS_DELIVERY_TRACEABILITY](docs/operations/TOOLS_DELIVERY_TRACEABILITY.md)
- **關鍵字規則**：[30-resume-keyword.mdc](.cursor/rules/30-resume-keyword.mdc)、[40-shutdown-closeout.mdc](.cursor/rules/40-shutdown-closeout.mdc)
- **今日主線真相**：[TASKS.md](TASKS.md)
- **統整報告**：[integrated-status-LATEST.md](reports/status/integrated-status-LATEST.md)（說明：[INTEGRATED_STATUS_REPORT.md](docs/overview/INTEGRATED_STATUS_REPORT.md)）

## AO + 龍蝦工程圖（首頁）

- 單一真相（SSOT）：[流程圖錨點](docs/overview/ao-lobster-operating-model.md#4-ao--lobster-event-flow-mermaid)（同檔：[ao-lobster-operating-model.md](docs/overview/ao-lobster-operating-model.md)）
- 首頁只放入口，不複製圖內容，避免多版本漂移與重工。

## 目標
- 同時管理多家公司、多網站，不失控
- 支援 WordPress + Supabase + GitHub + n8n + Replicate + DataForSEO
- 將接案到交付流程產品化、可複製
- 讓 AI 每次會話都先讀記憶，不從空白開始

## 範本目錄（兩種，勿混用）
- **租戶（每家公司）** 複製起點：`tenants/templates/`（`tenant-template`、`site-template`、`core`、`industry`）— 說明見 [`tenants/README.md`](tenants/README.md)。
- **平台堆疊／Woo 對客範例／專案極簡骨架**：`platform-templates/`（`woocommerce`、`client-base`）— 說明見 [`platform-templates/README.md`](platform-templates/README.md)。
- **合約／英文化對客範本、龍蝦 shell 等**：見 **索引正本** [`docs/overview/repo-template-locations.md`](docs/overview/repo-template-locations.md)（不建議無計畫遍歷改名）。

## 核心文件（可點）

- [**REMOTE 雙機開工**（他處電腦／公司機）](docs/overview/REMOTE_WORKSTATION_STARTUP.md)（§1.5 新機、§2 例行；與 [RESUME_AFTER_REBOOT.md](RESUME_AFTER_REBOOT.md) 同列必讀）
- [AGENTS.md](AGENTS.md)：AI 協作規則
- [BOOTSTRAP.md](BOOTSTRAP.md)：新環境初始化清單
- [TASKS.md](TASKS.md)：全域任務看板
- [WORKLOG.md](WORKLOG.md)：執行日誌與決策紀錄
- [財務營運](docs/operations/finance-operations.md)：報價、收款、毛利流程
- [外包 Playbook](docs/operations/outsourcing-playbook.md)：外包協作與驗收機制
- [事件應變 Runbook](docs/operations/incident-response-runbook.md)：資安與故障
- [範圍變更政策](docs/operations/scope-change-policy.md)：客戶邊界與變更單制度
- [憑證與祕鑰政策](docs/operations/security-secrets-policy.md)
- [本機 DPAPI 祕密庫](docs/operations/local-secrets-vault-dpapi.md)
- [MCP 新增快速手冊](docs/operations/mcp-add-server-quickstart.md)
- [**長期營運紀律**](docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md)（30 年級；Single Owner、ADR、節奏）
- [WordPress 雙模式交付 SOP](docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md)
- [Next-Gen 升級藍圖](docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md)
- [**Cursor MCP／外掛與路由對照**](docs/operations/cursor-mcp-and-plugin-inventory.md)（建議與 monorepo 根 `mcp.json` 同步）
- [**工具交付追溯一頁表**](docs/operations/TOOLS_DELIVERY_TRACEABILITY.md)（工具 ↔ 路由 ↔ TASKS）
- [**龍蝦路由強制規格**](../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) + [**路由矩陣**](../lobster-factory/docs/ROUTING_MATRIX.md)
- [**Cursor 企業規則索引**](docs/operations/cursor-enterprise-rules-index.md)（`63`–`66`；與 AO 流程衝突時以 `00`／`30`／`40` 為準）
- [**Airtable → Supabase Playbook**](docs/operations/airtable-to-supabase-migration-playbook.md)
- [工具與整合總表](docs/operations/tools-and-integrations.md)

## 事件流程單一真相（避免重複維護）

- **開工（AO-RESUME）**：[REMOTE_WORKSTATION_STARTUP](docs/overview/REMOTE_WORKSTATION_STARTUP.md)（Git 對齊 + 30 秒自檢）
- **收工（AO-CLOSE）**：[收工 Checklist](docs/operations/end-of-day-checklist.md) + [40-shutdown-closeout.mdc](.cursor/rules/40-shutdown-closeout.mdc)
- **原則**：其他文件只放入口連結與一句摘要，不再維護第二套完整命令
- **跨系統運作模型**：[ao-lobster-operating-model.md](docs/overview/ao-lobster-operating-model.md)

## Docs 分類入口（延伸索引：分類 + 可點連結 + Path）

> **Path** 一律相對 **本目錄 `agency-os/` 根**（在 monorepo 裡即 `agency-os/…`）。  
> 已分類的完整操作／導覽仍以 [operations 導覽](docs/operations/README.md)、[overview 導覽](docs/overview/README.md) 為主；下列為 **跨 `docs/` 子資料夾**速查。

### `docs/` 根與連動

- [文件分層總索引](docs/README.md) · Path: `docs/README.md`
- [變更連動矩陣](docs/CHANGE_IMPACT_MATRIX.md) · Path: `docs/CHANGE_IMPACT_MATRIX.md`

### `docs/overview/`（全貌／導讀）

- [完整系統介紹](docs/overview/agency-os-complete-system-introduction.md) · Path: `docs/overview/agency-os-complete-system-introduction.md`
- [Company OS 20 模組一頁導覽](docs/overview/company-os-twenty-modules.md) · Path: `docs/overview/company-os-twenty-modules.md`（連 `docs/spec/raw` 原文；僅索引）

### `docs/architecture/`（架構）

- [總控中心完整架構](docs/architecture/agency-command-center-v1.md) · Path: `docs/architecture/agency-command-center-v1.md`
- [WordPress-first 多平台架構](docs/architecture/multi-platform-delivery-architecture.md) · Path: `docs/architecture/multi-platform-delivery-architecture.md`

### `docs/operations/`（營運／SOP）

- [全系統操作 SOP](docs/operations/system-operation-sop.md) · Path: `docs/operations/system-operation-sop.md`
- [每公司自動排程與執行](docs/operations/tenant-scheduling.md) · Path: `docs/operations/tenant-scheduling.md`
- [關機前／每日守護與告知](docs/operations/system-guard-and-notification.md) · Path: `docs/operations/system-guard-and-notification.md`
- [全鏈路連動檢查清單](docs/operations/end-to-end-linkage-checklist.md) · Path: `docs/operations/end-to-end-linkage-checklist.md`
- [客戶風險評分模型](docs/operations/client-risk-scoring-model.md) · Path: `docs/operations/client-risk-scoring-model.md`
- [外包評分卡](docs/operations/outsourcing-vendor-scorecard.md) · Path: `docs/operations/outsourcing-vendor-scorecard.md`

### `docs/quality/`（品質）

- [交付品質放行關卡](docs/quality/delivery-qa-gate.md) · Path: `docs/quality/delivery-qa-gate.md`

### `docs/international/`（跨境）

- [跨時區交付模型](docs/international/global-delivery-model.md) · Path: `docs/international/global-delivery-model.md`
- [國際合規與資安基線](docs/international/global-compliance-baseline.md) · Path: `docs/international/global-compliance-baseline.md`
- [多幣別商務與收款政策](docs/international/multi-currency-commercial-policy.md) · Path: `docs/international/multi-currency-commercial-policy.md`

### `docs/sales/`（報價／銷售）

- [服務方案標準](docs/sales/service-packages-standard.md) · Path: `docs/sales/service-packages-standard.md`
- [CR 核價規則](docs/sales/cr-pricing-rules.md) · Path: `docs/sales/cr-pricing-rules.md`

### `docs/templates/`（合約範本）

- [MSA 模板](docs/templates/msa-template.md) · Path: `docs/templates/msa-template.md`
- [SOW 模板](docs/templates/sow-template.md) · Path: `docs/templates/sow-template.md`
- [CR 模板](docs/templates/cr-template.md) · Path: `docs/templates/cr-template.md`

### `docs/standards/`（技術標準）

- [WordPress 客製開發準則](docs/standards/wordpress-custom-dev-guidelines.md) · Path: `docs/standards/wordpress-custom-dev-guidelines.md`
- [n8n 工作流架構](docs/standards/n8n-workflow-architecture.md) · Path: `docs/standards/n8n-workflow-architecture.md`

### `docs/metrics/`（指標）

- [KPI 毛利儀表規格](docs/metrics/kpi-margin-dashboard-spec.md) · Path: `docs/metrics/kpi-margin-dashboard-spec.md`

### `docs/product/`（產品化／對外）

- [可販售產品化藍圖](docs/product/resell-package-blueprint.md) · Path: `docs/product/resell-package-blueprint.md`
- [買方交接驗收清單](docs/product/buyer-handover-checklist.md) · Path: `docs/product/buyer-handover-checklist.md`
- [英文化提案模板](docs/product/templates/proposal-template-en.md) · Path: `docs/product/templates/proposal-template-en.md`
- [英文化 SOW 模板](docs/product/templates/sow-template-en.md) · Path: `docs/product/templates/sow-template-en.md`
- [英文化月報模板](docs/product/templates/monthly-report-template-en.md) · Path: `docs/product/templates/monthly-report-template-en.md`

### `docs/compliance/`（合規）

- [leads／抓取合規檢查清單](docs/compliance/leads-and-scraping-checklist.md) · Path: `docs/compliance/leads-and-scraping-checklist.md`

### `docs/releases/`（版本／遷移）

- [版本發布紀錄](docs/releases/release-notes.md) · Path: `docs/releases/release-notes.md`
- [升級路徑](docs/releases/upgrade-path.md) · Path: `docs/releases/upgrade-path.md`
- [遷移檢查清單](docs/releases/migration-checklist.md) · Path: `docs/releases/migration-checklist.md`

## 自動同步與結案檢查
- 一次同步：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
- 持續同步：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -Watch`
- 輸出報告：`reports/closeout/closeout-*.md`
- 同步狀態：`.agency-state/doc-sync-state.json`

## 系統健康檢查
- 執行：`powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`
- 報告：`reports/health/health-*.md`
- **目標：與 `AGENTS.md`／`AO-CLOSE` 預設一致——健康分數 100%**（Critical Gate PASS；未達不得視為可收工／可對外宣告整庫完好的狀態；僅在明確授權下放寬）
- 硬性關卡：`Critical Gate` 必須 PASS（連動 map 缺漏或 tenant package 缺檔會 FAIL）

## 報告歸檔（避免長期膨脹）
- 預覽（不搬移）：`powershell -ExecutionPolicy Bypass -File .\scripts\archive-old-reports.ps1 -KeepDays 30`
- 套用（搬移到 `reports/archive/`）：`powershell -ExecutionPolicy Bypass -File .\scripts\archive-old-reports.ps1 -KeepDays 30 -Apply`

## 主動守護與告警
- 手動守護：`powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`
- 註冊守護排程：`powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1 -DailyTime 22:30`
- 註冊 Autopilot Phase1（開機 preflight + 告警自修，每 10 分鐘掃 `ALERT_REQUIRED.txt`）：`powershell -ExecutionPolicy Bypass -File .\scripts\register-autopilot-phase1.ps1`
- 停用 Autopilot Phase1：`powershell -ExecutionPolicy Bypass -File .\scripts\register-autopilot-phase1.ps1 -RemoveOnly`
- 可選：啟用「登出時自動 closeout」：`powershell -ExecutionPolicy Bypass -File .\scripts\register-autopilot-phase1.ps1 -EnableLogoffCloseout`（加 `-EnablePushOnLogoff` 才會 push）
- 若排程權限受限（無法建立新工作）：安裝 Startup fallback：`powershell -ExecutionPolicy Bypass -File .\scripts\install-autopilot-startup-fallback.ps1`（停用：加 `-RemoveOnly`）
- Slack 通知：設定環境變數 `AGENCY_OS_SLACK_WEBHOOK_URL` 後，`scripts/notify-ops.ps1` 會自動送出 preflight/告警修復/closeout 結果（**開機 Startup 預檢**：僅在 `ao-resume` **失敗**時才送 Slack；成功不再刷屏）
- 桌面彈窗：PASS/FAIL（含 ALERT 提示）
- 開機後自動開啟：`LAST_SYSTEM_STATUS.md`（可用 `-NoOpenStatusOnStartup` 關閉）
- 狀態文件：`LAST_SYSTEM_STATUS.md`
- 告警文件：`ALERT_REQUIRED.txt`（出現即代表需先修復）

## 對外販售打包
- 產生 bundle：`powershell -ExecutionPolicy Bypass -File .\scripts\build-product-bundle.ps1`
- 輸出路徑：`dist/agency-os-bundle-*.zip`

## 每公司自動排程（Daily/Weekly/Monthly/Adhoc）
- 排程設定：`tenants/<company>/OPERATIONS_SCHEDULE.json`
- 不定時任務佇列：`tenants/<company>/OPS_QUEUE.json`
- 執行引擎：`automation/TENANT_AUTOMATION_RUNNER.ps1`
- 註冊排程：`automation/REGISTER_TENANT_TASKS.ps1`
- 佇列加單：`automation/ENQUEUE_TENANT_TASK.ps1`
- 執行紀錄：`reports/automation/<company>/`

## 記憶與規則
- `.cursor/rules/00-session-bootstrap.mdc`: 會話啟動規則（always apply）
- `.cursor/rules/10-memory-maintenance.mdc`: 記憶維護規則
- `.cursor/rules/20-doc-sync-closeout.mdc`: 文件同步與結案規則
- `.cursor/rules/30-resume-keyword.mdc`: `AO-RESUME` 關鍵字快速續接規則
- `memory/CONVERSATION_MEMORY.md`: 跨會話摘要與進度
- `memory/daily/YYYY-MM-DD.md`: 每日原始記錄
- `memory/SESSION_TEMPLATE.md`: 每段摘要模板

## 接案模板套裝
- `project-kit/00_MASTER_CHECKLIST.md`
- `project-kit/10_DISCOVERY.md`
- `project-kit/20_BUILD_AND_CUSTOM_SYSTEM.md`
- `project-kit/30_LAUNCH_AND_HANDOVER.md`
- `project-kit/40_OPERATE_AND_GROWTH.md`

## 建議工作方式
1. 新客戶先走 `tenants/NEW_TENANT_ONBOARDING_SOP.md`
2. 每接新案先複製 `project-kit` 文件建立該案資料夾
3. 每次會議後更新 `WORKLOG.md` 與 `TASKS.md`
4. 每個里程碑完成後更新 `memory/CONVERSATION_MEMORY.md`
5. 若有範圍變更，先走 `docs/operations/scope-change-policy.md` + `docs/sales/cr-pricing-rules.md`
6. 改任一治理文件後，必看 `docs/CHANGE_IMPACT_MATRIX.md`
7. 完成改版前跑一次 `scripts/doc-sync-automation.ps1`
8. 若看到 `ALERT_REQUIRED.txt`，先修復再繼續交付

## 相關文件（分類索引；可點連結）

**這一節是不是機器自動寫的？**  
`doc-sync-automation.ps1` 會對**多數**治理 Markdown 自動覆寫底部的「Related」平面清單（來源是 [`docs/change-impact-map.json`](docs/change-impact-map.json) 的連動規則）。那是**「推薦一併留意的檔名列表」**，不是幫你改各檔內文。  
**本檔（`agency-os/README.md`）已從該自動覆寫排除**，改由人維護下面**分類＋連結**，避免長平面清單洗版；你改治理文件時仍應對照 `change-impact-map.json` 與 [`docs/CHANGE_IMPACT_MATRIX.md`](docs/CHANGE_IMPACT_MATRIX.md)。

### Monorepo 與龍蝦路由

- [monorepo 根 README](../README.md)
- [龍蝦 MCP 路由規格](../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)
- [龍蝦路由矩陣](../lobster-factory/docs/ROUTING_MATRIX.md)

### Cursor 專案規則（版控）

- [00-session-bootstrap](.cursor/rules/00-session-bootstrap.mdc)
- [10-memory-maintenance](.cursor/rules/10-memory-maintenance.mdc)
- [20-doc-sync-closeout](.cursor/rules/20-doc-sync-closeout.mdc)
- [30-resume-keyword](.cursor/rules/30-resume-keyword.mdc)
- [40-shutdown-closeout](.cursor/rules/40-shutdown-closeout.mdc)

### 人讀總則與文件樹

- [AGENTS.md](AGENTS.md)
- [docs 總索引](docs/README.md)
- [變更連動矩陣](docs/CHANGE_IMPACT_MATRIX.md)

### 架構

- [總控中心 v1](docs/architecture/agency-command-center-v1.md)
- [多平台交付架構](docs/architecture/multi-platform-delivery-architecture.md)

### 合規與跨境

- [leads／抓取合規](docs/compliance/leads-and-scraping-checklist.md)
- [國際合規基線](docs/international/global-compliance-baseline.md)
- [跨時區交付模型](docs/international/global-delivery-model.md)
- [多幣別商務政策](docs/international/multi-currency-commercial-policy.md)

### 營運（docs/operations）

- [客戶風險評分](docs/operations/client-risk-scoring-model.md)
- [Cursor MCP 與外掛 inventory](docs/operations/cursor-mcp-and-plugin-inventory.md)
- [端到端連動 Checklist](docs/operations/end-to-end-linkage-checklist.md)
- [外包評分卡](docs/operations/outsourcing-vendor-scorecard.md)
- [系統守護與通知](docs/operations/system-guard-and-notification.md)
- [系統操作 SOP](docs/operations/system-operation-sop.md)
- [租戶排程](docs/operations/tenant-scheduling.md)

### 介紹、指標、產品、品質、發布、銷售、標準、範本

- [Agency OS 完整介紹](docs/overview/agency-os-complete-system-introduction.md)
- [KPI 毛利儀表規格](docs/metrics/kpi-margin-dashboard-spec.md)
- [可販售產品化藍圖](docs/product/resell-package-blueprint.md)
- [交付品質放行關卡](docs/quality/delivery-qa-gate.md)
- [版本發布紀錄](docs/releases/release-notes.md)
- [升級路徑](docs/releases/upgrade-path.md)
- [遷移檢查清單](docs/releases/migration-checklist.md)
- [服務方案標準](docs/sales/service-packages-standard.md)
- [n8n 工作流架構](docs/standards/n8n-workflow-architecture.md)
- [WordPress 客製開發準則](docs/standards/wordpress-custom-dev-guidelines.md)
- [MSA 範本](docs/templates/msa-template.md)

### 租戶與新客戶

- [新租戶 Onboarding SOP](tenants/NEW_TENANT_ONBOARDING_SOP.md)
- [租戶範本 01 總司令指南](tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md)
- [租戶範本 02 客戶工作區](tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md)
- [租戶範本 03 工具設定](tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md)
- [租戶範本 04 營運自動化](tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md)


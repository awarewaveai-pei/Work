# Agency OS v1

這是一套給多客戶網站建置、客製系統、維運與行銷整合的營運框架。

與 **Lobster Factory** 同庫時，monorepo 總覽見上層 [`../README.md`](../README.md)（含 `verify-build-gates`、龍蝦 README 入口）。  
**整體公司 OS**：四份規格原文在上層 [`../docs/spec/README.md`](../docs/spec/README.md)；**四份怎麼整合、先讀誰** 見本目錄 [`docs/overview/company-os-four-sources-integration.md`](docs/overview/company-os-four-sources-integration.md)；**V3 §三 跳行表** 見 [`docs/overview/company-os-twenty-modules.md`](docs/overview/company-os-twenty-modules.md)。

## 每天開工必看（固定開工卡）
- **總入口**：`docs/overview/ao-lobster-operating-model.md`
- **開工事件 SSOT**：`docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- **收工事件 SSOT**：`docs/operations/end-of-day-checklist.md`
- **工具交付一頁追溯（顯眼入口）**：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- **關鍵字規則**：`.cursor/rules/30-resume-keyword.mdc`、`.cursor/rules/40-shutdown-closeout.mdc`
- **今日主線真相**：`TASKS.md`
- **統整報告**：`reports/status/integrated-status-LATEST.md`（說明：`docs/overview/INTEGRATED_STATUS_REPORT.md`）

## AO + 龍蝦工程圖（首頁）

- 單一真相（SSOT）：`docs/overview/ao-lobster-operating-model.md#4-ao--lobster-event-flow-mermaid`
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

## 核心文件
- **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**：**他處電腦／公司機開機與 pull 後須知**（**§1.5** 新機最短序列、**§2** 例行；與 `RESUME_AFTER_REBOOT.md` 同列必讀）
- `AGENTS.md`: AI 協作規則
- `BOOTSTRAP.md`: 新環境初始化清單
- `TASKS.md`: 全域任務看板
- `WORKLOG.md`: 執行日誌與決策紀錄
- `docs/operations/finance-operations.md`: 報價、收款、毛利流程
- `docs/operations/outsourcing-playbook.md`: 外包協作與驗收機制
- `docs/operations/incident-response-runbook.md`: 資安與故障事件應變
- `docs/operations/scope-change-policy.md`: 客戶邊界與變更單制度
- `docs/operations/security-secrets-policy.md`: 憑證與密鑰管理政策
- `docs/operations/local-secrets-vault-dpapi.md`: 本機免費祕密庫（Windows DPAPI）
- `docs/operations/mcp-add-server-quickstart.md`: MCP 新增快速手冊（常用）
- **`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`**：長期營運紀律（30 年級；可驗證、Single Owner、ADR 與節奏）
- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`: WordPress **雙模式交付 SOP**（既有站接手 + 新站從零，雲端 staging 優先）
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`: Next-Gen 升級藍圖（M1/M2/M3、驗收標準、風險對策）
- **`docs/operations/cursor-mcp-and-plugin-inventory.md`**: Cursor **MCP／外掛** 與龍蝦 Routing 對照（**建議與根目錄 `mcp.json` 同步維護**）
- **`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`**: 工具分工 ↔ 強制路由 ↔ `TASKS.md` 一頁追溯（避免三份文件各說各話）
- **`docs/operations/cursor-enterprise-rules-index.md`**: **Cursor 企業級 IDE 規則（版控）** — `63`–`66` `.mdc` 與 SSOT 導覽（與 `AO-RESUME`／`AO-CLOSE` 流程衝突時以 `00`／`30`／`40` 規則為準）
- **`docs/operations/airtable-to-supabase-migration-playbook.md`**: **Airtable 停用後**功能如何落到 **Supabase**（建模、RLS、匯入、n8n 改接）
- `docs/operations/tools-and-integrations.md`: 整合工具與環境變數規範

## 事件流程單一真相（避免重複維護）
- **開工事件（AO-RESUME）**：`docs/overview/REMOTE_WORKSTATION_STARTUP.md`（含 Git 對齊 + 30 秒自檢）
- **收工事件（AO-CLOSE）**：`docs/operations/end-of-day-checklist.md`（操作） + `.cursor/rules/40-shutdown-closeout.mdc`（規則）
- **原則**：其他文件只放入口連結與一句摘要，不再維護第二套完整命令
- **跨系統運作模型（AO + 龍蝦）**：`docs/overview/ao-lobster-operating-model.md`

## Docs 分類入口
- `docs/README.md`: 文件分層總索引
- `docs/overview/agency-os-complete-system-introduction.md`: 完整系統介紹（總司令/客戶/團隊導讀）
- **`docs/overview/company-os-twenty-modules.md`**: **Company OS 20 模組**一頁導覽（連到 `docs/spec/raw` 原文 §三；非程式功能，僅文件索引）
- `docs/CHANGE_IMPACT_MATRIX.md`: 變更連動矩陣（改一份時要同步哪些）
- `docs/architecture/agency-command-center-v1.md`: 總控中心完整架構
- `docs/architecture/multi-platform-delivery-architecture.md`: WordPress-first 多平台架構
- `docs/operations/system-operation-sop.md`: 全系統操作 SOP
- `docs/operations/tenant-scheduling.md`: 每公司自動排程與執行
- `docs/operations/system-guard-and-notification.md`: 關機前/每日主動守護與告知
- `docs/operations/end-to-end-linkage-checklist.md`: 全鏈路連動檢查清單
- `docs/operations/client-risk-scoring-model.md`: 客戶風險評分模型
- `docs/operations/outsourcing-vendor-scorecard.md`: 外包評分卡
- `docs/quality/delivery-qa-gate.md`: 交付品質放行關卡
- `docs/international/global-delivery-model.md`: 跨時區交付模型
- `docs/international/global-compliance-baseline.md`: 國際合規與資安基線
- `docs/international/multi-currency-commercial-policy.md`: 多幣別商務與收款政策
- `docs/sales/service-packages-standard.md`: 服務方案標準
- `docs/sales/cr-pricing-rules.md`: CR 核價規則
- `docs/templates/msa-template.md`
- `docs/templates/sow-template.md`
- `docs/templates/cr-template.md`
- `docs/standards/wordpress-custom-dev-guidelines.md`
- `docs/standards/n8n-workflow-architecture.md`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/product/resell-package-blueprint.md`: 可販售產品化藍圖
- `docs/product/buyer-handover-checklist.md`: 買方交接驗收清單
- `docs/product/templates/proposal-template-en.md`: 英文化提案模板
- `docs/product/templates/sow-template-en.md`: 英文化 SOW 模板
- `docs/product/templates/monthly-report-template-en.md`: 英文化月報模板
- `docs/compliance/leads-and-scraping-checklist.md`: leads/抓取合規檢查清單
- `docs/releases/release-notes.md`: 版本發布紀錄
- `docs/releases/upgrade-path.md`: 升級路徑
- `docs/releases/migration-checklist.md`: 遷移檢查清單

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

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `../README.md`
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/10-memory-maintenance.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `AGENTS.md`
- `docs/architecture/agency-command-center-v1.md`
- `docs/architecture/multi-platform-delivery-architecture.md`
- `docs/compliance/leads-and-scraping-checklist.md`
- `docs/international/global-compliance-baseline.md`
- `docs/international/global-delivery-model.md`
- `docs/international/multi-currency-commercial-policy.md`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/client-risk-scoring-model.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/end-to-end-linkage-checklist.md`
- `docs/operations/outsourcing-vendor-scorecard.md`
- `docs/operations/system-guard-and-notification.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/tenant-scheduling.md`
- `docs/overview/agency-os-complete-system-introduction.md`
- `docs/product/resell-package-blueprint.md`
- `docs/quality/delivery-qa-gate.md`
- `docs/releases/release-notes.md`
- `docs/releases/upgrade-path.md`
- `docs/sales/service-packages-standard.md`
- `docs/standards/n8n-workflow-architecture.md`
- `docs/standards/wordpress-custom-dev-guidelines.md`
- `docs/templates/msa-template.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md`
- `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md`
- `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md`
- `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md`

_Last synced: 2026-04-09 09:38:17 UTC_


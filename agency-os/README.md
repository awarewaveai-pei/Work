# Agency OS v1

多客戶網站建置、客製系統、維運與行銷整合的營運框架。

**連結**：在編輯器內 **Ctrl+Click**（Mac：**Cmd+Click**）開檔。下表**連結文字即檔名**（不含路徑）；檔案若在子資料夾，路徑仍由連結目標決定。

| 內容 | 檔案 |
|:---|:---|
| Monorepo 總覽（閘道、龍蝦入口） | [README.md](../README.md) |
| 規格原文區 | [README.md](../docs/spec/README.md) |
| 四份規格怎麼整合 | [company-os-four-sources-integration.md](docs/overview/company-os-four-sources-integration.md) |
| V3 二十模組跳行表 | [company-os-twenty-modules.md](docs/overview/company-os-twenty-modules.md) |

---

## 文件導覽（三入口）

| 導覽 | 檔案 |
|:---|:---|
| 整棵 `docs/` 地圖 | [README.md](docs/README.md)（`docs/` 根） |
| 操作／SOP／Runbook | [README.md](docs/operations/README.md) |
| 全貌／雙機／紀律 | [README.md](docs/overview/README.md) |

---

## 每天開工必看

| 用途 | 檔案 |
|:---|:---|
| AO＋龍蝦總入口 | [ao-lobster-operating-model.md](docs/overview/ao-lobster-operating-model.md) |
| 開工／雙機／ao-resume | [REMOTE_WORKSTATION_STARTUP.md](docs/overview/REMOTE_WORKSTATION_STARTUP.md) |
| 收工／關機 | [end-of-day-checklist.md](docs/operations/end-of-day-checklist.md) |
| 工具／路由／TASKS 一頁 | [TOOLS_DELIVERY_TRACEABILITY.md](docs/operations/TOOLS_DELIVERY_TRACEABILITY.md) |
| AO-RESUME 規則 | [30-resume-keyword.mdc](.cursor/rules/30-resume-keyword.mdc) |
| AO-CLOSE 規則 | [40-shutdown-closeout.mdc](.cursor/rules/40-shutdown-closeout.mdc) |
| 今日主線 | [TASKS.md](TASKS.md) |
| 統整報告（檔） | [integrated-status-LATEST.md](reports/status/integrated-status-LATEST.md) |
| 統整報告（說明） | [INTEGRATED_STATUS_REPORT.md](docs/overview/INTEGRATED_STATUS_REPORT.md) |

---

## AO＋龍蝦工程圖（單一入口）

| 用途 | 檔案 |
|:---|:---|
| 流程圖（錨點） | [ao-lobster-operating-model.md](docs/overview/ao-lobster-operating-model.md#4-ao--lobster-event-flow-mermaid) |

首頁只放入口，不複製圖內容。

---

## 目標

- 同時管理多家公司、多網站，不失控  
- WordPress + Supabase + GitHub + n8n + Replicate + DataForSEO  
- 接案到交付可複製  
- AI 會話先讀記憶，不從空白開始  

---

## 範本目錄（兩種，勿混用）

| 用途 | 位置／檔案 |
|:---|:---|
| 租戶（每家公司複製起點） | `tenants/templates/` → 說明 [README.md](tenants/README.md) |
| 平台堆疊／Woo 範例 | `platform-templates/` → [README.md](platform-templates/README.md) |
| 全庫範本路徑索引 | [repo-template-locations.md](docs/overview/repo-template-locations.md) |

---

## 根目錄與跨庫常用

| 用途 | 檔案 |
|:---|:---|
| AI 協作總則 | [AGENTS.md](AGENTS.md) |
| 新環境初始化 | [BOOTSTRAP.md](BOOTSTRAP.md) |
| 任務看板 | [TASKS.md](TASKS.md) |
| 決策與日誌 | [WORKLOG.md](WORKLOG.md) |
| 重開機後續接 | [RESUME_AFTER_REBOOT.md](RESUME_AFTER_REBOOT.md) |
| 龍蝦路由規格 | [MCP_TOOL_ROUTING_SPEC.md](../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) |
| 龍蝦路由矩陣 | [ROUTING_MATRIX.md](../lobster-factory/docs/ROUTING_MATRIX.md) |
| Cursor 企業規則索引 | [cursor-enterprise-rules-index.md](docs/operations/cursor-enterprise-rules-index.md) |
| MCP／外掛與路由對照 | [cursor-mcp-and-plugin-inventory.md](docs/operations/cursor-mcp-and-plugin-inventory.md) |
| 長期營運紀律 | [LONG_TERM_OPERATING_DISCIPLINE.md](docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md) |

其餘營運／合約／技術文件見下方 **「docs 分類速查」**（與 [README.md](docs/operations/README.md) 同步思路）。

---

## 事件流程（單一真相）

| 事件 | 檔案 |
|:---|:---|
| 開工（AO-RESUME） | [REMOTE_WORKSTATION_STARTUP.md](docs/overview/REMOTE_WORKSTATION_STARTUP.md) |
| 收工（AO-CLOSE） | [end-of-day-checklist.md](docs/operations/end-of-day-checklist.md) + [40-shutdown-closeout.mdc](.cursor/rules/40-shutdown-closeout.mdc) |
| 跨系統運作模型 | [ao-lobster-operating-model.md](docs/overview/ao-lobster-operating-model.md) |

原則：其他文件只保留入口一句，不重複貼全套命令。

---

## docs 分類速查（延伸）

> 與 [README.md](docs/operations/README.md)、[README.md](docs/overview/README.md) 同層整理；此處按 **`docs/` 子資料夾**列檔。**檔名**即連結文字。

### `docs/` 根與連動

| 說明 | 檔案 |
|:---|:---|
| 文件總索引 | [README.md](docs/README.md) |
| 變更連動矩陣 | [CHANGE_IMPACT_MATRIX.md](docs/CHANGE_IMPACT_MATRIX.md) |

### `docs/overview/`

**完整清單**以 [README.md](docs/overview/README.md) 為準（憲章、學習路徑、時程 JSON 等皆在該導覽）。下表僅列最常從首頁點的兩份。

| 說明 | 檔案 |
|:---|:---|
| 完整系統介紹 | [agency-os-complete-system-introduction.md](docs/overview/agency-os-complete-system-introduction.md) |
| 二十模組一頁 | [company-os-twenty-modules.md](docs/overview/company-os-twenty-modules.md) |

### `docs/architecture/`

| 說明 | 檔案 |
|:---|:---|
| 總控中心 | [agency-command-center-v1.md](docs/architecture/agency-command-center-v1.md) |
| 多平台架構 | [multi-platform-delivery-architecture.md](docs/architecture/multi-platform-delivery-architecture.md) |
| 輕量 ADR（目錄與 001–006） | [README.md](docs/architecture/decisions/README.md) |

### `docs/operations/`

**完整清單**以 [README.md](docs/operations/README.md) 為準（Hetzner、GHA、MCP 強化、Production Pilot Runbook、`ONBOARDING_A10_2` 等）。下表為常用子集，避免與導覽重複維護兩份全表。

| 說明 | 檔案 |
|:---|:---|
| 全系統操作 SOP | [system-operation-sop.md](docs/operations/system-operation-sop.md) |
| 租戶排程 | [tenant-scheduling.md](docs/operations/tenant-scheduling.md) |
| 守護與通知 | [system-guard-and-notification.md](docs/operations/system-guard-and-notification.md) |
| 端到端連動檢查 | [end-to-end-linkage-checklist.md](docs/operations/end-to-end-linkage-checklist.md) |
| 客戶風險評分 | [client-risk-scoring-model.md](docs/operations/client-risk-scoring-model.md) |
| 外包評分卡 | [outsourcing-vendor-scorecard.md](docs/operations/outsourcing-vendor-scorecard.md) |
| 財務營運 | [finance-operations.md](docs/operations/finance-operations.md) |
| 外包 Playbook | [outsourcing-playbook.md](docs/operations/outsourcing-playbook.md) |
| 事件應變 | [incident-response-runbook.md](docs/operations/incident-response-runbook.md) |
| 範圍變更 | [scope-change-policy.md](docs/operations/scope-change-policy.md) |
| 祕鑰政策 | [security-secrets-policy.md](docs/operations/security-secrets-policy.md) |
| DPAPI vault | [local-secrets-vault-dpapi.md](docs/operations/local-secrets-vault-dpapi.md) |
| MCP 新增步驟 | [mcp-add-server-quickstart.md](docs/operations/mcp-add-server-quickstart.md) |
| WP 交付模型 | [WORDPRESS_CLIENT_DELIVERY_MODELS.md](docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md) |
| Next-Gen 藍圖 | [NEXT_GEN_DELIVERY_BLUEPRINT_V1.md](docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md) |
| Airtable→Supabase | [airtable-to-supabase-migration-playbook.md](docs/operations/airtable-to-supabase-migration-playbook.md) |
| 工具整合總表 | [tools-and-integrations.md](docs/operations/tools-and-integrations.md) |

### `docs/quality/`

| 說明 | 檔案 |
|:---|:---|
| 交付放行關卡 | [delivery-qa-gate.md](docs/quality/delivery-qa-gate.md) |

### `docs/international/`

| 說明 | 檔案 |
|:---|:---|
| 跨時區交付 | [global-delivery-model.md](docs/international/global-delivery-model.md) |
| 國際合規基線 | [global-compliance-baseline.md](docs/international/global-compliance-baseline.md) |
| 多幣別商務 | [multi-currency-commercial-policy.md](docs/international/multi-currency-commercial-policy.md) |

### `docs/sales/`

| 說明 | 檔案 |
|:---|:---|
| 服務方案標準 | [service-packages-standard.md](docs/sales/service-packages-standard.md) |
| CR 核價 | [cr-pricing-rules.md](docs/sales/cr-pricing-rules.md) |

### `docs/templates/`

| 說明 | 檔案 |
|:---|:---|
| MSA | [msa-template.md](docs/templates/msa-template.md) |
| SOW | [sow-template.md](docs/templates/sow-template.md) |
| CR | [cr-template.md](docs/templates/cr-template.md) |

### `docs/standards/`

| 說明 | 檔案 |
|:---|:---|
| WordPress 客製準則 | [wordpress-custom-dev-guidelines.md](docs/standards/wordpress-custom-dev-guidelines.md) |
| n8n 架構 | [n8n-workflow-architecture.md](docs/standards/n8n-workflow-architecture.md) |

### `docs/metrics/`

| 說明 | 檔案 |
|:---|:---|
| KPI 毛利儀表 | [kpi-margin-dashboard-spec.md](docs/metrics/kpi-margin-dashboard-spec.md) |

### `docs/product/`

| 說明 | 檔案 |
|:---|:---|
| 可販售藍圖 | [resell-package-blueprint.md](docs/product/resell-package-blueprint.md) |
| 買方交接 | [buyer-handover-checklist.md](docs/product/buyer-handover-checklist.md) |
| 英文化提案 | [proposal-template-en.md](docs/product/templates/proposal-template-en.md) |
| 英文化 SOW | [sow-template-en.md](docs/product/templates/sow-template-en.md) |
| 英文化月報 | [monthly-report-template-en.md](docs/product/templates/monthly-report-template-en.md) |

### `docs/compliance/`

| 說明 | 檔案 |
|:---|:---|
| leads／抓取合規 | [leads-and-scraping-checklist.md](docs/compliance/leads-and-scraping-checklist.md) |

### `docs/releases/`

| 說明 | 檔案 |
|:---|:---|
| 發布紀錄 | [release-notes.md](docs/releases/release-notes.md) |
| 升級路徑 | [upgrade-path.md](docs/releases/upgrade-path.md) |
| 遷移檢查 | [migration-checklist.md](docs/releases/migration-checklist.md) |

### `tenants/`

| 說明 | 檔案 |
|:---|:---|
| 租戶總覽 | [README.md](tenants/README.md) |
| 新租戶 SOP | [NEW_TENANT_ONBOARDING_SOP.md](tenants/NEW_TENANT_ONBOARDING_SOP.md) |
| 範本 01～04 | [01_COMMANDER_SYSTEM_GUIDE.md](tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md)、[02_CLIENT_WORKSPACE_GUIDE.md](tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md)、[03_TOOLS_CONFIGURATION_GUIDE.md](tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md)、[04_OPERATIONS_AUTOMATION_GUIDE.md](tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md) |

---

## 另見（本檔不跑 doc-sync Related 覆寫）

`doc-sync-automation.ps1` 對多數治理檔會自動寫「Related」清單（來自 [change-impact-map.json](docs/change-impact-map.json)）；**本 README 排除在外**，由人手維護上表。改治理時仍應對照 [CHANGE_IMPACT_MATRIX.md](docs/CHANGE_IMPACT_MATRIX.md)。

| 用途 | 檔案 |
|:---|:---|
| Cursor 00 啟動 | [00-session-bootstrap.mdc](.cursor/rules/00-session-bootstrap.mdc) |
| Cursor 10 記憶 | [10-memory-maintenance.mdc](.cursor/rules/10-memory-maintenance.mdc) |
| Cursor 20 doc-sync | [20-doc-sync-closeout.mdc](.cursor/rules/20-doc-sync-closeout.mdc) |
| 龍蝦工廠入口 | [README.md](../lobster-factory/README.md) |

---

## 自動同步與結案檢查

- 一次：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
- 持續：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -Watch`
- 報告：`reports/closeout/closeout-*.md`
- 狀態：`.agency-state/doc-sync-state.json`

## 系統健康檢查

- `powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`
- 報告：`reports/health/health-*.md`
- 目標與 `AGENTS.md`／`AO-CLOSE` 一致：**100%**、Critical Gate PASS

## 報告歸檔

- 預覽：`powershell -ExecutionPolicy Bypass -File .\scripts\archive-old-reports.ps1 -KeepDays 30`
- 套用：`powershell -ExecutionPolicy Bypass -File .\scripts\archive-old-reports.ps1 -KeepDays 30 -Apply`

## 主動守護與告警

- 手動：`powershell -ExecutionPolicy Bypass -File .\scripts\system-guard.ps1 -Mode manual`
- 註冊排程：`powershell -ExecutionPolicy Bypass -File .\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1 -DailyTime 22:30`
- Autopilot Phase1：`powershell -ExecutionPolicy Bypass -File .\scripts\register-autopilot-phase1.ps1`（`-RemoveOnly` 停用）
- 登出 closeout：同上腳本加 `-EnableLogoffCloseout`（`-EnablePushOnLogoff` 才 push）
- Startup fallback：`powershell -ExecutionPolicy Bypass -File .\scripts\install-autopilot-startup-fallback.ps1`
- Slack：`AGENCY_OS_SLACK_WEBHOOK_URL` + `scripts/notify-ops.ps1`
- 狀態：[LAST_SYSTEM_STATUS.md](LAST_SYSTEM_STATUS.md)；告警：`ALERT_REQUIRED.txt`

## 對外販售打包

- `powershell -ExecutionPolicy Bypass -File .\scripts\build-product-bundle.ps1` → `dist/agency-os-bundle-*.zip`

## 每公司自動排程

- 設定：`tenants/<company>/OPERATIONS_SCHEDULE.json`、`OPS_QUEUE.json`
- 引擎：`automation/TENANT_AUTOMATION_RUNNER.ps1`；註冊：`automation/REGISTER_TENANT_TASKS.ps1`；加單：`automation/ENQUEUE_TENANT_TASK.ps1`
- 紀錄：`reports/automation/<company>/`

## 記憶與規則（其餘 .mdc）

| 檔案 | 用途 |
|:---|:---|
| [CONVERSATION_MEMORY.md](memory/CONVERSATION_MEMORY.md) | 跨會話摘要 |
| [SESSION_TEMPLATE.md](memory/SESSION_TEMPLATE.md) | 摘要模板 |

（`00`–`40` 規則見上表「另見」與「每天開工」。）

## 接案模板套裝

| 檔案 |
|:---|
| [00_MASTER_CHECKLIST.md](project-kit/00_MASTER_CHECKLIST.md) |
| [10_DISCOVERY.md](project-kit/10_DISCOVERY.md) |
| [20_BUILD_AND_CUSTOM_SYSTEM.md](project-kit/20_BUILD_AND_CUSTOM_SYSTEM.md) |
| [30_LAUNCH_AND_HANDOVER.md](project-kit/30_LAUNCH_AND_HANDOVER.md) |
| [40_OPERATE_AND_GROWTH.md](project-kit/40_OPERATE_AND_GROWTH.md) |

## 建議工作方式

1. 新客戶：[NEW_TENANT_ONBOARDING_SOP.md](tenants/NEW_TENANT_ONBOARDING_SOP.md)  
2. 新案：複製 `project-kit/`  
3. 會議後：[WORKLOG.md](WORKLOG.md)、[TASKS.md](TASKS.md)  
4. 里程碑：[CONVERSATION_MEMORY.md](memory/CONVERSATION_MEMORY.md)  
5. 範圍變更：[scope-change-policy.md](docs/operations/scope-change-policy.md)、[cr-pricing-rules.md](docs/sales/cr-pricing-rules.md)  
6. 改治理：[CHANGE_IMPACT_MATRIX.md](docs/CHANGE_IMPACT_MATRIX.md)  
7. 改版前：`scripts/doc-sync-automation.ps1`  
8. 見 `ALERT_REQUIRED.txt` 先修再交付  

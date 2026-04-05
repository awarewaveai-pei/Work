# Change Impact Matrix

## 使用方式
- 修改任一主文件時，必須同步檢查對應關聯文件
- 未完成關聯更新，不得視為任務完成
- 自動同步命令：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
- 持續監看模式：`powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -Watch`

| 主文件 | 必查/必同步文件 |
|---|---|
| `docs/architecture/agency-command-center-v1.md` | `docs/architecture/multi-platform-delivery-architecture.md`, `docs/operations/system-operation-sop.md`, `docs/operations/tenant-scheduling.md`, `README.md`, `TASKS.md` |
| `docs/architecture/multi-platform-delivery-architecture.md` | `docs/standards/wordpress-custom-dev-guidelines.md`, `docs/operations/end-to-end-linkage-checklist.md`, `README.md` |
| `docs/overview/agency-os-complete-system-introduction.md` | `README.md`, `docs/README.md`, `tenants/company-a/01_COMMANDER_SYSTEM_GUIDE.md`, `tenants/company-a/02_CLIENT_WORKSPACE_GUIDE.md`, `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md`, `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md` |
| `docs/operations/system-operation-sop.md` | `README.md`, `AGENTS.md`, `TASKS.md`, `WORKLOG.md` |
| `docs/operations/client-risk-scoring-model.md` | `docs/metrics/kpi-margin-dashboard-spec.md`, `docs/product/templates/monthly-report-template-en.md`, `README.md`, `TASKS.md` |
| `docs/operations/outsourcing-vendor-scorecard.md` | `docs/operations/outsourcing-playbook.md`, `README.md`, `TASKS.md` |
| `docs/operations/tenant-scheduling.md` | `README.md`, `tenants/README.md`, `tenants/NEW_TENANT_ONBOARDING_SOP.md`, `automation/README.md` |
| `docs/operations/system-guard-and-notification.md` | `README.md`, `AGENTS.md`, `RESUME_AFTER_REBOOT.md`, `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`, `scripts/system-guard.ps1` |
| `docs/operations/end-to-end-linkage-checklist.md` | `scripts/system-guard.ps1`, `scripts/system-health-check.ps1`, `scripts/doc-sync-automation.ps1`, `README.md` |
| `docs/international/global-delivery-model.md` | `docs/international/global-compliance-baseline.md`, `docs/international/multi-currency-commercial-policy.md`, `docs/operations/tenant-scheduling.md`, `README.md` |
| `docs/international/global-compliance-baseline.md` | `docs/operations/security-secrets-policy.md`, `docs/operations/incident-response-runbook.md`, `README.md` |
| `docs/international/multi-currency-commercial-policy.md` | `docs/operations/finance-operations.md`, `docs/metrics/kpi-margin-dashboard-spec.md`, `README.md` |
| `docs/sales/service-packages-standard.md` | `docs/operations/finance-operations.md`, `docs/sales/cr-pricing-rules.md`, `README.md` |
| `docs/sales/cr-pricing-rules.md` | `docs/operations/scope-change-policy.md`, `docs/templates/cr-template.md`, 專案 `01_SCOPE_AND_CR.md` |
| `docs/quality/delivery-qa-gate.md` | `project-kit/20_BUILD_AND_CUSTOM_SYSTEM.md`, `project-kit/30_LAUNCH_AND_HANDOVER.md`, `README.md` |
| `docs/compliance/leads-and-scraping-checklist.md` | `docs/international/global-compliance-baseline.md`, `README.md`, `TASKS.md` |
| `docs/product/resell-package-blueprint.md` | `docs/product/buyer-handover-checklist.md`, `README.md`, `scripts/build-product-bundle.ps1` |
| `docs/releases/release-notes.md` | `docs/releases/upgrade-path.md`, `docs/releases/migration-checklist.md`, `README.md`, `WORKLOG.md` |
| `docs/releases/upgrade-path.md` | `docs/releases/migration-checklist.md`, `scripts/system-health-check.ps1`, `scripts/system-guard.ps1`, `README.md` |
| `docs/templates/msa-template.md` | `docs/templates/sow-template.md`, `docs/templates/cr-template.md`, `README.md` |
| `docs/standards/wordpress-custom-dev-guidelines.md` | 專案 `02_EXECUTION_PLAN.md`, `03_HANDOVER_CRITERIA.md` |
| `docs/standards/n8n-workflow-architecture.md` | `docs/operations/tools-and-integrations.md`, 專案自動化文件、`README.md` |
| `docs/metrics/kpi-margin-dashboard-spec.md` | `FINANCIAL_LEDGER.md`, `TASKS.md`, `WORKLOG.md` |
| `tenants/NEW_TENANT_ONBOARDING_SOP.md` | `tenants/README.md`, `tenants/templates/tenant-template/01-04 guides`, `tenants/company-a/01-04 guides`, `README.md`, `TASKS.md`, `WORKLOG.md` |
| `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md` | `tenants/company-a/01_COMMANDER_SYSTEM_GUIDE.md`, `tenants/README.md`, `README.md` |
| `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md` | `tenants/company-a/02_CLIENT_WORKSPACE_GUIDE.md`, `tenants/README.md`, `README.md` |
| `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md` | `tenants/company-a/03_TOOLS_CONFIGURATION_GUIDE.md`, `tenants/README.md`, `README.md`, `docs/operations/tools-and-integrations.md` |
| `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md` | `tenants/company-a/04_OPERATIONS_AUTOMATION_GUIDE.md`, `tenants/README.md`, `README.md`, `docs/operations/tenant-scheduling.md`, `automation/README.md` |
| `.cursor/rules/00-session-bootstrap.mdc` | `AGENTS.md`, `README.md`, `memory/CONVERSATION_MEMORY.md`, `TASKS.md`, `WORKLOG.md` |
| `.cursor/rules/10-memory-maintenance.mdc` | `AGENTS.md`, `memory/CONVERSATION_MEMORY.md`, `README.md` |
| `.cursor/rules/20-doc-sync-closeout.mdc` | `AGENTS.md`, `README.md`, `scripts/doc-sync-automation.ps1`, `TASKS.md`, `WORKLOG.md` |
| `.cursor/rules/30-resume-keyword.mdc` | `AGENTS.md`, `README.md`, `memory/CONVERSATION_MEMORY.md`, `TASKS.md`, `WORKLOG.md`, `LAST_SYSTEM_STATUS.md` |
| `.cursor/rules/40-shutdown-closeout.mdc` | `AGENTS.md`, `README.md`, `TASKS.md`, `WORKLOG.md`, `memory/CONVERSATION_MEMORY.md`, `scripts/doc-sync-automation.ps1`, `scripts/system-health-check.ps1`, `scripts/system-guard.ps1` |

## 最小同步清單（每次改版）
- [ ] `README.md` 路徑與入口已更新
- [ ] `TASKS.md` 狀態已同步
- [ ] `WORKLOG.md` 決策已記錄
- [ ] 必要時更新 `memory/CONVERSATION_MEMORY.md`

## 自動化輸出
- `reports/closeout/closeout-*.md`：每次自動產生結案檢查報告
- `.agency-state/doc-sync-state.json`：記錄上次同步時間與受影響文件

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
| `docs/overview/agency-os-complete-system-introduction.md` | `README.md`, `docs/README.md`, `tenants/company-p1-pilot/01_COMMANDER_SYSTEM_GUIDE.md`, `tenants/company-p1-pilot/02_CLIENT_WORKSPACE_GUIDE.md`, `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md`, `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md` |
| `docs/overview/EXECUTION_DASHBOARD.md` | `docs/overview/REMOTE_WORKSTATION_STARTUP.md`, `docs/overview/INTEGRATED_STATUS_REPORT.md`, `docs/operations/end-of-day-checklist.md`, `memory/CONVERSATION_MEMORY.md`, `AGENTS.md`, `RESUME_AFTER_REBOOT.md` |
| `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md` | `AGENTS.md`, `README.md`, `docs/README.md`, `docs/overview/repo-template-locations.md`, `docs/architecture/decisions/README.md`, `tenants/templates/core/RELEASE_GATES_CHECKLIST.md`（§ 編號／Related）, `memory/CONVERSATION_MEMORY.md`, `TASKS.md`（若節奏表與 Next 對齊時）, `WORKLOG.md` |
| `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md` | `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`, `README.md`, `docs/README.md`, `TASKS.md`, `WORKLOG.md` |
| `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md` | `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`, `README.md`, `docs/README.md`, `TASKS.md`, `WORKLOG.md` |
| `docs/architecture/decisions/README.md` | `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`, `docs/CHANGE_IMPACT_MATRIX.md`（若新增 ADR 影響治理時）, `WORKLOG.md` |
| `platform-templates/README.md` | `docs/overview/repo-template-locations.md`, `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`, `platform-templates/SSOT_LINKS.md`, `platform-templates/SYNC_EXAMPLES_FROM_LOBSTER.md`, `platform-templates/client-base/README.md`, `platform-templates/woocommerce/manifests/README.md`, `WORKLOG.md` |
| `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md` | `docs/architecture/decisions/README.md`, `docs/overview/repo-template-locations.md`, `platform-templates/README.md`, `docs/operations/ecommerce-project-playbook.md`, `../lobster-factory/README.md`, `../lobster-factory/docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md`（敘述衝突時）, `docs/architecture/decisions/003-no-automated-manifest-dual-sync.md`, `WORKLOG.md` |
| `docs/architecture/decisions/002-clerk-identity-boundary.md` | `docs/architecture/decisions/README.md`, `docs/operations/security-secrets-policy.md`, `docs/operations/cursor-mcp-and-plugin-inventory.md`, `TASKS.md`, `docs/overview/PROGRAM_TIMELINE.md`, `WORKLOG.md`, `memory/CONVERSATION_MEMORY.md` |
| `docs/architecture/decisions/003-no-automated-manifest-dual-sync.md` | `docs/architecture/decisions/README.md`, `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`, `docs/overview/repo-template-locations.md`, `platform-templates/README.md`, `WORKLOG.md` |
| `docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md` | `docs/architecture/decisions/README.md`, `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `docs/operations/cursor-mcp-and-plugin-inventory.md`, `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`, `WORKLOG.md` |
| `docs/architecture/decisions/005-supabase-sor-vs-wordpress-runtime-db.md` | `docs/architecture/decisions/README.md`, `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `docs/operations/security-secrets-policy.md`, `tenants/templates/core/ENVIRONMENT_REGISTRY.md`, `docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md`, `WORKLOG.md` |
| `docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md` | `docs/architecture/decisions/README.md`, `docs/architecture/decisions/002-clerk-identity-boundary.md`, `docs/architecture/decisions/005-supabase-sor-vs-wordpress-runtime-db.md`, `../lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`, `docs/operations/security-secrets-policy.md`, `WORKLOG.md` |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `docs/overview/EXECUTION_DASHBOARD.md`, `docs/overview/INTEGRATED_STATUS_REPORT.md`, `RESUME_AFTER_REBOOT.md`, `docs/operations/end-of-day-checklist.md`, `AGENTS.md`, `memory/CONVERSATION_MEMORY.md`, `TASKS.md`, `../README.md`（monorepo 根；§1.5／§2／雙機敘述變更時必查）, `.cursor/rules/00-session-bootstrap.mdc`, `.cursor/rules/30-resume-keyword.mdc`, `.cursor/rules/40-shutdown-closeout.mdc`（**改 REMOTE 的開收工順序／§ 分工時必查**；並與 monorepo 根 `../.cursor/rules/` **同名檔鏡像對齊**，避免根與 `agency-os` 載入規則分叉） |
| `docs/overview/INTEGRATED_STATUS_REPORT.md` | `docs/overview/EXECUTION_DASHBOARD.md`, `docs/overview/REMOTE_WORKSTATION_STARTUP.md`, `scripts/generate-integrated-status-report.ps1`, `reports/status/integrated-status-LATEST.md` |
| `docs/operations/system-operation-sop.md` | `README.md`, `AGENTS.md`, `TASKS.md`, `WORKLOG.md` |
| `docs/operations/client-risk-scoring-model.md` | `docs/metrics/kpi-margin-dashboard-spec.md`, `docs/product/templates/monthly-report-template-en.md`, `README.md`, `TASKS.md` |
| `docs/operations/outsourcing-vendor-scorecard.md` | `docs/operations/outsourcing-playbook.md`, `README.md`, `TASKS.md` |
| `docs/operations/tenant-scheduling.md` | `README.md`, `tenants/README.md`, `tenants/NEW_TENANT_ONBOARDING_SOP.md`, `automation/README.md` |
| `docs/operations/system-guard-and-notification.md` | `README.md`, `AGENTS.md`, `RESUME_AFTER_REBOOT.md`, `automation/REGISTER_SYSTEM_GUARD_TASKS.ps1`, `scripts/system-guard.ps1` |
| `docs/operations/end-to-end-linkage-checklist.md` | `docs/operations/new-doc-linkage-checklist.md`, `scripts/system-guard.ps1`, `scripts/system-health-check.ps1`, `scripts/doc-sync-automation.ps1`, `README.md` |
| `docs/operations/new-doc-linkage-checklist.md` | `docs/operations/end-to-end-linkage-checklist.md`, `docs/operations/cursor-enterprise-rules-index.md`, `docs/CHANGE_IMPACT_MATRIX.md`, `docs/change-impact-map.json`, `docs/README.md`, `scripts/register-new-governance-doc.ps1`, `scripts/doc-sync-automation.ps1`, `scripts/system-health-check.ps1` |
| `AGENTS.md` | `docs/operations/new-doc-linkage-checklist.md`, `docs/operations/cursor-enterprise-rules-index.md`, `docs/CHANGE_IMPACT_MATRIX.md`, `scripts/register-new-governance-doc.ps1`, `README.md` |
| `scripts/register-new-governance-doc.ps1` | `docs/operations/new-doc-linkage-checklist.md`, `docs/change-impact-map.json`, `docs/CHANGE_IMPACT_MATRIX.md`, `AGENTS.md` |
| `docs/operations/cursor-enterprise-rules-index.md` | `AGENTS.md`, `docs/operations/cursor-mcp-and-plugin-inventory.md`, `docs/operations/new-doc-linkage-checklist.md`, `docs/operations/security-secrets-policy.md`, `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `../lobster-factory/docs/ROUTING_MATRIX.md`, `.cursor/rules/63-cursor-core-identity-risk.mdc`, `.cursor/rules/64-architecture-mcp-routing.mdc`, `.cursor/rules/65-build-standards-data-state.mdc`, `.cursor/rules/66-skills-observability-protocol.mdc`, `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md`, `docs/CHANGE_IMPACT_MATRIX.md`, `docs/change-impact-map.json`, `docs/README.md`, `../README.md` |
| `../README.md`（monorepo 根） | `docs/operations/cursor-enterprise-rules-index.md`, `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`, `agency-os/docs/overview/EXECUTION_DASHBOARD.md` |
| `docs/operations/cursor-mcp-and-plugin-inventory.md` | `docs/operations/cursor-enterprise-rules-index.md`, `docs/operations/tools-and-integrations.md`, `.cursor/rules/64-architecture-mcp-routing.mdc`, `AGENTS.md`, `TASKS.md`, `README.md`, `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `../lobster-factory/docs/ROUTING_MATRIX.md` |
| `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | `../lobster-factory/docs/ROUTING_MATRIX.md`, `docs/operations/cursor-mcp-and-plugin-inventory.md`, `docs/operations/cursor-enterprise-rules-index.md`, `TASKS.md`, `README.md` |
| `../lobster-factory/docs/ROUTING_MATRIX.md` | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `docs/operations/cursor-mcp-and-plugin-inventory.md`, `docs/operations/cursor-enterprise-rules-index.md`, `TASKS.md`, `README.md` |
| `.cursor/rules/63-cursor-core-identity-risk.mdc` | `docs/operations/cursor-enterprise-rules-index.md`, `AGENTS.md` |
| `.cursor/rules/64-architecture-mcp-routing.mdc` | `docs/operations/cursor-enterprise-rules-index.md`, `docs/operations/cursor-mcp-and-plugin-inventory.md`, `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `../lobster-factory/docs/ROUTING_MATRIX.md`, `docs/operations/security-secrets-policy.md` |
| `.cursor/rules/65-build-standards-data-state.mdc` | `docs/operations/cursor-enterprise-rules-index.md` |
| `.cursor/rules/66-skills-observability-protocol.mdc` | `docs/operations/cursor-enterprise-rules-index.md`, `.cursor/rules/62-progress-heartbeat-15min.mdc` |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `docs/operations/cursor-enterprise-rules-index.md`, `.cursor/rules/63-cursor-core-identity-risk.mdc`, `.cursor/rules/64-architecture-mcp-routing.mdc`, `.cursor/rules/65-build-standards-data-state.mdc`, `.cursor/rules/66-skills-observability-protocol.mdc` |
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
| `tenants/NEW_TENANT_ONBOARDING_SOP.md` | `tenants/README.md`, `tenants/templates/tenant-template/01-04 guides`, `tenants/templates/core/DEPARTMENT_CLUSTER_CATALOG.md`, `tenants/templates/core/DEPARTMENT_SELECTION.example.json`, `tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`, `tenants/company-p1-pilot/01-04 guides`（試點參照）, `README.md`, `TASKS.md`, `WORKLOG.md` |
| `tenants/templates/core/DEPARTMENT_CLUSTER_CATALOG.md` | `tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`（列鍵／Notes 對照）, `tenants/templates/core/DEPARTMENT_SELECTION.example.json`, `tenants/NEW_TENANT_ONBOARDING_SOP.md`, `docs/CHANGE_IMPACT_MATRIX.md` |
| `tenants/templates/core/DEPARTMENT_SELECTION.example.json` | `tenants/templates/core/DEPARTMENT_CLUSTER_CATALOG.md`, `tenants/NEW_TENANT_ONBOARDING_SOP.md`, `docs/CHANGE_IMPACT_MATRIX.md` |
| `tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md` | `tenants/templates/core/DEPARTMENT_CLUSTER_CATALOG.md`, `tenants/templates/core/DEPARTMENT_SELECTION.example.json`, `tenants/NEW_TENANT_ONBOARDING_SOP.md`, `docs/CHANGE_IMPACT_MATRIX.md` |
| `tenants/templates/tenant-template/01_COMMANDER_SYSTEM_GUIDE.md` | `tenants/company-p1-pilot/01_COMMANDER_SYSTEM_GUIDE.md`, `tenants/README.md`, `README.md` |
| `tenants/templates/tenant-template/02_CLIENT_WORKSPACE_GUIDE.md` | `tenants/company-p1-pilot/02_CLIENT_WORKSPACE_GUIDE.md`, `tenants/README.md`, `README.md` |
| `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md` | `tenants/company-p1-pilot/03_TOOLS_CONFIGURATION_GUIDE.md`, `tenants/README.md`, `README.md`, `docs/operations/tools-and-integrations.md` |
| `tenants/templates/tenant-template/04_OPERATIONS_AUTOMATION_GUIDE.md` | `tenants/company-p1-pilot/04_OPERATIONS_AUTOMATION_GUIDE.md`, `tenants/README.md`, `README.md`, `docs/operations/tenant-scheduling.md`, `automation/README.md` |
| `.cursor/rules/00-session-bootstrap.mdc` | `AGENTS.md`, `README.md`, `memory/CONVERSATION_MEMORY.md`, `TASKS.md`, `WORKLOG.md` |
| `.cursor/rules/10-memory-maintenance.mdc` | `AGENTS.md`, `memory/CONVERSATION_MEMORY.md`, `README.md` |
| `.cursor/rules/20-doc-sync-closeout.mdc` | `AGENTS.md`, `README.md`, `scripts/doc-sync-automation.ps1`, `TASKS.md`, `WORKLOG.md` |
| `.cursor/rules/30-resume-keyword.mdc` | `AGENTS.md`, `README.md`, `memory/CONVERSATION_MEMORY.md`, `TASKS.md`, `WORKLOG.md`, `LAST_SYSTEM_STATUS.md` |
| `.cursor/rules/40-shutdown-closeout.mdc` | `AGENTS.md`, `README.md`, `TASKS.md`, `WORKLOG.md`, `memory/CONVERSATION_MEMORY.md`, `scripts/doc-sync-automation.ps1`, `scripts/system-health-check.ps1`, `scripts/system-guard.ps1` |

| `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` | `docs/operations/cursor-mcp-and-plugin-inventory.md`, `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`, `../lobster-factory/docs/ROUTING_MATRIX.md`, `TASKS.md`, `WORKLOG.md`, `docs/operations/tools-and-integrations.md`, `docs/operations/security-secrets-policy.md`, `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` |

## 最小同步清單（每次改版）
- [ ] `README.md` 路徑與入口已更新
- [ ] `TASKS.md` 狀態已同步
- [ ] `WORKLOG.md` 決策已記錄
- [ ] 必要時更新 `memory/CONVERSATION_MEMORY.md`

## 自動化輸出
- `reports/closeout/closeout-*.md`：每次自動產生結案檢查報告
- `.agency-state/doc-sync-state.json`：記錄上次同步時間與受影響文件

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `scripts/register-new-governance-doc.ps1`

_Last synced: 2026-04-09 09:29:25 UTC_


# Change Impact Matrix Drift - 2026-10

- Generated: 2026-10-13 11:31:58 +08:00
- Overall: **WARN**
- Rows parsed: 80 | Pairs checked: 349 | Pairs skipped (unresolved path): 31
- Thresholds: WARN > 90 days, FAIL > 180 days (one-directional: main doc newer than impacted file)

## Flagged pairs (11 WARN, 0 FAIL)

| Severity | 主文件 | Impacted | 主文件 mtime (UTC) | Impacted mtime (UTC) | Drift (days) |
|----------|--------|----------|---------------------|------------------------|---------------|
| WARN | `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md` | `docs/overview/repo-template-locations.md` | 2026-09-30 | 2026-04-05 | 178 |
| WARN | `docs/edge-and-domains/EDGE_DOMAINS_INDEX.md` | `docs/overview/OVERVIEW_INDEX.md` | 2026-09-30 | 2026-04-29 | 153.7 |
| WARN | `../lobster-factory/docs/ONE_CLICK_BUILD_SYSTEM.md` | `../lobster-factory/docs/ARCHITECTURE_CANONICAL_MAP.md` | 2026-09-30 | 2026-05-03 | 149.7 |
| WARN | `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md` | `tenants/templates/core/RELEASE_GATES_CHECKLIST.md` | 2026-09-30 | 2026-05-07 | 145.7 |
| WARN | `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | `lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml` | 2026-09-28 | 2026-05-06 | 145.3 |
| WARN | `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | `docs/governance-plans/PLAN_30Y_STABILITY_HARDENING.md` | 2026-09-28 | 2026-05-06 | 145.3 |
| WARN | `docs/operations/end-to-end-linkage-checklist.md` | `scripts/system-guard.ps1` | 2026-10-13 | 2026-06-05 | 130 |
| WARN | `AGENTS.md` | `scripts/register-new-governance-doc.ps1` | 2026-10-13 | 2026-06-05 | 130 |
| WARN | `docs/operations/new-doc-linkage-checklist.md` | `scripts/register-new-governance-doc.ps1` | 2026-10-13 | 2026-06-05 | 130 |
| WARN | `../lobster-factory/docs/ONE_CLICK_BUILD_SYSTEM.md` | `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md` | 2026-09-30 | 2026-05-23 | 129.6 |
| WARN | `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | `docs/operations/hetzner-stack-rollout-index.md` | 2026-09-28 | 2026-06-26 | 94.5 |

## Skipped (31 entries -- path did not resolve to an existing file)

Not an error: template placeholders (專案 X.md), non-existent-yet docs, and the one intentional
Windows-absolute path in the matrix (AWARE_WAVE_CREDENTIALS.md) all land here by design.

| 主文件 | Raw impacted text | Reason |
|--------|--------------------|--------|
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `.cursor/rules/00-session-bootstrap.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `.cursor/rules/30-resume-keyword.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `.cursor/rules/40-shutdown-closeout.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `../.cursor/rules/00-session-bootstrap.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `../.cursor/rules/30-resume-keyword.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `../.cursor/rules/40-shutdown-closeout.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/wordpress_mainwp_plan.md` | `C:\Users\USER\Desktop\AWARE_WAVE_CREDENTIALS.md` | impacted path did not resolve to an existing file |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/63-cursor-core-identity-risk.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/65-build-standards-data-state.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/66-skills-observability-protocol.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/operations/cursor-enterprise-rules-index.md` | `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/operations/cursor-mcp-and-plugin-inventory.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `.cursor/rules/63-cursor-core-identity-risk.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/64-architecture-mcp-routing.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/65-build-standards-data-state.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/66-skills-observability-protocol.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `docs/operations/cursor-enterprise-rules-index.md` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/63-cursor-core-identity-risk.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/65-build-standards-data-state.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/66-skills-observability-protocol.mdc` | retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md |
| `docs/sales/cr-pricing-rules.md` | `01_SCOPE_AND_CR.md` | impacted path did not resolve to an existing file |
| `docs/standards/wordpress-custom-dev-guidelines.md` | `02_EXECUTION_PLAN.md` | impacted path did not resolve to an existing file |
| `docs/standards/wordpress-custom-dev-guidelines.md` | `03_HANDOVER_CRITERIA.md` | impacted path did not resolve to an existing file |
| `docs/metrics/kpi-margin-dashboard-spec.md` | `FINANCIAL_LEDGER.md` | impacted path did not resolve to an existing file |
| `.cursor/rules/00-session-bootstrap.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/10-memory-maintenance.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/20-doc-sync-closeout.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/30-resume-keyword.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/40-shutdown-closeout.mdc` | `(main file itself)` | main path did not resolve to an existing file |

## Notes

- This is an **informational snapshot**, not a build gate. A flagged pair means the impacted file's content has not been touched since the main doc changed by more than the threshold -- it does NOT prove the impacted file is actually wrong, only that nobody has recently confirmed it is still right.
- Root cause this closes: docs/operations/TOOL_TRIGGER_MAP.md drifted 7 weeks stale (2026-07-02 -> 2026-08-24) while AGENTS.md, which declares it as impacted, kept changing -- nothing checked the gap. See agency-os/WORKLOG.md 2026-08-24.
- Parser only treats backtick-quoted text as candidate paths (see script header). Prose annotations, template placeholders, and range descriptions in the matrix are intentionally never candidates, not a parsing gap.
- Designed for monthly invocation alongside check-governance-docs-drift.ps1 (scripts/ao-resume.ps1 monthly-checks block); also runnable manually anytime.
- Owner doc: this script + docs/CHANGE_IMPACT_MATRIX.md. Trigger: `scripts\check-change-impact-matrix-drift.ps1`.

# Change Impact Matrix Drift - 2026-09

- Generated: 2026-09-12 12:03:29 +08:00
- Overall: **WARN**
- Rows parsed: 80 | Pairs checked: 351 | Pairs skipped (unresolved path): 29
- Thresholds: WARN > 90 days, FAIL > 180 days (one-directional: main doc newer than impacted file)

## Flagged pairs (13 WARN, 0 FAIL)

| Severity | 主文件 | Impacted | 主文件 mtime (UTC) | Impacted mtime (UTC) | Drift (days) |
|----------|--------|----------|---------------------|------------------------|---------------|
| WARN | `docs/governance-plans/PLAN_RULES_STABILITY_CONSOLIDATION.md` | `docs/governance-plans/PLAN_30_YEAR_RULE_CONSOLIDATION.md` | 2026-08-26 | 2026-04-18 | 129.7 |
| WARN | `docs/governance-plans/PLAN_RULES_STABILITY_CONSOLIDATION.md` | `docs/operations/rules-version-and-enforcement.md` | 2026-08-26 | 2026-04-18 | 129.6 |
| WARN | `docs/architecture/decisions/ADR_INDEX.md` | `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md` | 2026-09-12 | 2026-05-07 | 127.7 |
| WARN | `docs/edge-and-domains/EDGE_DOMAINS_INDEX.md` | `docs/overview/OVERVIEW_INDEX.md` | 2026-08-29 | 2026-04-29 | 121.7 |
| WARN | `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | `lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh` | 2026-09-02 | 2026-05-06 | 118.7 |
| WARN | `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | `lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml` | 2026-09-02 | 2026-05-06 | 118.7 |
| WARN | `docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | `docs/governance-plans/PLAN_30Y_STABILITY_HARDENING.md` | 2026-09-02 | 2026-05-06 | 118.7 |
| WARN | `docs/edge-and-domains/EDGE_DOMAINS_INDEX.md` | `docs/operations/CLOUDFLARE_HETZNER_PHASE1.md` | 2026-08-29 | 2026-05-03 | 117.9 |
| WARN | `docs/wordpress_mainwp_plan.md` | `agency-os/docs/operations/WP_MANAGED_UPDATES.md` | 2026-09-02 | 2026-05-09 | 115.7 |
| WARN | `docs/operations/dual-ide-coexistence-strategy.md` | `docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` | 2026-09-03 | 2026-05-15 | 110.8 |
| WARN | `docs/operations/new-doc-linkage-checklist.md` | `scripts/register-new-governance-doc.ps1` | 2026-09-12 | 2026-06-05 | 99 |
| WARN | `docs/operations/end-to-end-linkage-checklist.md` | `scripts/system-guard.ps1` | 2026-09-12 | 2026-06-05 | 99 |
| WARN | `AGENTS.md` | `scripts/register-new-governance-doc.ps1` | 2026-09-12 | 2026-06-05 | 99 |

## Skipped (29 entries -- path did not resolve to an existing file)

Not an error: template placeholders (專案 X.md), non-existent-yet docs, and the one intentional
Windows-absolute path in the matrix (AWARE_WAVE_CREDENTIALS.md) all land here by design.

| 主文件 | Raw impacted text | Reason |
|--------|--------------------|--------|
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `.cursor/rules/00-session-bootstrap.mdc` | impacted path did not resolve to an existing file |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `.cursor/rules/30-resume-keyword.mdc` | impacted path did not resolve to an existing file |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `.cursor/rules/40-shutdown-closeout.mdc` | impacted path did not resolve to an existing file |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `../.cursor/rules/00-session-bootstrap.mdc` | impacted path did not resolve to an existing file |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `../.cursor/rules/30-resume-keyword.mdc` | impacted path did not resolve to an existing file |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | `../.cursor/rules/40-shutdown-closeout.mdc` | impacted path did not resolve to an existing file |
| `docs/wordpress_mainwp_plan.md` | `C:\Users\USER\Desktop\AWARE_WAVE_CREDENTIALS.md` | impacted path did not resolve to an existing file |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/63-cursor-core-identity-risk.mdc` | impacted path did not resolve to an existing file |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | impacted path did not resolve to an existing file |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/65-build-standards-data-state.mdc` | impacted path did not resolve to an existing file |
| `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/66-skills-observability-protocol.mdc` | impacted path did not resolve to an existing file |
| `docs/operations/cursor-mcp-and-plugin-inventory.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | impacted path did not resolve to an existing file |
| `.cursor/rules/63-cursor-core-identity-risk.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/64-architecture-mcp-routing.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/65-build-standards-data-state.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `.cursor/rules/66-skills-observability-protocol.mdc` | `(main file itself)` | main path did not resolve to an existing file |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/63-cursor-core-identity-risk.mdc` | impacted path did not resolve to an existing file |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | impacted path did not resolve to an existing file |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/65-build-standards-data-state.mdc` | impacted path did not resolve to an existing file |
| `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/66-skills-observability-protocol.mdc` | impacted path did not resolve to an existing file |
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

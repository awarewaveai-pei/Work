# Change Impact Matrix Drift - 2026-08

- Generated: 2026-08-24 19:35:29 +08:00
- Overall: **WARN**
- Rows parsed: 76 | Pairs checked: 397 | Pairs skipped (unresolved path): 5
- Thresholds: WARN > 90 days, FAIL > 180 days (one-directional: main doc newer than impacted file)

## Flagged pairs (7 WARN, 0 FAIL)

| Severity | 主文件 | Impacted | 主文件 mtime (UTC) | Impacted mtime (UTC) | Drift (days) |
|----------|--------|----------|---------------------|------------------------|---------------|
| WARN | `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/66-skills-observability-protocol.mdc` | 2026-08-24 | 2026-04-05 | 141.3 |
| WARN | `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/65-build-standards-data-state.mdc` | 2026-08-24 | 2026-04-05 | 141.3 |
| WARN | `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/65-build-standards-data-state.mdc` | 2026-08-24 | 2026-04-05 | 141.2 |
| WARN | `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/66-skills-observability-protocol.mdc` | 2026-08-24 | 2026-04-05 | 141.2 |
| WARN | `docs/operations/cursor-enterprise-rules-index.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | 2026-08-24 | 2026-04-18 | 127.9 |
| WARN | `docs/operations/cursor-mcp-and-plugin-inventory.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | 2026-08-24 | 2026-04-18 | 127.8 |
| WARN | `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` | `.cursor/rules/64-architecture-mcp-routing.mdc` | 2026-08-24 | 2026-04-18 | 127.8 |

## Skipped (5 entries -- path did not resolve to an existing file)

Not an error: template placeholders (專案 X.md), non-existent-yet docs, and the one intentional
Windows-absolute path in the matrix (AWARE_WAVE_CREDENTIALS.md) all land here by design.

| 主文件 | Raw impacted text | Reason |
|--------|--------------------|--------|
| `docs/wordpress_mainwp_plan.md` | `C:\Users\USER\Desktop\AWARE_WAVE_CREDENTIALS.md` | impacted path did not resolve to an existing file or directory |
| `docs/sales/cr-pricing-rules.md` | `01_SCOPE_AND_CR.md` | impacted path did not resolve to an existing file or directory |
| `docs/standards/wordpress-custom-dev-guidelines.md` | `02_EXECUTION_PLAN.md` | impacted path did not resolve to an existing file or directory |
| `docs/standards/wordpress-custom-dev-guidelines.md` | `03_HANDOVER_CRITERIA.md` | impacted path did not resolve to an existing file or directory |
| `docs/metrics/kpi-margin-dashboard-spec.md` | `FINANCIAL_LEDGER.md` | impacted path did not resolve to an existing file or directory |

## Notes

- This is an **informational snapshot**, not a build gate. A flagged pair means the impacted file's content has not been touched since the main doc changed by more than the threshold -- it does NOT prove the impacted file is actually wrong, only that nobody has recently confirmed it is still right.
- Root cause this closes: docs/operations/TOOL_TRIGGER_MAP.md drifted 7 weeks stale (2026-07-02 -> 2026-08-24) while AGENTS.md, which declares it as impacted, kept changing -- nothing checked the gap. See agency-os/WORKLOG.md 2026-08-24.
- Parser only treats backtick-quoted text as candidate paths (see script header). Prose annotations, template placeholders, and range descriptions in the matrix are intentionally never candidates, not a parsing gap.
- Designed for monthly invocation alongside check-governance-docs-drift.ps1 (scripts/ao-resume.ps1 monthly-checks block); also runnable manually anytime.
- Owner doc: this script + docs/CHANGE_IMPACT_MATRIX.md. Trigger: `scripts\check-change-impact-matrix-drift.ps1`.

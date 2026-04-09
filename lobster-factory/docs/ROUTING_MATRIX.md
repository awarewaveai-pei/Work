# Routing Matrix (Phase 1)

## Purpose
Define a deterministic routing policy for Lobster Factory requests so each request goes to the correct workflow/agent with guardrails.

## Routing Principles
- Route by `taskType`, `riskLevel`, and `environmentType`.
- Production-impacting actions require human approval.
- Phase 1 only allows auto execution in `staging`.
- Unknown task types are rejected by default.

## Matrix
| taskType | riskLevel | environmentType | routeTo | approvalRequired | mode |
|---|---|---|---|---|---|
| create_wp_site | medium | staging | workflow:create-wp-site | yes | semi-auto |
| apply_manifest_wc_core | medium | staging | workflow:apply-manifest | yes | semi-auto |
| repair_incident | high | staging | agent:repair-agent | yes | assist |
| validate_manifest | low | staging | script:validate-manifests | no | auto |
| validate_governance | low | staging | script:validate-governance-configs | no | auto |
| deploy_production | high | production | block | yes | blocked |

## Fallback Rules
- If `environmentType` is not `staging`, default to `block`.
- If `riskLevel` is `high`, force approval and non-auto mode.
- If `taskType` is unknown, return `unsupported_task`.

## Phase 1 Notes
- This matrix is the canonical routing policy for current skeleton workflows.
- Machine-readable policy is now available at `workflow-risk-matrix.json`.
- Detailed cross-tool routing and boundary rules are documented in `docs/MCP_TOOL_ROUTING_SPEC.md`.

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `README.md`
- `TASKS.md`

_Last synced: 2026-04-09 09:29:25 UTC_


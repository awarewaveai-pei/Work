# Routing Matrix (Phase 1)

## Purpose
Define a deterministic routing policy for Lobster Factory requests so each request goes to the correct workflow/agent with guardrails.

## Where this file sits (do not duplicate spec)
| Layer | File | Authority |
|-------|------|-----------|
| Enforced rules | `MCP_TOOL_ROUTING_SPEC.md` (same folder) | **Highest** — `task_type`, `primary_tool`, `allowed_envs`, risk, approval. |
| This matrix | `ROUTING_MATRIX.md` | Human-friendly routes; **must match** the spec row-for-row on semantics. |
| Machine check | `../workflow-risk-matrix.json` | Consumed by `scripts/validate-workflow-routing-policy.mjs` / bootstrap gates. |
| IDE only | `../agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md` | `mcp.json` keys; **no** production routing override. |
| Build / evidence | `../agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` | P1–P7, TASKS, DoD; **no new `task_type` names** without spec update. |

If this matrix and `MCP_TOOL_ROUTING_SPEC.md` disagree, **update the spec first**, then this file, then `workflow-risk-matrix.json`, in one change set.

## Routing Principles
- Route by `task_type`, `risk_level`, and `environment`.
- Production-impacting actions require human approval.
- Phase 1 only allows auto execution in `staging`.
- Unknown task types are rejected by default.

## Matrix
| task_type | risk_level | environment | route_to | approval_required | mode |
|---|---|---|---|---|---|
| client_onboarding | medium | staging,qa | trigger | no | orchestrated |
| site_provisioning | high | staging | trigger | yes | orchestrated |
| manifest_apply | high | staging | trigger | yes | orchestrated |
| smoke_test | medium | staging,qa | trigger | no | orchestrated |
| deploy_production | critical | production | trigger | yes | blocked-until-approved |
| incident_repair | high | staging,production | trigger | yes | assist-with-approval |
| webhook_ingress | low | staging,production | n8n | no | auto |
| crm_sync | low | staging,production | n8n | no | auto |
| notifications | low | staging,production | n8n | no | auto |
| ci_validate | medium | staging,production | github | no | auto |
| release_tagging | medium | production | github | yes | gated |
| runtime_content_ops | medium | staging,production | wordpress | no | manual-assisted |
| runtime_plugin_change | high | staging | wordpress | yes | manual-gated |

## Fallback Rules
- If `task_type` is unknown, return `unsupported_task` and block execution.
- If `environment` includes `production`, force explicit approval before execution.
- If `risk_level` is `high` or `critical`, enforce rollback-ready mode.
- If matrix and `MCP_TOOL_ROUTING_SPEC.md` differ, **`MCP_TOOL_ROUTING_SPEC.md` wins** and this file must be updated in the same change set.

## Phase 1 Notes
- This matrix is the human-facing companion for current skeleton workflows; **authoritative semantics** remain in `MCP_TOOL_ROUTING_SPEC.md`.
- Machine-readable policy: `../workflow-risk-matrix.json` (under `lobster-factory/`).
- Column **`environment`**: comma-separated list; must remain consistent with spec **`allowed_envs`** for the same `task_type`.

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `README.md`
- `TASKS.md`

_Last synced: 2026-04-10 07:29:14 UTC_


# Tools Delivery Traceability

## Purpose
- Provide one-page traceability across:
  - tool responsibility (`cursor-mcp-and-plugin-inventory.md`)
  - enforced routing (`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`)
  - execution progress (`TASKS.md`)
- Reduce drift: each tool-building task must map to one spec anchor and one evidence path.

## Relationship (Single View)
| Layer | Owner File | What it answers |
|---|---|---|
| Tool responsibility | `docs/operations/cursor-mcp-and-plugin-inventory.md` | Which tool is for what (IDE/app/platform boundaries) |
| Enforced routing | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | Which workflow must run on which engine with approvals |
| Execution status | `TASKS.md` | What is done / pending / next |
| Routing quick matrix | `../lobster-factory/docs/ROUTING_MATRIX.md` | Deterministic route by task type / risk / env |

## Task-to-Spec Traceability
| TASKS item (keyword) | Primary spec | Routing anchor | DoD (must be observable) | Evidence fields |
|---|---|---|---|---|
| `（工具建置）Secrets 治理升級` | `docs/operations/security-secrets-policy.md` | `MCP_TOOL_ROUTING_SPEC.md` Guardrails + Tool Boundaries | Rotation rehearsal completed without outage | `date`, `owner`, `rotated_scopes`, `rollback_note`, `report_path` |
| `（工具建置）Hetzner 自託管 n8n（staging）` | `docs/standards/n8n-workflow-architecture.md` | `webhook_ingress` / `crm_sync` / `notifications` belong to `n8n` | One staging flow passes end-to-end | `workflow_run_id`, `environment`, `route`, `artifact_path`, `status` |
| `（工具建置）Sentry 觀測接入` | `docs/operations/tools-and-integrations.md` | Supports non-owner observability path (not control plane) | Test error triggers alert | `release_tag`, `alert_rule`, `event_id`, `screenshot_path` |
| `（工具建置）PostHog 事件基線` | `docs/operations/tools-and-integrations.md` | Supports analytics path (not control plane) | One complete test funnel visible | `event_names`, `funnel_id`, `time_window`, `report_path` |
| `（工具建置）Cloudflare 邊界保護` | `docs/operations/tools-and-integrations.md` | Supports edge protection around runtime | Staging protected without regression | `zone`, `rule_ids`, `before_after_result`, `rollback_note` |
| `（工具建置）Clerk 組織與角色` | `docs/architecture/decisions/002-clerk-identity-boundary.md` | Control-plane identity boundary remains explicit | Two test roles show distinct permissions | `org_id`, `role_matrix_ref`, `test_accounts`, `result` |
| `（工具建置）Next.js 控制台 v1` | `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` | UI orchestrates approved paths, does not bypass routing | Create one test customer config via UI | `tenant_slug`, `department_selection_payload`, `submit_result`, `ui_capture` |

## Execution Checklist (per tool task)
- Link the task line in `TASKS.md` to one row in this file (keyword match).
- Attach at least one evidence path in `WORKLOG.md` on completion day.
- Ensure routing owner is unchanged from `MCP_TOOL_ROUTING_SPEC.md`.
- If owner changes, update all 3 files in one commit:
  - `cursor-mcp-and-plugin-inventory.md`
  - `MCP_TOOL_ROUTING_SPEC.md`
  - `TASKS.md`

## Evidence Storage Convention
- Reports: `agency-os/reports/`
- Runtime traces: `lobster-factory` workflow artifacts + `workflow_run_id`
- Narrative + decisions: `agency-os/WORKLOG.md`

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/security-secrets-policy.md`
- `docs/operations/tools-and-integrations.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-04-09 09:29:25 UTC_


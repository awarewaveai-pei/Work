# MCP Tool Routing Spec

## Purpose
Define enforceable tool routing for Lobster Factory so automation is predictable, staging-first, and approval-gated for production.

## Execution Decision
- `Trigger.dev` is the durable workflow engine.
- `n8n` is only for light glue workflows (webhook, notification, sync).
- `Supabase` is the system of record.
- `GitHub` is code/CI/release gate.
- `WordPress` is the final delivery runtime.

## Guardrail Principles
- Production actions require explicit approval.
- High-risk actions must include rollback steps.
- Every run must write audit records (`workflow_runs`, `approvals`, `incidents`, `artifacts`).
- Unknown tasks default to `block`.

## Routing Rules (enforced)
| task_type | primary_tool | allowed_envs | risk_level | approval_required | rollback_required | notes |
|---|---|---|---|---|---|---|
| client_onboarding | trigger | staging,qa | medium | false | true | durable multi-step flow |
| site_provisioning | trigger | staging | high | true | true | includes wp install and validation |
| manifest_apply | trigger | staging | high | true | true | must write package lifecycle logs |
| smoke_test | trigger | staging,qa | medium | false | false | attach report artifact |
| deploy_production | trigger | production | critical | true | true | hard gate; blocked without approval |
| incident_repair | trigger | staging,production | high | true | true | production repair needs approval |
| webhook_ingress | n8n | staging,production | low | false | false | normalize and route only |
| crm_sync | n8n | staging,production | low | false | false | no destructive updates |
| notifications | n8n | staging,production | low | false | false | Slack/email/line dispatch |
| ci_validate | github | staging,production | medium | false | false | release gate + policy checks |
| release_tagging | github | production | medium | true | false | approval by release owner |
| runtime_content_ops | wordpress | staging,production | medium | false | false | content/business runtime only |
| runtime_plugin_change | wordpress | staging | high | true | true | production change blocked by default |

## Tool Boundaries
### Trigger (must own)
- Long-running workflows, retries, resumable steps, approval waits.
- Provisioning/apply/deploy/repair orchestration.

### n8n (must not own critical orchestration)
- Webhooks, notifications, simple sync.
- Must not execute production critical deployment logic.

### GitHub
- PR checks, release gates, deployment workflow entrypoint.
- Must not store runtime secrets in repo.

### Supabase
- Canonical state, approvals, incidents, workflow records.
- Must not be bypassed for workflow state writes.

### WordPress
- Delivery runtime surface.
- Must not be treated as control plane.

## WordPress Factory Fixed Channel
1. Create `workflow_run` (`site_provisioning`) in Supabase.
2. Trigger provisioning in staging only.
3. Apply `wc-core` manifest via Trigger workflow.
4. Run smoke tests and attach artifact.
5. If failed, run rollback step and open incident.
6. If passed and production target requested, require approval.
7. On approval, execute production deploy with full audit trail.

## Approval Minimum Payload
```json
{
  "environment": "production",
  "requested_action": "deploy_manifest",
  "risk_level": "critical",
  "rollback_plan": "restore previous manifest + backup",
  "precheck_status": "passed",
  "status": "pending"
}
```

## Cursor IDE MCP layer (non-enforced)
- **Agency OS** maintains a separate inventory of **Cursor `mcp.json` servers and extensions**: `agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`.
- That document does **not** override this spec for **Lobster production/staging orchestration**; it explains what each IDE MCP is *for* so agents do not route durable workflows through the wrong tool.
- Cross-system operating cadence (AO events + Lobster execution): `../agency-os/docs/overview/ao-lobster-operating-model.md`.
- One-page traceability map (tool split ↔ routing ↔ tasks): `../agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`.

## Out of Scope (for now)
- Additional durable engines (Inngest, Temporal).
- Browser automation specific runtimes.

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `README.md`
- `TASKS.md`

_Last synced: 2026-04-09 09:29:25 UTC_


# MCP Tool Routing Spec

## Purpose
Define enforceable tool routing for Lobster Factory so automation is predictable, staging-first, and approval-gated for production.

## Document set & SSOT precedence (read this first)
When humans or agents need to route work, use this order. **Lower number wins on conflict.**

| Order | Artifact | Role |
|------:|----------|------|
| 1 | **This file** (`MCP_TOOL_ROUTING_SPEC.md`) | **Enforced** routing semantics: `task_type`, `primary_tool`, env, risk, approval. |
| 2 | **`workflow-risk-matrix.json`** (repo: `lobster-factory/`, validated by `scripts/validate-workflow-routing-policy.mjs`) | Machine-readable mirror of routing; CI/bootstrap gate. |
| 3 | **`ROUTING_MATRIX.md`** (this folder) | Human-readable matrix; **must match this spec**; if drift, fix matrix + JSON in the **same change** as this spec. |
| 4 | **`agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`** | **IDE / Cursor MCP only**; explains `mcp.json` keys; **never** overrides rows in the table below for production orchestration. |
| 5 | **`agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`** | Platform capabilities, build phases (P1–P7), TASKS ↔ spec evidence; **does not** invent new `task_type` names. |
| 6 | **`agency-os/docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md`** | ADR rationale for Trigger vs n8n ownership. |

**Monorepo rule (IDE):** `.cursor/rules/64-architecture-mcp-routing.mdc` points here; keep it in sync when this file changes materially.

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

## Cursor / IDE MCP keys → routing (informative only)
The following maps **Cursor `mcpServers` names** (see inventory) to **this spec’s `task_type` domain**. **Supabase MCP, LLM wrappers, and filesystem MCPs are not `task_type` owners**—they do not replace Trigger approvals or SoR writes.

| Typical MCP key (inventory) | Related `task_type` values (if any) | Notes |
|-----------------------------|--------------------------------------|--------|
| **trigger** | `client_onboarding`, `site_provisioning`, `manifest_apply`, `smoke_test`, `deploy_production`, `incident_repair` | Durable orchestration owner per table above. |
| **n8n** | `webhook_ingress`, `crm_sync`, `notifications` | Glue only; no critical deploy orchestration. |
| **github** | `ci_validate`, `release_tagging` | CI/release gate; no runtime secrets in repo. |
| **wordpress** | `runtime_content_ops`, `runtime_plugin_change` | Delivery runtime; not control plane. |
| **supabase** | *(none)* | Platform SoR; **Supabase MCP** = IDE inspect/docs/debug per inventory—not a routing shortcut. |
| **replicate**, **perplexity**, **chatgpt-***, **claude-***, **gemini-***, **copilot**, **work-global** | *(none)* | Draft, search, or dev read; **not** authoritative over SoR. |
| Plugin MCPs (**cloudflare-***, **clerk**, **sentry**, **posthog**, **slack**) | *(none)* | Edge/identity/observability helpers; align with `TOOLS_DELIVERY_TRACEABILITY` build tasks, not new `task_type` without spec change. |

## Cross-Document Contract (must stay aligned)
- This file is the **enforced owner** for routing semantics.
- `ROUTING_MATRIX.md` (same directory) must use the same field vocabulary:
  - `task_type`, `risk_level`, `environment`, `approval_required`.
- `../workflow-risk-matrix.json` must remain a **structural mirror** for CI/bootstrap (see `scripts/validate-workflow-routing-policy.mjs` under `lobster-factory/`).
- `../../agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md` maps **IDE `mcpServers` keys** only; it does not add `task_type` rows.
- `../../agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` must map tool-building tasks to the same `task_type` terms when referencing routing ownership.
- If any mismatch exists, resolve by:
  1. updating this file first,
  2. updating `ROUTING_MATRIX.md` and `workflow-risk-matrix.json` in the same change,
  3. updating `cursor-mcp-and-plugin-inventory.md`, `TOOLS_DELIVERY_TRACEABILITY.md`, and `TASKS.md` in the same change set.

## Long-Horizon Governance (30+ years)
- Review cadence:
  - monthly: routing drift check (Spec vs Matrix vs `workflow-risk-matrix.json` vs Traceability),
  - quarterly: risk-tier recalibration and approval payload adequacy,
  - yearly: deprecation cleanup and archived task_type audit.
- Change policy:
  - adding a new `task_type` requires owner, rollback path, and evidence fields before activation,
  - removing a `task_type` requires deprecation note and migration mapping,
  - no production route may bypass approval when `risk_level` is `high` or `critical`.

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
- **Agency OS** maintains a separate inventory of **Cursor `mcp.json` servers and extensions**: `../../agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`.
- That document does **not** override this spec for **Lobster production/staging orchestration**; it explains what each IDE MCP is *for* so agents do not route durable workflows through the wrong tool.
- Cross-system operating cadence (AO events + Lobster execution): `../../agency-os/docs/overview/ao-lobster-operating-model.md`.
- One-page traceability map (tool split ↔ routing ↔ tasks): `../../agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`.

## Out of Scope (for now)
- Additional durable engines (Inngest, Temporal).
- Browser automation specific runtimes.

## Related Documents (Auto-Synced)
- `ROUTING_MATRIX.md` (same directory)
- `../workflow-risk-matrix.json`
- `../../agency-os/.cursor/rules/64-architecture-mcp-routing.mdc` (canonical; monorepo root mirror: `../../.cursor/rules/64-architecture-mcp-routing.mdc`)
- `../../agency-os/docs/operations/cursor-enterprise-rules-index.md`
- `../../agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`
- `../../agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `../../agency-os/docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md`
- `../../README.md`
- `../../agency-os/TASKS.md`

_Last synced: 2026-04-10 07:36:39 UTC_


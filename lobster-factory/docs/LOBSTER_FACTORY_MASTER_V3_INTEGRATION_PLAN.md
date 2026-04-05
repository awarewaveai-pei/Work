# Lobster Factory Master V3 Integration Plan

> Source: `D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`  
> Purpose: convert V3 vision spec into executable milestones in current repo.

## 1) Integration Principles
- Keep current milestone sequence (`M1 -> M5`) and avoid breaking in-flight C1 path.
- Build broad skeletons first across modules, then deepen by priority.
- Preserve safety gates: `staging-only`, approval-gated production operations.
- Multi-tenant baseline is mandatory: `organization_id`, `workspace_id`, and RLS.

## 2) V3 Module Mapping (20 OS -> current build lanes)

| V3 OS module | Current lane | Status | Next action |
|---|---|---|---|
| Sales OS | `apps/api` + future `packages/sales` | gap | add schema/types/workflow skeleton |
| Marketing OS | `packages/workflows` + `infra/n8n` | gap | add campaign/funnel workflow skeleton |
| CX OS | `packages/cx` + `knowledge` | partial | implement ticket intent + SLA baseline |
| Factory OS | `packages/manifests` + trigger workflows | partial | continue C2/C3/C4 hardening |
| Commerce OS | WP/Woo manifest path | partial | add operations schema and lifecycle workflow |
| Brand + Content OS | templates + docs path | gap | add content pipeline skeleton and artifacts |
| Data OS | analytics + event pipelines | partial | unify KPI snapshots and anomaly outputs |
| Finance OS | billing path | partial | quote -> invoice -> billing workflow baseline |
| Legal OS | templates/contracts + policy | partial | legal workflow + compliance checklist executable form |
| IT / Infra OS | `infra/*` | partial | codify security controls and ops checks |
| HR / People OS | future package lane | gap | add minimal schema/workflow skeleton |
| Ops OS | automation + operations docs | partial | add internal routing and service desk workflow |
| Partner / Ecosystem OS | future package lane | gap | add referral/partner schema baseline |
| Media / Asset Pipeline | `packages/media` + storage path | gap | add media transform pipeline skeleton |
| Compliance / Governance OS | policy + governance scripts | partial | formalize policy checks as executable gates |
| PMO / Delivery OS | checklist + readiness flows | partial | add acceptance and CR workflow baselines |
| Knowledge / Training OS | `knowledge/*` + docs | partial | add structure/index and retrieval workflow skeleton |
| Supply Chain OS | future package lane | gap | add optional commerce extension skeleton |
| Analytics / Decision Engine | scoring/recommendation lane | gap | add score/recommend tables and job skeleton |
| Merchandising OS | commerce extension lane | gap | add product strategy schema and basic workflows |

## 3) Priority Plan (aligned with existing milestones)

### P0 (now, without disrupting C1-2 execution)
1. Keep C1-2 execute path as immediate operational priority.
2. Add "V3 gap tracking" checkpoints into master checklist.
3. Prepare skeleton package/folder contracts for missing modules.

### P1 (after C1-2/C1-3)
1. Module skeleton sprint: create minimal schema + types + workflow + docs stubs for high-priority gaps:
   - Sales, Marketing, Partner, Media, Decision Engine, Merchandising
2. Add Decision Engine baseline tables and scoring job placeholder.
3. Add CX retention/upsell workflow baselines tied to `workflow_runs`.

### P2 (stabilization and governance)
1. Convert policy docs into executable validations where possible.
2. Extend release gates for module-level completeness checks.
3. Add regression suites for key workflows and state transitions.

## 4) Required Deliverables per Module Skeleton
- DB schema migration (or placeholder migration plan)
- Shared types + validation schemas
- Workflow contract (trigger/input/output/error model)
- Minimal policy and approval boundary
- Docs update in `docs/*` with integration notes

## 5) Acceptance Signals
- Checklist has explicit V3 tracking section and owners.
- Missing-module count decreases over time with evidence commits.
- No regression on existing C1/C2 safety gates.

## 6) Notes
- This plan intentionally maps the large V3 vision to current executable lanes.
- Production/autonomous actions remain approval-gated.

# Cognitive OS Deployment Blueprint

2026-09-12. SSOT for "how does Cognitive Engineering OS go from backend library to an operable, commercially-viable system." Governance overlay: `.foundry/` (System Foundry v1.6 profile=commercial, archetypes=[ai_system, web_application] -- see `.foundry/project-profile.json`). Reference standards: `D:/Work/agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/commercial/*`.

## Current state (2026-09-12)

- 41 Method Atlas Tier-1 methods complete (F15/F22/F23/F24, commits `3d06b15c9`/`7698a0340`/`fd661d94d`/`96094110a`). Pure Python builder+gate functions, `MethodCatalog` resolver, zero HTTP/API/frontend/Identity/Tenant runtime.
- Master Plan (`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`) defines 12 architecture Planes; only Cognitive Plane content exists as running code today.
- ADR-003 defines Tenant 1:N Workspace (`specs/domain/tenant.schema.yaml`) -- not instantiated.

## Commercial arc (operator-confirmed 2026-09-12)

Self-use (internal) -> subscription + credits -> enterprise sale. One codebase throughout (`commercial/EDITION_ARCHITECTURE.md` rule 1: editions are data, never forks).

| Phase | Audience | New capability needed | Commercial standards that apply |
|---|---|---|---|
| 1 | Operator (self-use) | Tenant/Workspace/Identity (1 real row), entitlement-check seam (trivially all-true), execute+browse API, deploy | none load-bearing yet -- seam only |
| 2 | Public subscribers | Real entitlement store, billing event log, Stripe (or equivalent) adapter, credit metering | `ENTITLEMENT_STANDARD.md`, `BILLING_ARCHITECTURE.md`, `EDITION_ARCHITECTURE.md` |
| 3 | Enterprise/group customers | Multi-tenant isolation proof, SSO, contract-level jurisdiction controls (reuses F23 `jurisdiction.*` methods), private-deployment option | `ENTERPRISE_STANDARD.md`, `GROUP_STANDARD.md`, `CUSTOMER_LIFECYCLE.md` |

Zero-rework rule for this table: Phase 1 code must not need rewriting when Phase 2/3 land -- only additive wiring behind the same seams. See `.foundry/decision-register.json` entry 2.

## Phase 1 scope (the only phase authorized to plan for right now)

**Not yet authorized to build** -- this is the plan pending operator go-ahead (High-risk gate: new production service on `ks-aw-01`, per `agency-os/AGENTS.md` R0 section 3).

1. **Domain**: one real `Tenant` + `Workspace` + `Identity` row (ADR-003 schema, no shortcuts/hardcoded bypass) in a small SQLite/Postgres store (choose at build time based on `ks-aw-01`'s existing stack -- check `AWAREWAVE_STACK_QUICKREF.md` before introducing a new DB engine).
2. **Entitlement seam**: one function, `check_entitlement(tenant_id, capability_id) -> bool`, called before every method invocation. Phase 1 implementation always returns `True` for the single tenant -- the point is the call site exists, not that it does anything yet (`ENTITLEMENT_STANDARD.md` rule 2).
3. **API** (FastAPI): `GET /methods`, `GET /methods/{id}`, `POST /methods/{id}/invoke` (dispatches via `inspect.signature` against the real builder, runs gates, returns record + gate results -- no persistence, builders are pure), `GET /methods/{id}/demo` (runs existing `run_*_slice.py`).
4. **Auth**: real Identity row + session, not Basic Auth (per operator correction 2026-09-12 -- this is a multi-tenant product, auth must be built on the real Identity/Tenant model from day 1, not a throwaway).
5. **Deploy**: `ks-aw-01`, Docker Compose, `sg-deploy.sh` 6-item checklist (test gate / healthcheck / smoke / rollback / notification / typecheck) per `agency-os/AGENTS.md` section 0. Domain: `cognitive.aware-wave.com`.
6. **Abuse mitigation**: `POST /invoke` requires the Identity session (item 4) -- closes the medium-risk "public execution endpoint" item in `.foundry/risk-classification.json`.

### Explicitly out of scope for Phase 1

Billing, credits, multiple tenants, SSO, enterprise contracts, regulated-system controls. These are Phase 2/3 -- do not build ahead of the phase that needs them (matches `agency-os/AGENTS.md`'s own anti-scope-creep discipline).

## Next action

Operator go-ahead required before any Phase 1 code is written (High-risk: production deploy target). On go-ahead: use `planner` to break Phase 1 into task prompts (touches >=3 modules: domain/API/auth/deploy), then build with the same R0/R4 rigor (real test, critic review, bughunt, WORKLOG) as the Method Atlas work above.

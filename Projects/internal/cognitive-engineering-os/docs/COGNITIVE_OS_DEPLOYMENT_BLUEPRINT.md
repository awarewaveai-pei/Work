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

## Phase 1 scope -- CODE COMPLETE 2026-09-12, NOT YET DEPLOYED

Items 1-4 below are built, tested, and critic-reviewed (see WORKLOG 2026-09-12 "Cognitive OS Phase 1" entry). Item 5 (actual deploy to `ks-aw-01`) is a separate High-risk action still pending explicit operator go-ahead -- everything up to that point runs and is verified locally only.

1. **Domain** -- DONE. `specs/domain/workspace.schema.yaml` + `specs/domain/identity.schema.yaml` (new), `ai_lego/core/domain/{workspace,identity}.py` (builders). Real `Tenant` + `Workspace` + `Identity` rows persisted in SQLite (`ai_lego/platform/identity/store.py`) -- not mocked, not hardcoded. `python -m ai_lego.apps.cli.bootstrap_phase1_tenant --email ... ` creates the real (non-synthetic) Phase 1 tenant. `encryption_root_key_ref` is a disclosed local-dev placeholder (no real KMS yet -- deferred to Phase 2/3 when real customer data exists, see `.foundry/risk-classification.json`).
2. **Entitlement seam** -- DONE. `ai_lego/platform/entitlement/check.py`'s `check_entitlement(store, tenant_id, capability_id) -> bool`. Phase 1: grants iff the tenant exists and is active; every check is audited (`entitlement_audit` table) regardless of outcome, so Phase 2 only needs to replace the grant *logic*, never add auditing that was missing.
3. **API** -- DONE (`ai_lego/apps/api/main.py` + `dispatch.py`). `GET /methods`, `GET /methods/{id}`, `POST /auth/login`, `POST /auth/logout`, `POST /methods/{id}/invoke`, `GET /methods/{id}/demo`. Dispatch is generic (introspection-based, not a hand-maintained per-method adapter table) -- verified against methods whose builder function name does NOT match the method id (e.g. `jurisdiction.market_admission_control` -> `generate_market_admission`).
4. **Auth** -- DONE. Real Identity + PBKDF2-HMAC-SHA256 password hashing (600,000 iterations, OWASP 2023+ floor), real server-side session tokens (256-bit, revocable, 12h TTL), `Secure`/`HttpOnly`/`SameSite=Strict` cookies. A critic pass (2026-09-12, Standard tier, auth/crypto rigor) found 0 Critical, 1 Major (a timing side-channel in `authenticate()` letting an attacker distinguish "no such email" from "wrong password" by response latency -- ~182ms/730x gap measured directly) -- fixed same day with a constant-cost dummy-hash branch, regression-tested by actually measuring timing (`tests/unit/test_authenticate_timing.py`), not just asserting return values. 1 Minor (bootstrap CLI's `--password` argv flag can leak into shell history -- already defaulted to a `getpass` prompt instead; added an explicit stderr warning when the flag is used anyway). Verified clean: SQL injection (all queries parameterized), cross-tenant leakage (same email+password cannot authenticate against a different real tenant), the generic dispatch/demo endpoints cannot execute anything beyond the 249 real, pre-scanned Method Atlas contracts (live-exploit-tested with path-traversal/injection-shaped `method_id` payloads, all correctly 404).
5. **Deploy** -- NOT DONE, pending operator go-ahead. `ks-aw-01`, Docker Compose, `sg-deploy.sh` 6-item checklist (test gate / healthcheck / smoke / rollback / notification / typecheck) per `agency-os/AGENTS.md` section 0. Domain: `cognitive.aware-wave.com`.

Verification evidence: 72 tests pass (`tests/unit/test_{workspace_domain,identity_domain,identity_store,entitlement_check,api_dispatch,api_main,authenticate_timing}.py`); a real `uvicorn` server was started locally and exercised end-to-end with real `curl` requests (login -> invoke -> demo -> logout), not only the FastAPI `TestClient`; corpus-wide `pytest tests/unit` shows zero regressions against the pre-existing 245+ Method Atlas tests.

### Explicitly out of scope for Phase 1 (deferred, not forgotten)

Billing, credits, multiple tenants, SSO, enterprise contracts, regulated-system controls, rate limiting beyond "must be authenticated", real KMS for `encryption_root_key_ref`, `entitlement_audit` table retention/pruning. These are Phase 2/3 -- do not build ahead of the phase that needs them.

## Next action

Deploy to `ks-aw-01` is a separate High-risk action requiring explicit operator go-ahead (production host, new subdomain, new attack surface) -- not implied by "Phase 1 code is done." When authorized: follow `sg-deploy.sh`'s 6-item checklist, provision the real Phase 1 tenant via `bootstrap_phase1_tenant.py` on the target host (never reuse a locally-generated `encryption_root_key_ref` placeholder in a way that implies it is a real key), and confirm the smoke test (login + one real invoke) over the real deployed domain before declaring done.

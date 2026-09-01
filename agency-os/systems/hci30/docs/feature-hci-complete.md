# HCI complete-system delivery plan

Status: **ACTIVE — operator delegated implementation authority, 2026-09-01**
Scope: Build HCI as an independent, contract-first PostgreSQL modular monolith. This plan never treats a local test, an ADR, or delegated authority as proof of legal compliance, production readiness, or permission to process a real person.

## Success criteria

The first complete milestone is a production-core system: isolated HCI ownership; signed tenant context; forced RLS; Person/DSR/permission/Case/Evidence/Claim/Assessment/Decision domains; versioned API contracts; bitemporal replay; immutable lineage; deterministic tests; restore drill; and a fail-closed real-data admission gate. A safe paid system additionally needs a verified isolated public-intelligence pipeline, market/role controls, privacy operations, and deployment evidence.

## Non-negotiable boundaries

- HCI and AI LEGO are peer products; integration is versioned API/event contract only, never a cross-product database query or FK.
- No real-person data, production deployment, EU/US regulated-market claim, controller/processor claim, or public-web fetch is enabled merely by this plan.
- Every restricted-table migration requires expand/compatibility proof, non-owner RLS tests, synthetic fixtures, rollback/forward-recovery instructions, and an independent review.
- `HD-06` through `HD-23` are implemented as explicit admission/policy gates, not silently assumed product behavior.

## Delivery sequence

### Phase 0 — Canonical decisions and executable gates

1. Reconcile documentation that incorrectly calls HD-06/07 resolved; the canonical state remains the owning `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` and the decision register.
2. Convert accepted ADR-0009/0010/0011/0014/0015/0016 from synthetic skeletons into Docker-real-tested runtime controls.
3. Write an ADR and machine-readable default-deny policy for each remaining HD. Engineering recommendations can be built only where they do not assert external legal/market facts; real-data admission remains blocked by HD-07/20/21 evidence.

Acceptance: empty isolated DB migration/up/down succeeds; all RLS, DSR, consent, identity, and tenant tests run as non-owner roles; no design document claims a closed runtime gate without test evidence.

### Phase 1 — Domain and storage foundation

Build `domain/{tenancy,people,permissions,data-subject-requests,case,evidence,claims,assessments,trust,decisions,controls,audit}` plus `database/migrations`, deterministic fixtures, dictionaries, invariants, and state machines.

Record HD-06's limited bitemporal treatment and HD-07's crypto-shredding design as ADR-controlled schema contracts before Evidence data exists. The repository must include as-of replay, immutable/supersession, retention, and destructive-DDL rejection tests.

### Phase 2 — Security and policy boundary

Build verified actor/tenant context, tenant/workspace/project hierarchy, policy evaluation, ABAC/RBAC, service identity, audit trail, break-glass procedure, key compromise response, and CI architecture checks. The application cannot accept a caller-selected tenant ID; Postgres RLS is the final boundary.

### Phase 3 — Contract-first application

Build a single versioned `/v1` API process, OpenAPI/event schemas, standard error envelope, idempotency, correlation IDs, contract compatibility tests, and disabled-by-default portal/Cognitive adapters. First synthetic vertical slice: create Person → authorization → DSR lifecycle → immutable audit query.

### Phase 4 — Evidence and decision core

After Phase 1/2 gates and cross-box restore evidence: build Case/Engagement, Evidence→Claim→Assessment→Decision traceability, method/version provenance, bitemporal replay, math specifications, golden/property/counterfactual tests, and a fail-closed insufficient-data state.

### Phase 5 — External intelligence and paid operation

Only after an actual HD-19 isolation proof, HD-16 ownership decision, HD-20/21 legal-market gate evidence, and restore drill: build public-fetch worker, SSRF/malware/prompt-injection/source-poisoning controls, source provenance, false-match/allegation counter-search tests, web UI, operational runbooks, and data admission controls.

## Required repository layout

```text
systems/hci30/
  apps/{api,web,worker}/
  domain/{tenancy,people,permissions,data-subject-requests,case,evidence,claims,assessments,trust,decisions,controls,audit}/
  application/{commands,queries,policies}/
  adapters/{postgres,auth,portal,cognitive-os,observability,object-storage}/
  packages/{kernel,contracts,test-support}/
  database/{migrations,fixtures,tests}/
  tests/{unit,integration,contract,architecture,e2e,security}/
  docs/
```

## Evidence and stop conditions

| Gate | Required evidence | Stop condition |
|---|---|---|
| Local DB | Docker PostgreSQL 15.8 migration/RLS suite under non-owner roles | Docker unavailable or any denial test leaks metadata |
| Real data | cross-box restore drill, DSR/RLS/policy gates, HD-07/20/21 records | no restricted or real-person admission |
| Fetch worker | network-isolation, DNS-rebind, SSRF/malware/prompt-injection tests | no public-web fetch execution |
| Commercial/Enterprise | market/role controls, export/deletion/incident evidence, external security review | no customer security/SLA/BYOK/dedicated-DB claim |

## First implementation increment

Create TypeScript strict toolchain, CI-quality local test commands, migration manifest, architecture-boundary tests, signed tenant-context contract, and the synthetic Person/DSR API vertical slice. It must not connect to the portal, Cognitive OS, production infrastructure, or any real data source.

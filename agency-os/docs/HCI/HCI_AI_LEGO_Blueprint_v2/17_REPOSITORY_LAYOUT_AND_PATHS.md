# 17 — Repository Layout & Exact Paths

## Purpose

Provide a concrete workspace structure for implementation under `D:\Work\`. The intent is to preserve product separation without introducing a parallel `systems\` classification that the workspace does not otherwise use.

## Recommended top-level layout

```text
D:\Work\
│
├── Projects\
│   ├── internal\
│   │   ├── hci30\
│   │   ├── ziwei-doushu\
│   │   └── cognitive-engineering-os\  -- create only when that product has runtime code
│   └── clients\
│
├── agency-os\
│   ├── docs\
│   ├── AI_LEGO_Cognitive_Engineering_OS\
│   └── HCI\
│       ├── HCI_AI_LEGO_Blueprint_v1\  -- superseded historical record
│       ├── HCI_AI_LEGO_Blueprint_v2\  -- this document set
│       │   └── governance\             -- ADR register, accepted ADRs, and proposal template
│       └── HCI30_RESEARCH_REVIEW\     -- audit trail / decision evidence, see below
│
├── lobster-factory\  -- shared factory workflows and existing infrastructure only
└── scripts\           -- workspace operational scripts
```

**Existing directories confirmed current (verified 2026-09-01)**: `docs\AI_LEGO_Cognitive_Engineering_OS\` already exists with real, ADR-governed `specs/*.yaml` files — do not treat this layout as greenfield for the AI LEGO side. `docs\HCI\HCI_AI_LEGO_Blueprint_v1\` is superseded; keep it in place, unmodified, as historical record. `docs\HCI\HCI30_RESEARCH_REVIEW\` holds the full evidence chain behind every decision in this V2 document — not required reading to build, but the reference of record for "why." `docs\HCI\HCI_AI_LEGO_Blueprint_v2\governance\` is the current ADR register, proposal template, and accepted-decision record; only entries explicitly recorded as `ACCEPTED` with human approval are architecture decisions.

## HCI-30

```text
D:\Work\Projects\internal\hci30\
│
├── apps\
│   ├── web\
│   ├── desktop\
│   ├── mobile\
│   ├── admin-console\
│   └── enterprise-console\
│
├── domain\
│   ├── people\
│   ├── organizations\
│   ├── relationships\
│   ├── interactions\
│   ├── evidence\
│   ├── claims\
│   ├── assessments\
│   ├── trust\
│   ├── risk\
│   ├── permissions\
│   ├── decisions\
│   ├── outcomes\
│   ├── cases\                    -- new in V2, see 07 §Case Aggregate
│   ├── controls\                 -- new in V2, see 04 §Cooperation Safety Principle
│   ├── data-subject-requests\    -- new in V2, see 07 §Data Subject Rights
│   └── identity-corrections\     -- new in V2, see 07 §Identity Correction
│
├── intelligence\
│   ├── reliability\
│   ├── behaviour\
│   ├── incentives\
│   ├── power\
│   ├── conflict\
│   ├── communication\
│   ├── context\
│   ├── network\
│   ├── confidence\
│   ├── calibration\
│   └── explainability\
│
├── public-intelligence\
│   ├── identity-resolution\
│   ├── content-isolation\        -- new in V2, see 06 §Content Isolation
│   ├── search-planner\
│   ├── retrieval\
│   ├── source-registry\
│   ├── source-quality\
│   ├── source-graph\
│   ├── claim-extraction\
│   ├── claim-validation\
│   ├── contradiction\
│   ├── timeline\
│   ├── multilingual\
│   ├── jurisdictions\
│   └── monitoring\
│
├── governance\
│   ├── HCI_DOMAIN_POLICY.yaml
│   ├── HCI_METHOD_POLICY.yaml
│   ├── HCI_DATA_POLICY.yaml
│   ├── HCI_DECISION_POLICY.yaml
│   └── HCI_PUBLIC_INTELLIGENCE_POLICY.yaml
│
├── integrations\
│   └── cognitive-os\
│       ├── adapter\
│       ├── request-mapper\
│       ├── result-mapper\
│       ├── policy-mapper\
│       ├── events\
│       └── contract-tests\
│
├── security\
│   ├── evidence-integrity\       -- includes crypto-shredding, see 07 §Immutability vs. Erasure
│   └── threat-models\
│
├── api\
├── database\
├── tests\
│   └── architecture\             -- CI-blocking gates, see 13 §Enforcement Discipline
├── packages\
│   └── contracts\
├── infra\
│   └── local\
├── scripts\
└── docs\
```

## AI LEGO Cognitive Engineering OS

```text
D:\Work\Projects\internal\cognitive-engineering-os\
│
├── method-atlas\
├── workflow\
├── execution\
├── authority\
├── model-routing\
├── verification\
├── convergence\
├── replay\
├── rollback\
├── handoff\
├── jurisdiction\
├── contracts\
├── tests\
└── docs\
```

## Existing mother-document location

Retain: `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\`. Recommended specification files around the mother documents: `00_LEGO_CONSTITUTION.md`, `01_LEGO_BOUNDARY_AND_DEPENDENCY_STANDARD.md`, `02_DOMAIN_METHOD_PACK_STANDARD.md`, `03_SOLUTION_INTEGRATION_CONTRACT_STANDARD.md`, `04_DATA_OWNERSHIP_AND_EVENT_STANDARD.md`. These are specifications. Runtime implementation belongs under `Projects\internal\cognitive-engineering-os\` when that product has runtime code.

## Cross-product components

Do **not** pre-create a `shared\` tree. A component remains inside its owning product until two independent products require the same versioned contract and an ADR records the ownership, release, and rollback policy. Only then create the component at `D:\Work\Projects\shared\{platform,contracts,method-packs}\`; it is a versioned package source, never a live shared database or an unbounded "god platform". HCI-specific psychology and trust methods remain HCI-owned.

## HCI recipes

```text
D:\Work\Projects\internal\hci30\recipes\
│
├── hci.quick-person-research.yaml
├── hci.standard-person-research.yaml
├── hci.deep-person-due-diligence.yaml
├── hci.partner-assessment.yaml
├── hci.conflict-analysis.yaml
├── hci.negotiation-preparation.yaml
├── hci.relationship-review.yaml
└── hci.high-risk-decision.yaml
```

These recipes may optionally invoke AI LEGO capabilities.

## Existing deploy/observability tooling *(new section in V2 — do not rebuild)*

**Verified 2026-08-29**: a working deploy pipeline (`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` — pre-build image snapshot, Docker healthcheck wait loop, HTTP smoke-check gate, automatic rollback on smoke failure), a primary+verify+offsite backup discipline (`backup-ks-aw-01.sh`, `verify-backup-ks-aw-01.sh`), an observability stack (`docker-compose.observability.yml` — Grafana/Loki/Promtail), and CI/CD gates (`.github/workflows/sg-deploy.yml`, `next-admin-typecheck.yml`, `release-gate-main.yml`) **already exist and are production-proven** on the current infrastructure. HCI-30 must plug into these, not design parallel replacements — reading Waves in isolation without knowing this tooling exists is a direct zero-rework violation. Full reasoning: `HCI30_RESEARCH_REVIEW/08_DEVOPS_SRE_REVIEW.md` D-03, D-06.

## ADRs

**Updated 2026-09-02**: all 33 ADRs listed below now exist and are `ACCEPTED` — `governance/ADR_INDEX.md` is the authoritative state (topic, gate status, approval citation) for every one; this list is a filename/scope index only. A decision record is not an implementation — every gate remains `OPEN` until its named artifact and test exist, per `ADR_INDEX.md`'s gate table. Use `governance/HCI_CHANGE_PROPOSAL_TEMPLATE.md` for any future material change.

```text
ADR-0001-hci-and-cognitive-os-are-peer-products.md
ADR-0002-no-cross-product-database-access.md
ADR-0003-api-aware-wave-unified-gateway.md
ADR-0004-no-universal-human-trust-score.md
ADR-0005-hci-ai-lego-integration-is-optional.md
ADR-0006-domain-evidence-and-execution-evidence-are-distinct.md
ADR-0007-modular-monolith-first.md                             -- amended on one point by ADR-0021
ADR-0008-vendor-neutral-domain-core.md
ADR-0009-tenant-organization-model-reconciliation.md          -- resolves 02 HD-01
ADR-0010-consent-entity-scope.md                               -- resolves 07 HD-02
ADR-0011-hci-subject-type-scope.md                             -- resolves 02 HD-00
ADR-0012-regulatory-market-scope.md                            -- resolves 11 HD-20
ADR-0013-shared-foundation-kernel-extraction.md                -- resolves 09 HD-09
ADR-0014-data-subject-rights-channel.md                        -- resolves 07 HD-03
ADR-0015-restricted-subject-identity-confirmation.md           -- resolves 06 HD-04
ADR-0016-mandatory-tenant-rls.md                                -- resolves 11 HD-05; tenancy-principal mechanism -> ADR-0033
ADR-0017-bitemporal-scope.md                                    -- resolves 07 HD-06
ADR-0018-crypto-shredding-for-erasure.md                        -- resolves 07 HD-07
ADR-0019-deterministic-probabilistic-llm-human-field-policy.md  -- resolves 10 HD-08
ADR-0020-case-engagement-aggregate.md                            -- resolves 07 HD-10
ADR-0021-physical-isolation-of-hci-postgres.md                  -- resolves 07 HD-11; amends ADR-0007
ADR-0022-minimal-key-rotation-and-compromise-runbook.md         -- resolves 11 HD-12
ADR-0023-block-byok-dedicated-db-sales-claims.md                -- resolves 11 HD-13
ADR-0024-multi-region-trigger-condition.md                      -- resolves 12 HD-14
ADR-0025-ai-agent-credentials-for-restricted-data.md            -- resolves 11 HD-15
ADR-0026-claim-source-tenant-ownership.md                       -- resolves 06 HD-16
ADR-0027-sanctions-screening-ownership.md                       -- resolves 09 HD-17
ADR-0028-bulk-export-prevention-control.md                      -- resolves 11 HD-18
ADR-0029-isolated-fetch-worker-not-trigger-dev.md                -- resolves 06 HD-19; narrows ADR-0007 gate 4
ADR-0030-controller-processor-determination.md                   -- resolves 11 HD-21
ADR-0031-ai-lego-usage-metering-attribution.md                   -- resolves 10 HD-22
ADR-0032-personality-and-behavioral-method-disposition.md        -- resolves 05 HD-23
ADR-0033-signed-tenant-context-principal.md                      -- resolves ADR-0016's tenancy-principal open item
```

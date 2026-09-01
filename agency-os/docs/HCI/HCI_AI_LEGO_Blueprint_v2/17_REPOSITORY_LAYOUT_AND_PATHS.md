# 17 — Repository Layout & Exact Paths

## Purpose

Provide a concrete repository structure for implementation under `D:\Work\agency-os\`. The intent is to preserve product separation while allowing shared platform components and optional integrations.

## Recommended top-level layout

```text
D:\Work\agency-os\
│
├── systems\
│   ├── hci30\
│   ├── cognitive-engineering-os\
│   └── future-systems\
│
├── shared\
│   ├── platform\
│   ├── contracts\
│   ├── method-packs\
│   ├── integrations\
│   └── sdk\
│
├── recipes\
│   ├── hci\
│   └── cognitive\
│
├── docs\
│   ├── AI_LEGO_Cognitive_Engineering_OS\
│   └── HCI\
│       ├── HCI_AI_LEGO_Blueprint_v1\  -- superseded historical record
│       ├── HCI_AI_LEGO_Blueprint_v2\  -- this document set
│       │   └── governance\             -- ADR register, accepted ADRs, and proposal template
│       └── HCI30_RESEARCH_REVIEW\     -- audit trail / decision evidence, see below
│
├── infra\
├── tests\
└── ops\
```

**Existing directories confirmed current (verified 2026-09-01)**: `docs\AI_LEGO_Cognitive_Engineering_OS\` already exists with real, ADR-governed `specs/*.yaml` files — do not treat this layout as greenfield for the AI LEGO side. `docs\HCI\HCI_AI_LEGO_Blueprint_v1\` is superseded; keep it in place, unmodified, as historical record. `docs\HCI\HCI30_RESEARCH_REVIEW\` holds the full evidence chain behind every decision in this V2 document — not required reading to build, but the reference of record for "why." `docs\HCI\HCI_AI_LEGO_Blueprint_v2\governance\` is the current ADR register, proposal template, and accepted-decision record; only entries explicitly recorded as `ACCEPTED` with human approval are architecture decisions.

## HCI-30

```text
D:\Work\agency-os\systems\hci30\
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
└── docs\
```

## AI LEGO Cognitive Engineering OS

```text
D:\Work\agency-os\systems\cognitive-engineering-os\
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

Retain: `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\`. Recommended specification files around the mother documents: `00_LEGO_CONSTITUTION.md`, `01_LEGO_BOUNDARY_AND_DEPENDENCY_STANDARD.md`, `02_DOMAIN_METHOD_PACK_STANDARD.md`, `03_SOLUTION_INTEGRATION_CONTRACT_STANDARD.md`, `04_DATA_OWNERSHIP_AND_EVENT_STANDARD.md`. These are specifications. Runtime implementation belongs under `systems\cognitive-engineering-os\`.

## Shared platform

```text
D:\Work\agency-os\shared\platform\
│
├── identity\
├── tenants\
├── iam\
├── policy\
├── audit\
├── secrets\
├── event-bus\               -- staged NOW/NEXT/FUTURE, see 13_TESTING_.../
│                                HCI30_RESEARCH_REVIEW/13_ARCHITECTURE_OPTIONS_MATRIX.md §4;
│                                no broker exists in current infra, do not build Day-1
├── observability\           -- reuse the ALREADY-RUNNING Loki/Promtail/Grafana + Uptime
│                                Kuma stack (verified 2026-08-29) — do not build a second one
├── capability-registry\
├── licensing\
└── config\
```

## Shared contracts *(new emphasis in V2)*

```text
D:\Work\agency-os\shared\contracts\
│
├── epistemic\           -- the Shared Kernel, see 09 §Shared Kernel — vendored/pinned by
│                            both HCI and AI LEGO, not a live shared service
├── risk-tier\
├── entity-refs\          -- EntityRef, PersonRef, OrganizationRef, EvidenceRef, TenantContext,
│                            ActorRef, SourceRef — actually build these thin references, which
│                            18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md already specified but
│                            V1 never implemented (see 09 §Shared Kernel for why this matters)
└── tenant\
```

## Shared method packs

Only genuinely cross-domain methods belong here.

```text
D:\Work\agency-os\shared\method-packs\
│
├── strategy\
├── negotiation\
├── research\
├── decision\
└── systems-thinking\
```

HCI-specific psychology/trust methods should remain HCI-owned unless later proven genuinely reusable.

## HCI recipes

```text
D:\Work\agency-os\recipes\hci\
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

## ADRs to create

At minimum, extended in V2. Until Wave 0 creates an ADR and records its approval, the authoritative planning state is `governance/ADR_INDEX.md`; use `governance/HCI_CHANGE_PROPOSAL_TEMPLATE.md` to prepare a change without silently choosing an option.

```text
ADR-0001-hci-and-cognitive-os-are-peer-products.md
ADR-0002-no-cross-product-database-access.md
ADR-0003-api-aware-wave-is-unified-gateway.md
ADR-0004-no-universal-human-trust-score.md
ADR-0005-hci-ai-integration-is-optional.md
ADR-0006-domain-evidence-and-execution-evidence-are-distinct.md
ADR-0007-modular-monolith-first.md
ADR-0008-vendor-neutral-domain-core.md
ADR-0009-tenant-organization-model-reconciliation.md         -- new, resolves 02 HD-01
ADR-0010-consent-entity-scope.md                              -- new, resolves 07 HD-02
ADR-0011-hci-subject-type-scope.md                             -- new, resolves 02 HD-00
ADR-0012-regulatory-market-scope.md                            -- new, resolves 11 HD-20
ADR-0013-shared-foundation-kernel-extraction.md                -- new, formalizes 09 §Shared Kernel
```

> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/17_REPOSITORY_LAYOUT_AND_PATHS.md. See 00_README.md in this folder for why.

# 17 — Repository Layout & Exact Paths

## Purpose

Provide a concrete repository structure for implementation under:

```text
D:\Work\agency-os\
```

The intent is to preserve product separation while allowing shared platform components and optional integrations.

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
│   ├── HCI30\
│   └── ADR\
│
├── infra\
├── tests\
└── ops\
```

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
│   └── outcomes\
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
│   ├── HCI_DOMAIN_POLICY.yaml\
│   ├── HCI_METHOD_POLICY.yaml\
│   ├── HCI_DATA_POLICY.yaml\
│   ├── HCI_DECISION_POLICY.yaml\
│   └── HCI_PUBLIC_INTELLIGENCE_POLICY.yaml\
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
├── api\
├── database\
├── tests\
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

Retain:

```text
D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\
```

Recommended specification files around the mother documents:

```text
00_LEGO_CONSTITUTION.md
01_LEGO_BOUNDARY_AND_DEPENDENCY_STANDARD.md
02_DOMAIN_METHOD_PACK_STANDARD.md
03_SOLUTION_INTEGRATION_CONTRACT_STANDARD.md
04_DATA_OWNERSHIP_AND_EVENT_STANDARD.md
```

These are specifications. Runtime implementation belongs under:

```text
systems\cognitive-engineering-os\
```

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
├── event-bus\
├── observability\
├── capability-registry\
├── licensing\
└── config\
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
├── hci.quick-person-research.yaml\
├── hci.standard-person-research.yaml\
├── hci.deep-person-due-diligence.yaml\
├── hci.partner-assessment.yaml\
├── hci.conflict-analysis.yaml\
├── hci.negotiation-preparation.yaml\
├── hci.relationship-review.yaml\
└── hci.high-risk-decision.yaml\
```

These recipes may optionally invoke AI LEGO capabilities.

## ADRs to create

At minimum:

```text
ADR-0001-hci-and-cognitive-os-are-peer-products.md
ADR-0002-no-cross-product-database-access.md
ADR-0003-api-aware-wave-is-unified-gateway.md
ADR-0004-no-universal-human-trust-score.md
ADR-0005-hci-ai-integration-is-optional.md
ADR-0006-domain-evidence-and-execution-evidence-are-distinct.md
ADR-0007-modular-monolith-first.md
ADR-0008-vendor-neutral-domain-core.md
```

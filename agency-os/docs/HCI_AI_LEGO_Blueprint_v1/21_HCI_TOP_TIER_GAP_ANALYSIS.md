> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/21_HCI_TOP_TIER_GAP_ANALYSIS.md. See 00_README.md in this folder for why.

# 21 — HCI-30 Top-Tier Gap Analysis

## Verdict

**HCI-30 is not yet “top-tier complete”.**

It already has a strong architecture constitution and unusually good product boundaries, but it is currently an **architecture baseline / high-level specification**, not yet a production-verifiable world-class system.

Recommended maturity interpretation:

```text
Vision / product architecture           9.0 / 10
Domain boundary design                  8.5 / 10
LEGO / modularity direction             8.5 / 10
Explainability philosophy               9.0 / 10
Commercial edition strategy             8.0 / 10

Executable domain specification         4.5 / 10
Security implementation specification   6.0 / 10
Privacy/compliance operations           5.0 / 10
SRE/DR measurable readiness             5.0 / 10
Scientific/model validation             4.5 / 10
API/event contract completeness         4.5 / 10
Supply-chain security                    4.0 / 10
Adversarial OSINT/AI security            4.0 / 10
```

The target is not “more features”. The target is:

```text
Correct
+ measurable
+ enforceable
+ testable
+ replayable
+ rollbackable
+ migratable
+ legally operable
+ independently auditable
```

# P0 — Must resolve before production core coding

## P0-01 Formal Domain ERD + invariants

Path:

```text
D:\Work\agency-os\systems\hci30\docs\domain\
├── HCI_DOMAIN_ERD.md
├── HCI_ENTITY_DICTIONARY.md
├── HCI_INVARIANTS.md
└── HCI_STATE_MACHINES.md
```

Implementation:

```text
D:\Work\agency-os\systems\hci30\database\
├── schema\
├── migrations\
└── constraints\
```

Expected result: no developer or AI can invent a different meaning for Person, Claim, Evidence, Assessment, Risk, Permission, or Decision.

## P0-02 Bitemporal history

HCI must distinguish:

```text
VALID TIME  = when the real-world fact was true
SYSTEM TIME = when HCI learned/stored/changed it
```

Path:

```text
D:\Work\agency-os\systems\hci30\docs\data\HCI_BITEMPORAL_DATA_STANDARD.md
```

Expected result: replay can answer “what did HCI know on date X?”

## P0-03 Evidence tamper-evidence

Path:

```text
D:\Work\agency-os\systems\hci30\security\evidence-integrity\
```

Specify:
- content/source/attachment hashes
- immutable audit refs
- correction lineage
- optional WORM/object-lock
- hash-chain/Merkle verification where justified

Expected result: critical evidence cannot be silently rewritten without detection.

## P0-04 Mathematical specifications

Path:

```text
D:\Work\agency-os\systems\hci30\docs\intelligence\
├── HCI_EVIDENCE_QUALITY_SPEC.md
├── HCI_CONFIDENCE_SPEC.md
├── HCI_TRUST_DOMAIN_SPEC.md
├── HCI_RISK_SPEC.md
├── HCI_PERMISSION_SPEC.md
├── HCI_CONTRADICTION_SPEC.md
└── HCI_TIME_DECAY_SPEC.md
```

Must define:
- score semantics
- uncertainty
- minimum evidence
- source independence
- contradiction
- time decay
- severity exceptions
- missing data
- model disagreement
- insufficient-data behavior

Expected result: independent implementations given the same inputs produce equivalent outputs.

## P0-05 Machine-readable HCI policy

Path:

```text
D:\Work\agency-os\systems\hci30\governance\
├── HCI_DOMAIN_POLICY.yaml
├── HCI_HIGH_IMPACT_POLICY.yaml
├── HCI_PROTECTED_DATA_POLICY.yaml
├── HCI_PUBLIC_INTELLIGENCE_POLICY.yaml
└── HCI_METHOD_POLICY.yaml
```

Expected result: safety is enforceable, not advisory prose.

## P0-06 API + Event contracts

Path:

```text
D:\Work\agency-os\systems\hci30\api\
├── openapi\hci-v1.yaml
├── asyncapi\hci-events-v1.yaml
├── schemas\
└── errors\
```

Define auth scopes, tenant context, pagination, idempotency, errors, concurrency, versioning, webhook signatures, deprecation.

Expected result: all clients depend on contracts, not implementation internals.

## P0-07 Tenant-context propagation

Path:

```text
D:\Work\agency-os\shared\platform\tenants\TENANT_CONTEXT_STANDARD.md
```

Define:

```text
tenant_id
organization_id
workspace_id
actor_id
service_account_id
request_id
data_region
policy_context
```

Expected result: tenant identity cannot disappear between gateway, worker, DB, event, export, or AI request.

## P0-08 Public Intelligence threat model

Path:

```text
D:\Work\agency-os\systems\hci30\security\threat-models\
├── TM_PUBLIC_INTELLIGENCE.md
├── TM_FILE_INGESTION.md
├── TM_AI_ANALYSIS.md
└── TM_MULTI_TENANCY.md
```

Threats:
- SSRF
- malicious redirects
- malware
- decompression bombs
- web prompt injection
- source poisoning
- SEO manipulation
- synthetic evidence
- domain impersonation
- malicious MIME
- tool-based exfiltration

Expected result: all external research content is treated as hostile input.

# P1 — Enterprise commercial readiness

## P1-01 Privacy operations

Path:

```text
D:\Work\agency-os\systems\hci30\privacy\
├── DATA_INVENTORY.md
├── PURPOSE_AND_LAWFUL_BASIS_MATRIX.md
├── RETENTION_SCHEDULE.md
├── DSAR_RUNBOOK.md
├── DELETION_RUNBOOK.md
├── DPIA_TEMPLATE.md
├── CROSS_BORDER_TRANSFER_MATRIX.md
├── SUBPROCESSOR_REGISTER_SCHEMA.md
└── CONSENT_AND_NOTICE_MODEL.md
```

Expected result: privacy requests are operational workflows.

## P1-02 Security-control baseline

Path:

```text
D:\Work\agency-os\shared\security\controls\
├── SECURITY_CONTROL_CATALOG.md
├── CONTROL_CROSSWALK.md
└── EVIDENCE_COLLECTION_PLAN.md
```

Target alignment:
- ISO/IEC 27001:2022
- NIST CSF 2.0
- NIST SSDF
- OWASP ASVS 5.0
- OWASP API Security Top 10
- ISO/IEC 42001:2023 where applicable
- NIST AI RMF / GenAI Profile where applicable

Expected result: enterprise questionnaires map to evidence-backed controls.

## P1-03 Supply-chain security

Path:

```text
D:\Work\agency-os\shared\security\supply-chain\
```

Require SBOM, dependency pinning, SAST, DAST, secrets scanning, IaC scanning, image scanning, artifact signing, build provenance, protected branches.

Expected result: compromised dependencies/builds have constrained blast radius.

## P1-04 Key architecture

Path:

```text
D:\Work\agency-os\shared\security\crypto\
├── KEY_HIERARCHY.md
├── ENVELOPE_ENCRYPTION.md
├── KEY_ROTATION.md
├── BYOK_MODEL.md
└── CRYPTO_ERASURE.md
```

Expected result: encryption becomes an operable lifecycle.

## P1-05 Numerical SLO / RTO / RPO

Path:

```text
D:\Work\agency-os\systems\hci30\ops\sre\
├── SLO.md
├── RTO_RPO.md
├── ERROR_BUDGET_POLICY.md
└── DEPENDENCY_DEGRADATION_MATRIX.md
```

Expected result: reliability can be measured, tested, and contracted.

## P1-06 Incident response

Path:

```text
D:\Work\agency-os\shared\ops\incident-response\
```

Expected result: breach/outage handling is rehearsed and repeatable.

## P1-07 Enterprise identity

Path:

```text
D:\Work\agency-os\shared\platform\identity\
├── IDENTITY_ARCHITECTURE.md
├── SESSION_SECURITY.md
├── SSO_SAML_OIDC.md
├── SCIM_PROVISIONING.md
├── SERVICE_ACCOUNTS.md
└── BREAK_GLASS_ACCESS.md
```

Invariant:

```text
app.aware-wave.com != portal.aware-wave.com
```

Expected result: internal operators and external customers remain separate trust zones.

# P2 — World-class differentiation

## P2-01 Scientific/Method Governance Board

Path:

```text
D:\Work\agency-os\systems\hci30\governance\methods\
├── METHOD_REVIEW_STANDARD.md
├── EVIDENCE_GRADING_STANDARD.md
├── METHOD_VALIDATION_PROTOCOL.md
├── METHOD_DEPRECATION_PROTOCOL.md
└── LICENSE_REGISTER.md
```

Expected result: empirical, professional, heuristic, self-reflective, and experimental methods are visibly differentiated.

## P2-02 Model/prompt/retrieval governance

Path:

```text
D:\Work\agency-os\systems\hci30\ai\
├── MODEL_REGISTRY.md
├── PROMPT_REGISTRY.md
├── EVAL_DATASET_STANDARD.md
├── RETRIEVAL_SECURITY.md
├── MODEL_CHANGE_GATE.md
└── DRIFT_MONITORING.md
```

Expected result: provider/prompt changes cannot silently change enterprise decisions.

## P2-03 Value of Information

Path:

```text
D:\Work\agency-os\systems\hci30\intelligence\value-of-information\
```

Expected result: HCI recommends the most valuable next validation instead of collecting endless data.

## P2-04 Sensitivity / robustness

Path:

```text
D:\Work\agency-os\systems\hci30\intelligence\robustness\
```

Expected result: users see whether a decision is robust or flips under small assumption changes.

## P2-05 Scenario simulation

Path:

```text
D:\Work\agency-os\systems\hci30\intelligence\scenarios\
```

Expected result: HCI evaluates future collaboration failure modes, not only historical behavior.

## P2-06 Synthetic evidence / content provenance

Support document/media provenance and synthetic-content awareness where feasible.

Expected result: HCI is resilient to an internet increasingly filled with synthetic evidence.

# P3 — Long-term LEGO ecosystem

## P3-01 Plugin sandbox

Path:

```text
D:\Work\agency-os\shared\platform\lego-runtime\
```

Need signed manifests, permissions, quotas, network/secret scopes, kill switch, audit, compatibility.

Expected result: extensions cannot gain implicit full-platform privilege.

## P3-02 Data portability

Path:

```text
D:\Work\agency-os\systems\hci30\data-portability\
```

Expected result: region migration, SaaS→Private, export/import do not require bespoke engineering.

## P3-03 Globalization/accessibility

Path:

```text
D:\Work\agency-os\systems\hci30\product-foundation\
├── I18N_STANDARD.md
├── NAME_AND_IDENTITY_STANDARD.md
├── TIMEZONE_AND_CALENDAR_STANDARD.md
└── ACCESSIBILITY_STANDARD.md
```

Expected result: global use is native, not retrofit.

# Top-tier acceptance rule

Architecture may be called top-tier only after all P0 items are complete.

Enterprise-ready requires:

```text
P0 complete
+ critical P1 complete
+ restore test passed
+ tenant isolation test passed
+ external security assessment passed
+ privacy operations tested
+ model/method validation baseline
```

Mature/world-class requires outcome calibration demonstrating that the system improves decisions without unacceptable bias or false certainty.

# Critical priority

Do not add more psychology, strategy methods, dashboards, or AI models before P0 is complete.

```text
Formal semantics + enforceable contracts + operational proof
>
More features
```

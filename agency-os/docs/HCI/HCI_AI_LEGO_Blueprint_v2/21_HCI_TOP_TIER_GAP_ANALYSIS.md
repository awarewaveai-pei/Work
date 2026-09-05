# 21 — HCI-30 Top-Tier Gap Analysis

## Verdict

**HCI-30 is not yet "top-tier complete".**

It has a strong architecture constitution and unusually good product boundaries — confirmed by independent re-derivation, not merely asserted (`02_PRODUCT_BOUNDARIES.md`) — but it is currently an **architecture baseline / high-level specification**, not yet a production-verifiable world-class system.

Recommended maturity interpretation (unchanged scoring methodology from V1; scores reflect the state before V2's changes are implemented):

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

**Verdict on enforcement, added in V2**: an independent Red Team review, cross-checked against every other reviewer's recommendation for what to keep unchanged, found that none of the "Executable..."/"Security..."/"Privacy..." scores above are protected by anything actually enforced today — the low scores reflect real absence, not conservative grading. See `01_SYSTEM_CONSTITUTION.md` Invariant 8.

The target is not "more features." The target is: Correct + measurable + enforceable + testable + replayable + rollbackable + migratable + legally operable + independently auditable.

# P0 — Must resolve before production core coding

## P0-01 Formal Domain ERD + invariants

Path: `D:\Work\Projects\internal\hci30\docs\domain\{HCI_DOMAIN_ERD.md, HCI_ENTITY_DICTIONARY.md, HCI_INVARIANTS.md, HCI_STATE_MACHINES.md}`. Implementation: `D:\Work\Projects\internal\hci30\database\{schema, migrations, constraints}\`.

**Must incorporate, new in V2**: `Case`/`Engagement`, `DataSubjectRequest`, `PersonMergeLog`/`PersonSplitLog`, `Control`/`Mitigation` (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`), the ADR-0011 `subject_type`/`subject_id` forward-compatible Person-default shape, and the Shared Kernel thin-reference types (`09` §Shared Kernel) rather than full-record duplication.

Expected result: no developer or AI can invent a different meaning for Person, Claim, Evidence, Assessment, Risk, Permission, or Decision.

## P0-02 Bitemporal history

**Resolved in V2, scoped**: full bitemporal treatment (`VALID TIME` vs `SYSTEM TIME`) for Evidence, Claim, Assessment, Decision specifically — not universally. Path: `D:\Work\Projects\internal\hci30\docs\data\HCI_BITEMPORAL_DATA_STANDARD.md`. See `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Bitemporal History for the scoping rationale and the specific columns.

Expected result: replay can answer "what did HCI know on date X?"

## P0-03 Evidence tamper-evidence

Path: `D:\Work\Projects\internal\hci30\security\evidence-integrity\`. Specify: content/source/attachment hashes, immutable audit refs, correction lineage, **crypto-shredding (resolved in V2, replaces the "optional WORM/object-lock" language — see `07` §Immutability vs. Erasure for why literal WORM is both legally problematic and currently infeasible on this infrastructure)**, hash-chain/Merkle verification where justified.

Expected result: critical evidence cannot be silently rewritten without detection, **and can still be lawfully erased when required (new in V2)**.

## P0-04 Mathematical specifications

Path: `D:\Work\Projects\internal\hci30\docs\intelligence\{HCI_EVIDENCE_QUALITY_SPEC.md, HCI_CONFIDENCE_SPEC.md, HCI_TRUST_DOMAIN_SPEC.md, HCI_RISK_SPEC.md, HCI_PERMISSION_SPEC.md, HCI_CONTRADICTION_SPEC.md, HCI_TIME_DECAY_SPEC.md}`.

Must define: score semantics, uncertainty, minimum evidence, source independence, contradiction, time decay, severity exceptions, missing data, model disagreement, insufficient-data behavior, **and (new in V2) the Trust-Domain-to-Assessment-Dimension roll-up formula (`04_HCI30_PRODUCT_SPEC.md` note) and the qualitative-band-to-probability-range mapping (`19` §Confidence Display) until this spec ships**.

**Partial closure (2026-09-06)**: the Trust-Domain-to-Assessment-Dimension roll-up formula sub-item is done — `Projects/internal/hci30/docs/intelligence/HCI_TRUST_DOMAIN_SPEC.md`, using ADR-0032's already-ratified qualitative-band scale (reusing `19`'s Confidence Display bands rather than a second numeric scale).

**Second partial closure, same day**: `HCI_CONFIDENCE_SPEC.md` also gained a partial closure — `Projects/internal/hci30/docs/intelligence/HCI_CONFIDENCE_SPEC.md` covers method-to-dimension combination only (multiple methods' findings about one Assessment Dimension, combined via mean-of-ranks with a disclosed `disagreement` flag rather than silently averaged away). Still open within that same file: Evidence Confidence, Model Agreement (incl. the source-independence wiring), Method Robustness, Decision Confidence, the qualitative-band-to-probability-range mapping, and calibration.

The remaining five specs (`HCI_EVIDENCE_QUALITY_SPEC.md`, `HCI_RISK_SPEC.md`, `HCI_PERMISSION_SPEC.md`, `HCI_CONTRADICTION_SPEC.md`, `HCI_TIME_DECAY_SPEC.md`) — plus the still-open pieces of `HCI_CONFIDENCE_SPEC.md` named above — covering source independence, contradiction, time decay, severity exceptions, permission implications, and model disagreement/calibration, remain open; see `HCI_TRUST_DOMAIN_SPEC.md` §Explicitly out of scope and `HCI_CONFIDENCE_SPEC.md`'s own open-items list for the exact boundary.

Expected result: independent implementations given the same inputs produce equivalent outputs.

## P0-05 Machine-readable HCI policy

Path: `D:\Work\Projects\internal\hci30\governance\{HCI_DOMAIN_POLICY.yaml, HCI_HIGH_IMPACT_POLICY.yaml, HCI_PROTECTED_DATA_POLICY.yaml, HCI_PUBLIC_INTELLIGENCE_POLICY.yaml, HCI_METHOD_POLICY.yaml}`.

**Must incorporate, new in V2**: the deterministic/probabilistic/LLM-assisted/human-only field policy (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Cross-Model Gate) and the self-reflection→formal-trust-domain forbidden-transition enforcement (`09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §HCI Must Not Duplicate), both reusing AI LEGO's existing enforcement mechanisms.

Expected result: safety is enforceable, not advisory prose.

## P0-06 API + Event contracts

Path: `D:\Work\Projects\internal\hci30\api\{openapi\hci-v1.yaml, asyncapi\hci-events-v1.yaml, schemas\, errors\}`. Define auth scopes, tenant context, pagination, idempotency, errors, concurrency, versioning, webhook signatures, deprecation.

Expected result: all clients depend on contracts, not implementation internals.

## P0-07 Tenant-context propagation

Path: `D:\Work\Projects\internal\hci30\packages\contracts\tenant-context\TENANT_CONTEXT_STANDARD.md`. Define: `tenant_id`, `organization_id`, `workspace_id`, `actor_id`, `service_account_id`, `request_id`, `data_region`, `policy_context`.

**ADR-0009 (`HD-01=A`) resolves the Tenant/Organization model before this standard is written** — the standard must implement its AI LEGO ADR-003 Tenant semantic and portal-adapter mapping; do not freeze it until the mapping, compatibility/migration plan, and cross-tenant negative test gates are closed.

Expected result: tenant identity cannot disappear between gateway, worker, DB, event, export, or AI request.

## P0-08 Public Intelligence threat model

Path: `D:\Work\Projects\internal\hci30\security\threat-models\{TM_PUBLIC_INTELLIGENCE.md, TM_FILE_INGESTION.md, TM_AI_ANALYSIS.md, TM_MULTI_TENANCY.md}`.

Threats: SSRF, malicious redirects, malware, decompression bombs, web prompt injection, source poisoning, SEO manipulation, synthetic evidence, domain impersonation, malicious MIME, tool-based exfiltration, **investigation-footprint detectability (new in V2, see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Investigation Footprint)**.

Expected result: all external research content is treated as hostile input.

## P0-09 RLS enforcement gate *(new in V2, elevated from V1's Testing chapter)*

Path: `D:\Work\Projects\internal\hci30\tests\architecture\test_cross_tenant_isolation.*`. A CI-blocking test connecting as a tenant-scoped non-superuser role, asserting zero cross-tenant rows returned for every RESTRICTED table, on every migration.

**Why this is P0, not a testing-chapter footnote**: this is the single highest-blast-radius technical vulnerability found across the entire V2 review — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant Isolation and `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Enforcement Discipline. Expected result: a leaked credential or missed policy cannot silently expose every tenant's data.

## P0-10 Restore-drill precondition *(new in V2)*

A rehearsed, cross-box (not same-box) restore drill, passed before Wave 4 admits any real, non-synthetic tenant data — moved up from V1's Gate C (paid tier). See `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Backups.

## P0-11 Minimal key-rotation/compromise-response runbook *(new in V2)*

A narrow runbook — not the full BYOK/envelope-encryption architecture, which stays P1-04 — covering what happens if a key/KMS credential is compromised during the build phase. See `11_SECURITY_PRIVACY_GOVERNANCE.md` §Encryption.

## P0-12 Data Subject Rights — pending scope decision

**RESOLVED — ADR-0014 (`HD-03=A`)** makes DataSubjectRequest a P0 entity. The remaining gate is executable synthetic event-lifecycle and tenant-isolation evidence; this does not authorize real-person processing.

# P1 — Enterprise commercial readiness

## P1-01 Privacy operations

Path: `D:\Work\Projects\internal\hci30\privacy\{DATA_INVENTORY.md, PURPOSE_AND_LAWFUL_BASIS_MATRIX.md, RETENTION_SCHEDULE.md, DSAR_RUNBOOK.md, DELETION_RUNBOOK.md, DPIA_TEMPLATE.md, CROSS_BORDER_TRANSFER_MATRIX.md, SUBPROCESSOR_REGISTER_SCHEMA.md, CONSENT_AND_NOTICE_MODEL.md}`.

**Note (new in V2)**: a one-page minimal version of DPIA/lawful-basis/subprocessor artifacts is required earlier, before Wave 6/Phase 5 — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Privacy Operations Sequencing. This P1 entry is the full enterprise-grade version.

Expected result: privacy requests are operational workflows.

## P1-02 Security-control baseline

Path: `D:\Work\Projects\internal\hci30\security\controls\{SECURITY_CONTROL_CATALOG.md, CONTROL_CROSSWALK.md, EVIDENCE_COLLECTION_PLAN.md}`. Target alignment: ISO/IEC 27001:2022, NIST CSF 2.0, NIST SSDF, OWASP ASVS 5.0, OWASP API Security Top 10, ISO/IEC 42001:2023 where applicable, NIST AI RMF / GenAI Profile where applicable.

**Regulatory research note (new in V2)**: `HCI30_RESEARCH_REVIEW/REGULATORY_STANDARDS_RESEARCH_SUPPLEMENTARY.md` provides current (2026-08-29, sourced and dated) MUST/SHOULD/FUTURE/NOT_APPLICABLE classification against this exact standards list — use it as the starting crosswalk rather than researching from scratch.

Expected result: enterprise questionnaires map to evidence-backed controls.

## P1-03 Supply-chain security

Path: `D:\Work\Projects\internal\hci30\security\supply-chain\`. Require SBOM, dependency pinning, SAST, DAST, secrets scanning, IaC scanning, image scanning, artifact signing, build provenance, protected branches.

Expected result: compromised dependencies/builds have constrained blast radius.

## P1-04 Key architecture

Path: `D:\Work\Projects\internal\hci30\security\crypto\{KEY_HIERARCHY.md, ENVELOPE_ENCRYPTION.md, KEY_ROTATION.md, BYOK_MODEL.md, CRYPTO_ERASURE.md}`. **`CRYPTO_ERASURE.md` is now referenced directly from the Wave-1 domain model (`07` §Immutability vs. Erasure), not an isolated enterprise-tier artifact — write it early enough to inform P0-03/P0-12, even though the full key-hierarchy work around it stays P1.**

Expected result: encryption becomes an operable lifecycle.

## P1-05 Numerical SLO / RTO / RPO

Path: `D:\Work\Projects\internal\hci30\ops\sre\{SLO.md, RTO_RPO.md, ERROR_BUDGET_POLICY.md, DEPENDENCY_DEGRADATION_MATRIX.md}`. **Calibrate targets to the verified single-box infrastructure reality — see `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §SLOs.**

Expected result: reliability can be measured, tested, and contracted.

## P1-06 Incident response

Path: `D:\Work\Projects\internal\hci30\docs\operations\incident-response\`. Expected result: breach/outage handling is rehearsed and repeatable.

## P1-07 Enterprise identity

Path: `D:\Work\Projects\internal\hci30\security\identity\{IDENTITY_ARCHITECTURE.md, SESSION_SECURITY.md, SSO_SAML_OIDC.md, SCIM_PROVISIONING.md, SERVICE_ACCOUNTS.md, BREAK_GLASS_ACCESS.md}`.

**Note (new in V2)**: a *minimal* break-glass mechanism is pulled forward to Wave 2 (`11_SECURITY_PRIVACY_GOVERNANCE.md` §Admin Principle) — this P1 entry is the full enterprise-grade version (SSO/SCIM integration).

Invariant: `app.aware-wave.com != portal.aware-wave.com`.

Expected result: internal operators and external customers remain separate trust zones.

# P2 — World-class differentiation

## P2-01 Scientific/Method Governance Board

Path: `D:\Work\Projects\internal\hci30\governance\methods\{METHOD_REVIEW_STANDARD.md, EVIDENCE_GRADING_STANDARD.md, METHOD_VALIDATION_PROTOCOL.md, METHOD_DEPRECATION_PROTOCOL.md, LICENSE_REGISTER.md}`.

**Note (new in V2)**: `05_HCI30_INTELLIGENCE_METHODS.md` already resolves the specific Big Five instrument/licensing and MBTI/Enneagram/Ziwei-Bazi disposition questions this board would otherwise face first — treat those as decided inputs, not open questions for the board to re-litigate.

Expected result: empirical, professional, heuristic, self-reflective, and experimental methods are visibly differentiated.

## P2-02 Model/prompt/retrieval governance

Path: `D:\Work\Projects\internal\hci30\ai\{MODEL_REGISTRY.md, PROMPT_REGISTRY.md, EVAL_DATASET_STANDARD.md, RETRIEVAL_SECURITY.md, MODEL_CHANGE_GATE.md, DRIFT_MONITORING.md}`.

**Coordination note (new in V2)**: build **one** shared registry with AI LEGO, not two independently — see `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Model/Prompt Registry. AI LEGO's own gap register already flags the identical gap for itself.

Expected result: provider/prompt changes cannot silently change enterprise decisions.

## P2-03 Value of Information

Path: `D:\Work\Projects\internal\hci30\intelligence\value-of-information\`. Expected result: HCI recommends the most valuable next validation instead of collecting endless data.

## P2-04 Sensitivity / robustness

Path: `D:\Work\Projects\internal\hci30\intelligence\robustness\`. Expected result: users see whether a decision is robust or flips under small assumption changes.

## P2-05 Scenario simulation

Path: `D:\Work\Projects\internal\hci30\intelligence\scenarios\`. Expected result: HCI evaluates future collaboration failure modes, not only historical behavior.

## P2-06 Synthetic evidence / content provenance

**Partially resolved in V2**: a minimum-viable authenticity check is pulled forward to Wave 4/P0 (`06_HCI30_PUBLIC_INTELLIGENCE.md` §Content Isolation & Authenticity Check). This P2 entry is now specifically the advanced synthetic-media-detection tooling, correctly deferred here.

Expected result: HCI is resilient to an internet increasingly filled with synthetic evidence.

# P3 — Long-term LEGO ecosystem

## P3-01 Plugin sandbox

Path: `D:\Work\Projects\internal\cognitive-engineering-os\lego-runtime\`. Need signed manifests, permissions, quotas, network/secret scopes, kill switch, audit, compatibility. Expected result: extensions cannot gain implicit full-platform privilege.

## P3-02 Data portability

Path: `D:\Work\Projects\internal\hci30\data-portability\`. Expected result: region migration, SaaS→Private, export/import do not require bespoke engineering.

## P3-03 Globalization/accessibility

Path: `D:\Work\Projects\internal\hci30\product-foundation\{I18N_STANDARD.md, NAME_AND_IDENTITY_STANDARD.md, TIMEZONE_AND_CALENDAR_STANDARD.md, ACCESSIBILITY_STANDARD.md}`. Expected result: global use is native, not retrofit.

# Top-tier acceptance rule

Architecture may be called top-tier only after all P0 items are complete (now including P0-09 through P0-12, new in V2).

Enterprise-ready requires: P0 complete + critical P1 complete + restore test passed + tenant isolation test passed + external security assessment passed + privacy operations tested + model/method validation baseline.

Mature/world-class requires outcome calibration demonstrating that the system improves decisions without unacceptable bias or false certainty.

# Critical priority

Do not add more psychology, strategy methods, dashboards, or AI models before P0 is complete.

```text
Formal semantics + enforceable contracts + operational proof
>
More features
```

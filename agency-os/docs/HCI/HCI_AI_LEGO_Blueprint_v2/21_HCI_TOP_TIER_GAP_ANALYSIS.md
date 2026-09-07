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

**Partial closure (2026-09-07)**: all 4 files written, derived from the shipped, real-Docker-tested schema (`database/migrations/0001`-`0011`) — transcription of already-enforced rules, not new design. Covers: all 21 tables + 4 canonical views (ERD + dictionary), every cross-cutting rule (tenant isolation, append-only/no-delete, the effect-based escape hatch, bitemporal history, kind-scoped columns, author-class policy, the Decision-Claim reaudit gate, epistemic promotion, identity confirmation, Case ownership, regulatory scope, ADR-0004, P0-09, SECURITY DEFINER fail-closed — `HCI_INVARIANTS.md`), and every lifecycle FSM (Case, DSR, Identity match, bitemporal supersession, Claim admission, epistemic label — `HCI_STATE_MACHINES.md`). `Case`/`Engagement` and `DataSubjectRequest` (named above) are covered; `PersonMergeLog`/`PersonSplitLog` and `Control`/`Mitigation` are **not** — no migration builds them yet, so there is nothing to document (tracked in `HCI_ENTITY_DICTIONARY.md` §Not yet modelled, not silently dropped). The Shared Kernel thin-reference framing (`09` §Shared Kernel) was not independently re-verified against this pass — the typed composite-FK idiom this schema already uses (`(tenant_id, id, kind)`) is documented as what exists; whether it fully satisfies that section's intent is unconfirmed.

## P0-02 Bitemporal history

**Resolved in V2, scoped**: full bitemporal treatment (`VALID TIME` vs `SYSTEM TIME`) for Evidence, Claim, Assessment, Decision specifically — not universally. Path: `D:\Work\Projects\internal\hci30\docs\data\HCI_BITEMPORAL_DATA_STANDARD.md`. See `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Bitemporal History for the scoping rationale and the specific columns.

Expected result: replay can answer "what did HCI know on date X?"

## P0-03 Evidence tamper-evidence

Path: `D:\Work\Projects\internal\hci30\security\evidence-integrity\`. Specify: content/source/attachment hashes, immutable audit refs, correction lineage, **crypto-shredding (resolved in V2, replaces the "optional WORM/object-lock" language — see `07` §Immutability vs. Erasure for why literal WORM is both legally problematic and currently infeasible on this infrastructure)**, hash-chain/Merkle verification where justified.

Expected result: critical evidence cannot be silently rewritten without detection, **and can still be lawfully erased when required (new in V2)**.

**Partial closure (2026-09-07)**: `HCI_EVIDENCE_TAMPER_EVIDENCE_SPEC.md` maps all 5 required elements to the shipped schema. 2 of 5 fully closed (immutable audit refs — the append-only grant+trigger dual layer; correction lineage — ADR-0017 bitemporal supersession), 1 closed with a tracked Wave-4 gap (crypto-shredding — ADR-0018's key table/reference columns/tombstoning function are built; only the DSR-lifecycle-to-`record_erasure()` wiring is deferred), 2 genuinely blocked on one shared root cause: no real Evidence/Claim payload column exists in this schema yet, so there is no content to hash or chain (content/source/attachment hashes — Source-level hashing is closed via `source_snapshots.content_hash`, Evidence-content-level is not; hash-chain/Merkle — the gap analysis's own "where justified" wording makes this conditional, and today's real answer is "not yet justified"). Not a design gap to fill speculatively — the payload-column shape (free text, structured, external object reference) is an undischarged product decision.

## P0-04 Mathematical specifications

Path: `D:\Work\Projects\internal\hci30\docs\intelligence\{HCI_EVIDENCE_QUALITY_SPEC.md, HCI_CONFIDENCE_SPEC.md, HCI_TRUST_DOMAIN_SPEC.md, HCI_RISK_SPEC.md, HCI_PERMISSION_SPEC.md, HCI_CONTRADICTION_SPEC.md, HCI_TIME_DECAY_SPEC.md}`.

Must define: score semantics, uncertainty, minimum evidence, source independence, contradiction, time decay, severity exceptions, missing data, model disagreement, insufficient-data behavior, **and (new in V2) the Trust-Domain-to-Assessment-Dimension roll-up formula (`04_HCI30_PRODUCT_SPEC.md` note) and the qualitative-band-to-probability-range mapping (`19` §Confidence Display) until this spec ships**.

**Partial closure (2026-09-06)**: the Trust-Domain-to-Assessment-Dimension roll-up formula sub-item is done — `Projects/internal/hci30/docs/intelligence/HCI_TRUST_DOMAIN_SPEC.md`, using ADR-0032's already-ratified qualitative-band scale (reusing `19`'s Confidence Display bands rather than a second numeric scale).

**Second partial closure, same day**: `HCI_CONFIDENCE_SPEC.md` also gained a partial closure — `Projects/internal/hci30/docs/intelligence/HCI_CONFIDENCE_SPEC.md` covers method-to-dimension combination only (multiple methods' findings about one Assessment Dimension, combined via mean-of-ranks with a disclosed `disagreement` flag rather than silently averaged away). Still open within that same file: Evidence Confidence, Model Agreement (incl. the source-independence wiring), Method Robustness, Decision Confidence, the qualitative-band-to-probability-range mapping, and calibration.

**Third partial closure, same day**: `HCI_RISK_SPEC.md` also gained a partial closure — `Projects/internal/hci30/docs/intelligence/HCI_RISK_SPEC.md` covers severity-floor detection only (a `VERY_LOW` dimension value is surfaced as a parallel signal via `packages/intelligence/detect-severity-floor.mjs`, never used to override a Trust Domain average). Still open within that same file: the `RiskEvent` domain entity, Risk-to-Permission mapping, and collaboration-stage-aware severity.

**Fourth partial closure, same day**: `HCI_EVIDENCE_QUALITY_SPEC.md` also gained a partial closure — `Projects/internal/hci30/docs/intelligence/HCI_EVIDENCE_QUALITY_SPEC.md` covers per-dimension evidence-quality classification only (`packages/intelligence/classify-evidence-quality.mjs` labels every present dimension `SINGLE_SOURCE` or `MULTIPLE_SOURCES` by distinct evidence-ref count — deliberately never `CORROBORATED`, since this layer cannot verify source independence). Still open within that same file: source independence itself, source quality grading (the S1-S6 hierarchy), and any threshold beyond the 1-vs-2-distinct-refs boundary.

**Update, same day (later, eighth round)**: `HCI_TRUST_DOMAIN_SPEC.md` (the first partial closure above) gained a further addition — §Domain-internal disagreement, a `dimension_disagreement` boolean surfacing when a domain's own two assigned dimensions land on materially different bands, rather than being silently averaged away. **This does not close, and is narrower than, the "model disagreement" item named above** (critic review, 2026-09-06, which caught an earlier draft of this note overclaiming "half answered"): the corpus's one concrete worked example of model disagreement (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:19-21`, `Reliability: LOW RISK` / `Incentive Alignment: HIGH RISK` → `MODEL DISAGREEMENT`) spans **two different domains** (`RELIABILITY_FULFILLMENT → OPERATIONAL`, `INCENTIVE_ALIGNMENT → FINANCIAL`), which `dimension_disagreement` structurally cannot flag — it only ever compares the two dimensions **inside one domain**. Model disagreement across dimensions remains wholly open, unchanged from the second partial closure's own still-open list above.

The remaining three specs (`HCI_PERMISSION_SPEC.md`, `HCI_CONTRADICTION_SPEC.md`, `HCI_TIME_DECAY_SPEC.md`) — plus the still-open pieces of `HCI_CONFIDENCE_SPEC.md`, `HCI_RISK_SPEC.md`, and `HCI_EVIDENCE_QUALITY_SPEC.md` named above — covering source independence, contradiction, time decay, permission implications, model disagreement/calibration, source quality grading, and the broader risk-entity/lifecycle questions, remain open; see each spec's own §Explicitly out of scope / open-items list for the exact boundary.

**Update, same day (later, ninth round)**: all three remaining files now exist, but deliberately contain no rule — each records its exact blocking question rather than a bare "not yet written" marker: `HCI_PERMISSION_SPEC.md`, `HCI_CONTRADICTION_SPEC.md` (the shared `evidence_refs: string[]` opaque-reference shape has no Claim-content field for a contradiction check to compare — a missing data-model layer, not a missing formula), `HCI_TIME_DECAY_SPEC.md` (the schema already has the needed bitemporal timestamps since `ADR-0017`, but the shared evidence-ref shape does not carry them through to the five already-shipped consumers, and the actual decay function itself is an undecided parameter). **Correction (critic review, same day)**: an earlier version of this note claimed `HCI_PERMISSION_SPEC.md`'s blocker was that "the `Permission` entity has no defined shape anywhere in the corpus" — false, and caught only after spreading into three files including this one. `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:100` defines a seven-tier Permission enum (`P0`-`P6`); `02_PRODUCT_BOUNDARIES.md:59` defines its access-control semantics. The real, narrower blocker: the mapping from a Trust Domain profile to one of those already-named tiers is a business/risk-tolerance judgment, not a derivable formula — see `HCI_PERMISSION_SPEC.md` for the corrected reasoning, including a real Collaboration-Stage-vs-Permission-tier index-mismatch trap this correction surfaced (the two enums share labels like "Confidential"/"Strategic" but not indices). A closely related but distinct gap found while investigating Permission — `04_HCI30_PRODUCT_SPEC.md:138`'s already-fully-specified bias-check blocking precondition on Decision finalization at Stage 4+, which had zero prior implementation in `Projects/internal/hci30/` and does not itself touch a Trust Domain profile — was closed: `Projects/internal/hci30/docs/intelligence/HCI_DECISION_BIAS_CHECK_GATE.md` + `packages/intelligence/bias-check-gate.mjs`.

Expected result: independent implementations given the same inputs produce equivalent outputs.

## P0-05 Machine-readable HCI policy

Path: `D:\Work\Projects\internal\hci30\governance\{HCI_DOMAIN_POLICY.yaml, HCI_HIGH_IMPACT_POLICY.yaml, HCI_PROTECTED_DATA_POLICY.yaml, HCI_PUBLIC_INTELLIGENCE_POLICY.yaml, HCI_METHOD_POLICY.yaml}`.

**Must incorporate, new in V2**: the deterministic/probabilistic/LLM-assisted/human-only field policy (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Cross-Model Gate) and the self-reflection→formal-trust-domain forbidden-transition enforcement (`09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §HCI Must Not Duplicate), both reusing AI LEGO's existing enforcement mechanisms.

Expected result: safety is enforceable, not advisory prose.

**Partial closure (2026-09-07)**: all 5 files written, transcribing already-ACCEPTED ADRs rather than inventing new policy. Several rules turned out to be further along than the gap-analysis text implied: ADR-0019's cross-model authorship gate and ADR-0012's regulatory jurisdiction/purpose exclusions are both `SYNTHETIC GATE VERIFIED` with real functions/constraints and passing Docker-verified test suites, not merely decided. The one item this file was written specifically to close — the self-reflection→formal-trust-domain forbidden-transition enforcement — is **honestly NOT closed**: `HCI_METHOD_POLICY.yaml`'s `self_reflection_forbidden_transition` entry names the exact gate design (following AI LEGO's own per-method `forbidden_transition` naming convention) but no trigger/constraint exists yet preventing a self-reflection method's output from reaching a TrustDomain-scoped table — a rule is now machine-*readable*, not yet machine-*enforced*, and the file says so plainly rather than papering over it. Several other rules across the 5 files (protected-attribute exclusion, employment/HR boundary, purpose limitation, severe-evidence dual control, admin/break-glass, AI-agent credentials, data-protection roles) remain `advisory_only` or `decided_implementation_open` — named accurately per-rule, not glossed with one file-level status.

## P0-06 API + Event contracts

Path: `D:\Work\Projects\internal\hci30\api\{openapi\hci-v1.yaml, asyncapi\hci-events-v1.yaml, schemas\, errors\}`. Define auth scopes, tenant context, pagination, idempotency, errors, concurrency, versioning, webhook signatures, deprecation.

Expected result: all clients depend on contracts, not implementation internals.

**Partial closure (2026-09-07)**: `Projects/internal/hci30/api/{API_CONTRACT_STANDARD.md, openapi/hci-v1.yaml, asyncapi/hci-events-v1.yaml, errors/ERROR_MAPPING.md}` cover the cross-cutting conventions every endpoint must follow — not an endpoint inventory, since no HCI API code exists yet and listing one would invent undecided product scope. Host/versioning (ADR-0003), concurrency (reuses the schema's own bitemporal-supersession uniqueness), and errors (reuses `database/ERROR_CODE_REGISTRY.md`'s already-shipped `H1xxx` SQLSTATEs) are CLOSED via reuse; pagination, idempotency, webhook signatures, and deprecation are CONVENTION (industry-standard mechanics adopted, no product judgment needed). One real mechanism was found, not assumed: tenant-context propagation resolves through `hci.current_tenant_id()` keyed on the **active Postgres role** (`hci.app_tenant_bindings`), not a session variable — a real constraint on the still-unbuilt connection-pooling design. `hci.principals` is a partial precedent for P0-07's open `actor_id` field (real, shipped, tenant-scoped identity — but missing the `actor_class` column ADR-0025 requires). Auth-scope-to-Permission-tier mapping stays OPEN (P0-04 already found this is a business judgment, not a formula); the event naming/versioning standard stays OPEN per `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md` item 11 — one worked event channel is proposed, extending AI LEGO's own `cognitive.run.completed` pattern, not ratified as a decision. `schemas/` (named in this item's Path above) was deliberately not created as a separate directory — types live inline in the OpenAPI/AsyncAPI files' own `components`/`payload` sections, disclosed here as a path deviation like P0-09's.

## P0-07 Tenant-context propagation

Path: `D:\Work\Projects\internal\hci30\packages\contracts\tenant-context\TENANT_CONTEXT_STANDARD.md`. Define: `tenant_id`, `organization_id`, `workspace_id`, `actor_id`, `service_account_id`, `request_id`, `data_region`, `policy_context`.

**ADR-0009 (`HD-01=A`) resolves the Tenant/Organization model before this standard is written** — the standard must implement its AI LEGO ADR-003 Tenant semantic and portal-adapter mapping; do not freeze it until the mapping, compatibility/migration plan, and cross-tenant negative test gates are closed.

Expected result: tenant identity cannot disappear between gateway, worker, DB, event, export, or AI request.

**Partial closure (2026-09-07)**: 3 of 8 fields closed. `tenant_id` is fully implemented (ADR-0016, every tenant-owned table). `organization_id` is closed as "not HCI's own concept" — it is the portal's, bridged only through the nullable `external_tenant_id` seam, never a direct query or FK (`governance/wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md`). `workspace_id` is closed as a decided relationship rule (a Workspace belongs to exactly one Tenant) with no schema backing yet — no `Workspace` entity exists in `docs/domain/HCI_ENTITY_DICTIONARY.md`'s exhaustive 11-migration inventory. The other 5 fields (`actor_id`, `service_account_id`, `request_id` in the generic tracing sense, `data_region`, `policy_context`) have zero prior design anywhere — they are API/auth-gateway properties that cannot be meaningfully specified before P0-06 exists, honestly left OPEN rather than invented. See `Projects/internal/hci30/packages/contracts/tenant-context/TENANT_CONTEXT_STANDARD.md`.

## P0-08 Public Intelligence threat model

Path: `D:\Work\Projects\internal\hci30\security\threat-models\{TM_PUBLIC_INTELLIGENCE.md, TM_FILE_INGESTION.md, TM_AI_ANALYSIS.md, TM_MULTI_TENANCY.md}`.

Threats: SSRF, malicious redirects, malware, decompression bombs, web prompt injection, source poisoning, SEO manipulation, synthetic evidence, domain impersonation, malicious MIME, tool-based exfiltration, **investigation-footprint detectability (new in V2, see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Investigation Footprint)**.

Expected result: all external research content is treated as hostile input.

**Partial closure (2026-09-07)**: 3 of 4 files written as substantive transcriptions of already-ACCEPTED ADRs and research-review findings (`Projects/internal/hci30/security/threat-models/`) — `TM_PUBLIC_INTELLIGENCE.md` (SSRF/ADR-0029, prompt injection, source-poisoning/SEO-manipulation as a genuinely undecided scoring parameter, investigation-footprint as a genuinely undecided mechanism), `TM_AI_ANALYSIS.md` (cross-references AI LEGO's own TB-1/T2/E4 threat rows per the Must-Not-Duplicate boundary rather than re-deriving them), `TM_MULTI_TENANCY.md` (ADR-0016 RLS mandate, ADR-0026 tenant-scoped Claim/Source ownership, ADR-0028 bulk-export control — and surfaced, without resolving, a stale blocking-rationale in ADR-0026's own implementation note now contradicted by ADR-0018's later-landed gate 3, see TASKS.md follow-up). `TM_FILE_INGESTION.md` is honestly left as a "blocked on a nonexistent product feature" record — malware/decompression-bomb/malicious-MIME threats have no file-upload feature anywhere in the corpus to attach to; not invented.

## P0-09 RLS enforcement gate *(new in V2, elevated from V1's Testing chapter)*

Path: `D:\Work\Projects\internal\hci30\tests\architecture\test_cross_tenant_isolation.*`. A CI-blocking test connecting as a tenant-scoped non-superuser role, asserting zero cross-tenant rows returned for every RESTRICTED table, on every migration.

**Why this is P0, not a testing-chapter footnote**: this is the single highest-blast-radius technical vulnerability found across the entire V2 review — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant Isolation and `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Enforcement Discipline. Expected result: a leaked credential or missed policy cannot silently expose every tenant's data.

**Partial closure (2026-09-06)**: the substance of this item's ask is met, though not at the literal path named above. `Projects/internal/hci30/database/tests/wave1-negative-tests.sql` (`RLS-COMPLETENESS-01`/`02`, run as `hci_app_test_a` — the existing tenant-scoped non-superuser role every other assertion in that file already uses, not a new dedicated role) now queries the live catalog for every table in the `hci` schema with a `tenant_id` column and asserts RLS is both enabled+forced and has at least one policy, so a future migration that adds a new tenant-scoped table and forgets RLS entirely is caught without anyone remembering to write a new per-table test — exercised on every full migration run via `scripts/test-wave1-local.ps1`, the same CI-facing entry point every other Wave 1 assertion goes through. This extends the existing negative-test suite rather than creating the standalone `tests/architecture/test_cross_tenant_isolation.*` file this item names; a reasoned implementation choice (one suite, one harness, no parallel test-runner to keep in sync), not an oversight, but disclosed here since it does not match the literal path. **What this does NOT close**: the check is structural (RLS exists and has a policy), not functional — a table with a policy whose logic is simply wrong (e.g. `USING (true)`) still passes it. Real-Docker verification proved this distinction matters: disabling RLS entirely, and separately dropping a table's own policy while leaving RLS enabled+forced, are two different failure modes, and neither is a substitute for a table's own dedicated `RLS-LEAK-NN` functional test (real query, real data, real cross-tenant probe) — those remain the standard for any new RESTRICTED table, with the catalog check now as a second, independent layer that does not depend on someone remembering to write one.

## P0-10 Restore-drill precondition *(new in V2)*

A rehearsed, cross-box (not same-box) restore drill, passed before Wave 4 admits any real, non-synthetic tenant data — moved up from V1's Gate C (paid tier). See `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Backups.

**Closed (2026-09-07), real drill run, not a document**: `Projects/internal/hci30/security/DR_RESTORE_DRILL_RECORD.md` + `.github/workflows/hci30-restore-drill.yml`. Two independent GitHub Actions runner VMs, connected only by an uploaded artifact, stand in for the second box this repo's own infrastructure does not otherwise have (the only other machine is production `ks-aw-01`, off-limits to synthetic HCI data by this product's own test/prod isolation). The first real attempt (run `34137801181`) failed — and correctly so: not the restore itself, but the drill's own row-count-marker checkpoint ordering (the negative-test suite's own legitimate inserts were counted against a pre-test source snapshot). Fixed, re-run (`34138260481`): pg_restore succeeded, all 6 tracked tables' row counts matched exactly, and the existing `wave1-negative-tests.sql` suite re-run against the RESTORED schema on the second machine passed 232/232 — real proof RLS/triggers/grants survive the cycle, not just that `pg_restore` exited 0. One real, previously-undiscovered finding baked into the fix: the two app roles (`hci_app_test_a/b`) are cluster-scoped while `pg_dump` is database-scoped, so a naive restore would drop their GRANTs — resolved by recreating the roles from the same DDL the migration uses, before restoring. Does not cover real-data volume/timing (Wave 4+, separately gated) or anything beyond the `hci` schema.

## P0-11 Minimal key-rotation/compromise-response runbook *(new in V2)*

A narrow runbook — not the full BYOK/envelope-encryption architecture, which stays P1-04 — covering what happens if a key/KMS credential is compromised during the build phase. See `11_SECURITY_PRIVACY_GOVERNANCE.md` §Encryption.

**Partial closure (2026-09-07)**: ADR-0022's own required implementation gates are ADR-0022 gate 1 only (of 5) — `security/crypto/KEY_ROTATION_AND_COMPROMISE.md`, the runbook artifact itself (DEK→KEK→master hierarchy diagram, routine-rotation procedure, compromise-response procedure, drill-record section — all 4 required headers present). ADR-0022 gates 2-5 (the `tenant_keks` schema, `KEY-ROT-01`, `KEY-COMPROMISE-DRILL-01` + its mutation check, and the Wave-4 blocking-precondition edit) remain OPEN and are **not** attempted here — real cryptographic key-management logic deserves its own careful, real-Docker-verified pass, not a rushed continuation of a documentation batch. Nothing in the schema enforces this runbook yet; `hci.data_encryption_keys.key_material` still holds a raw (unwrapped) DEK exactly as ADR-0018 Wave 1 shipped it.

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

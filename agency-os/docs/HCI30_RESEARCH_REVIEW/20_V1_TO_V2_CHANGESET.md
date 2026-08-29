# 20 V1 -> V2 Changeset

> Note on naming: the operator renamed the current architecture version from "V5" to "V1" at the start of this review; this file (originally specified as "V5_TO_V2_CHANGESET") is renamed accordingly. Every diff below is against `HCI_AI_LEGO_Blueprint_v1` as it exists today, expressed as concrete document/schema edits — not a new architecture, a changeset.

---

## Legend
`[DOC]` = edit to an existing blueprint chapter · `[NEW-DOC]` = new artifact/ADR to write · `[SCHEMA]` = domain-model/table change · `[POLICY]` = operational/process commitment, no schema change · `[CI]` = new automated gate

---

## 1. Documents to edit

| Doc | Change | Ref |
|---|---|---|
| `02_PRODUCT_BOUNDARIES.md` | Add explicit note: Foundation-layer epistemic/reference/risk-tier kernel is shared (versioned, vendored); domain logic stays independent. Cross-reference the new shared-kernel ADR. | HD-09, `19` §1 |
| `06_HCI30_PUBLIC_INTELLIGENCE.md` | Add authenticity/provenance check step between Retrieval and Claim Extraction (minimum-viable: hash/EXIF, reverse-search corroboration for high-stakes claims). Add `tenant_id` (or explicit shared-record design) to claim/source objects to resolve HD-16. | RT-06, HD-16 |
| `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` | Add `DataSubjectRequest`, `PersonMergeLog`/`PersonSplitLog`, `Case`/`Engagement` entities. Add bitemporal columns to Evidence/Claim/Assessment/Decision. Scope `Consent` into named sub-fields. | HD-02, HD-03, HD-04, HD-10, HD-06 |
| `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` | Formally map HCI edition -> tenant-isolation tier as an `Entitlement` row, not an "option." Add payment-provider selection as a named open item (currently absent). | `13` §2, `18` |
| `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` | Reference the shared kernel explicitly; clarify jurisdiction/sanctions-screening ownership seam (HD-17). | HD-09, HD-17 |
| `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | Replace the freshly-invented LOW/MEDIUM/HIGH/CRITICAL cross-model gate table with a reference to AI LEGO's existing R0-R4 `mandatory-gates.yaml`. State the sync-request + async-callback transport explicitly (currently implicit). Add the AI LEGO usage-metering/billing-attribution clause. | HD-08, HD-19 (D's Option 2 recommendation), HD-22 |
| `11_SECURITY_PRIVACY_GOVERNANCE.md` | Change RLS from "where appropriate" to mandatory. Add DB-session-level audit logging requirement for non-application-role connections. Add preventive (not just detective) bulk-export control for RESTRICTED data. | HD-05, `12` RT-04, HD-18 |
| `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` | State Tier A (shared DB + RLS) as the explicit default for the Personal/Professional/Team majority. Name the multi-region trigger condition explicitly (signed residency-clause contract). | `13` §2, HD-14 |
| `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` | Add "single dedicated-server hardware/host failure" to the DR scenario list. Require a rehearsed cross-box restore drill as a P0/Wave-1 gate, not Gate-C. Define `REPLAY_UNAVAILABLE` state; restate the "never silently substitute" rule for replay specifically. | `12` RT-02, RT-12 |
| `16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md` | Add the Claim/Source tenant-ownership question (HD-16) and the data-subject-rights scope decision (HD-03) — both currently absent from this list despite being load-bearing. | HD-03, HD-16 |
| `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` | Replace bare numeric confidence percentages with qualitative bands (ICD 203 Words-of-Estimative-Probability convention) until a calibrated model exists. Wire source-independence tracking into the Model Agreement metric. | HD-23, `12` RT-11 |
| `05_HCI30_INTELLIGENCE_METHODS.md` | Name a specific Big Five instrument (IPIP recommended) with a `self_report`/`third_party_inferred` distinction. Resolve MBTI/Enneagram/Ziwei-Bazi disposition (recommend: restrict or remove per method — see `10_METHOD_SCIENCE_REVIEW.md`). Require a completed bias-check pass as a precondition for finalizing EXIT/PROCEED_WITH_CONTROLS decisions at Stage 4+. | HD-23, `12` RT-16 |
| `21_HCI_TOP_TIER_GAP_ANALYSIS.md` / `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` | Re-sequence: pull forward (to P0/Wave 1-4) the items listed in `17_TECH_DEBT_PREVENTION.md` §A and `21_V2_IMPLEMENTATION_ORDER.md`. | `17`, `21` |

## 2. New artifacts / ADRs to write

| Artifact | Purpose | Ref |
|---|---|---|
| ADR: Tenant/Organization reconciliation | Resolve HD-01 | HD-01 |
| ADR: Shared Epistemic/Provenance/Decision-Authority kernel | Formalize HD-09's extraction | HD-09 |
| ADR: EU AI Act / FCRA use-case scoping | Resolve HD-20 | HD-20 |
| `DATA_PROTECTION_ROLES_MEMO.md` | Resolve HD-21 (controller/processor determination) | HD-21 |
| Minimal `KEY_ROTATION_RUNBOOK.md` | Pulled forward from P1 (HD-12) — full BYOK/KMS stays P1 | HD-12 |
| `BREAK_GLASS_ACCESS.md` (minimal version) | Pulled forward to Wave 2 | `12` RT-04 |

## 3. Schema-level changes (must happen before Wave 1 data exists — see `17_TECH_DEBT_PREVENTION.md` §A for why sequencing matters)

`DataSubjectRequest`, `PersonMergeLog`/`PersonSplitLog`, `Case`/`Engagement` tables · bitemporal columns on Evidence/Claim/Assessment/Decision · `encryption_key_ref`/`tombstoned_at` on encrypted evidence fields · RLS policies enabled (not just `tenant_id` columns present) on every tenant-owned table · `REVOKE UPDATE/DELETE` + trigger on insert-only ledger tables.

## 4. New CI-blocking gates

Cross-tenant RLS read test (seeded multi-tenant fixture, non-superuser role) · destructive-migration linter (blocks `DROP`/`TRUNCATE`/destructive `ALTER` against tables tagged `critical`/`evidence`) · epistemic-type mapping contract test (if full kernel extraction is deferred, per HD-09 Alternative C).

## 5. Explicitly out of scope for this changeset (deferred, not forgotten)

Full event-sourcing/CQRS · standalone graph database · Kubernetes/true microservices · message broker (Kafka/NATS) · multi-region infrastructure · full SOC 2/ISO 27001 certification · full BYOK/dedicated-KMS enterprise key hierarchy. See `17_TECH_DEBT_PREVENTION.md` §B for why each is correctly deferred, and the named trigger condition that would change that.

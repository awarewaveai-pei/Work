# HCI ADR Index

Status: **MIXED REGISTER — only entries explicitly marked `ACCEPTED` below are approved decisions**
Owner: HCI AI LEGO Blueprint v2
Last reviewed: 2026-09-05 (Peer-boundary gates added)

## Purpose and state rules

This is the auditable index for the ADRs proposed by `17_REPOSITORY_LAYOUT_AND_PATHS.md`. It records intent, owner references, evidence links, and approval state; it does not create an ADR file, approve a design choice, or permit implementation of a 🔴 DECISION PENDING item.

Allowed lifecycle: `PLANNED` → `DRAFT` → `PROPOSED` → `ACCEPTED` / `REJECTED` / `SUPERSEDED`. `ACCEPTED` requires either (a) a recorded, explicit per-decision human approval (the 2026-09-01 tranche, `reports/decisions/2026-09-01-hci-wave-1-decision-tranche.md`), or (b) a recorded, explicit human delegation of decision authority that the operator has not revoked (the 2026-09-02 full delegation, `reports/decisions/2026-09-02-hci-full-delegation-and-adr-batch.md`) — both are "explicit human approval" in the sense this rule requires; delegation is not silence, and every ADR accepted under it states its authority line and remains supersedable by a later explicit operator decision at any time. A `DRAFT` or `PROPOSED` entry is not authority to implement.

For any material change, start with `HCI_CHANGE_PROPOSAL_TEMPLATE.md`, attach the result here, and link the final ADR/approval record before changing an implementation boundary.

## Register

| ADR | Topic | Primary blueprint source | State | Explicit approval |
|---|---|---|---|---|
| ADR-0001 | HCI and Cognitive OS are peer products | `02_PRODUCT_BOUNDARIES.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0001-hci-and-cognitive-os-are-peer-products.md` |
| ADR-0002 | No cross-product database access | `02_PRODUCT_BOUNDARIES.md`, `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0002-no-cross-product-database-access.md` |
| ADR-0003 | `api.aware-wave` is the unified gateway | `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0003-api-aware-wave-unified-gateway.md` |
| ADR-0004 | No universal human trust score | `01_SYSTEM_CONSTITUTION.md`, `05_HCI30_INTELLIGENCE_METHODS.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0004-no-universal-human-trust-score.md` |
| ADR-0005 | HCI × AI LEGO integration is optional | `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0005-hci-ai-lego-integration-is-optional.md` |
| ADR-0006 | Domain evidence and execution evidence are distinct | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0006-domain-evidence-and-execution-evidence-are-distinct.md` |
| ADR-0007 | Modular monolith first | `17_REPOSITORY_LAYOUT_AND_PATHS.md`, `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0007-modular-monolith-first.md` (amended on one point by `ADR-0021`) |
| ADR-0008 | Vendor-neutral domain core | `01_SYSTEM_CONSTITUTION.md`, `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0008-vendor-neutral-domain-core.md` |
| ADR-0009 | Tenant/Organization model reconciliation | `02_PRODUCT_BOUNDARIES.md` (`HD-01`) | `ACCEPTED` | Operator: `HD-01=A`, 2026-09-01; `ADR-0009-tenant-organization-model-reconciliation.md` |
| ADR-0010 | Consent entity scope | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-02`) | `ACCEPTED` | Operator: `HD-02=C`, 2026-09-01; `ADR-0010-consent-entity-scope.md` |
| ADR-0011 | HCI subject-type scope | `02_PRODUCT_BOUNDARIES.md` (`HD-00`) | `ACCEPTED` | Operator: `HD-00=C`, 2026-09-01; `ADR-0011-hci-subject-type-scope.md` |
| ADR-0012 | Regulatory market scope | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-20`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0012-regulatory-market-scope.md` |
| ADR-0013 | Shared Foundation-kernel extraction | `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` (§Shared Kernel, `HD-09`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0013-shared-foundation-kernel-extraction.md` |
| ADR-0014 | Data-subject rights channel | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-03`) | `ACCEPTED` | Operator: `HD-03=A`, 2026-09-01; `ADR-0014-data-subject-rights-channel.md` |
| ADR-0015 | Restricted-subject identity confirmation | `06_HCI30_PUBLIC_INTELLIGENCE.md` (`HD-04`) | `ACCEPTED` | Operator: `HD-04=A`, 2026-09-01; `ADR-0015-restricted-subject-identity-confirmation.md` |
| ADR-0016 | Mandatory tenant RLS | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-05`) | `ACCEPTED` | Operator: `HD-05=A`, 2026-09-01; `ADR-0016-mandatory-tenant-rls.md` (tenancy-principal mechanism resolved by `ADR-0033`) |
| ADR-0017 | Bitemporal scope | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-06`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0017-bitemporal-scope.md` |
| ADR-0018 | Crypto-shredding for erasure | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-07`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0018-crypto-shredding-for-erasure.md` |
| ADR-0019 | Deterministic/probabilistic/LLM/human field policy | `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` (`HD-08`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0019-deterministic-probabilistic-llm-human-field-policy.md` |
| ADR-0020 | Case/Engagement aggregate | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-10`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0020-case-engagement-aggregate.md` |
| ADR-0021 | Physical isolation of HCI's Postgres instance | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-11`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0021-physical-isolation-of-hci-postgres.md` (amends `ADR-0007` on one point) |
| ADR-0022 | Minimal key-rotation/compromise-response runbook | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-12`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0022-minimal-key-rotation-and-compromise-runbook.md` |
| ADR-0023 | Block BYOK/dedicated-DB sales claims until acceptance-tested | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-13`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0023-block-byok-dedicated-db-sales-claims.md` |
| ADR-0024 | Multi-region/residency infrastructure trigger | `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md` (`HD-14`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0024-multi-region-trigger-condition.md` |
| ADR-0025 | AI agent credentials for RESTRICTED data | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-15`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0025-ai-agent-credentials-for-restricted-data.md` |
| ADR-0026 | Claim/Source tenant ownership | `06_HCI30_PUBLIC_INTELLIGENCE.md` (`HD-16`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0026-claim-source-tenant-ownership.md` |
| ADR-0027 | Sanctions/export-control screening ownership | `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` (`HD-17`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0027-sanctions-screening-ownership.md` |
| ADR-0028 | Bulk-export prevention control | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-18`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0028-bulk-export-prevention-control.md` |
| ADR-0029 | Isolated fetch worker (not Trigger.dev) for Wave 6 | `06_HCI30_PUBLIC_INTELLIGENCE.md` (`HD-19`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0029-isolated-fetch-worker-not-trigger-dev.md` (narrows `ADR-0007` gate 4) |
| ADR-0030 | Controller/processor determination | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-21`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0030-controller-processor-determination.md` |
| ADR-0031 | AI LEGO usage-metering/entitlement attribution | `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` (`HD-22`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0031-ai-lego-usage-metering-attribution.md` |
| ADR-0032 | Personality/behavioral method disposition | `05_HCI30_INTELLIGENCE_METHODS.md` (`HD-23`) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0032-personality-and-behavioral-method-disposition.md` |
| ADR-0033 | Signed tenant-context principal (Option B-signed) | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`ADR-0016`'s tenancy-principal open item) | `ACCEPTED` | Operator delegation, 2026-09-02; `ADR-0033-signed-tenant-context-principal.md` |

## Accepted-decision implementation gates

`ACCEPTED` records a human architecture choice; it is not an implementation-complete state. The following gates remain open until their named artifacts and verification evidence exist.

| ADR | Gate state | Required artifact-to-gate mapping |
|---|---|---|
| ADR-0001 | `SYNTHETIC GATE VERIFIED (Wave 1 gates 1-2)` | `ARCH-PEER-01` (Node, `tests/architecture/peer-boundary.test.mjs`) + `ARCH-PEER-02` (SQL) — real-verified 2026-09-05 (node --test green incl. self-test; 90/90 SQL assertions, 30/30 mutations, see `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`); `PEER-DEGRADE-01`, `PEER-REF-01` (Wave 10) and `ARCH-PEER-03` (reverse direction, blocked on cognitive-engineering-os runtime existing) remain `OPEN` |
| ADR-0002 | `SYNTHETIC GATE VERIFIED (Wave 1 gates 1,3)` | Reuses `ADR-0001`'s `ARCH-PEER-02` (gate 1) + new `ARCH-PEER-02b` (gate 3, credential/network isolation, SQL `pg_roles` check) — both real-verified 2026-09-05, same evidence as `ADR-0001` above; `PEER-REF-01` (gate 2, Wave 10) and `ARCH-PEER-05` (gate 4, reverse direction) remain `OPEN` |
| ADR-0003 | `SPECIFIED — RUNTIME OPEN` | OpenAPI single-host constraint, negative routing smoke test, gateway logic-purity check, service-placement inventory row (Wave 3) |
| ADR-0004 | `SPECIFIED — RUNTIME OPEN` | `TRUST-NEG-01..03`, `METHOD-CONTRACT-NEG-01`, `check-no-universal-trust-column.ps1` (Wave 1 / Wave 5) |
| ADR-0005 | `SYNTHETIC GATE VERIFIED (Wave 1 gate 1 only)` | Gate 1 (`HCI-INDEP-SCHEMA-01`, no hard schema dependency) closed by `ADR-0001`'s `ARCH-PEER-02` — a strict superset (blocks ANY FK crossing schema `hci`, not just `NOT NULL` ones into a cognitive-os entity specifically); no separate test needed, avoiding a duplicate mechanism for the same invariant. Gate 2 (`HCI-INDEP-RUNTIME-01`, full core-lifecycle test with the adapter unreachable) **not implemented** — genuinely blocked on an application/API layer that does not exist yet at Wave 1 schema stage, left `OPEN` rather than faked. Gates 3-4 (Wave 10) remain `OPEN`. |
| ADR-0006 | `SPECIFIED — RUNTIME OPEN` | Ledger-separation architecture test + `EvidenceRef`-only crossing check (Wave 4/10) |
| ADR-0007 | `SPECIFIED — RUNTIME OPEN` | `no-second-db-dsn.test.*` — amended per `ADR-0021` gate 6 to exempt a service literally named `hci-postgres` |
| ADR-0008 | `SPECIFIED — RUNTIME OPEN` | Vendor-adapter isolation lint + `llm.reason` two-provider replaceability test (`18_LEGO_CONTRACT_AND_COMPONENT_TAXONOMY.md` §Vendor Replaceability) |
| ADR-0009 | `SPECIFIED — RUNTIME OPEN` | Mapping and compatibility/migration design: `wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md`; cross-tenant adapter negative tests: `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` |
| ADR-0010 | `SPECIFIED — RUNTIME OPEN` | Three-record policy: `wave1/HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY.md`; model/constraint design: `wave1/HCI_WAVE1_DOMAIN_ERD.md`; anti-conflation tests: `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` |
| ADR-0011 | `SPECIFIED — RUNTIME OPEN` | Subject table/constraint design: `wave1/HCI_WAVE1_DOMAIN_ERD.md`; Person-only negative tests: `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` |
| ADR-0012 | `SYNTHETIC GATE VERIFIED (Wave 1 gates 1/2)` | `hci.tenants.jurisdiction` deny-list + `hci.cases.purpose` allow-list (re-anchored per the ADR's own instruction, see its "Implementation note") — `Projects/internal/hci30/database/migrations/0003_wave1_regulatory_market_scope_up.sql`; Docker run green **88/88 assertions + 28/28 mutations killed**, 2026-09-05 (see `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` §Current state for the full account, incl. a real deny-list gap a db-expert review caught before commit); gate 3 (`H1012` trigger) deliberately not built — CHECK constraints alone proven to have no bypass, see ADR's Implementation note; Wave 6 (`CONTMON-PURPOSE-01`) and Wave 9 (market-expansion lock) remain `OPEN` |
| ADR-0013 | `SPECIFIED — RUNTIME OPEN` | Kernel package (`Projects/shared/kernel`, semver) + per-product CI contract test against pinned version (Wave 3) |
| ADR-0014 | `SYNTHETIC GATE VERIFIED` | Synthetic DSR schema/events/tests: `D:\Work\Projects\internal\hci30\database\`; suite green + mutation-checked 2026-09-02; no real-person processing |
| ADR-0015 | `SYNTHETIC GATE VERIFIED` | Synthetic identity-verification constraint/tests: `D:\Work\Projects\internal\hci30\database\`; both-sided evidence guard, mutation-checked 2026-09-02; no production pipeline |
| ADR-0016 | `SYNTHETIC GATE VERIFIED` | Forced RLS/non-owner test-role runner: `D:\Work\Projects\internal\hci30\`; Docker run green **51/51 assertions + 15/15 mutations killed**, 2026-09-02 (updated from the earlier 38/9 baseline after the Wave 1 hardening pass — see `WORKLOG.md` 2026-09-02); tenancy-principal mechanism resolved by `ADR-0033`, still `OPEN` at runtime |
| ADR-0017 | `SPECIFIED — RUNTIME OPEN` | `BITEMP-WINDOW-01`, `-REASON-01`, `-CROSSTENANT-01`, `-SUPERSEDE-01/02`, `-IMMUTABLE-01`, `-CLOCK-01`, `-ASOF-01`, `-SCOPE-01`, `EXPLAIN-ASOF-01` (Wave 1/4) |
| ADR-0018 | `SPECIFIED — RUNTIME OPEN` | `CRYPTO-KEYGRANT-01`, `-KEYREQ-01`, `-SCOPE-01`, `-CROSSTENANT-KEYREF-01`, `-TOMBSTONE-01/02`, `-WRITE-01`, `-ROUNDTRIP-01`, `-READ-TOMBSTONED-01`, `-ERASURE-01/02/METADATA-01`, `-NOEXTERNAL-01` (Wave 1/4) |
| ADR-0019 | `SPECIFIED — RUNTIME OPEN` | `wave1/HCI_FIELD_AUTHOR_CLASS_POLICY.md` + `NEG-HD08-01..04` (Wave 1) |
| ADR-0020 | `SYNTHETIC GATE VERIFIED (Wave 1 scope)` | Wave 1 gates verified: `CASE-SCHEMA-01`, `CASE-LIFECYCLE-*`, `CASE-CLOSED-IMMUTABLE-01`, `CASE-OWNS-01/02/03`, `CASE-CLOSED-GUARD-01/02`, `CASE-PROJECTREF-01/02`, `RLS-LEAK-03`, plus owner-bypass trigger-layer proof (`CASE-LIFECYCLE-TRIGGER-01`, `CASE-NODELETE-TRIGGER-01`) — `Projects/internal/hci30/database/migrations/0002_wave1_case_aggregate_up.sql`; Docker run green **75/75 assertions + 26/26 mutations killed**, 2026-09-04 (first Docker run at 65/19 found and fixed 2 real gate bypasses + 5 structural gaps via critic review, then a further trigger-ordering bug the critic review did not catch — full account in `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` §Current state); `CASE-REPLAY-01` (Wave 4, replay/rollback) still `OPEN` — not in scope of this migration |
| ADR-0021 | `SPECIFIED — RUNTIME OPEN` | Dedicated `hci-postgres` compose service/volume, `ARCH-DB-03`, dedicated credentials/backup/resource limits, `ADR-0007` reconciliation (Wave 1/2, blocks Wave 4) |
| ADR-0022 | `SPECIFIED — RUNTIME OPEN` | `KEY-RUNBOOK-EXISTS-01`, `SCHEMA-KEK-01`, `KEY-ROT-01`, `KEY-COMPROMISE-DRILL-01` (Wave 2, blocks Wave 4) |
| ADR-0023 | `SPECIFIED — RUNTIME OPEN` | `docs/trust/CLAIMS_REGISTER.md`, `CLAIM-REG-01`, `CLAIM-GATE-01..04`, `CLAIM-PUB-01` (Wave 0) |
| ADR-0024 | `SPECIFIED — RUNTIME OPEN` | `RESIDENCY-SCHEMA-01`, `docs/trust/RESIDENCY_TRIGGER_RECORD.md`, `RESIDENCY-INFRA-GATE-01..03` (Wave 0/1) |
| ADR-0025 | `SPECIFIED — RUNTIME OPEN` | Reserved-name convention, `HCI-CRED-SCAN-01..03`, `BREAKGLASS-AGENT-01`, `PGAUDIT-AGENT-TAG-01` (Wave 1/2, blocks Wave 4) |
| ADR-0026 | `SPECIFIED — RUNTIME OPEN` | `sources`/`source_snapshots` tables + RLS, `RLS-CLAIM-01`, `DSR-CLAIM-DELETE-01` (Wave 1) |
| ADR-0027 | `SPECIFIED — RUNTIME OPEN` | `CONTROL-SCHEMA-01`, `SANCTIONS-NEG-01/02`, `SCREEN-PROVIDER-VENDOR-01`, `SANCTIONS-SCREEN-01`, `CONTRACT-SCREEN-01` (Wave 1/3/6) |
| ADR-0028 | `SPECIFIED — RUNTIME OPEN` | `EXPORT-THRESHOLD-CONFIG-01`, `SCHEMA-EXPORT-RELEASE-01`, `EXPORT-THRESHOLD-ENFORCE-01`, `EXPORT-DELAYED-RELEASE-01`, `EXPORT-AUDIT-IMMUTABLE-01` (Wave 2/3) |
| ADR-0029 | `SPECIFIED — RUNTIME OPEN` | `fetch-runner-is-separate-service`, `wave6-no-bridge-route`, `-metadata-and-rfc1918-blocked`, `-dns-rebind-rejected`, `-ssrf-payload-corpus`, `-trigger-no-direct-fetch` (Wave 6, blocks Gate C) |
| ADR-0030 | `SPECIFIED — RUNTIME OPEN` | `wave1/HCI_DATA_PROTECTION_ROLES_MEMO.md`, `controller_role` column, `ROLE-NEG-01..03`, `wave1/HCI_CUSTOMER_DPA_TEMPLATE.md` (before Wave 6/Phase 5) |
| ADR-0031 | `SPECIFIED — RUNTIME OPEN` | `CONTRACT-ENTITLEMENT-REQUIRED-01` (Wave 3), `ENTITLEMENT-ISSUE-STATUS-GATE-01` (Wave 8), `COGOS-ENTITLEMENT-REJECT-01` (Wave 10), `ENTITLEMENT-RUN-LEDGER-01` (Wave 8) |
| ADR-0032 | `SPECIFIED — RUNTIME OPEN` | `TEST-METHOD-CONTRACT-COLUMNS-PRESENT`, grade-delta/MBTI/Enneagram/third-party-invocation/confidence-band gates (Wave 4/5) |
| ADR-0033 | `SPECIFIED — RUNTIME OPEN` | `hci.tenant_context_keys`, `hci_app` pooled role, `RLS-ESCALATE-01..03`, transaction-scoping test, minting-isolation test (Wave 2, blocks non-synthetic admission) |

## Review record template

For every state change, add: date; change/proposal identifier; affected documents and implementation paths; alternatives considered; evidence; reviewer and review type; explicit approver and decision; compatibility/migration impact; verification; and rollback/reversal path. Link the entry to the repository worklog closeout required by `14_ROADMAP_AND_DEFINITION_OF_DONE.md`.

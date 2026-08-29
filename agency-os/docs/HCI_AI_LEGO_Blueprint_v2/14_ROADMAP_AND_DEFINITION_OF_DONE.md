# 14 — Roadmap & Definition of Done

## Architecture-first implementation order

**Superseded by the Wave sequencing in `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`**, which incorporates the V2 sequencing changes (restore-drill precondition, RLS CI gate, minimal key-rotation runbook, minimum-viable evidence-authenticity check, all pulled forward relative to V1 — see `HCI30_RESEARCH_REVIEW/21_V2_IMPLEMENTATION_ORDER.md` for the complete reordering with rationale). The Phase list below is retained as the original high-level narrative; treat `22`'s Wave list as authoritative for actual sequencing.

### Phase 0 — Constitution & ADRs

Create: system constitution, product boundaries, data ownership, security baseline, domain policies.

**V2 addition**: also resolve the Wave-0 ADRs this document set now requires before Wave 1 — Tenant/Organization reconciliation (`02` `HD-01`), Consent scoping (`07` `HD-02`), Regulatory scope (`11` `HD-20`), Shared Kernel extraction (`09` §Shared Kernel).

Expected result: no developer or AI can silently redefine system boundaries.

### Phase 1 — Platform identity + tenant foundation

Implement: tenant, organization, workspace, identity, memberships, roles, permissions.

Expected result: multi-tenant correctness exists before business data grows.

### Phase 2 — HCI core domain

Implement: Person, Relationship, Interaction, Observation, Evidence, Organization, Decision, **Case/Engagement, DataSubjectRequest, PersonMergeLog/PersonSplitLog, Control/Mitigation** (new domain entities, see `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`).

Expected result: HCI works without AI integration.

### Phase 3 — HCI assessment core

Implement: trust domains, risk, confidence, unknowns, contradictions, permission model, relationship lifecycle.

### Phase 4 — Public intelligence

Implement: identity resolution (with the deterministic `MATCH_CONFIRMED` gate, see `06`), search planner, source registry, source quality, claim graph, contradiction, timeline, source appendix, **content isolation & minimum-viable authenticity check** (new, see `06`).

### Phase 5 — Personal product / founder dogfooding

Use HCI daily.

**Sequencing note (new in V2)**: real Person data begins flowing at this phase. The restore-drill precondition (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Backups) and the minimal privacy-ops artifacts (`11_SECURITY_PRIVACY_GOVERNANCE.md` §Privacy Operations Sequencing) must both be in place before this phase begins, not after.

Expected result: validate real domain design before enterprise expansion.

### Phase 6 — Team/commercial

Implement: workspaces, collaboration, entitlements, subscriptions, licensing, usage metering (see `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` §Usage Metering for the cross-product clause).

### Phase 7 — Enterprise

Implement: SSO, SCIM, ABAC, audit, legal hold, data residency, enterprise policy, dedicated deployment.

**Blocking precondition (new in V2)**: do not reference BYOK or dedicated-DB in Enterprise sales materials until `21_HCI_TOP_TIER_GAP_ANALYSIS.md` P1-04 (full key architecture) is actually built and tested — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Encryption.

### Phase 8 — AI LEGO optional integration

Implement only through the formal integration contract (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`), consuming the Shared Kernel (`09` §Shared Kernel).

### Phase 9 — Group / conglomerate

Implement: multi-organization hierarchy, delegated admin, regional policy, legal entity isolation.

**Confirmed correctly deferred**: no design work should happen here before Phase 9 is actually reached — see `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md` §Group/M&A Tier.

### Phase 10 — Public API / SDK / partner ecosystem

Expose stable capability contracts.

## Definition of Done

A feature is not complete without: Requirements, Domain impact review, Threat model, Data model, Migration, Implementation, Unit tests, Integration tests, Contract tests, Security tests, Observability, Audit behavior, Documentation, Runbook, Rollback, Acceptance criteria.

For intelligence methods also require: Method contract (including the `inference_mode` field, new in V2 — see `05_HCI30_INTELLIGENCE_METHODS.md`), Evidence grade, Allowed use, Forbidden use, Version, Validation plan, Bias test, Replay support.

**New requirement in V2**: for any feature implementing a "must"/"never" stated elsewhere in this document set, Definition of Done also requires a corresponding CI-blocking test or DB-level constraint — see `01_SYSTEM_CONSTITUTION.md` Invariant 8 and `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Enforcement Discipline. A feature whose safety claim is prose-only is not done.

## Stop conditions

Do not continue implementation when: domain ownership is ambiguous, a new feature requires direct cross-system DB access, no rollback path exists, sensitive data purpose is unclear, a high-impact decision has no human review.

**New stop condition in V2**: do not continue implementation of any section marked 🔴 DECISION PENDING in this document set until the operator has explicitly resolved it — see `D:\Work\agency-os\docs\HCI30_RESEARCH_REVIEW\22_OPEN_HUMAN_DECISIONS.md`.

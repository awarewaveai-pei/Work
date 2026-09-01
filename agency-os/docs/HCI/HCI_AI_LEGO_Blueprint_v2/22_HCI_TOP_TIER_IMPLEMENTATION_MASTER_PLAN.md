# 22 — HCI-30 Top-Tier Implementation Master Plan

## Goal

Move HCI-30 from architecture baseline to a production-verifiable, commercially deployable, LEGO-extensible, 30-year system without architectural rework.

## Dependency order

```text
Constitution
→ Domain semantics
→ Data model
→ Policy
→ Security boundaries
→ Contracts
→ Core workflow
→ Intelligence
→ Public Intelligence
→ Commercial controls
→ Enterprise controls
→ Optional AI integration
→ Scale/extensions
```

**Resequencing note (new in V2)**: the Wave list below carries forward V1's structure with specific items pulled earlier — see `HCI30_RESEARCH_REVIEW/21_V2_IMPLEMENTATION_ORDER.md` for the complete reasoning behind each move. The organizing principle: every pulled-forward item lands before the specific Wave where this plan first admits the class of data or traffic it protects — not "as early as possible" (itself a form of overengineering), and not left at its original position where an independent red-team review found it protects nothing.

# Wave 0 — Freeze invariants + resolve pending ADRs

Planning register: `D:\Work\agency-os\docs\HCI\HCI_AI_LEGO_Blueprint_v2\governance\ADR_INDEX.md`

Proposal template: `D:\Work\agency-os\docs\HCI\HCI_AI_LEGO_Blueprint_v2\governance\HCI_CHANGE_PROPOSAL_TEMPLATE.md`

Create/lock the remaining planned ADRs from ADR-0001 through ADR-0013 (extended list, `17_REPOSITORY_LAYOUT_AND_PATHS.md`), and verify the implementation gates of any already accepted ADR.

**New in V2 — these ADRs specifically must resolve before Wave 0 closes**: Tenant/Organization reconciliation (`02` `HD-01`, ADR-0009). Consent scope (`07` `HD-02`, ADR-0010). Subject-type scope (`02` `HD-00`, ADR-0011). Data-subject rights (`07` `HD-03`, ADR-0014), identity confirmation (`06` `HD-04`, ADR-0015), and tenant RLS (`11` `HD-05`, ADR-0016) now have synthetic skeletons but still require Docker-backed evidence. Shared Kernel extraction and regulatory market scope (`HD-20`) remain open.

Expected result: later teams cannot collapse HCI/Cognitive, app/portal, DB boundaries, trust semantics, or the newly-resolved ADR items above.

### Wave-gate record

Before a Wave or release gate is declared closed, record the gate name, scoped artifacts, prerequisites/evidence, ADR/proposal links and status, independent-review result (or labeled fallback), residual risk, rollback/reversal path, and the approving human authority. Research evidence or a `PROPOSED` recommendation alone never unlocks the next Wave.

# Wave 1 — Domain foundation

Paths: `D:\Work\agency-os\systems\hci30\docs\domain\`, `database\`, `domain\`

Deliver: ERD (**including all V2 new entities — Case/Engagement, DataSubjectRequest, PersonMergeLog/PersonSplitLog, Control/Mitigation, subject_type stub**), entity dictionary, state machines, bitemporal model (scoped, see `07`), DB schema, constraints/indexes, fixtures.

**New in V2, must land in this Wave**: insert-only ledger DB-level enforcement (`REVOKE`+trigger), RLS mandatory + CI-blocking cross-tenant test (P0-09), crypto-shredding schema (`encryption_key_ref`/`tombstoned_at`), partitioning/retention strategy for high-growth tables.

Acceptance: migration from empty DB passes; tenant ownership enforced; invalid state transitions fail; history remains queryable; "what was known at T" test passes; **cross-tenant read attempt fails (new in V2)**; **destructive migration is blocked by CI (new in V2)**.

Expected result: stable core survives UI/AI/provider replacement.

# Wave 2 — Policy + security boundary

Paths: `D:\Work\agency-os\systems\hci30\governance\`, `shared\security\`, `shared\platform\identity\`, `shared\platform\tenants\`

Deliver: machine-readable policies, RBAC/ABAC, tenant-context standard, key hierarchy, audit schema, JIT/break-glass, service accounts.

**New in V2, pulled forward to this Wave**: DB-session-level audit logging (pgaudit or equivalent) for non-application-role connections; minimal `BREAK_GLASS_ACCESS.md` (time-bound elevation + justification + audit event — full enterprise version stays P1); minimal key-rotation/compromise-response runbook (full BYOK stays P1).

Acceptance: cross-tenant access fails; admin != unrestricted content access; fail-closed policy; high-risk export audited; **direct DB access outside the app role is logged and alertable (new in V2)**.

Expected result: blast radius is bounded before sensitive data enters production.

# Wave 3 — Contract-first API/events

Paths: `D:\Work\agency-os\systems\hci30\api\`, `shared\contracts\`

Deliver: OpenAPI, AsyncAPI, error model, idempotency, webhooks, version/deprecation, contract tests, **Shared Kernel thin-reference types built as actual code (new in V2, `09` §Shared Kernel), not left as prose**.

Expected result: frontend/workers/portal/API integrations evolve independently.

# Wave 4 — Evidence/Claim/Assessment core

Paths: `D:\Work\agency-os\systems\hci30\domain\evidence\`, `claims\`, `assessments\`, `security\evidence-integrity\`

Acceptance trace: `Decision → Assessment → Method → Claim → Evidence → Source`.

> 🔴 **BLOCKING PRECONDITION (new in V2)**: a rehearsed, cross-box restore drill must pass before this Wave admits any real, non-synthetic tenant data (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Backups, P0-10). ADR-0014 resolves `HD-03=A`; its synthetic schema/test gate still needs Docker-backed execution evidence before this Wave starts.

Expected result: explainability is structural.

# Wave 5 — Intelligence math v1

Paths: `D:\Work\agency-os\systems\hci30\intelligence\`, `docs\intelligence\`

Implement only from formal specs (P0-04). Acceptance: golden datasets, property/invariant tests, counterfactual tests, insufficient-data state, versioned outputs, **qualitative-band confidence display until calibration evidence exists (new in V2, `19` §Confidence Display)**.

Expected result: reproducible analysis, not arbitrary AI scoring.

# Wave 6 — Hardened Public Intelligence

Paths: `D:\Work\agency-os\systems\hci30\public-intelligence\`, `security\threat-models\`

Pipeline: Search → isolated fetch → malware/MIME checks → normalization → untrusted-content label → identity match → source quality → claim extraction → verification → admission gate.

**New in V2, added to this Wave**: content isolation for untrusted retrieved text (prompt-injection defense), minimum-viable authenticity check, deterministic `MATCH_CONFIRMED` gate for RESTRICTED subjects, purpose-attestation gate for Continuous Monitoring mode.

> 🔴 **BLOCKING PRECONDITION (new in V2, `HD-19`)**: the Trigger.dev-reuse-vs-isolated-runner network-isolation question must be resolved with an actual verification test before this Wave builds the fetch/scan pipeline on top of an unverified isolation assumption — this is not resolvable by further architecture review, it requires someone to run the test.

Acceptance: SSRF/malware/prompt-injection tests, source poisoning tests, false identity match tests, allegation counter-search, URL provenance, **network-isolation test against the resolved `HD-19` decision (new in V2)**.

Expected result: the internet never becomes a trusted input channel.

# Wave 7 — HCI customer UI

Path: `D:\Work\agency-os\systems\hci30\apps\web\`. Host: `hci.aware-wave.com` (DNS reservation deferred until this Wave is close to shipping, per `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md`).

UI priority: evidence/claims, relationship timeline, trust domains, unknowns, contradictions, why-this-conclusion, permissions, decisions, sources, review.

Expected result: evidence and decision clarity come before chat UX.

# Wave 8 — Commercial control-plane integration

Future external: `portal.aware-wave.com` (already live at the identity layer, see `20_VERIFIED_SUBDOMAIN_INVENTORY_AND_BRAND_IA.md`). Existing internal remains: `app.aware-wave.com`.

Paths: `D:\Work\agency-os\shared\platform\entitlements\`, `licensing\`, `billing\`

**New in V2**: implements the AI LEGO usage-metering clause (`10` §Usage Metering) — the *contract clause* should already be written in Wave 0/3; this Wave is where real cross-product billing goes live.

Expected result: HCI can sell Personal→Enterprise without business logic contaminating domain core.

# Wave 9 — Enterprise readiness

Paths: `D:\Work\agency-os\systems\hci30\enterprise\`, `privacy\`, `shared\security\controls\`

Deliver: SSO/SCIM, retention/legal hold, DLP, audit export, residency, dedicated DB, BYOK, support access governance, procurement/trust package.

> 🔴 **BLOCKING PRECONDITION (new in V2)**: do not reference BYOK or dedicated-DB in Enterprise sales materials until this Wave's key-architecture work is actually built and tested — see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Encryption. Also confirm the `11` `HD-20` regulatory-scope decision before pursuing EU/regulated-industry Enterprise deals specifically.

Expected result: standard enterprise due diligence becomes answerable.

# Wave 10 — Optional AI LEGO integration

Path: `D:\Work\agency-os\systems\hci30\integrations\cognitive-os\`

Acceptance: no direct DB, timeout/failure graceful, contract compatibility, AI results cannot self-admit as HCI facts, run references preserved, convergence != evidence confidence.

Expected result: advanced cognition is replaceable LEGO.

# Wave 11 — Scientific calibration

Paths: `D:\Work\agency-os\systems\hci30\governance\methods\`, `tests\calibration\`, `tests\bias\`

Deliver: validation lifecycle, benchmark data, outcome labels, calibration, false positive/negative analysis, independent expert review.

Expected result: HCI can measure whether it actually improves decisions.

# Wave 12 — 30-year resilience / ecosystem

Paths: `D:\Work\agency-os\shared\platform\lego-runtime\`, `capability-registry\`, `systems\hci30\data-portability\`

Deliver: signed LEGO manifests, sandbox, compatibility, kill switch, export/import versioning, private/customer-cloud deployment, region migration, deprecation lifecycle.

Expected result: future tools/models/methods can be swapped without rewriting HCI.

# Release gates

Every Gate A–F closure requires the Wave-gate record above in addition to its listed technical evidence.

## Gate A — Prototype
Waves 0–3.

## Gate B — Internal dogfood
Waves 0–5 + backups/security baseline.

## Gate C — Paid Personal/Pro
Hardened public intelligence + export/delete + incident response + restore test. **Note: restore test is now also a Wave-4 precondition (P0-10), so this Gate's requirement is already satisfied by that point, not newly introduced here.**

## Gate D — Team/Business
RBAC/collaboration + tenant isolation tests + audit + commercial controls.

## Gate E — Enterprise
SSO/SCIM + privacy/compliance ops + external pen test + DR exercise + SLA/SLO.

## Gate F — Group/Private
Multi-region/residency + dedicated/private deployment + regional DR + migration tooling. **Confirmed correctly deferred — no design work before this Gate is actually reached (`08` §Group/M&A Tier).**

# Final top-tier proof

The system must prove:

```text
1. Why a conclusion exists.
2. What was known at the time.
3. Who was allowed to act.
4. How execution can be reproduced/explained.
5. How to recover or rollback when conclusion/code/provider/infrastructure is wrong.
6. How the Subject of the analysis can be heard.   -- new in V2
```

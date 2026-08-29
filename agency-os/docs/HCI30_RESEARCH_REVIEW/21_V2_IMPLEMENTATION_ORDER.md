# 21 V2 Implementation Order

> Note on naming: the mission spec listed this file as `21_V6_IMPLEMENTATION_ORDER.md`. That appears to be a stray reference — nothing elsewhere in the spec or the blueprint mentions a "V6," and the document set otherwise consistently talks about V1 (current) -> V2 (this proposal). Renamed to `21_V2_IMPLEMENTATION_ORDER.md` on that basis; flag to the operator if a different meaning was intended.

This orders the changeset in `20_V1_TO_V2_CHANGESET.md` against V1's own existing Wave 0-12 sequence (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`), inserting hardening work at the point where it becomes cheap-vs-expensive, not before.

---

## Before Wave 0 code (ADRs — pure documentation, zero engineering blast radius)

1. Tenant/Organization reconciliation ADR (HD-01) — zero real customers on any of the three definitions today; this is the single cheapest fix in this entire package relative to its future cost.
2. Shared Epistemic/Provenance/Decision-Authority kernel ADR (HD-09)
3. EU AI Act / FCRA use-case scoping ADR (HD-20)
4. Consent entity scoping decision (HD-02)

## Wave 0-1 (domain ERD freeze — the point of no cheap return)

5. Add `DataSubjectRequest`, `PersonMergeLog`/`PersonSplitLog`, `Case`/`Engagement` to the ERD (HD-03, HD-04, HD-10)
6. Bitemporal columns on Evidence/Claim/Assessment/Decision (HD-06)
7. `encryption_key_ref`/`tombstoned_at` crypto-shredding design (HD-07)
8. RLS policies made mandatory in schema + CI-blocking cross-tenant test written (HD-05) — this is the single highest-severity item in the entire package (see `15_RISK_REGISTER.md`); do not let it slip past this wave under any circumstance
9. Insert-only ledger enforcement (`REVOKE` + trigger) on Evidence/Claim/Assessment/Decision/Observation/audit tables
10. `DATA_PROTECTION_ROLES_MEMO.md` (HD-21)

## Wave 2 (was: audit schema wave in V1's own sequence — pull forward, don't add a new wave)

11. Minimal `BREAK_GLASS_ACCESS.md` + DB-session-level audit logging (pgaudit or equivalent) for non-application-role connections (`12` RT-04)
12. Minimal `KEY_ROTATION_RUNBOOK.md` (HD-12) — full BYOK/KMS machinery stays at its original P1 position; only the minimal runbook moves up

## Before Wave 4 (Evidence/Claim/Assessment core goes live — V1's own scheduled point)

13. Minimum-viable evidence-authenticity check wired into the retrieval->claim-extraction pipeline (`12` RT-06) — advanced synthetic-media detection stays at its original P2 position
14. Identity-resolution `MATCH_CONFIRMED` policy ratified and enforced as a hard admission gate (HD-04) — this must land no later than Wave 4 since Wave 4 is exactly where match errors start propagating into formal Assessments
15. Deterministic/probabilistic/LLM-assisted field policy published and wired into the admission gate (HD-08)

## Before any real (non-synthetic) tenant data is admitted — currently Gate C in V1's sequence, moved earlier

16. **Rehearsed, cross-box restore drill passed** (`12` RT-02) — V1's own sequence only requires this at Gate C (paid tier); this order moves it to a precondition for admitting *any* real RESTRICTED data, synthetic or paid-tier, since the risk (total unrecoverable loss) doesn't care whether the tenant is paying yet
17. Preventive bulk-export control live for RESTRICTED-classified exports (HD-18)

## Wave 6 (Public Intelligence pipeline — V1's own scheduled point, one open item must resolve first)

18. **Resolve HD-19 before Wave 6 ships**: commission the Trigger.dev sandboxing-vs-SSRF-isolation test (the DISAGREEMENT between Reviewers C and D). This is a blocking dependency for Wave 6, not parallel work — building the pipeline on an unverified isolation assumption is exactly the kind of gap this review process exists to catch before it ships.
19. Claim/Source tenant-ownership decision implemented (HD-16) — must land before or alongside Wave 6 since this is when shared-vs-tenant-scoped public evidence starts accumulating

## Wave 9 / Enterprise-readiness (V1's own scheduled point — confirmed correctly deferred here, not pulled forward)

20. Full BYOK/dedicated-KMS key hierarchy (only the minimal runbook moved earlier, per item 12)
21. Full SOC 2 / ISO 27001 program (confirmed correctly out of scope until Enterprise stage per Reviewer I)
22. AI LEGO usage-metering/billing-attribution clause implementation (HD-22) — the *contract clause* should be written earlier (before Wave 0, cheap); the *implementation* naturally lands when real cross-product billing exists

## No fixed wave — trigger-based, per `13_ARCHITECTURE_OPTIONS_MATRIX.md` §4

Multi-region infrastructure (signed residency-clause contract) · standalone graph database (measured latency/algorithm trigger) · full event-sourcing subsystem (specific narrow need, e.g. historical confidence recompute) · Kubernetes/microservices (second physical box or isolated-blast-radius enterprise requirement) · message broker (measured fan-out need).

---

## Why this ordering, not a different one

The single organizing principle: **every item above is sequenced to land before the specific wave where V1's own roadmap first admits the class of data or traffic that item protects** — not "as early as possible" (which would itself be a form of overengineering the mission brief warns against) and not left at V1's original position where the red-team cross-check found it protects nothing (see `12_RED_TEAM_FAILURE_ANALYSIS.md`). Items confirmed correctly deferred by the mission's own anti-overengineering test (event-sourcing, graph DB, Kubernetes, broker, multi-region, full SOC2/BYOK) keep V1's original late position unchanged.

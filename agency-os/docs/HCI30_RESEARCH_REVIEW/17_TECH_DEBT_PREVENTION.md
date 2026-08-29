# 17 Tech Debt Prevention

> Synthesized by the architect (Claude) from all 9 independent reviews. This file answers one question per candidate debt source: is this debt V1 is *about to create* (cheap to prevent now, expensive to fix after Wave 1 code exists), or debt V1 has *correctly chosen to defer* (the anti-overengineering discipline working as intended)? Confusing the two in either direction is itself a failure mode this file exists to prevent.

---

## A. Debt V1 is about to create — prevent now, before Wave 1 schema freeze

These are cases where the fix is cheap *today* (zero production data, zero real customers) and expensive *later* (requires migrating live RESTRICTED data). Ordered by how much more expensive delay makes them.

| # | Debt | Why it's cheap now / expensive later | Source |
|---|---|---|---|
| TD-1 | Bitemporal schema absent (system-time only) despite Invariant 6's "what did we know when" promise | Retrofitting valid-time columns onto a live Evidence/Claim/Assessment table with years of system-time-only rows is a materially harder migration than designing it in at Wave 1. Every reviewer who touched this (B, H) says resolve before Wave 1, not in parallel. | CM-03, RISK (Critical), B §3, H RT-14 |
| TD-2 | Insert-only ledger is a `version` column (mutable row), not a DB-enforced guarantee | `REVOKE UPDATE/DELETE` + trigger is a one-time schema decision; adding it after an application has grown used to mutating rows means auditing every code path that currently does so. | B §2, CM-19 (enforcement-gap meta-pattern) |
| TD-3 | Three incompatible Tenant/Organization definitions coexist (blueprint 4-level, AI LEGO ADR-003 3-level, shipped `portal.aware-wave.com` `organizations` table) | Currently zero real external customers on any of the three (portal signup deliberately closed). The reconciling ADR costs an afternoon today; it costs a live-data migration across three code owners the moment any one of them gets real usage. | RISK (Medium-High), CM-01, A DOM-01, G G-01 |
| TD-4 | Person merge/split has no lineage entity | Cheap to add a `PersonMergeLog`/`PersonSplitLog` table before any Person rows exist; expensive to retrofit once Assessments/Decisions already reference merged/split identities with no correction trail. | RISK (Critical), H RT-05 |
| TD-5 | RLS is "where appropriate," test only checks column presence | Writing the CI-blocking cross-tenant-read test costs a few hours now. Discovering the gap after a leaked `service_role` key or a missed policy has already exposed every tenant's RESTRICTED data costs the company itself. | RISK (Critical), CM-02 |
| TD-6 | Immutable-evidence vs. right-to-erasure tension unresolved at schema level | Crypto-shredding (`encryption_key_ref` + `tombstoned_at`) is a Wave-1 schema decision. Retrofitting per-record encryption onto a large existing evidence table later is, in B's own words, "a genuinely painful, high-risk migration." | B §7, RISK |
| TD-7 | Epistemic/provenance/risk-tier vocabulary being independently re-derived by HCI while AI LEGO already has ACCEPTED equivalents | Extracting a shared kernel costs a coordination conversation now. Every week both tracks build independently increases the reconciliation cost and increases the odds of a silent naming collision (`Evidence` meaning two different shapes across the integration adapter). | CM-10, CM-16, A, E |
| TD-8 | `CURRENT_SERVICE_PLACEMENT.md` cited as SSOT by 4 documents but does not exist | A stub inventory table costs an hour to write. Every week it doesn't exist, more documents accumulate references to a file that isn't there, and the false-SSOT pattern (a citation nobody checks) compounds. | D, ASM-03 (VERIFIED via direct `ls`) |

---

## B. Debt V1 has correctly chosen to defer — leave alone, do not "fix" preemptively

Flagging these explicitly matters as much as flagging TD-1 through TD-8: a reviewer or future contributor re-reading this package should not mistake correct restraint for an oversight and add unwarranted complexity.

| # | Deferred item | Why deferring is correct | Source |
|---|---|---|---|
| TD-D1 | Full event-sourcing/CQRS | Insert-only ledgers already capture ~80% of the value without projection-consistency complexity a solo operator cannot support. | B §8 (3-option matrix), CM-15 |
| TD-D2 | Standalone graph database | Apache AGE (in-Postgres) serves the same query ergonomics without a second stateful service; a real trigger condition is defined in `13_ARCHITECTURE_OPTIONS_MATRIX.md` §1. | B §6, CM-15 |
| TD-D3 | Kubernetes / true microservices | Single dedicated box, solo operator; the existing `sg-deploy.sh` modular-monolith pattern already works and is proven on next-admin/node-api. | D §3a, CM-15 |
| TD-D4 | Message broker (Kafka/NATS) for HCI↔AI LEGO integration | Sync-request + async-callback already matches doc 10's own contract shape; a broker adds a new shared-fate dependency with no HA on a single box. | D §3b, CM-15 |
| TD-D5 | Multi-region infrastructure | No signed enterprise/residency contract exists yet; nullable schema stubs (cheap) are kept, enforcement is not built until a named trigger fires. | D §3c, CM-15 |
| TD-D6 | Full SOC 2 / ISO 27001 certification | Correctly out of scope pre-Enterprise-stage per Reviewer I's regulatory research; premature certification spend with no customer demanding it yet is its own form of overengineering. | I (REG-07), CM-15 |
| TD-D7 | Full BYOK / dedicated-KMS enterprise key hierarchy | The narrow fix (a minimal key-rotation/compromise-response runbook, see TD-list item RT-07) should move to P0; the *full* enterprise key-hierarchy machinery is correctly P1 — the distinction matters and is easy to blur. | H RT-07, C |

---

## C. The meta-pattern behind most of Section A

Independently named by three reviewers via three different investigations (B for ledger immutability and RLS, C for RLS specifically, H as an explicit cross-cutting observation — "a constitution is not a control," see `12_RED_TEAM_FAILURE_ANALYSIS.md`): **V1 consistently states the correct principle in prose and consistently defers the machine-enforced version of that same principle to a later wave, while the data the principle is meant to protect is scheduled to exist earlier.** This is not eight unrelated findings — it is one recurring authoring pattern. The single highest-leverage tech-debt-prevention move available is procedural, not architectural: for every P0 chapter, before Wave 1 code freezes, add a matching CI-blocking test or DB-level constraint for every "must"/"never"/"always" sentence — the same discipline this org's own broader governance (`AGENTS.md` §R0/§R4) already applies elsewhere, just not yet applied to the HCI blueprint itself.

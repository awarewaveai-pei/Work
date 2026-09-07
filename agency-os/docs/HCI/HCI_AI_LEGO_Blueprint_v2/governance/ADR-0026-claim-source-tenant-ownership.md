# ADR-0026 — Claim/Source Tenant Ownership

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 domain-schema architecture only; this ADR does not authorize real-person data processing, production deployment, or a byte-dedup implementation.

## Context

`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`'s Evidence field list carries `tenant_id` (`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Evidence provenance), but its Claim object field list does not (`06_HCI30_PUBLIC_INTELLIGENCE.md` §Claim object, marked `🔴 DECISION PENDING (HD-16 / RT-10)`). `06_HCI30_PUBLIC_INTELLIGENCE.md` §Source quality/§Source independence likewise defines `Source`/`SourceSnapshot`-shaped fields (`source_relationships`, `cites`, `derived_from`, `original_source`) with no tenancy field at all. Whether two tenants researching the same public figure get separate rows or a shared/deduplicated record was never decided in V1, and `22_OPEN_HUMAN_DECISIONS.md` HD-16 states this sits "directly under a customer-facing deletion promise."

Two independent reviewers converge on the same gap by different routes and land on opposite recommendations:

- `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-10 frames it as a deletion-lifecycle defect: an undecided shared-vs-scoped boundary means a per-tenant deletion request could either retain data unlawfully or delete evidence other paying tenants still depend on. RT-10 states options only, no recommendation.
- `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-14 frames the same gap as a cost/invariant tension against `11_SECURITY_PRIVACY_GOVERNANCE.md`'s "no cross-tenant person reputation database" default, and recommends **Alternative B**: a shared, non-attributable raw-source cache (URLs/snapshots only) with per-tenant Claim/Assessment layers referencing it.

Neither reviewer's recommendation is binding; both are `Requires human decision: YES`. This ADR is the required explicit decision.

Existing accepted ADRs already constrain the solution space: ADR-0016 makes `tenant_id NOT NULL` + forced RLS mandatory for every *tenant-owned* table with an executable cross-tenant negative test, and separately leaves an open question about what identity RLS keys on (`SET ROLE` risk) — this ADR must not add a second tenancy exception on top of that unresolved surface. ADR-0014 makes `DataSubjectRequest` a first-class record with tenant-scoped links to affected records and append-only correction lineage — a deletion/correction target must be traceable to one tenant's own record, not to a shared record another tenant also depends on. `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Immutability vs. Erasure (`HD-07`, still open) proposes per-record `encryption_key_ref` crypto-shredding as the erasure mechanism — a mechanism that requires the record whose key is destroyed to belong to exactly one tenant's erasure request, not to be silently unavailable to a second tenant who never asked for anything to be deleted.

## Decision

Adopt **HD-16 Option A**: `Claim`, `Source`, and `SourceSnapshot` are **tenant-scoped records** — each row carries `tenant_id NOT NULL`, is covered by ADR-0016's mandatory forced-RLS pattern, and is never shared, deduplicated at the record level, or made visible across tenants. Corroboration graphs (`source_relationships`, `cites`, `derived_from`, `original_source`) are tenant-local. Deletion and correction (ADR-0014) against a tenant's Claim/Source is therefore complete and unambiguous: there is no second tenant's dependency to check, because no second tenant can hold a reference into another tenant's row.

Storage duplication when multiple tenants research the same public figure is an accepted cost. A content-addressed, byte-level deduplication layer for **raw snapshot bytes only** (the object-storage payload behind `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Raw content storage's hash+metadata design) MAY be added later as an internal storage optimization, provided it changes no record's tenant ownership: the dedup layer stores content-addressed bytes with no `tenant_id`, no claim/assessment interpretation, and no cross-tenant reference exposed to any application code path; each tenant's `SourceSnapshot` row keeps its own hash+metadata pointer into that store. This is an optimization on top of Option A, not SEC-14's Option B — the logical `Claim`/`Source`/`SourceSnapshot` records stay tenant-scoped copies regardless of whether the bytes behind them are physically deduplicated.

**Why Option A over SEC-14's Alternative B (shared raw-source cache with reference-counted visibility)**: Option B requires a table exempt from ADR-0016's "every tenant-owned table carries `tenant_id` + forced RLS" invariant by construction — it is tenant-agnostic by design — which reopens exactly the tenancy-principal ambiguity ADR-0016 already flagged as unresolved (`SET ROLE`/pooled-connection risk) by adding a second, differently-shaped exception to reason about. It also cannot host ADR-0014's correction/deletion lineage or `HD-07`'s proposed crypto-shredding cleanly: a `DataSubjectRequest`-triggered erasure or an `encryption_key_ref` tombstone on a record one tenant references but does not own either destroys another paying tenant's evidence base (the exact failure RT-10 names) or the erasure request cannot actually erase the content, only that tenant's link to it — a materially weaker claim than "deleted." Per-tenant lawful-basis clarity (ADR-0010's consent/authorization/terms three-way split is meaningless if the underlying Claim a tenant's authorization was scoped to is shared with a stranger's authorization) and complete per-tenant erasure outweigh the re-fetch/storage cost Option B would save. Alternative C (shared claim/assessment data itself) is not considered — SEC-14 already rejects it as the forbidden cross-tenant reputation database (`11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant Isolation).

This decision does not authorize: processing of real (non-synthetic) person data; production deployment of the public-intelligence pipeline (Wave 6, still gated by `HD-19`'s unresolved network-isolation test); building the optional byte-dedup layer itself (a later, separately-reviewed storage change if pursued); or any claim that erasure is legally complete absent `HD-07`'s still-open crypto-shredding decision.

## Required implementation gates

Design artifacts do not yet exist for this decision; both design and runtime gates are **OPEN**. Before Wave 1 ERD freeze (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` §Wave 1):

1. **Claim** already exists as a `kind='CLAIM'` row in the polymorphic `hci.subject_records` table (`0001_wave1_synthetic_up.sql:116-126`), which is already `tenant_id NOT NULL`, append-only (`REVOKE UPDATE, DELETE` + `BEFORE UPDATE/DELETE` trigger raising `H1003`), and RLS-forced per ADR-0016 — this decision requires no new gate for Claim, only that it stay in that table rather than being split out. **Source** and **SourceSnapshot** have no table yet (`subject_records.kind` does not include either value). `wave1/HCI_WAVE1_DOMAIN_ERD.md` must add `sources`/`source_snapshots` (or extend `subject_records.kind` to include `SOURCE`/`SOURCE_SNAPSHOT`, an implementation choice left to the Wave 1 ERD owner) each carrying `tenant_id NOT NULL`, the same insert-only pattern, and forced RLS per ADR-0016. `source_relationships`/`claim_sources` (`cites`, `derived_from`, `original_source`) are new join tables and must carry `tenant_id NOT NULL` and RLS identically — no table in this group is exempted from that pattern. Lands in **Wave 1**.
2. `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md` gains an executable, CI-blocking cross-tenant test proving a tenant-A principal cannot read, corroborate against, or contradiction-link a tenant-B `Claim`/`Source`/`SourceSnapshot` row, run as a non-owner `NOBYPASSRLS` role per ADR-0016's runner pattern (test id: `RLS-CLAIM-01`). Lands in **Wave 1**.
3. A deletion-completeness test proving a tenant's `DataSubjectRequest`-triggered deletion (ADR-0014) against its own `Claim`/`Source` leaves zero residual readable rows for that tenant and exactly zero effect on any other tenant's rows, since none reference it (test id: `DSR-CLAIM-DELETE-01`). Lands in **Wave 1**, gated on ADR-0014's Docker-backed execution evidence per `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` §Wave 4 blocking precondition.
4. If the optional byte-level dedup layer is built: a schema constraint/test proving the object-storage dedup table carries no `tenant_id` column and no foreign key from any `Claim`/`Assessment` table, only content-hash-keyed bytes referenced by per-tenant `SourceSnapshot.raw_snapshot_ref` (test id: `DEDUP-NO-TENANT-01`). This gate is conditional — it is only required if and when the optimization is actually pursued, and requires its own design review before that Wave's work starts; it does not block Wave 1 or Wave 6.

## Implementation note (2026-09-05, gate 1-2 landed, gate 3 blocked)

Recorded here rather than by editing the numbered gates above, which remain
the historical decision record.

- **Gate 1's own text is stale** ("Source and SourceSnapshot have no table
  yet") relative to what `migrations/0001_wave1_synthetic_up.sql` actually
  built: `hci.sources` (source_ref, `tenant_id NOT NULL`, already in the
  tenant-isolation loop) has existed since 0001 and was already tenant-
  scoped + RLS-forced — checked before assuming this gate needed a new
  `sources` table (this project's "verify before conclude" discipline). What
  was genuinely missing, and what `migrations/0004_wave1_source_provenance_up.sql`
  adds: `hci.source_snapshots` (the hash+metadata pointer to one retrieval of
  a Source) and `hci.source_relationships` (the corroboration graph —
  `CITES`/`DERIVED_FROM`/`ORIGINAL_SOURCE` — named at
  `06_HCI30_PUBLIC_INTELLIGENCE.md:175-179`). Both are tenant-scoped,
  RLS-forced, and append-only (matching `hci.subject_records` rather than
  `hci.sources`' pre-existing full-CRUD shape).
- **Gate 2 landed as `RLS-CLAIM-01`** (write-side: a tenant-A Claim cannot
  cite/derive-from/claim-as-original-source a tenant-B Source — composite FK
  makes the row structurally impossible to construct) plus `SOURCE-RLS-01`
  (read-side: tenant B's Source/SourceSnapshot rows are invisible to tenant
  A). Real-Docker-verified as part of the full Wave 1 suite (102/102
  assertions, 37/37 mutations, 2026-09-05 — see
  `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`).
- **Gate 3 (`DSR-CLAIM-DELETE-01`) is still genuinely blocked, re-verified 2026-09-07 for a different, now-precise reason** (this note's original premise below was stale, caught while writing P0-08's threat models the same day — see `TASKS.md`). `ADR-0018` is no longer `SPECIFIED — RUNTIME OPEN`: `hci.tombstone_evidence(uuid)` (`migrations/0007_wave1_crypto_shredding_up.sql:143-162`) exists, is real-Docker-verified, and is kind-agnostic — it operates on `hci.subject_records` by `id` alone with no `kind` filter, so it mechanically CAN tombstone a `kind='CLAIM'` row exactly like an `EVIDENCE` row. That does not unblock this gate, for two independent reasons checked directly: (1) `Source`/`SourceSnapshot` (`hci.sources`/`hci.source_snapshots`) are separate tables `tombstone_evidence()` never touches — zero erasure mechanism exists for them at all, dump-only or otherwise; (2) grepping every call site of `tombstone_evidence` (`database/`, 2026-09-07) found exactly one: `wave1-negative-tests.sql:1307-1309`, which calls it directly as schema owner to prove the function itself works and that app roles are correctly refused (`ADR-0018` gate 3's own scope) — there is no trigger, no application code, and no wiring from a `data_subject_request_events` row (`event_type='ERASURE_RECORDED'`) to an actual call. Writing `DSR-CLAIM-DELETE-01` today would still be vacuous: the DSR-to-erasure call path P0-03 already named as the deferred piece (`security/evidence-integrity/HCI_EVIDENCE_TAMPER_EVIDENCE_SPEC.md`) is the real blocker, not `ADR-0018`'s own gate 3, and no Source/SourceSnapshot erasure mechanism has ever been designed. Left `OPEN`, now tracked as blocked on that wiring + a Source/SourceSnapshot erasure design, not on `ADR-0018` landing (it already has, for Claim).
- **A real limitation surfaced during implementation, not anticipated by
  this ADR's original text**: making `source_relationships` append-only (the
  correct call for an evidentiary corroboration graph) means a `CITES` edge
  asserted in error — e.g. pointing at a since-discredited citation — can
  never be retracted or corrected under this design alone. Correction
  requires `ADR-0017`'s `mark_superseded` mechanism (reserved as `H1008`,
  not yet built). Tracked as blocked on `ADR-0017` landing, the same way
  gate 3 is blocked on `ADR-0018`. These two new tables also enlarge the
  eventual erasure surface `ADR-0018`'s crypto-shredding mechanism will need
  to cover.
- **Gate 4** (optional byte-dedup layer) remains out of scope, unchanged —
  not pursued.

## Consequences

- HCI has one ownership semantic for public-intelligence records — tenant-scoped, matching Evidence — closing the `07`/`06` field-list inconsistency HD-16 named.
- `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md`'s tenant-deletion lifecycle can now be implemented for Claim/Source without a shared-record special case.
- Re-crawling the same public figure per tenant is an accepted, ongoing storage/compute cost, partially recoverable later via the optional byte-dedup layer without reopening this ownership decision.
- SEC-14 and RT-10 are both resolved by this ADR; neither requires separate closure.
- `HD-07` (crypto-shredding, resolved by `ADR-0018`), `HD-11` (physical isolation, resolved by `ADR-0021`), and the ADR-0016 tenancy-principal question (resolved by `ADR-0033`) were each still open while this ADR's Context/rationale sections above were drafted, and those sections' reasoning is preserved as written since it does not depend on how those three ultimately resolved — this ADR's own decision (Claim/Source are tenant-scoped) holds regardless. All three are now decided elsewhere and none contradicts this ADR.

## Verification and rollback

- Verification recorded here is documentation-only: this decision is cross-linked to `06_HCI30_PUBLIC_INTELLIGENCE.md` §Claim object, `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, and `governance/ADR_INDEX.md`.
- The ERD update, cross-tenant negative test, and deletion-completeness test have not been implemented; their gates remain open per §Required implementation gates.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision (the operator retains override authority per the delegation this ADR was written under). After implementation, rollback must be a reviewed schema migration; it must not silently convert tenant-scoped rows into a shared record in place, and must not weaken ADR-0016's RLS requirement to accommodate a rollback.

## Evidence

- `06_HCI30_PUBLIC_INTELLIGENCE.md` §Claim object — HD-16 marker and Claim field list without `tenant_id`.
- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Evidence provenance, §Raw content storage — Evidence's `tenant_id` field and the object-storage hash+metadata design the optional dedup layer builds on.
- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-16 — question framing and options A/B.
- `HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-14 — the rejected shared-raw-source-cache alternative and its stated rationale.
- `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md` RT-10 — the deletion-lifecycle failure mode this ADR closes.
- `governance/ADR-0016-mandatory-tenant-rls.md` — the RLS/tenant-ownership invariant this ADR extends to Claim/Source rather than exempts.
- `governance/ADR-0014-data-subject-rights-channel.md` — the deletion/correction lineage this ADR keeps traceable to a single tenant.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` §Wave 1, §Wave 4, §Wave 6 — gate placement.

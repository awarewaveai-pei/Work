# ADR-0020 — Case/Engagement Aggregate

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 domain model only; this ADR adds a bounding aggregate for due-diligence work. It does not authorize real-person data processing, a production migration/deploy, or any change to the commercial `Project`/billing schema owned by doc 08.

## Context

`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:54-56` carries a 🔴 `DECISION PENDING (HD-10)` block: no bounded aggregate currently owns a due-diligence effort's purpose, risk level, evidence, or lifecycle, even though `case_id` is already referenced as if it existed (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:28` now reads `case_id -- now backed by the Case aggregate, see 07 §Case Aggregate`, itself forward-referencing this decision). `07:35` lists `Case / Engagement -- new in V2` in the core-entity block, but no table backs it.

The synthetic Wave 1 skeleton makes the gap concrete: `hci.research_workflows` (`D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:90-92`) is FK'd directly to `hci.tenant_authorizations`, and its only gate is `hci.require_active_authorization()` (`:97-114`, error `H1001`) — one active authorization admits unboundedly many workflow rows with no purpose/risk/lifecycle scoping between them. `hci.subject_records` (`:116-124`) keys Evidence/Claim/Assessment/TrustDomain rows only to `person_id`; nothing bounds which rows belong to which due-diligence effort. `wave1/HCI_WAVE1_DOMAIN_ERD.md:24,32` already marks `Case/Engagement` conditional — "deliberately conditional because HD-10 remains unresolved" — and `ADR-0017-bitemporal-scope.md:30` explicitly declines to resolve it: "It does not resolve `HD-07` … or `HD-10` (Case aggregate, `07:56`)." `ADR-0017:15` also confirms no `hci.decisions` table exists yet, so the future Decision reference this ADR requires has no schema to attach to today.

`08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:30` defines "multiple projects" as a Professional-tier feature — an account-size/billing-surface concept, not a due-diligence-scoping one; ADR-0009 (`:14`) already drew the analogous boundary for Tenant, holding that the portal's commercial layer must not silently become the platform's domain-identity source of truth. `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:38` requires replay to reproduce "Historical HCI evidence … Decision policy" for a reproduced decision, and `:61` fixes a rehearsed restore/replay precondition ahead of Wave 4 real-data admission — with no bounding unit, that reconstruction has only the Subject's entire eternal `person_id` history to replay against. `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:71-75` (HD-10) and `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md:180-199` (DOM-06) record the same three options independently.

## Decision

Adopt **HD-10 Option A**. `hci.cases` becomes a Wave 1 aggregate root: `id`, `tenant_id`, `tenant_authorization_id` (references ADR-0010's TenantAuthorization, not a bare `consent`), `purpose`, `risk_tier` (`R0`–`R4`), `relationship_context`, `requester_context`, `project_ref` (nullable, opaque, **not** a foreign key), `status` (`OPEN`/`ACTIVE`/`CLOSED`), `opened_at` (server-assigned, not null), `closed_at` (null until `CLOSED`). Evidence/Claim/Assessment/TrustDomain (`subject_records`) and the future `hci.decisions` table (ADR-0017 gate 1) are owned by a Case; `research_workflows` executes within one. Replay bounds to one `case_id`, never a Subject's full history.

**Why B (merge into Project) loses**: Project is a billing-scoping container that changes shape with commercial tiers (`08:30`) and is exactly the "tenancy control plane HCI must not own" boundary `07:56` and ADR-0009 already drew for Tenant — a due-diligence effort's `risk_tier`/`relationship_context` would then live in a table the portal/commercial layer controls, re-opening the identity-source conflict ADR-0009 just closed, one layer down.

**Why C (defer, opaque `case_id` string) loses**: `research_workflows`' only current gate is "authorization is ACTIVE" (`0001_wave1_synthetic_up.sql:97-114`) — it cannot answer "what did this due-diligence effort see" because one authorization can gate unrelated workflows across unrelated subjects and time. DOM-06 (`05:194`) rates this option's migration cost "Low now … becomes a real migration once research_reports/evidence records accumulate" — the cost is deferred, not avoided, and lands after real data exists, which is strictly worse.

This ADR does not authorize Organization as an assessable subject (ADR-0011 still governs), does not decide `HD-06` bitemporal scope for `hci.cases` itself (system-time `created_at`/`opened_at`/`closed_at` only — the four-table bitemporal scope in ADR-0017 is unchanged), does not decide `HD-07` erasure/retention for a closed Case, and does not modify the commercial `Project`/billing schema owned by doc 08.

## Required implementation gates

Runtime gates are **OPEN**. All land in `D:\Work\Projects\internal\hci30\database\` and must be green in `scripts/test-wave1-local.ps1` and killed in `scripts/mutation-check-wave1.ps1` before Wave 1 schema freeze.

1. **Wave 1 — schema.** `hci.cases` per the Decision field list, `CHECK (risk_tier IN ('R0','R1','R2','R3','R4'))`, `CHECK (status IN ('OPEN','ACTIVE','CLOSED'))`, `CHECK (closed_at IS NULL OR status = 'CLOSED')`, `FOREIGN KEY (tenant_id, tenant_authorization_id) REFERENCES hci.tenant_authorizations`, `opened_at timestamptz NOT NULL DEFAULT now()` with `INSERT` privilege on that column withheld from the app role (same pattern as `data_subject_request_events.created_at`, `:340-344`); added to the RLS/`tenant_isolation` loop and the hand-maintained table-inventory list (`:296-337`) so the drift check in the same migration catches an unprotected table. Test `CASE-SCHEMA-01`: `information_schema.columns`/`table_constraints` introspection confirms the column set, checks, and FK (pattern of `BITEMP-SCOPE-01`, `ADR-0017:39`).
2. **Wave 1 — lifecycle trigger.** `hci.enforce_case_lifecycle()` (`BEFORE UPDATE`) originally permitted only `OPEN → ACTIVE` and `ACTIVE → CLOSED` (`CLOSED → *` and the `OPEN → CLOSED` skip both raised registry code `H1010`, "case lifecycle transition rejected"; `H1009` is taken by ADR-0018 gate 3's `hci.tombstone_evidence()` "record already erased" — both this ADR and ADR-0018 independently computed "next free after `H1008`" and collided; `H1010` is the corrected next-free code, `H1011` below is renumbered accordingly). **Superseded 2026-09-10 (migration 0015, see Implementation note below): `CLOSED → ACTIVE` is now also permitted** — `CLOSED → *` other than `ACTIVE`, and the `OPEN → CLOSED` skip, still raise `H1010` unchanged. The same trigger sets `closed_at := now()` exactly on the transition into `CLOSED` and clears it back to `NULL` on `CLOSED → ACTIVE`; the app role has no direct `UPDATE` privilege on `closed_at` either way. Tests: `CASE-LIFECYCLE-01` (`OPEN→ACTIVE` succeeds), `CASE-LIFECYCLE-02` (`ACTIVE→CLOSED` succeeds, `closed_at` set), `CASE-LIFECYCLE-03` (`CLOSED→ACTIVE` succeeds, `closed_at` cleared — repurposed 2026-09-10, previously asserted the pre-0015 `H1010` rejection), `CASE-LIFECYCLE-04` (`OPEN→CLOSED` skip → `H1010`, unchanged), `CASE-REOPEN-SKIP-01` (`CLOSED→OPEN` skip → `H1010`, new 2026-09-10). Mutation: dropping the trigger must turn `CASE-LIFECYCLE-04`/`CASE-REOPEN-SETUP-03`/`-SETUP-04`/`-SKIP-01` red.
3. **Wave 1 — ownership binding.** `hci.research_workflows` and `hci.subject_records` each gain `case_id uuid NOT NULL` with composite `FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases`, replacing/augmenting the direct `tenant_authorization_id` reference (`:90-92`) as the workflow's bounding scope. Tests: `CASE-OWNS-01` (insert omitting `case_id` → `23502`), `CASE-OWNS-02` (a `case_id` from tenant B referenced by a tenant A row → `23503`), run as the non-owner tenant role per `ADR-0016-mandatory-tenant-rls.md:9`.
4. **Wave 1 — terminal-state guard.** `hci.require_open_or_active_case()` (`BEFORE INSERT`) rejects a new `research_workflows` or `subject_records` row whose `case_id` resolves to a `CLOSED` case, raising `H1011`. Test `CASE-CLOSED-GUARD-01`; mutation: dropping the trigger must turn it red.
5. **Wave 1 — `project_ref` non-FK proof (architecture test).** `CASE-PROJECTREF-01`: `information_schema.table_constraints` shows zero `FOREIGN KEY` constraints on `hci.cases.project_ref`; a synthetic fixture renames/drops a stand-in commercial `projects` row and asserts no `hci.cases` write fails — proving "never equal, references only" is enforced, not merely documented.
6. **Wave 4 — consumer binding.** `CASE-REPLAY-01`: the replay path (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:38`) reconstructs Evidence/Claim/Assessment/Decision rows filtered by one `case_id` only; a fixture with two Cases for the same Person asserts replaying Case A never returns Case B's rows — the mechanical proof that bounded replay is now satisfiable.

## Implementation note (2026-09-05, error-code registry consolidated)

Gate 2's `H1009` collision with `ADR-0018` (both independently computed
"next free after `H1008`" and landed on the same code) is one of the two
incidents that motivated
`Projects/internal/hci30/database/ERROR_CODE_REGISTRY.md`, now the single
SSOT for every `H1xxx` code in this schema. `H1010`/`H1011`'s allocation is
recorded there, not only in this ADR and the migration header comment;
future codes are claimed there first, not computed independently per-ADR.

## Implementation note (2026-09-10, case reopen -- gate 2 superseded, not this ADR revised)

Operator-requested product decision: closed (historical) cases must be
revivable, not permanently terminal -- gate 2's original `CLOSED` terminal-
state design was a reasonable default (this ADR never actually decided "can
a closed case reopen," the question was simply never asked) but does not
match the product's real intended lifecycle. `Projects/internal/hci30/database/migrations/0015_wave1_case_reopen_up.sql`
widens `hci.enforce_case_lifecycle()` to also permit `CLOSED → ACTIVE`,
reusing the existing `H1010` code (no new registry entry) and the existing
`UPDATE (status)` grant (no new privilege). Gate 2's own CLOSED-immutability
sub-guard (`OLD.status = 'CLOSED'` freezes every other column) is untouched
by this change: reopening is a pure status-only `UPDATE`, so `NEW`/`OLD` are
`IS NOT DISTINCT` on every other column and that guard never fires for it.
Real-Docker verified: 241/241 assertions, 122/122 mutations killed
(`agency-os/WORKLOG.md` 2026-09-10 entry). Gates 1/3/4/5/6 above are
unaffected.

## Consequences

- `07:56`'s 🔴 `DECISION PENDING` block and `wave1/HCI_WAVE1_DOMAIN_ERD.md:24,32`'s conditional line must be updated to cite this ADR — as a separate documentation change, not made by this ADR.
- `ADR-0017` gate 1 (new `hci.decisions` table, `:36`) must add `case_id NOT NULL` when it lands; that gate's SQL is not yet written, so no conflict exists today, but implementation order matters — `hci.cases` (this ADR) must land no later than the same migration that creates `hci.decisions`.
- `research_workflows`' existing `H1001` authorization gate is unchanged and composes with the new `case_id` gates; a workflow still needs both an `ACTIVE` authorization and a non-`CLOSED` case.
- `project_ref` carries no referential or cascading behavior; a Case is never deleted or altered by a change to the commercial Project it references.
- A later change to the lifecycle transitions, the four owning tables, or the non-FK `project_ref` rule requires a superseding ADR.

## Verification and rollback

- Verification recorded here is documentation-only: cross-linked to `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md §Case Aggregate`, `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` HD-10, `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-06, and `ADR_INDEX.md`. No `hci.cases` table, trigger, or test named above exists yet (checked 2026-09-02); every gate is open.
- Before implementation, rollback is to supersede this ADR with a later explicit decision (operator or delegated). After migration, rollback follows Expand/Contract (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md §Database migration`): `case_id` may be added as nullable first and backfilled before the `NOT NULL` constraint lands, and dropped only from a migration verified against an empty table — never against `research_workflows`/`subject_records` rows that already carry data.
- This ADR does not touch any production database, portal `organizations`/`projects` table, or real-person data; no data migration risk exists at the documentation stage.

## Evidence

- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:35,54-56` — Case/Engagement core-entity listing and the HD-10 pending block.
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:28` — `case_id` already forward-referencing this decision.
- `08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md:30` — Project as a billing/tier concept, distinct axis from subject/case scoping.
- `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:38,61` — replay content requirement and Wave 4 real-data precondition.
- `governance/wave1/HCI_WAVE1_DOMAIN_ERD.md:24,32` — Case/Engagement marked conditional on HD-10.
- `governance/ADR-0017-bitemporal-scope.md:15,30,37` — no `hci.decisions` table yet; explicit non-resolution of HD-10; `H1008` reserved (mark_superseded).
- `governance/ADR-0018-crypto-shredding-for-erasure.md:34` — `H1009` reserved (tombstone_evidence "record already erased"); this ADR's lifecycle/terminal-state codes are `H1010`/`H1011` to avoid the collision both ADRs independently produced by computing "next free after `H1008`" without seeing each other.
- `governance/ADR-0009-tenant-organization-model-reconciliation.md:14` — the analogous tenancy-identity boundary this ADR mirrors for the domain-workflow layer.
- `governance/ADR-0010-consent-entity-scope.md` and `governance/ADR-0016-mandatory-tenant-rls.md:9` — TenantAuthorization reference and non-owner test-role requirement this ADR's gates reuse.
- `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:90-114,116-124,296-344` — `research_workflows`/`subject_records` current shape, authorization-only gate, RLS/inventory loop, server-assigned-column pattern.
- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:71-75` (HD-10) and `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md:180-199` (DOM-06) — question, options, and recommendation this ADR adopts.

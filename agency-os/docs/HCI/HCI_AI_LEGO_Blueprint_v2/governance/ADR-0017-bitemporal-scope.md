# ADR-0017 — Bitemporal Scope

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 data model only; this ADR fixes which tables carry valid-time/system-time history and how supersession is recorded. It does not authorize real-person data, a production migration, or any legal/regulatory claim about discovery readiness.

## Context

`HD-06` asks where the bitemporal line is drawn: full treatment everywhere is over-engineering for a solo operator, zero treatment breaks the "what did we know when" promise (`HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:47-51`). Reviewer B's recommendation was explicitly "not yet operator-ratified" (`22_OPEN_HUMAN_DECISIONS.md:50`); `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:134` still carries the 🔴 DECISION PENDING block.

What the current documents actually specify:

- V1's schema sketch is system-time only: `created_at`/`updated_at`/`version` on Evidence (`07:123-124`) and `created_at`/`valid_until`/`assessment_version` on Assessment (`07:144`). Reviewer B (`06_DATABASE_ARCHITECTURE_REVIEW.md:149-162`, CI-1) and the Red Team (`12_RED_TEAM_FAILURE_ANALYSIS.md:372-390`, RT-14) independently found that "what did HCI know on date X, and when did it learn it" cannot be answered from these columns — creation time conflates "when it happened" with "when we learned it".
- Insert-only enforcement is already decided at the DB level: `REVOKE UPDATE, DELETE` plus a `BEFORE UPDATE/DELETE` trigger, corrections as a new row with `supersedes_id` + `corrected_reason`, latest state via a `_current` view (`07:130`; `06:170-182`, CI-2). The synthetic Wave 1 skeleton implements this pattern as a declarative `append_only` list (`D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:295-338`), rejects mutations with SQLSTATE `H1003` (`:179-183`), and withholds the INSERT privilege on `created_at` so the ledger clock is server-assigned (`:340-344`). Evidence/Claim/Assessment/TrustDomain currently share one polymorphic `hci.subject_records` table keyed by `kind` (`:116-126`); no `decisions` table exists yet.
- Downstream chapters already depend on the capability: Wave 1 acceptance requires a passing "what was known at T" test (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:51`), the bitemporal model is a Wave 1 deliverable (`22:47`), replay must reproduce historical evidence and versions (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:40`), the explainability button must show the Evidence used for an Assessment (`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:23-27`), and `DataSubjectRequest` corrections must produce a new version with lineage into bitemporal history (`07:60`; ADR-0014 `:9`).
- Invariant 8 makes a stated principle a control only when a CI-blocking test or DB constraint enforces it (`01_SYSTEM_CONSTITUTION.md:113-115`); Reviewer B rates unresolved CI-1 as the highest sequencing risk before Wave 1 (`06:415`).

## Decision

Adopt the **recommended scope** (`22_OPEN_HUMAN_DECISIONS.md:50`; `06:43-46`):

1. **Evidence, Claim, Assessment, Decision** carry full bitemporal columns, two axes kept distinct: `valid_from timestamptz NOT NULL` / `valid_to timestamptz NULL` (real-world applicability window, open-ended when NULL) and `system_recorded_at timestamptz NOT NULL` / `system_superseded_at timestamptz NULL` (when HCI's row set changed). `system_recorded_at` is server-assigned in the same way as `data_subject_request_events.created_at` (`0001_wave1_synthetic_up.sql:340-344`); the application role never holds INSERT on it.
2. **Every other table** (including `source_snapshots`, `search_jobs`, `identity_candidates`, `hci.cases` (ADR-0020), and the TrustDomain kind) is insert-only or domain-mutable per the existing mutability matrix (`:40-56`) and carries exactly one `NOT NULL`, server-assigned insertion-timestamp column — named `created_at` by convention, but a domain-appropriate name satisfies this item too (`hci.cases.opened_at`, ADR-0020 `:18,30`). No `valid_*`/`system_*` bitemporal columns may be **populated** outside the four tables named in item 1; where TrustDomain still physically shares the polymorphic `hci.subject_records` table (gate 1's escape clause), those columns exist as table columns on `TRUST_DOMAIN` rows too — item 2's ban is on population, enforced row-level (gate 4), not on column existence, in that shared-table case.
3. **Supersession is a new row.** `supersedes_id` references a row of the same table and tenant; `corrected_reason` is NOT NULL whenever `supersedes_id` is. On insert of the successor, a trigger owned by the schema (not the application role) sets the predecessor's `system_superseded_at := NEW.system_recorded_at` exactly once. Any other UPDATE remains rejected with `H1003`; a row already superseded cannot be superseded again (no forks). `valid_from`/`valid_to` are set at insert and never edited — narrowing a validity window is itself a superseding row. The trigger's `H1003` exception is not limited to `mark_superseded()`: a schema-owned (non-application-role) write named by an ACCEPTED ADR is also permitted. ADR-0019 gates 3-4 name two such writes on Claim — `human_spotcheck_status` (set only by its admission trigger) and `reaudit_required` (set only by its risk-tier-elevation trigger) — both remain rejected with `H1003` if the application role attempts them directly.
4. **Two canonical reads.** A `<table>_current` view returns rows with `system_superseded_at IS NULL`. A `<table>_as_of(T)` function returns rows where `system_recorded_at <= T AND (system_superseded_at IS NULL OR system_superseded_at > T)`; a valid-time predicate on `valid_from`/`valid_to` is applied by the caller, never folded into the system-time filter.

**Why the alternatives lose.** Universal bitemporal (CI-1 Alternative "everywhere", `06:43`) adds two axes and a supersession trigger to research artifacts that are never "facts about a Subject that can be superseded" — pure cost, no query the product needs. System-time-only / audit-log reconstruction (CI-1 Alternative C, `06:160`) cannot distinguish "when it happened" from "when we learned it", so the replay and explainability promises stay unanswerable at audit grade (`12:378-380`). Deriving `system_superseded_at` purely in a view (no physical column) keeps rows byte-immutable but makes the as-of filter a self-join on every read and leaves nothing for a CHECK constraint to guard; the single trigger-owned write is the smaller blast radius. Reviewer B's GiST exclusion on `(subject_id, valid_range)` (`06:45`) is **not** adopted: several concurrently valid Evidence rows about one Subject are normal, so that constraint would reject correct data; non-overlap is enforced per lineage chain by the no-fork rule instead.

This ADR does not authorize real-person processing, a production deploy, or any claim to a court or regulator. It does not resolve `HD-07` (erasure mechanism, `07:140`) or `HD-10` (Case aggregate, `07:56`).

## Required implementation gates

Runtime gates are **OPEN**. All land in `D:\Work\Projects\internal\hci30\database\` and must be green in `scripts/test-wave1-local.ps1` and killed in `scripts/mutation-check-wave1.ps1` (the harness that already proves 51 assertions / 15 mutations, `wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md:46-58`) before Wave 1 schema freeze:

1. **Wave 1 — columns and constraints.** Migration `0002` adds to the physical tables carrying kinds `EVIDENCE`/`CLAIM`/`ASSESSMENT` and to a new `hci.decisions` table: `valid_from`, `valid_to`, `system_recorded_at DEFAULT now()`, `system_superseded_at`, `supersedes_id`, `corrected_reason`; constraints `CHECK (valid_to IS NULL OR valid_to > valid_from)`, `CHECK (system_superseded_at IS NULL OR system_superseded_at >= system_recorded_at)`, `CHECK (supersedes_id IS NULL OR corrected_reason IS NOT NULL)`, composite `FOREIGN KEY (tenant_id, supersedes_id)` to the same table, `UNIQUE (supersedes_id)`. Tests: `BITEMP-WINDOW-01` (`valid_to < valid_from` → `23514`), `BITEMP-REASON-01` (supersession without reason → `23514`), `BITEMP-CROSSTENANT-01` (`supersedes_id` into another tenant → `23503`, run as the non-owner tenant role per ADR-0016 `:9`). If `subject_records` is still polymorphic at freeze, the columns apply to that table and the TRUST_DOMAIN kind inherits them physically; the semantic contract is claimed only for the four.
2. **Wave 1 — supersession trigger.** Function `hci.mark_superseded()` (`SECURITY DEFINER`, `AFTER INSERT` when `NEW.supersedes_id IS NOT NULL`) and error code `H1008` (predecessor already superseded) registered in the SSOT list (`0001_wave1_synthetic_up.sql:25-31`). Tests: `BITEMP-SUPERSEDE-01` (predecessor's `system_superseded_at = successor's system_recorded_at`), `BITEMP-SUPERSEDE-02` (second successor for the same predecessor → `H1008`), `BITEMP-IMMUTABLE-01` (application-role `UPDATE` of `valid_to` or `system_superseded_at` → `H1003`), `BITEMP-CLOCK-01` (client-supplied `system_recorded_at` → `42501`, same mechanism as `APPEND-ONLY-GRANT-0x`).
3. **Wave 1 — "what was known at T".** Views `evidence_current`, `claims_current`, `assessments_current`, `decisions_current` and functions `<table>_as_of(timestamptz)`. Test `BITEMP-ASOF-01`: insert A, supersede with B, assert `as_of(T)` returns A for `system_recorded_at(A) <= T < system_recorded_at(B)`, B for `T >= system_recorded_at(B)`, and `_current` returns only B. Mutation: dropping `mark_superseded` must turn `BITEMP-ASOF-01` and `BITEMP-SUPERSEDE-01` red.
4. **Wave 1 — scope fence (architecture test).** `BITEMP-SCOPE-01` queries `information_schema.columns` and fails if `valid_from`/`system_recorded_at` exist on any `hci.*` table outside the four, or if any other tenant-owned table lacks `created_at`. This is the machine form of Decision item 2.
5. **Wave 4 — consumer binding.** `EXPLAIN-ASOF-01`: the explainability read for a Decision resolves its Evidence/Claim/Assessment through `<table>_as_of(decision.system_recorded_at)`, never through `_current`, so the "Evidence used" list (`19:23-27`) is what was known when the Decision was recorded.

## Implementation note (2026-09-05, gates 1-3 landed; gate 4 deferred to a follow-up migration; gate 5 out of scope)

Recorded here rather than editing the numbered gates above, which remain the
historical decision record.

**Migration number.** Gate 1's text says "Migration `0002` adds..." - stale
relative to the migration numbering actually finalized once `0002` became
ADR-0020's `hci.cases` (already committed and real-Docker-verified before
this ADR's own implementation started). The real migration is
`0005_wave1_bitemporal_history_up.sql`.

**Gates 1-3 (columns/constraints, supersession trigger, canonical reads) —
DONE**, real-Docker-verified after an independent db-expert review pass found
3 Critical + 6 Major issues in the first landed version and all were fixed
and re-verified before this note was written: `test-wave1-local.ps1` green
at **128/128** assertions (up from 104), `mutation-check-wave1.ps1` green at
**54/54** mutations killed (up from 39), including 15 new/revised mutations
targeting this migration specifically. `hci.subject_records` carries the six
bitemporal columns; a new `hci.decisions` table carries the same shape plus a
minimal `outcome`/`rationale`/`case_id` shape (outcome enum sourced verbatim
from `04_HCI30_PRODUCT_SPEC.md`'s Decision output values - full Decision
workflow semantics are explicitly out of scope here, left to whichever ADR
resolves `HD-19`/`HD-21`). `hci.mark_superseded()` and the four `_current`
views / `_as_of()` functions are built and generic across both tables.

**The escape-hatch mechanism actually shipped is NOT what gate 2's text
implies.** Three designs were tried and rejected - by a standalone probe, by
running the real migration, and finally by an independent security review -
before landing on a fourth:
1. A session-local GUC flag, checked inside a modified
   `reject_update_delete()` - rejected by a standalone probe before writing
   any migration code: any role can forge an arbitrary custom GUC with a
   bare `SET`, so this would have let the application role bypass
   append-only enforcement entirely, not just the schema's own internal
   write.
2. `ALTER TABLE ... DISABLE/ENABLE TRIGGER` inside `mark_superseded()` -
   passed the same standalone probe, but broke on the first real end-to-end
   migration run with PostgreSQL error `55006` ("cannot ALTER TABLE because
   it is being used by active queries in this session"): `mark_superseded()`
   fires as an `AFTER INSERT` trigger ON THE SAME TABLE it then needs to
   `ALTER`, and `ALTER TABLE` cannot run reentrant against a relation with an
   open query in the same session. The standalone probe never hit this
   because it called the function directly, with no enclosing `INSERT` on
   the same table - exactly why this had to be caught by running the real
   migration, not by trusting the isolated probe.
3. A lazily-created, per-session `pg_temp.hci_supersession_lock` table (one
   column, `id uuid PRIMARY KEY`), owned by `hci_owner` with no grant to the
   application roles - passed **118/118 real assertions and 45/45 mutations**
   before an independent db-expert review (requested before commit, not
   after) rejected it for a real, demonstrated hole: `pg_temp` is not
   actually owner-exclusive. PostgreSQL grants every role holding the
   database's `TEMPORARY` privilege (`PUBLIC` by default, never revoked here)
   full rights, including `CREATE`, on its own session's temp schema; since
   `SET ROLE` shares one session's `pg_temp` across every role switch
   (exactly how this project's own test harness runs), an application role
   could run `CREATE TEMP TABLE hci_supersession_lock (id uuid PRIMARY KEY)`
   itself BEFORE `mark_superseded()`'s lazy `CREATE TEMP TABLE IF NOT EXISTS`
   ever ran, and that `IF NOT EXISTS` would silently adopt the attacker's
   table. Same forgeability class as design 1 (GUC), not a new one - "any
   role can plant the session-local marker checked to grant the exception" -
   just moved from a config parameter to a temp relation. Also caught by the
   same review: the SECURITY DEFINER `mark_superseded()` function had no
   `REVOKE ALL ... FROM PUBLIC` (0001's own `hci.current_tenant_id()`
   established this as the convention, and this migration's first draft
   missed it), a real `2BP01` bug in the narrow-rollback down migration
   (`DROP FUNCTION` before the `DROP TRIGGER` that depends on it, never once
   actually executed before the review since `test-wave1-local.ps1`'s
   reversibility pass only exercises `0001_down`'s whole-schema drop), plus
   6 Major findings (concurrency-unsafe `now()` on the ledger clock,
   cross-tenant existence oracle in a non-tenant-scoped `UNIQUE`, blank
   `corrected_reason` passing its own guard, zero test coverage on
   `hci.decisions`' own RLS/append-only/`security_invoker` controls, and
   more) - full report and every fix cross-referenced in the migration
   file's own header and inline comments.
4. **What actually shipped**: `hci.reject_update_delete()` authorizes an
   `UPDATE` by what it DOES, not by any session-local marker a role could
   plant. It lets the `UPDATE` through only when `system_superseded_at`
   moved `NULL` -> `NOT NULL`, every other column is byte-identical
   (`jsonb`-minus-key comparison of `OLD`/`NEW`), and `current_user` is a
   member of the table's owning role (`pg_has_role(..., relowner,
   'MEMBER')`). There is no carrier for a forged bypass - nothing is
   planted, checked, or trusted across statements - and `mark_superseded()`
   no longer needs a lock table, `DISABLE TRIGGER`, or any escape-hatch
   scaffolding at all; it performs its `UPDATE` directly. Verified for real,
   not just reasoned about: with a deliberately-granted future-scenario
   column-restricted `UPDATE` privilege simulated on a live probe, an
   application-role `UPDATE` crafted to match the exact shape
   `mark_superseded()` produces was still rejected with `H1003`, because
   that role is not a member of `hci_owner`. Full narrative in the migration
   file's own header comment
   (`migrations/0005_wave1_bitemporal_history_up.sql:1-100`).

**`H1008` is real but not primary.** `BITEMP-SUPERSEDE-02` (second attempt to
supersede an already-superseded predecessor) is rejected by
`subject_records_supersedes_unique` (`UNIQUE(tenant_id, supersedes_id)` -
tenant-scoped per a db-expert review finding that a bare `UNIQUE(supersedes_id)`
let a foreign tenant use the constraint as a cross-tenant existence oracle,
gate 1) at
`23505`, before `mark_superseded()`'s own "already superseded" check
(`H1008`) ever runs - the `UNIQUE` constraint structurally guarantees at most
one row can ever reference a given predecessor as `supersedes_id`, so the
`H1008` branch inside `mark_superseded()` is unreachable while that
constraint stands. It is kept as defense-in-depth, not dead code: the
`drop-supersedes-unique-constraint` mutation proves it - with the `UNIQUE`
constraint gone, the same test's real SQLSTATE flips from `23505` to `H1008`.
`BITEMP-IMMUTABLE-01` similarly resolved to `42501` (grant layer), not the
gate 2 text's stated `H1003` (trigger layer): the application role holds zero
`UPDATE` grant on `subject_records` at all (unchanged since `0001`), so a
direct `UPDATE` attempt never reaches the trigger to begin with - this
matches the schema's existing two-layer pattern
(`APPEND-ONLY-GRANT-0x`/`APPEND-ONLY-TRIGGER-0x`) rather than deviating from
it.

**Gate 4 (scope fence, `BITEMP-SCOPE-01`) — deferred to a separate
migration**, not built here. It requires retrofitting a server-assigned
insertion-timestamp column onto eleven other pre-existing tenant-owned tables
that currently carry none (`persons`, `tenant_authorizations`,
`subject_lawful_basis_records`, `sources`, `source_terms_records`,
`research_workflows`, `data_subject_requests`, `data_subject_request_targets`,
`identity_candidates`, `identity_verifications`, `source_relationships`) -
a distinct blast radius from the bitemporal mechanism itself, and this
schema's own convention (`0002`/`0003`/`0004`) is one cohesive concern per
migration. Tracked in `TASKS.md`, not silently dropped.

**Gate 5 (Wave 4 consumer binding, `EXPLAIN-ASOF-01`) — out of scope**, as
gate 4 already was for prior ADRs at this stage: no application layer exists
yet to bind an explainability read to `_as_of()`.

## Consequences

- `07 §Assessment versioning` fields (`07:144`) stay as method/policy provenance; `valid_until` is subsumed by `valid_to` and must not be reintroduced as a parallel axis.
- ADR-0014's correction lineage (`:9`) is realized as a superseding row here; a `DataSubjectRequest` correction target references both predecessor and successor ids.
- `HD-07` crypto-shredding sets `tombstoned_at` on an existing row (`07:126-127,140`); that is a second trigger-owned column write and must be reconciled with gate 2 when `HD-07` is decided — this ADR neither permits nor forbids it.
- The as-of filter is defined once (gate 3); application code that re-implements it is a defect, not a convenience.
- A later change to the four-table scope requires a superseding ADR and a migration that follows Expand/Contract (`13:50`); columns may be added to a table, never removed from one that holds data.

## Verification and rollback

- Verification recorded here is documentation-only: the option is cross-linked to `07 §Bitemporal History`, `22_OPEN_HUMAN_DECISIONS.md HD-06`, and the master plan Wave 1 acceptance line (`22:51`). No migration, view, function, or test named above exists yet; every gate is open.
- Before implementation, rollback is to supersede this ADR with a later explicit decision (operator or delegated). After migration `0002` runs on a populated schema, rollback is the reviewed `0002_down` verified by the existing down/up reversibility pass (`HCI_WAVE1_NEGATIVE_TEST_SPEC.md:46-48`); it may drop empty bitemporal columns but must not rewrite `system_recorded_at` on rows that carry data.

## Evidence

- `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:123-136,140,144` — current columns, insert-only decision, HD-06 pending block.
- `HCI30_RESEARCH_REVIEW/06_DATABASE_ARCHITECTURE_REVIEW.md:43-48,149-162,170-182,415` — CI-1, CI-2, sequencing risk.
- `HCI30_RESEARCH_REVIEW/12_RED_TEAM_FAILURE_ANALYSIS.md:372-390` — RT-14.
- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:47-51` — HD-06 question and unratified recommendation.
- `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:12,18,40,50` — replay, CI-blocking architecture tests, Expand/Contract.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:47,51,75-83` — Wave 1 deliverable/acceptance, Wave 4 core.
- `D:\Work\Projects\internal\hci30\database\migrations\0001_wave1_synthetic_up.sql:25-31,40-56,116-126,179-183,295-344` — error-code SSOT, mutability matrix, `subject_records`, append-only enforcement, server-assigned clock.
- `governance/ADR-0014-data-subject-rights-channel.md:9,13`, `ADR-0016-mandatory-tenant-rls.md:9` — lineage requirement, HD-06 left open, non-owner test role.

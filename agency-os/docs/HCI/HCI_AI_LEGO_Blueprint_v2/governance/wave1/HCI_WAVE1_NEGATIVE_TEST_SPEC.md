# HCI Wave 1 Negative-Test Specification

Status: **EXECUTED AND MUTATION-CHECKED (synthetic scope only) — the HD-03/04/05 slice, the Case/Engagement addition, the Regulatory market scope addition, the Peer-product boundary addition, the Source provenance addition, the Consent-class RLS addition, and the Bitemporal history addition are all real-Docker-verified (or real-Node-verified), see Execution evidence**
Date: 2026-09-01 (Case/Engagement section added 2026-09-03, executed 2026-09-04; Regulatory market scope, Peer-product boundary, Source provenance, and Consent-class RLS sections added and executed 2026-09-05; Bitemporal history section added and executed 2026-09-05)
Authority: ADR-0009, ADR-0010, ADR-0011, ADR-0014, ADR-0015, ADR-0016, ADR-0020, ADR-0012, ADR-0001, ADR-0002, ADR-0005, ADR-0026, ADR-0017
Scope: Required acceptance tests before the respective runtime gates can close. Test names are stable identifiers, not passing results.

## Tenant adapter isolation

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| TENANT-ADAPTER-NEG-01 | Two portal organizations with distinct live HCI subscriptions and HCI tenant IDs | Tenant A request attempts to read Tenant B resource through the portal adapter | Denied; no resource metadata or existence signal returned |
| TENANT-ADAPTER-NEG-02 | Tenant A supplies Tenant B's `external_tenant_id` during provision/bind | Adapter validates subscription ownership before binding | Denied; no overwrite or reassignment |
| TENANT-ADAPTER-NEG-03 | Product subscription is `NULL`, canceled, or mismatched product key | Launcher/provisioning path handles absent external tenant | Unprovisioned/denied state; never synthesizes a tenant identity |

## Consent-class separation

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| CONSENT-NEG-01 *(implemented, Node)* | API/storage request uses bare `consent` | Generic record is rejected | Validation error; no record persists — `tests/unit/contracts/validate-request.test.mjs`, not SQL |
| CONSENT-NEG-02 *(OPEN — needs a claim-admission workflow that does not exist yet)* | Tenant authorization exists but no subject lawful-basis record | UI/workflow attempts to claim subject consent | Claim denied; status remains `UNASSESSED` |
| CONSENT-NEG-03 *(OPEN — same blocker as CONSENT-NEG-02)* | Source terms exist but no subject lawful-basis record | Workflow attempts to use source permission as consent | Denied; source terms remain source-scoped only |
| CONSENT-NEG-04 *(implemented as `CONSENT-NEG-04a/04b` + `CONSENT-NEG-05a..e`, SQL)* | No tenant authorization | Research workflow starts | Denied before collection/processing |
| CONSENT-RLS-01 *(new, 2026-09-05)* | Tenant B `subject_lawful_basis_records` row | Tenant A must not see it | Not visible |
| CONSENT-RLS-02 *(new, 2026-09-05)* | Tenant B `source_terms_records` row | Tenant A must not see it | Not visible |

## Person-only subject boundary

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| SUBJECT-NEG-01 | New Evidence/Claim/Assessment/TrustDomain row omits subject type | V1 default is deterministic | Persisted/validated as `PERSON` with existing Person provenance preserved |
| SUBJECT-NEG-02 | Request supplies `subject_type=ORGANIZATION` | V1 does not expose Organization assessment | Rejected before persistence or assessment |
| SUBJECT-NEG-03 | Request supplies a compatibility `subject_id` that conflicts with `person_id` | Stub cannot bypass Person provenance | Rejected |
| SUBJECT-NEG-04 | Existing Person record is read/replayed | Compatibility fields do not alter V1 behavior | Person-scoped result only; no polymorphic fallback |

## Case/Engagement aggregate *(new, ADR-0020, migration 0002)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| CASE-SCHEMA-01 | `hci.cases` table exists | Full ADR-0020 field list and tenant-authorization FK present | Introspection confirms both |
| RLS-LEAK-03 | Tenant B case | Tenant A must not see it | Not visible |
| CASE-LIFECYCLE-01 | Fresh `OPEN` case | `OPEN -> ACTIVE` transition | Succeeds |
| CASE-LIFECYCLE-02 | `ACTIVE` case | `ACTIVE -> CLOSED` transition | Succeeds; `closed_at` set |
| CASE-LIFECYCLE-03 | `CLOSED` case | `CLOSED -> ACTIVE` attempted | Rejected, `H1010` |
| CASE-CLOSED-IMMUTABLE-01 | `CLOSED` case | `purpose` rewritten | Rejected, `H1007` |
| CASE-LIFECYCLE-04 | Fresh `OPEN` case | `OPEN -> CLOSED` (skips `ACTIVE`) attempted | Rejected, `H1010` |
| CASE-CLOSEDAT-DIRECT-01 | Any case | App role attempts to set `closed_at` directly | Rejected, `42501` (no column grant) |
| CASE-LIFECYCLE-05 | Any insert | App role includes `status` in the INSERT column list | Rejected, `42501` (no column grant) |
| CASE-OPENEDAT-01 | Any insert | App role includes `opened_at` in the INSERT column list | Rejected, `42501` (no column grant) |
| CASE-OWNS-01 | `research_workflows` insert | `case_id` omitted | Rejected, `23502` |
| CASE-OWNS-02 | `research_workflows` insert | `case_id` from a different tenant | Rejected, `23503` |
| CASE-OWNS-03 | Existing `research_workflows` row | `case_id` repointed to a different (valid, OPEN) case via UPDATE | Rejected, `H1007` |
| CASE-CLOSED-GUARD-01 | `CLOSED` case | New `research_workflows` row admitted against it | Rejected, `H1011` |
| CASE-CLOSED-GUARD-02 | `CLOSED` case | New `subject_records` row admitted against it | Rejected, `H1011` |
| CASE-PROJECTREF-01 | `hci.cases.project_ref` | No `FOREIGN KEY` constraint exists on it | Introspection confirms none |
| CASE-LIFECYCLE-TRIGGER-01 | Owner connection (bypasses grants) | INSERT directly with `status='ACTIVE'` | Rejected, `H1010` (trigger layer, not just the grant) |
| CASE-NODELETE-TRIGGER-01 | Owner connection, childless case | `DELETE` attempted | Rejected, `H1003` (trigger layer, not just the grant) |
| CASE-PROJECTREF-02 | `project_ref` set to an arbitrary, non-existent value | Write is accepted regardless | Succeeds (proves the column is opaque, not validated) |

## Regulatory market scope *(new, ADR-0012, migration 0003)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| REG-NEG-01/02/03 | Owner INSERT into `hci.tenants` with `jurisdiction` `DE`/`FR`/`GB` | Excluded EU/EEA/UK jurisdiction rejected | Rejected, `23514` |
| REG-NEG-11 | `jurisdiction='UK'` | The common free-text UK spelling is also denied, not just `GB` | Rejected, `23514` |
| REG-NEG-12 | `jurisdiction='de'` (lowercase) | Denial is case-insensitive | Rejected, `23514` |
| REG-NEG-04..07 | `hci.cases` insert with `purpose` `employment_screening`/`credit_decisioning`/`housing_tenant_screening`/`insurance_underwriting` | Consumer-reporting-adjacent purposes rejected | Rejected, `23514` |
| REG-NEG-08 | `purpose='vendor_risk_assessment'` | A gate that rejects everything is also broken - an allow-listed purpose is admitted | Succeeds |
| REG-NEG-09 | Owner connection, excluded `purpose` | The purpose CHECK binds even a grant-bypassing connection | Rejected, `23514` |
| REG-NEG-10a/10b | Attempt to create a `DE` tenant, then a `research_workflows` row against it | The "bulk-insert style" bypass ADR-0012 gate 3 named - no tenant exists to bind to | 10a rejected `23514`; 10b rejected `H1001` (the existing authorization gate fires first, before any FK check) |

## Peer-product boundary *(new, ADR-0001/ADR-0002/ADR-0005, migration-free — Node test + SQL introspection)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| ARCH-PEER-01 | `tests/architecture/peer-boundary.test.mjs`, scans `domain/`, `intelligence/`, `public-intelligence/`, `database/`, `api/` | No file references AI LEGO Cognitive OS's source tree outside the (not-yet-built) `integrations/cognitive-os/` adapter | 0 violations; a planted fixture violation is independently proven to be caught (non-vacuity) |
| ARCH-PEER-02 | Whole database | No `postgres_fdw`/`dblink` extension, no foreign server, no FK from schema `hci` crossing out of it, no schema besides `hci`/`hci_test`/PostgreSQL defaults — this is also ADR-0002 gate 1 (reused) and a strict superset of ADR-0005 gate 1 (`HCI-INDEP-SCHEMA-01`: no `NOT NULL` FK from a core table into a cognitive-os entity) | Introspection confirms all four |
| ARCH-PEER-02b | Whole database, owner connection | Only the 3 known Wave 1 roles plus PostgreSQL built-ins exist; none match `cognitive`/`lego` (ADR-0002 gate 3, credential/network isolation) | Introspection confirms both |

ADR-0005 gate 2 (`HCI-INDEP-RUNTIME-01`, a full core-lifecycle test with the adapter unreachable) is **not implemented** — it requires an actual application/API layer to exercise (create/edit person, record interaction, admit evidence, etc.), none of which exists yet at Wave 1 schema stage. Left `OPEN`, not faked.

## Source/Claim provenance *(new, ADR-0026, migration 0004)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| SOURCE-RLS-01 | Tenant B `Source` + `SourceSnapshot` | Tenant A must not see either | Not visible |
| RLS-CLAIM-01 | Tenant A `Claim`, tenant B `Source` | A tenant-A corroboration edge cannot cite a tenant-B Source (composite FK) | Rejected, `23503` |
| RLS-CLAIM-02 | Tenant A `Claim`, tenant A `Source` | A gate that rejects every `source_id` is also broken — the same shape against tenant A's own Source succeeds | Succeeds |
| APPEND-ONLY-GRANT-05..08 | `source_snapshots`/`source_relationships`, app role | Grant layer never holds UPDATE/DELETE | Rejected, `42501` |
| APPEND-ONLY-TRIGGER-03/04 | `source_snapshots`/`source_relationships`, owner connection | Trigger layer holds even for a connection bypassing grants | Rejected, `H1003` |
| TRUNCATE-03-FK | `source_snapshots` | Referenced by `source_relationships.source_snapshot_id`, so PostgreSQL refuses the TRUNCATE before any trigger runs (mirrors `TRUNCATE-02-FK`) | Rejected, `0A000` |
| TRUNCATE-04 | `source_relationships` | Not referenced by any FK, so the trigger fires directly (mirrors `TRUNCATE-01`) | Rejected, `H1003` |

`hci.sources` (existing since 0001, previously with zero fixtures or tests)
gets its first real coverage in this section via `CLAIM-FIXTURE-01`'s setup
row and `SOURCE-RLS-01`/`RLS-CLAIM-01`. `DSR-CLAIM-DELETE-01` (ADR-0026 gate
3) is **not implemented** — blocked on `ADR-0018`'s crypto-shredding
mechanism landing first (no deletion path exists yet for `subject_records`-
and-friends to test against). Correction/retraction of a corroboration edge
was blocked on `ADR-0017`'s `mark_superseded` mechanism landing — that
mechanism now exists (below), but `hci.source_relationships` itself was not
given a `supersedes_id`/bitemporal shape by this migration (out of scope: the
ADR names Evidence/Claim/Assessment/Decision specifically, not the
corroboration graph), so this specific limitation is unchanged.

## Bitemporal history *(new, ADR-0017, migration 0005)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| BITEMP-WINDOW-01 | `subject_records` INSERT, `valid_to < valid_from` | Valid-time window CHECK | Rejected, `23514` |
| BITEMP-REASON-01 | `subject_records` INSERT, `supersedes_id` set, no `corrected_reason` | Reason-required CHECK (pairing) | Rejected, `23514` |
| BITEMP-REASON-02 | `subject_records` INSERT, `supersedes_id` set, `corrected_reason=''` | Reason-required CHECK (non-blank; added by db-expert review — blank passed the pairing check alone) | Rejected, `23514` |
| BITEMP-CROSSTENANT-01 | Tenant A row, `supersedes_id` = a real tenant-B row | Composite `(tenant_id, supersedes_id)` FK rejects a genuine cross-tenant reference | Rejected, `23503` |
| BITEMP-IMMUTABLE-01 | App-role `UPDATE ... SET valid_to` | Application role holds zero UPDATE grant on `subject_records` at all (unchanged since 0001) — never reaches the trigger | Rejected, `42501` (ADR text's gate 2 predicted `H1003`; real-Docker run corrected this — see ADR-0017's own "Implementation note") |
| BITEMP-CLOCK-01 | App-role INSERT naming `system_recorded_at` | Server-assigned clock, same mechanism as `APPEND-ONLY-GRANT-0x` | Rejected, `42501` |
| BITEMP-CLOCK-02 | Same, against `hci.decisions` | Same control, second table (db-expert review found this table had zero clock-forgery coverage) | Rejected, `42501` |
| BITEMP-SUPERSEDE-SETUP-A/B | Predecessor A, successor B (`supersedes_id=A`) | Both inserts succeed | Succeeds |
| BITEMP-SUPERSEDE-01 | After setup A/B | `hci.mark_superseded()` sets A's `system_superseded_at` to B's `system_recorded_at` | Predicate true |
| BITEMP-SUPERSEDE-02 | Second attempt to supersede A | No forks | Rejected, `23505` (`subject_records_supersedes_unique`, gate 1's `UNIQUE(tenant_id, supersedes_id)` — tenant-scoped per a db-expert review finding, see below) — this is the primary path, not gate 2's `H1008`; `H1008` is real defense-in-depth, proven reachable by the `drop-supersedes-unique-constraint` mutation, see ADR-0017's own "Implementation note" for the full real-Docker discovery |
| BITEMP-ASOF-01 | A/B from setup | `<table>_as_of(T)`/`<table>_current` return the right row at each boundary | Predicate true |
| BITEMP-VIEWRLS-01 | Tenant A queries `evidence_current`/`decisions_current` for a real tenant-B row | `security_invoker=true` actually enforces RLS through the view (db-expert review found this was asserted but never once actually exercised cross-tenant) | Predicate true (not visible) |
| BITEMP-DECISION-01..04 | New `hci.decisions` table, same predecessor/successor shape | `hci.mark_superseded()` is generic across both bitemporal tables, not subject_records-only | Succeeds / predicate true |
| RLS-LEAK-04 | Tenant B `hci.decisions` row | Tenant A must not see it (db-expert review: `hci.decisions` had zero RLS coverage of its own) | Not visible |
| APPEND-ONLY-GRANT-09/10 | `hci.decisions`, app role | Grant layer never holds UPDATE/DELETE (db-expert review: zero coverage) | Rejected, `42501` |
| APPEND-ONLY-TRIGGER-05 | `hci.decisions`, owner connection | Trigger layer holds even for a connection bypassing grants (db-expert review: zero coverage) | Rejected, `H1003` |
| TRUNCATE-05 | `hci.decisions` | Not referenced by any FK, trigger fires directly (db-expert review: zero coverage) | Rejected, `H1003` |

`hci.mark_superseded()`'s escape hatch (letting a schema-owned write past the
shared `hci.reject_update_delete()` append-only trigger) went through THREE
rejected designs before landing on an effect-based authorization check — full
narrative in the migration file's own header comment
(`migrations/0005_wave1_bitemporal_history_up.sql:1-100`) and in ADR-0017's
"Implementation note". Two genuine bugs were found only by running the real
migration end to end, not by review or the standalone probe that preceded
writing any migration code: PostgreSQL error `55006` (`ALTER TABLE` cannot
run reentrant against a relation with an active query in the same session —
design 1), and `42P01` (a combined `AND`-ed boolean does not guarantee its
`EXISTS` subquery is skipped before being parsed/planned when the referenced
relation does not exist yet — design 2, fixed with nested PL/pgSQL `IF`
statements, the same fix pattern as the `0001` down-migration idempotency bug
earlier in this project). Design 2's fixed form (a lazily-created, per-
session `pg_temp.hci_supersession_lock` temp table) then passed 118/118 real
assertions and 45/45 mutations before an independent db-expert review,
requested before commit, found it forgeable by the application role - `pg_temp`
is not owner-exclusive, so a role could plant its own copy of the lock table
before the legitimate one was ever created. The design that actually shipped
authorizes an `UPDATE` by what it changes (`system_superseded_at` moving
`NULL`->`NOT NULL`, nothing else, executed by a role that is a member of the
table owner) rather than by any session-local marker a role could plant -
verified for real against a simulated future scenario (a deliberately-granted
column-restricted `UPDATE` privilege), where a shape-matching forgery attempt
from the application role was still rejected with `H1003`. The same review
pass also found 3 Critical + 6 Major issues beyond the escape hatch itself
(missing `REVOKE ALL ... FROM PUBLIC` on the `SECURITY DEFINER` function, a
narrow-rollback down migration that had never once been run and would have
failed with `2BP01`, a concurrency-unsafe `now()` on the ledger clock, a
cross-tenant existence oracle in a non-tenant-scoped `UNIQUE`, a blank
`corrected_reason` passing its own guard, and zero test/mutation coverage of
`hci.decisions`' own RLS/append-only/`security_invoker` controls) - all fixed
in the same migration file before commit; the `BITEMP-VIEWRLS-01`,
`BITEMP-REASON-02`, `BITEMP-CLOCK-02`, `RLS-LEAK-04`, `APPEND-ONLY-GRANT-09/10`,
`APPEND-ONLY-TRIGGER-05`, and `TRUNCATE-05` rows in the table above are that
review's direct product, not part of the original gate 1-3 plan.

`BITEMP-SCOPE-01` (gate 4, the architecture fence requiring every other
tenant-owned table to carry exactly one server-assigned insertion-timestamp
column) is **not implemented** in this migration — deferred to a follow-up
migration, tracked in `TASKS.md`, since it touches eleven unrelated
pre-existing tables' grants rather than the bitemporal mechanism itself.
`EXPLAIN-ASOF-01` (gate 5, Wave 4) remains `OPEN` — no application layer
exists yet to bind.

## Test execution requirements

1. Run against an HCI database/API using a non-superuser tenant role; service-role or owner-only tests do not prove tenant isolation.
2. Use two deterministic fixtures with distinct tenant IDs and correlation IDs; assert both denial and absence of data leakage.
3. Make all listed tests CI-blocking before non-synthetic HCI subject data is admitted.
4. Record database engine/version, migration revision, policy revision, and fixture hash with each test run.

## Current state

An isolated synthetic-only PostgreSQL 15.8 schema, non-owner test role, request
validator, and runner exist at `D:\Work\Projects\internal\hci30\`.

**Execution evidence (2026-09-02, HD-03/04/05 slice).** `scripts/test-wave1-local.ps1`
ran green against real PostgreSQL 15.8 in Docker: 51 assertions recorded, 0
failed, plus a down/up reversibility pass over a populated schema.

**Execution evidence (2026-09-04, Case/Engagement addition).**
Docker Desktop was unavailable on the authoring machine when this section was
first written (a known, recurring stale-socket crash in its Inference-manager
component, unrelated to this schema, hardened separately the same day — see
WORKLOG). Once available, `scripts/test-wave1-local.ps1` ran green against
real PostgreSQL 15.8 in Docker with migration `0002_wave1_case_aggregate_up.sql`
applied after `0001`.

The first real run (65 assertions, the schema and tests as originally
authored) surfaced two classes of finding, both fixed in the same session
before this gate was declared closed:

1. An independent critic review (before any Docker run) found two real gate
   bypasses — `status` was still in the app role's INSERT grant on
   `hci.cases`, letting it INSERT directly into ACTIVE/CLOSED and skip the
   OPEN-only birth state entirely; and `research_workflows.case_id` was a
   plain UPDATE-able column, letting an already-admitted row be repointed
   onto a different (including CLOSED) case after the terminal-state guard's
   one-time INSERT check had already passed — plus five further structural
   gaps (fail-open status check, `hci.cases` missing the DELETE/TRUNCATE
   trigger layer every other protected table in this schema has, no test ever
   proving `hci.cases`' own RLS policy holds, a CLOSED case's non-status
   fields remaining freely rewritable with no event trail, and the
   `subject_records` half of the terminal-state guard having zero assertion
   coverage of its own). All were fixed in the migration, raising the suite
   from 65 to **75 assertions** (10 new: `RLS-LEAK-03`, `CASE-CLOSED-IMMUTABLE-01`,
   `CASE-LIFECYCLE-05`, `CASE-OPENEDAT-01`, `CASE-OWNS-03(-SETUP)`,
   `CASE-CLOSED-GUARD-02`, `CASE-LIFECYCLE-TRIGGER-01`,
   `CASE-NODELETE-TRIGGER-(SETUP-)01`).
2. The first real Docker run of the widened suite (not caught by review alone)
   then failed 3 assertions — `RLS-WRITE-01`, `CASE-OWNS-01`, `CASE-OWNS-02` —
   because the new terminal-state-guard trigger fires BEFORE the NOT NULL
   constraint, the composite ownership FK, and this row's own RLS WITH CHECK,
   and its own cross-table lookup is itself RLS-filtered: a NULL, absent, or
   cross-tenant `case_id` all made the lookup return no visible row, which the
   fail-closed rewrite misread as "not open or active" and rejected with the
   wrong `H1011`, masking the correct `23502`/`23503`/`42501`. Fixed by making
   the trigger defer entirely (no raise) whenever the case does not resolve
   inside the row's own tenant, and apply the fail-closed status check only
   once it does — see the migration's own attempt-1/2/3 comment for the full
   account.

Second run after both fixes: **75 assertions recorded, 0 failed**, plus a
down/up reversibility pass over a populated schema
(`0001_wave1_synthetic_down.sql` drops both migrations' objects together;
rebuild re-applies `0001` then `0002` in order).

**Execution evidence (2026-09-05, Regulatory market scope addition).**
`scripts/test-wave1-local.ps1` ran green against real PostgreSQL 15.8 in
Docker with migration `0003_wave1_regulatory_market_scope_up.sql` applied
after `0001`+`0002` on the first try: **84 assertions recorded, 0 failed**
(75 + 9 new `REG-NEG-*`). A pre-Docker db-expert review then found one real
gate-content bug before commit — the jurisdiction deny-list denied `GB` but
not the more common free-text spelling `UK`, and was missing `CH`
(Switzerland/EFTA) and `EL` (the EU's own alternate code for Greece), despite
the migration's own comment claiming "UK/EFTA" coverage — plus several
migration-hygiene issues (rollback file not re-runnable, a `SELECT INTO`
without `STRICT`, stale evidence claims). Fixing the deny-list and adding
`REG-NEG-10a/10b` (the actual "bulk-insert-style" bypass ADR-0012 gate 3
named) and `REG-NEG-11/12` (the `UK`/lowercase cases) raised the suite to
**88 assertions**; the real Docker run then caught a second, familiar-shaped
bug — `REG-NEG-10b` expected `23503` (FK violation) but the existing
`research_workflows_require_active_authorization` trigger (2026-09-02, fires
before any FK check) correctly reports `H1001` first, since no authorization
row can belong to a tenant that was never created. Fixed by correcting the
expected SQLSTATE, not the schema — same "trigger fires before constraints"
lesson `0002_wave1_case_aggregate_up.sql`'s hardening pass already
documented, this time surfaced by an *existing*, unrelated trigger rather
than a new one. Final run: **88 assertions recorded, 0 failed**, plus a
down/up reversibility pass. The rollback-file fix itself needed two real
Docker attempts to land: a first fix (`to_regclass('hci.cases')` in place of
`'hci'::regnamespace`) still raised `3F000` against a dropped schema, because
PostgreSQL does not guarantee a SQL `AND`'s right operand (here, a regclass
cast inside an `EXISTS` subquery) is skipped just because the left operand is
false; nesting two separate PL/pgSQL `IF` statements instead of one combined
boolean expression fixed it for real, verified across all three rollback
scenarios (narrow rollback + re-apply, run-twice idempotency, and rollback
after the whole schema is already gone) with real Docker runs, all exit 0.

**Execution evidence (2026-09-05, Peer-product boundary addition).**
`tests/architecture/peer-boundary.test.mjs` (`node --test`, no Docker
required, wired into `scripts/test-wave1-local.ps1` next to the existing
request-policy validator) passed on the first real run, including its own
non-vacuity self-test (plants a violation in a temp fixture directory,
confirms the shared detector function flags it, confirms the
`integrations/cognitive-os/` exclusion does not also hide a real violation
elsewhere, cleans up). `scripts/test-wave1-local.ps1`'s SQL suite then ran
green with `ARCH-PEER-01`/`02`/`02b` added: **90 assertions recorded, 0
failed** (88 + 2 new). `scripts/mutation-check-wave1.ps1`'s first run of the
two new mutations (`enable-dblink-extension`, `create-cognitive-named-role`)
found a real bug in the harness itself, not the schema: roles are
cluster-wide and extensions are database-wide, so `DROP SCHEMA hci CASCADE`
(the down migration `Reset-Schema` uses between mutations) never removes
either — `create-cognitive-named-role`'s run reported `ARCH-PEER-02` (not
`ARCH-PEER-02b`) as the unexpected failure, because the dblink extension the
PRIOR mutation installed was still present, corrupting this mutation's
baseline. Fixed by adding explicit `DROP ROLE IF EXISTS`/`DROP EXTENSION IF
EXISTS` cleanup to `Reset-Schema` itself, verified by re-running: both new
mutations killed correctly on the corrected baseline.

**Execution evidence (2026-09-05, Source provenance addition).**
`migrations/0004_wave1_source_provenance_up.sql` added `hci.source_snapshots`
+ `hci.source_relationships`; `scripts/test-wave1-local.ps1` ran green on the
**second** try: the first real run found `TRUNCATE-03`'s prediction wrong —
`source_snapshots` is FK-referenced by `source_relationships.source_snapshot_id`,
so PostgreSQL blocks the TRUNCATE at the FK layer (`0A000`) before any
trigger runs, the same `TRUNCATE-02-FK` shape already documented for
`subject_records`, not the `H1003` the test originally predicted. Renamed to
`TRUNCATE-03-FK` with the corrected expectation. Final run: **102 assertions
recorded, 0 failed** (90 + 12 new), plus a down/up reversibility pass.
`scripts/mutation-check-wave1.ps1` then caught a genuine cross-migration
coupling on its first run: the *pre-existing* `drop-typed-target-fk`
mutation (2026-09-02) went WEAK, missing `TRUNCATE-02-FK` — 0004 added a
*second* FK into `subject_records` (`source_relationships.claim_id`), so
dropping only the older FK no longer removes every reference blocking that
TRUNCATE. Fixed by narrowing `drop-typed-target-fk`'s own expectation to
`TARGET-KIND-01b` only, and adding a new `drop-all-subject-records-referencing-fks`
mutation that drops both FKs together to keep `TRUNCATE-02-FK` itself
provably non-vacuous. A pre-commit db-expert review (real PG 15.8 probes, not
reasoning alone) then found two Major gaps before commit: `retrieved_at` was
still client-writable on the append-only `source_snapshots` ledger (fixed
via the same column-list-`GRANT` pattern `data_subject_request_events.created_at`
already uses) and `source_relationships(tenant_id, source_id)` had no index
against its still-mutable `hci.sources` parent, which would have degraded
every `DELETE FROM hci.sources` into a tenant-wide scan (fixed by adding the
same index its sibling FK already has). Final re-run after both fixes:
**102/102 assertions, 37/37 mutations killed.**

**Execution evidence (2026-09-05, Consent-class RLS addition).**
`hci.subject_lawful_basis_records` and `hci.source_terms_records` (existed
since 0001, zero fixtures or tests until now) got `CONSENT-RLS-01/02`
tenant-isolation coverage, and `tests/unit/contracts/validate-request.test.mjs`'s
existing `'rejects bare consent'` test was formally cross-referenced as
`CONSENT-NEG-01`. No new migration, no new triggers — fixtures + tests only
against already-existing, already-RLS-protected tables. First real run
green on the first try: **104 assertions recorded, 0 failed** (102 + 2 new),
**39/39 mutations killed** (37 + 2 new). `CONSENT-NEG-02/03` remain `OPEN`,
blocked on a claim-admission application workflow that does not exist yet
(same disposition as `ADR-0005` gate 2 and `ADR-0026` gate 3) — not faked.

**Execution evidence (2026-09-05, Bitemporal history addition).** New
migration `0005_wave1_bitemporal_history_up.sql` (ADR-0017 gates 1-3):
bitemporal columns on `hci.subject_records`, a new `hci.decisions` table,
`hci.mark_superseded()`, and 4 `_current` views/`_as_of()` functions. Unlike
every prior addition to this file, this one did NOT go green on the first
real run — two genuine bugs surfaced, both by running the real migration end
to end, neither by review or the standalone privilege probe that preceded
writing any migration code:

1. `55006` — the first escape-hatch design (`ALTER TABLE ... DISABLE/ENABLE
   TRIGGER` inside `mark_superseded()`) passed a standalone five-scenario
   probe cleanly, then failed the instant it ran as a real `AFTER INSERT`
   trigger on the same table it tried to `ALTER` ("being used by active
   queries in this session"). Replaced with a lazily-created, per-session
   `pg_temp.hci_supersession_lock` temp table.
2. `42P01` — `to_regclass('pg_temp.hci_supersession_lock') IS NOT NULL AND
   EXISTS (...)` as one combined boolean threw "relation does not exist" the
   first time the lock table hadn't been created yet in a session; the `AND`
   does not guarantee the `EXISTS` subquery is skipped before being
   parsed/planned. Fixed with nested PL/pgSQL `IF` statements — the same fix
   pattern already used for the `0001` down-migration idempotency bug earlier
   in this project, re-encountered rather than newly discovered.

The mutation check caught a third real issue that was not a bug so much as a
wrong prediction: `BITEMP-SUPERSEDE-02` was written expecting `H1008`
(gate 2's stated code for "predecessor already superseded"), but real
execution showed `23505` (gate 1's `UNIQUE(supersedes_id)` constraint fires
first, before `mark_superseded()`'s own check ever runs) — corrected in the
test, with `H1008` kept as real, mutation-proven defense-in-depth rather than
removed as dead code. First real run after all three corrections: **118/118
assertions, 45/45 mutations killed** (104 + 14 new assertions, 39 + 6 new
mutations).

**That 118/45-green version was then independently reviewed (db-expert
subagent, requested before commit) and found to have 3 Critical + 6 Major
issues** the real-execution passes above had no way to catch, because none of
them made an assertion fail - they were either untested surface (`hci.decisions`'
own RLS/append-only/`security_invoker` controls had zero coverage of their
own) or a real security hole in code that happened to behave correctly for
every input the test suite actually sent it:

- The design 3 escape hatch (a `pg_temp` lock table, see ADR-0017's
  "Implementation note" for the full mechanism) was **forgeable by the
  application role**: `pg_temp` is not owner-exclusive - any role holding the
  database's `TEMPORARY` privilege (`PUBLIC` by default) can create its own
  table there, and a role could pre-create `hci_supersession_lock` before
  `mark_superseded()`'s lazy `CREATE TABLE IF NOT EXISTS` ever ran, silently
  hijacking it. Same forgeability class as the GUC design gate 2 already
  rejected once, rediscovered in a different carrier.
- `hci.mark_superseded()`, a `SECURITY DEFINER` function, had no `REVOKE ALL
  ... FROM PUBLIC` - `0001`'s own `hci.current_tenant_id()` established this
  as the convention and this migration's first draft missed it.
- The narrow-rollback down migration had never actually been run once before
  the review (`test-wave1-local.ps1`'s reversibility pass only exercises
  `0001_down`'s whole-schema drop) and would have failed immediately with
  PostgreSQL `2BP01` - `DROP FUNCTION hci.mark_superseded()` was ordered
  before `DROP TRIGGER subject_records_mark_superseded`, which depends on it.
- Six Major findings: `now()` (transaction-start time, not wall-clock) on the
  ledger's own clock columns is concurrency-unsafe and can produce a false
  `23514`; a bare `UNIQUE(supersedes_id)` let a different tenant use the
  constraint as a cross-tenant existence oracle (`23505` vs `23503` leaks
  state RLS was supposed to hide); `corrected_reason = ''` satisfied its own
  "reason required" CHECK; and `hci.decisions`' RLS/append-only/
  `security_invoker` protections were real but had exactly zero assertions
  or mutations exercising any of them - `118/118` was true but did not mean
  what it appeared to mean for that table.

All 3 Critical + 6 Major were fixed in the same migration file before commit,
not deferred: `hci.reject_update_delete()` was redesigned from a side-channel
lock into an effect-based check (authorizes an `UPDATE` by what it changes -
`system_superseded_at` `NULL`->`NOT NULL`, nothing else, executed by a role
that is a member of the table owner - rather than by any plantable flag),
which also eliminated the temp-table forgery hole structurally rather than
patching it; `mark_superseded()` gained its `REVOKE`; the down migration
gained the missing `DROP TRIGGER` (and was then actually run, narrowly, for
the first time); `system_recorded_at`/`system_superseded_at` moved to
`clock_timestamp()`; the `UNIQUE` constraint became tenant-scoped; blank
`corrected_reason` got its own CHECK; and 7 new assertions plus 6 new
mutations gave `hci.decisions` the same real coverage every other protected
table in this schema already had. That review-and-fix cycle reached
126/126 assertions, 52/52 mutations killed - then, before commit, a second
independent critic review of the two harness scripts themselves (required by
this project's commit gate for any logic change) found the withholding of
`system_superseded_at` from the application role's INSERT grant had never
been independently proven load-bearing (only its sibling column
`system_recorded_at` had a dedicated assertion+mutation), plus three stale
comments still describing the pre-review `UNIQUE(supersedes_id)` shape and a
`security_invoker` mutation that only touched 2 of the 4 canonical-read
views. Fixed the same way: 2 more assertions (`BITEMP-CLOCK-01b`/`02b`), 2
more mutations (column-level, not table-level), and the view-RLS test/
mutation pair widened to all four views. Final run after both review cycles:
**128/128 assertions, 54/54 mutations killed**. Full narrative in the
migration file's own header comment and in ADR-0017's "Implementation note".

**Non-vacuity evidence.** A green suite is not by itself evidence that a gate is
closed. `scripts/mutation-check-wave1.ps1` deletes each control in turn and
requires the suite to go red on exactly the assertions covering it; **all 54
mutations killed** (15 original, 2026-09-02, + 11 Case-aggregate mutations,
2026-09-04, + 2 Regulatory-scope mutations + 2 Peer-boundary mutations + 7
Source-provenance mutations + 2 Consent-class mutations + 15 Bitemporal-
history mutations (7 landed pre-review + 6 added by the db-expert review pass
+ 2 added by a second critic review of the harness scripts themselves),
2026-09-05, covering every invariant listed above). This
exists because the first version of this suite
could not fail: four assertions caught their own failure signal with the same
handler that caught the control's rejection (both SQLSTATE P0001). That
defect was demonstrated, not merely argued - the original suite exits 0 with
the authorization, DSR-lifecycle, append-only, and identity-confirmation
triggers physically dropped from the schema.

Portal-adapter tests (TENANT-ADAPTER-NEG-01..03) remain excluded from this local
skeleton. Passing these tests is a statement about the synthetic schema only. It
is not evidence of legal compliance, production readiness, or permission to
process a real person.

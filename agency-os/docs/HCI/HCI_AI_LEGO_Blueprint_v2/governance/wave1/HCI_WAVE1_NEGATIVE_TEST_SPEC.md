# HCI Wave 1 Negative-Test Specification

Status: **EXECUTED AND MUTATION-CHECKED (synthetic scope only) — the HD-03/04/05 slice, the Case/Engagement addition, the Regulatory market scope addition, and the Peer-product boundary addition are all real-Docker-verified (or real-Node-verified), see Execution evidence**
Date: 2026-09-01 (Case/Engagement section added 2026-09-03, executed 2026-09-04; Regulatory market scope and Peer-product boundary sections added and executed 2026-09-05)
Authority: ADR-0009, ADR-0010, ADR-0011, ADR-0014, ADR-0015, ADR-0016, ADR-0020, ADR-0012, ADR-0001, ADR-0002, ADR-0005
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
| CONSENT-NEG-01 | API/storage request uses bare `consent` | Generic record is rejected | Validation error; no record persists |
| CONSENT-NEG-02 | Tenant authorization exists but no subject lawful-basis record | UI/workflow attempts to claim subject consent | Claim denied; status remains `UNASSESSED` |
| CONSENT-NEG-03 | Source terms exist but no subject lawful-basis record | Workflow attempts to use source permission as consent | Denied; source terms remain source-scoped only |
| CONSENT-NEG-04 | No tenant authorization | Research workflow starts | Denied before collection/processing |

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

**Non-vacuity evidence.** A green suite is not by itself evidence that a gate is
closed. `scripts/mutation-check-wave1.ps1` deletes each control in turn and
requires the suite to go red on exactly the assertions covering it; **all 30
mutations killed** (15 original, 2026-09-02, + 11 Case-aggregate mutations,
2026-09-04, + 2 Regulatory-scope mutations + 2 Peer-boundary mutations,
2026-09-05, covering every invariant listed above). This exists because the
first version of this suite
could not fail: four assertions caught their own failure signal with the same
handler that caught the control's rejection (both SQLSTATE P0001). That
defect was demonstrated, not merely argued - the original suite exits 0 with
the authorization, DSR-lifecycle, append-only, and identity-confirmation
triggers physically dropped from the schema.

Portal-adapter tests (TENANT-ADAPTER-NEG-01..03) remain excluded from this local
skeleton. Passing these tests is a statement about the synthetic schema only. It
is not evidence of legal compliance, production readiness, or permission to
process a real person.

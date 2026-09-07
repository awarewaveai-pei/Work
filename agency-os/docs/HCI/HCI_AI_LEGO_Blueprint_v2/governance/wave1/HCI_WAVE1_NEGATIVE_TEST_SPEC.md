# HCI Wave 1 Negative-Test Specification

Status: **EXECUTED AND MUTATION-CHECKED (synthetic scope only) — the HD-03/04/05 slice, the Case/Engagement addition, the Regulatory market scope addition, the Peer-product boundary addition, the Source provenance addition, the Consent-class RLS addition, the Bitemporal history addition, the Bitemporal scope fence addition, the Crypto-shredding addition, and the Field/transition author-class policy addition are all real-Docker-verified (or real-Node-verified), see Execution evidence**
Date: 2026-09-01 (Case/Engagement section added 2026-09-03, executed 2026-09-04; Regulatory market scope, Peer-product boundary, Source provenance, and Consent-class RLS sections added and executed 2026-09-05; Bitemporal history, Bitemporal scope fence, Crypto-shredding, and Field/transition author-class policy sections added and executed 2026-09-05)
Authority: ADR-0009, ADR-0010, ADR-0011, ADR-0014, ADR-0015, ADR-0016, ADR-0020, ADR-0012, ADR-0001, ADR-0002, ADR-0005, ADR-0026, ADR-0017, ADR-0018
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

`EXPLAIN-ASOF-01` (gate 5, Wave 4) remains `OPEN` — no application layer
exists yet to bind.

## Bitemporal scope fence *(new, ADR-0017 gate 4, migration 0006)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| BITEMP-SCOPE-01 | Owner-run `information_schema` introspection | (a) `valid_from`/`system_recorded_at` exist on no table outside `subject_records`/`decisions`; (b) every other tenant-owned table (`app_tenant_bindings` excluded by name — infrastructure, not domain data, never granted to app roles at all) has ≥1 `NOT NULL` server-assigned `timestamptz` column | Predicate true |
| CREATEDAT-SCOPE-01 | App-role INSERT naming `hci.persons.created_at` | Server-assigned clock, same mechanism as `BITEMP-CLOCK-0x` — representative of all 11 scope-fence tables, not exhaustive | Rejected, `42501` |
| CREATEDAT-SCOPE-02 | App-role `UPDATE hci.persons SET created_at` | `created_at` withheld from UPDATE too, not just INSERT | Rejected, `42501` |

Retrofits `created_at timestamptz NOT NULL DEFAULT now()` onto the eleven
tenant-owned tables that previously carried no insertion-timestamp column at
all (`persons`, `tenant_authorizations`, `subject_lawful_basis_records`,
`sources`, `source_terms_records`, `research_workflows`,
`data_subject_requests`, `data_subject_request_targets`,
`identity_candidates`, `identity_verifications`, `source_relationships`),
withheld from both INSERT and UPDATE grants on each - matching gate 2's own
"the ledger's own clock must not be something the audited party can choose"
rule extended to also cover silent rewriting after the fact.

A real, mechanical side effect surfaced converting this: several pre-existing
bare positional `INSERT hci.<table> VALUES (...)` statements (no column
list) in the fixtures and test files - against `persons`,
`tenant_authorizations`, `data_subject_requests`, `identity_candidates`, and
`identity_verifications` - would have broken the instant `created_at` became
a new trailing column (`column count mismatch`). Converted to explicit
column lists before running, not discovered by letting the run fail first,
since a repo-wide grep found every instance ahead of time.

Real-Docker verified: first run green on both `test-wave1-local.ps1`
(**131/131 assertions**, including migration 0006 in both the forward and
the full-schema reversibility pass) and `mutation-check-wave1.ps1`
(**58/58 mutations killed**, including one real collateral-hit correction -
dropping `persons.created_at` to prove `BITEMP-SCOPE-01` also broke
`CREATEDAT-SCOPE-01/02` themselves, since their own SQL names the column
directly; added to that mutation's expect list rather than treated as a
separate mutation). The narrow-rollback path (`0006_wave1_bitemporal_scope_fence_down.sql`,
not exercised by the harness's own reversibility pass, which only drops the
whole schema via `0001_down`) was run manually, twice - once alone against a
populated 0001-0006 schema, once followed by a clean re-application of
`0006_up` - both exit 0. No design churn this round, unlike gate 2: this
gate reuses an already-proven grant-narrowing pattern (0001's
`data_subject_request_events.created_at`, 0004's
`source_snapshots.retrieved_at`) rather than inventing a new mechanism, and
a db-expert review was judged unnecessary for that reason - the real bugs
this gate did surface (positional INSERTs, the collateral-hit mutation) were
both caught by grep and real execution respectively, the same disciplines
applied throughout this file.

## Crypto-shredding for erasure *(new, ADR-0018 gates 1/2/3/6, migration 0007)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| CRYPTO-KEYGRANT-01 | Owner-run `information_schema.role_table_grants` query | Application roles hold zero grants on `hci.data_encryption_keys` — no SELECT, no anything | Predicate true |
| CRYPTO-KEYREQ-01 | App-role `EVIDENCE` insert, `encryption_key_ref` explicit `NULL` | Key required for `EVIDENCE`/`CLAIM` (`subject_records_key_required_for_evidence_claim`) | Rejected, `23514` |
| CRYPTO-SCOPE-01 | App-role `ASSESSMENT` insert with a non-null `encryption_key_ref` | Key forbidden outside `EVIDENCE`/`CLAIM` (`subject_records_key_scoped_to_evidence_claim`) | Rejected, `23514` |
| CRYPTO-CROSSTENANT-KEYREF-01 | Tenant A row, `encryption_key_ref` = a real tenant-B key | Composite `(tenant_id, encryption_key_ref)` FK rejects a genuine cross-tenant reference | Rejected, `23503` |
| CRYPTO-TOMBSTONE-01 | App-role `UPDATE ... SET tombstoned_at` | Application role holds zero UPDATE grant on `subject_records` at all — never reaches the trigger (ADR text's gate 3 predicted `H1003`; corrected the same way `BITEMP-IMMUTABLE-01` was) | Rejected, `42501` |
| CRYPTO-TOMBSTONE-SETUP / -02-SETUP / -02 | Owner-run, dedicated row, `hci.tombstone_evidence()` called twice | Second call on an already-tombstoned row | Succeeds / Succeeds / Rejected, `H1009` |
| CRYPTO-TOMBSTONE-SHAPE-01 | Owner-run `UPDATE` touching `tombstoned_at` AND another column together | The effect-based shape check requires nothing else changed, not merely that `tombstoned_at` changed | Rejected, `H1003` |
| CRYPTO-NOEXTERNAL-01 | Owner-run `pg_extension`/`pg_proc.prosrc` introspection | No network-capable extension installed (`dblink`/`postgres_fdw`/`http`); no `hci` function body calls one | Predicate true |

`hci.tombstone_evidence()`'s escape hatch is not a new mechanism: it reuses
`hci.reject_update_delete()`'s effect-based authorization (ADR-0017,
`0005_wave1_bitemporal_history_up.sql`), extended with a second, structurally
identical shape clause for `tombstoned_at` instead of a second design. No
db-expert review was requested for this reason - the same judgment call
gate 4 (bitemporal scope fence) already made for the same reason. A real
retrofit was required regardless: gate 2's `CHECK` requiring
`encryption_key_ref` on every `EVIDENCE`/`CLAIM` row applies retroactively to
~19 pre-existing insert sites across fixtures and this file that had never
needed a key before - fixed by provisioning a small, reused set of synthetic
keys per tenant, not one key per row (the ADR's own gate 2 does not require
that - no `UNIQUE` constraint is in its gate list). Real execution caught
one collateral hit the retrofit itself could not: the pre-existing
`drop-append-only-triggers` mutation removes `subject_records_append_only`
entirely, which also un-kills `CRYPTO-TOMBSTONE-SHAPE-01` (no trigger, no
rejection of any shape) - added to that mutation's expect list. First real
run green on both `test-wave1-local.ps1` (**141/141 assertions**) and
`mutation-check-wave1.ps1` (**63/63 mutations killed**, after the one
collateral-hit fix), including a manually-run narrow-rollback cycle for
`0007_down` (not exercised by the harness's own reversibility pass).

Gates 4-5 (mediated write/read once a real payload column exists;
`hci.record_erasure()` wired to the DSR lifecycle) remain **Wave 4**, per the
ADR's own explicit gate-text labeling - not built here. VBC note: gate 5's
own mechanics do not strictly require gate 4's payload column to exist
first (it only touches `hci.data_encryption_keys` and calls
`hci.tombstone_evidence()`, both already built), but the sequencing reads as
a considered product choice rather than an oversight - "erasure" is not a
meaningful concept to test against a row that never held real content
through the proper write path - so it is respected here rather than built
past on a technical loophole.

## Field/transition author-class policy *(new, ADR-0019 gates 2-4 + gate 5 human-principal half, migration 0008)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| AUTHORCLASS-NEG-01..04 | App-role insert with a wrong `author_class` for the row's `kind` (EVIDENCE/CLAIM/ASSESSMENT/Decision) | `hci.enforce_field_author_class()`'s per-kind mapping | Rejected, `H1013` |
| NEG-HD08-01 | App-role Claim insert, `claim_state='ASSESSMENT_CANDIDATE'`, `human_spotcheck_status='PENDING'`, on an R0 case | Admission gate has no risk_tier branch at all | Rejected, `H1014` |
| NEG-HD08-06 | Owner-run link of a `DRAFT`/unspotchecked Claim into `hci.decision_claims` | A Claim must be an approved Assessment Candidate before it can be cited as a Decision's basis at all | Rejected, `H1016` |
| NEG-HD08-02 | Owner-run: elevate a case's `risk_tier`, confirm the linked Claim is flagged with no direct write to it, then attempt to link it to a `PROCEED` decision | The elevate-then-link ordering | Rejected, `H1015` |
| NEG-HD08-05 | Owner-run: INSERT a Claim with `supersedes_id` pointing at the already-flagged Claim above | A correcting row inherits `reaudit_required`, does not reset to `false` | `reaudit_required = true` on the successor |
| NEG-HD08-07 | Owner-run: link an unflagged Claim to a `PROCEED` decision, then elevate its case's `risk_tier` | The reverse, link-then-elevate ordering | The elevation itself is rejected, `H1017` |
| DECISION-CLAIMS-INSERT-01 | App-role link of an approved Claim to a non-conflicting Decision | The real application role (not just the owner) can actually complete a legal link | Succeeds |
| DECISION-CLAIMS-CREATEDAT-01 | App-role link specifying `created_at` explicitly | `created_at` withheld from the INSERT grant, matching `CREATED-AT-01`'s own pattern | Rejected, `42501` |
| NEG-HD08-03 | App-role Decision insert omitting `principal_id` | `hci.decisions.principal_id` is `NOT NULL` | Rejected, `23502` |
| PRINCIPAL-SCOPE-01 / TENANT-IMMUTABLE-02 | App-role grant-layer / owner-run trigger-layer attempt to change a `hci.principals` row's `tenant_id` | Belt (narrow `GRANT UPDATE (display_name)`-only) and suspenders (`principals_tenant_immutable` trigger) both hold independently | Rejected, `42501` / `H1006` |
| RLS-LEAK-05 / RLS-LEAK-06 | Tenant A queries `hci.principals` / `hci.decision_claims` for a real tenant-B row | RLS tenant isolation on both new tables | Row not visible |
| APPEND-ONLY-GRANT-11/12, APPEND-ONLY-TRIGGER-06/07, TRUNCATE-06 | App-role grant layer / owner-run trigger layer / TRUNCATE against `hci.decision_claims` | Two-layer append-only, matching every other ledger table in this schema | Rejected, `42501` / `H1003` / `H1003` |

An independent db-expert review (2026-09-05) found 3 Critical and 5 Major
findings against the first version of this migration - unlike the "reuse a
proven pattern" gates elsewhere in this Wave, gates 3-5 introduce three
genuinely new schema concepts, so a full review was warranted here. All
findings were fixed in the same migration before commit: gate 3's state
machine had no downstream consumer (closed by `H1016`), `reaudit_required`
could be reset by an ordinary correcting INSERT (closed by supersession
inheritance), the elevate/link race was only guarded in one direction
(closed by `H1017` plus a `FOR SHARE` row lock), an unrecognized `risk_tier`
value failed open (closed by `H1018`, reserved/unraisable today), the
already-superseded/tombstoned rows were reachable by the cascade (excluded),
`decision_claims.created_at` was client-writable (narrowed), and the
down-migration's guard was wrong in both directions (too narrow to catch
real data, and permanently unreachable once any Decision exists) - fixed and
re-verified. Fixing the concurrency lock (`FOR SHARE`) itself introduced a
regression - it silently requires UPDATE privilege the application role
never has on this append-only table, which nothing caught because every
existing `decision_claims` test ran under the owner role - found by manual
reproduction against a real non-superuser role, fixed by making the trigger
function `SECURITY DEFINER`, and closed with a genuine app-role positive
test (`DECISION-CLAIMS-INSERT-01`) that had never existed before. Final
tally: **176/176 assertions, 78/78 mutations killed** (164 + 12 new
assertions after the review round, 73 + 5 new mutations). Full narrative in
the migration file's own header comments and in ADR-0019's "Implementation
note".

Hardening addition (same day, migration `0009_wave1_adr0019_hardening_up.sql`),
closing the review's remaining findings in their own migration rather than
by amending shipped 0008:

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| SPOTCHECK-PRINCIPAL-REQUIRED-01 / -SCOPE-01 / -CROSSTENANT-01 | App-role Claim `APPROVED` without a principal / `spotcheck_principal_id` on an ASSESSMENT / a real tenant-B principal | M7: `APPROVED` must name a real same-tenant human (`hci.principals`), never a self-asserted string | Rejected, `23514` / `23514` / `23503` |
| DECISION-PRINCIPAL-CROSSTENANT-01 | App-role Decision naming a real tenant-B principal | `decisions_principal_fk`'s tenant half | Rejected, `23503` |
| DECISION-CLAIMS-CROSSTENANT-01-GATE / KIND-01-GATE | App-role link to a real tenant-B Claim / to a real EVIDENCE row | Outer layer: the gate trigger's tenant-scoped lookup rejects before the FK is evaluated (real-Docker correction of a 23503 prediction) | Rejected, `H1016` |
| DECISION-CLAIMS-CROSSTENANT-01-FK / KIND-01-FK | Owner-run, user triggers on `decision_claims` disabled for exactly these two statements | Inner layer: the composite `(tenant_id, claim_id, claim_kind)` FK on its own | Rejected, `23503` |
| DECISION-CLAIMS-CROSSTENANT-02 | App-role link naming a real tenant-B Decision | The decision-side composite FK (reaches the FK directly - a missing decision row is not itself a gate error) | Rejected, `23503` |
| PRINCIPAL-DELETE-RI-01 | App-role `DELETE` of a principal still referenced by Decisions | m4: the FK's NO ACTION barrier (two FKs into `principals` since M7 - the mutation must drop both) | Rejected, `23503` |
| CHECK-CLAIMSTATE-SCOPED/REQUIRED-01, CHECK-SPOTCHECK-SCOPED/REQUIRED-01, CHECK-REAUDIT-SCOPED-01, CHECK-REAUDIT-DEFAULT-01 | One insert per constraint (the last with `subject_records` user triggers stripped, since the trigger otherwise satisfies the CHECK first) | m2: 0008's six paired CHECK constraints, each directly | Rejected, `23514` |
| DEFINER-RLS-FAILCLOSED-01 | Owner-run `pg_proc` introspection, no hardcoded list | M4: every SECURITY DEFINER function in `hci` carries `row_security=off` (fails closed, never silently zero-row, under FORCE RLS with a non-superuser owner) | Predicate true |
| FUNCTION-SEARCHPATH-01 | Owner-run `pg_proc` introspection | Every function in `hci` pins `search_path` | Predicate true |

M6 (canonical `_current` views / `_as_of()` functions gaining every
ADR-0018 and ADR-0019 column) is covered by the existing `BITEMP-ASOF-01`/
`BITEMP-VIEWRLS-01` paths continuing to pass against the widened shapes;
the down direction taught its own lesson (`CREATE OR REPLACE VIEW` can add
but never remove a column, so `0009_down` drops/recreates and re-grants).
Real execution corrected two predictions (the `-GATE`/`-FK` layering above,
and the two-FK coupling on the principals RI barrier) and one harness
assumption (body-rewriting mutations must re-pin `search_path`, and
`row_security=off` only on definers - on an invoker fired by the app role
it hard-errors the role's own filtered lookup, six collateral hits). Final
tally after 0009: **194/194 assertions, 93/93 mutations killed** (176 + 18
new assertions, 78 + 15 new mutations); `0009_down` verified alone,
idempotent on a second run, cleanly re-applied, and refused against a
populated schema. Full narrative in the migration's header comments and in
ADR-0019's "Implementation note" (hardening pass).

Epistemic-label addition (same day, migration `0010_wave1_epistemic_label_up.sql`),
closing the last OPEN item under ADR-0019 (`NEG-HD08-04`):

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| EPISTEMIC-DEFAULT-SETUP-01 / -01 | App-role Claim insert with no `epistemic_label` | A born-unlabelled Claim defaults to `UNKNOWN`, never NULL | Succeeds; `epistemic_label = 'UNKNOWN'` |
| EPISTEMIC-VALUESET-01 | App-role Claim with `epistemic_label='FACT'` | Value set is the ADR-0013 kernel's 11-value enum verbatim - `FACT` is the bare literal the kernel's own note says exists in no enum | Rejected, `23514` |
| EPISTEMIC-SCOPED-01 / -VERIFIER-SCOPED-01 | App-role EVIDENCE row carrying `epistemic_label` / `epistemic_verifier_principal_id` | Both columns are CLAIM-scoped | Rejected, `23514` |
| EPISTEMIC-SOURCEFACT-VERIFIER-01 | App-role Claim BORN `SOURCE_FACT`, no predecessor, no verifier | Every `SOURCE_FACT` names a verifier, not only a promotion - closes the "born in the final state" bypass class (0008's C1/C2) | Rejected, `23514` |
| EPISTEMIC-VERIFIER-CROSSTENANT-01 | App-role Claim naming a real tenant-B principal as verifier | `epistemic_verifier_principal_id`'s tenant-composite FK | Rejected, `23503` |
| NEG-HD08-04 / NEG-HD08-04b | App-role superseding insert, predecessor `UNKNOWN` / `HYPOTHESIS`, new label `SOURCE_FACT`, no verifier | The named redline itself: direct promotion without a human verifier is forbidden | Rejected, `H1019` |
| EPISTEMIC-PROMOTE-01 | App-role superseding insert, predecessor `HYPOTHESIS`, new label `SOURCE_FACT`, real verifier supplied | A gate that rejects every promotion is also broken - the legal "via Human Validation" path must succeed | Succeeds |
| EPISTEMIC-INHERIT-SETUP-01 / -01 | App-role superseding insert of a `SOURCE_FACT` row with no `epistemic_label` supplied | An unlabelled correction inherits both the label AND the verifier together, never a silent demotion | Succeeds; label/verifier unchanged |
| EPISTEMIC-REQUIRED-01 | Owner-run, user triggers on `subject_records` disabled, `reaudit_required` supplied explicitly | `subject_records_epistemic_required`, isolated from the trigger default that normally satisfies it first | Rejected, `23514` |

Real execution found a false-positive risk in the new ADR-0013 annotation
script itself before it ever ran against real migrations: a naive
declaration-line regex also matches a `RETURNS TABLE(...)` column list,
which re-declares an already-annotated real column's type for a function's
return shape and carries no CHECK/ENUM of its own - excluded by tracking
the `RETURNS TABLE (` ... `) LANGUAGE` span, with its own dedicated
self-test case proving the exclusion is not itself a silent hole. Mutation-
check then found that the two 0009-era mutations targeting the same
trigger function this migration also rewrote had gone stale - their
literals predated 0010's epistemic default/inherit logic, so applying
either now collaterally stripped it from every CLAIM insert (up to 18
assertions at once) - fixed by re-syncing both to the function's current
full body, the same "body-rewriting mutations must mirror the current
function" lesson 0009 taught, now shown to need re-checking on every
subsequent change to that function. A third finding:
`CHECK-REAUDIT-DEFAULT-01` (0009) went `VACUOUS` once the same disabled
trigger also stopped defaulting `epistemic_label` - the row failed a
DIFFERENT CHECK behind the identical `23514` SQLSTATE, masking whether the
one under test still mattered - fixed by supplying `epistemic_label`
explicitly so only the intended CHECK can be the reason it fails. No
db-expert review requested: extends an already-reviewed mechanism (the
BEFORE INSERT trigger, the composite-FK-to-principals pattern, inherit-
across-supersession) rather than inventing a new one. Final tally:
**208/208 assertions, 101/101 mutations killed** (194 + 14 new assertions,
93 + 8 new mutations); `0010_down` verified alone, idempotent on a second
run, cleanly re-applied, and refused against a populated schema - all on
the first attempt. Full narrative in the migration's header comments and
ADR-0019's "Implementation note" (epistemic-label half).

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

**Superseded (2026-09-06, P0-09 RLS enforcement gate)**: `Reset-Schema` and
its per-mutation `DROP SCHEMA` + full 11-migration replay no longer exist.
`scripts/mutation-check-wave1.ps1` now builds the baseline schema once
(`Initialize-Baseline`) and isolates each mutation with a single
`BEGIN ... ROLLBACK` transaction instead (`Test-Mutation`) — real-Docker
confirmed `CREATE ROLE`/`CREATE EXTENSION` roll back cleanly under this
model, so the defensive cleanup this entry describes is no longer needed
either; a fresh connection to the untouched baseline replaces it. Same
mutation list, same exact-match semantics, ~10x faster on a full run.

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

**Execution evidence (2026-09-05, Bitemporal scope fence addition).** ADR-0017
gate 4, migration `0006_wave1_bitemporal_scope_fence_up.sql`: `created_at`
retrofitted onto the eleven previously-timestamp-less tenant-owned tables,
withheld from both INSERT and UPDATE grants, plus `BITEMP-SCOPE-01`'s
generic `information_schema` introspection check. First real run green on
both the forward path and both rollback paths (narrow `0006_down`, run twice;
whole-schema `0001_down`) - no design churn, reusing gate 2's now-proven
grant-narrowing pattern rather than inventing a new mechanism, so no
db-expert review was requested for this addition. One real mutation
collateral hit, found and fixed on the first `mutation-check` run: dropping
`persons.created_at` also breaks `CREATEDAT-SCOPE-01/02` (their own SQL
names the column, so it fails at `42703` instead of the `42501` they assert)
- added to that mutation's expect list. Final tally after gates 1-4
together: **131/131 assertions, 58/58 mutations killed** (128 + 3 new
assertions, 54 + 4 new mutations). Full narrative in the migration file's
own header comment and in ADR-0017's "Implementation note".

**Execution evidence (2026-09-05, Crypto-shredding addition).** ADR-0018
gates 1/2/3/6, migration `0007_wave1_crypto_shredding_up.sql`:
`hci.data_encryption_keys` (zero grants), `encryption_key_ref`/`tombstoned_at`
on `subject_records`, `hci.tombstone_evidence()` (reusing gate 2's
effect-based `reject_update_delete()` shape-clause mechanism, not a new
design), and the no-external-key-path introspection check. First real run
green on the forward path (**141/141 assertions**); one real collateral hit
on the first `mutation-check` run - the pre-existing `drop-append-only-triggers`
mutation also un-kills `CRYPTO-TOMBSTONE-SHAPE-01` once
`subject_records_append_only` is gone entirely - added to that mutation's
expect list, **63/63 mutations killed** after the fix. Both narrow-rollback
paths (`0007_down` alone; `0007_down` then a clean `0007_up` re-application)
run manually, exit 0 - not exercised by the harness's own reversibility
pass. No db-expert review requested, matching gate 4's own reasoning: the
escape hatch reuses an already-reviewed mechanism rather than inventing one.
A genuine retrofit was required regardless - gate 2's key-required `CHECK`
applies to ~19 pre-existing `EVIDENCE`/`CLAIM` insert sites across fixtures
and this file - fixed with a small, reused set of synthetic per-tenant keys
(the ADR's own gate 2 does not require one key per row). Full narrative in
the migration file's own header comment and in ADR-0018's "Implementation
note".

**Execution evidence (2026-09-05, Field/transition author-class policy
addition).** ADR-0019 gates 2-4 and gate 5's human-principal half, migration
`0008_wave1_field_author_class_policy_up.sql`: `author_class` on
`subject_records`/`decisions`, `claim_state`/`human_spotcheck_status` on
`subject_records`, `reaudit_required` (a third effect-based escape-hatch
branch on `hci.reject_update_delete()`), the risk-tier elevation cascade,
new `hci.decision_claims`/`hci.principals` tables, and three new codes
(`H1016`-`H1018`). First real run green at **164/164 assertions, 73/73
mutations killed** with three real bugs fixed along the way (a column
DEFAULT that cannot reference a sibling column; a case-ID collision with a
pre-existing test; a TRUNCATE SQLSTATE corrected from `H1003` to `0A000`
once `decision_claims`'s new FK made it FK-blocked). An independent
db-expert review then found 3 Critical + 5 Major findings against that first
version (gate 3 had no downstream consumer, `reaudit_required` was
resettable by supersession, the elevate/link race was one-directional, an
unknown `risk_tier` failed open, the down-migration's guard was destructive
in one direction and permanently unreachable in the other) plus a
self-inflicted privilege regression found while fixing the concurrency lock
- all fixed, landing at **176/176 assertions, 78/78 mutations killed**. Both
narrow-rollback paths (`0008_down` alone against a populated schema, correctly
refused; `0008_down` against an empty schema then a clean `0008_up`
re-application) run manually, matching the pattern established for
0005/0006/0007's own narrow-rollback verification. Full narrative in the
migration file's own header comments and in ADR-0019's "Implementation
note".

**Execution evidence (2026-09-05, ADR-0019 hardening addition).** Migration
`0009_wave1_adr0019_hardening_up.sql`, closing the db-expert review's
M4/M6/M7/M8/m2/m4 and both suggestions in their own migration. First real
run went red on exactly two predictions - the two claim-side FK tests got
`H1016` (the BEFORE INSERT gate trigger's own tenant-scoped lookup fires
before PostgreSQL evaluates the FK), corrected by splitting each into an
app-role `-GATE` assertion (outer layer) and an owner-run `-FK` assertion
with the table's user triggers stripped (inner layer). Two real bugs in
`0009_down` were found by reasoning and confirmed by the narrow-rollback
run before they could ship: `CREATE OR REPLACE VIEW` cannot remove
columns (`42P16`), and the empty-state guard referenced the very column it
drops (not idempotent). Mutation-check then surfaced three more real
findings: body-rewriting mutations strip 0009's `ALTER FUNCTION ... SET`
config (hence the harness `repin` hook); `row_security=off` on a SECURITY
INVOKER trigger fired by the app role hard-errors the role's own filtered
lookup (six `IDENTITY-NEG` collateral hits - repin now definer-only); and
the principals RI barrier is held by two FKs since M7, so its mutation must
drop both. Final: **194/194 assertions, 93/93 mutations killed**;
`0009_down` verified alone, idempotent on a second run, cleanly re-applied,
and refused against a populated schema. Full narrative in the migration's
header comments and ADR-0019's "Implementation note" (hardening pass).

**Execution evidence (2026-09-05, ADR-0019 epistemic-label addition).**
Migration `0010_wave1_epistemic_label_up.sql`, closing gate 5's last OPEN
item (`NEG-HD08-04`). Also built `scripts/verify-epistemic-annotation.ps1`
- ADR-0013 gate 5 had specified this script but nothing had built it, and
this migration was the first Wave 1 change to introduce a column its
pattern (`epistemic|risk_tier|admission_state|fact_type`) matches. The
script self-tests before checking real migrations (an unannotated
synthetic column must be flagged, an annotated one and a `RETURNS
TABLE(...)` re-declaration of the same column must not - the latter found
as a real false-positive risk before the script ever ran for real, fixed
by tracking the `RETURNS TABLE (...)` span as excluded) and, run for real,
found one genuine pre-existing gap: `hci.cases.risk_tier` (migration 0002)
had never carried the ADR-0013 citation - annotated in place, comment
only. SQL itself went green first try: **208/208 assertions, 101/101
mutations killed**. Mutation-check then found two of 0009's own mutations
had gone stale against the trigger function this migration also rewrote -
their literals predated 0010's epistemic default/inherit logic, so
applying either now collaterally stripped it from up to 18 unrelated
assertions - fixed by re-syncing both literals to the function's current
full body. A third finding: `CHECK-REAUDIT-DEFAULT-01` (0009) went
`VACUOUS` once the same trigger-disabled test also lost its epistemic
default, masking which CHECK actually fired behind an identical SQLSTATE -
fixed by supplying `epistemic_label` explicitly. `0010_down` verified
alone, idempotent on a second run, cleanly re-applied, and refused against
a populated schema - all first attempt. No db-expert review requested:
extends an already-reviewed mechanism rather than inventing a new one.
Full narrative in the migration's header comments and ADR-0019's
"Implementation note" (epistemic-label half).

**Migration 0011 (2026-09-05): ADR-0004 (No Universal Human Trust Score),
Wave 1 gates 1-3.** `hci.subject_records` gains `domain` (the seven
`04_HCI30_PRODUCT_SPEC.md:59-65` names, TRUST_DOMAIN-scoped/required) and a
typed evidence self-reference (`evidence_ref_id`/`evidence_ref_kind`,
`evidence_ref_kind IN ('EVIDENCE','CLAIM')`, same composite-FK idiom
`data_subject_request_targets` already uses), plus a partial
`UNIQUE (tenant_id, person_id, domain) WHERE kind='TRUST_DOMAIN'` index -
explicitly not a bare `UNIQUE(tenant_id, person_id)`, which is exactly the
one-slot-per-Person shape the ADR forbids. Gate 1 (the CI-blocking column-
name lint, `scripts/check-no-universal-trust-column.ps1`) is source-level
and Docker-free like `verify-epistemic-annotation.ps1`; its self-test proves
three things at once: an undomained forbidden-named column is flagged, a
domained one is not, and a table whose forbidden column is declared in one
migration file and whose `domain` column is added by a LATER file's `ALTER
TABLE` still clears - the exact cross-migration shape ADR-0004's own
`subject_records` case takes (CREATE in 0001, `domain` added by ALTER in
0011). The retrofitted `TARGET-KIND-01a` fixture row (this file's original
0001-era TRUST_DOMAIN insert, `wave1-negative-tests.sql:137-144`) is the
base positive case; fifteen new assertions on the first pass (`TRUST-NEG-01`/
`02` - the ADR's own named gate-2/gate-3 tests - plus one assertion per new
CHECK/FK/UNIQUE: domain scope/required/enum, evidence-ref-id scope/required,
evidence-ref-kind scope/required/enum, the composite FK's cross-tenant and
typed-pin legs, the partial unique index, and a positive CLAIM-kind
evidence-ref proof) prove each constraint actually rejects the shape it
names, not merely that the happy path still works. SQL went green first
try: **223/223 assertions**.

Unlike several sibling migrations this session that only extend an
already-reviewed mechanism, this one introduces a self-referencing composite
FK and a table-wide lint exemption on the ADR's own protected table - new
enough to request a db-expert review before commit (the migration had never
been applied anywhere, so every fix below landed in-place, not as a
follow-up migration). Found **1 Critical + 3 Major + 5 Minor/Suggestion**:
- **C1 (Critical)**: gate 1's lint exempted a table on ANY column literally
  named `domain`, nullable or not - this migration's own nullable `domain`
  then exempted `hci.subject_records` from the WHOLE check, so
  `ADD COLUMN overall_score numeric` on that exact table would have passed
  from this migration onward. Fixed by requiring the exemption's `domain`
  column be unconditionally `NOT NULL` (denies the exemption to a shared
  multi-kind table like `subject_records`, correctly keeps it for a
  genuinely domain-dedicated one) plus `TRUST-NO-AGGREGATE-COLUMN-01`, a
  live `pg_attribute` catalog assertion as defense-in-depth.
- **M1**: TrustDomain rows could never reach this table's only correction
  mechanism (bitemporal supersession) - the partial unique index rejects the
  superseding row before the predecessor's `mark_superseded()` trigger ever
  runs. Fixed with an explicit `subject_records_trust_domain_no_supersede`
  exclusion (same pattern 0008 uses to keep TRUST_DOMAIN out of
  `author_class`), tested by `TRUST-NEG-NOSUPERSEDE-01`.
- **M2**: the typed evidence pin keyed only on `(tenant_id, id, kind)`,
  letting a TrustDomain row cite evidence about a DIFFERENT Person in the
  same tenant. Widened to `(tenant_id, person_id, id, kind)`, tested by
  `TRUST-EVIDENCE-CROSSPERSON-01` plus a dedicated regression-guard mutation
  proving the `person_id` leg specifically is load-bearing.
- **M3 (class fix)**: the down-migration empty-state guard pattern (which
  0011 copied) reads a `FORCE ROW LEVEL SECURITY` table and would fail open
  under a non-superuser owner. Fixed with `SET LOCAL row_security = off;` in
  `0011_down` AND, since the bug predates this migration, in
  `0005`/`0007`/`0008`/`0010`'s down files too.
- **M4**: `TRUST-EVIDENCE-KINDVALUE-01` passed for the wrong reason (caught
  by the composite FK, not the enum `CHECK` it claimed to test - this file's
  own named anti-pattern). Fixed with a real tenant-A `ASSESSMENT` fixture
  row and a retarget, plus a new `TRUST-EVIDENCE-CHAIN-01` (no chaining to
  another TRUST_DOMAIN row).
- Minor items also closed: `TRUST-PERSON-CROSSTENANT-01` (N4, the one new
  typed reference in this ADR that had no real-other-tenant negative test) —
  added, kept, but probed rather than trusted: weakening only the `persons`
  FK still leaves it rejected (M2's own widened evidence FK also catches
  it), so it stands as a real, tested assertion with no dedicated mutation
  rather than a falsely-isolated one. Also closed: a tightened
  down-migration idempotency guard (N3). Two Suggestion-level items tracked
  in `TASKS.md`, not fixed here (an unused index; a pre-existing
  tenant-predicate gap in 0007's `tombstone_evidence()`, out of this
  migration's scope).

A separate critic review of the lint script itself (`check-no-universal-
trust-column.ps1`) and its two callers, requested independently of the
db-expert SQL review since a regex bug is not a schema question, found the
gate did not work as shipped and reproduced every bypass directly: case-
sensitive type matching (`NUMERIC` uppercase matched nothing), the
forbidden-column scan gated on the same type whitelist as the `domain`
exemption (so `decimal`/`double precision`/`int`/`jsonb` all evaded it),
`ALTER TABLE IF EXISTS foo` capturing the literal word `if` as the table
name (collapsing unrelated tables' exemption state together - a form
already present in this corpus's own `0002`/`0003` down migrations), and
the self-test's own `compact_table` fixture never actually exercising the
paren-depth tracking it claimed to (`NOT NULL` was placed before the
`CHECK`, so a broken depth-walk still passed) - confirmed by literally
reverting the depth-tracking and watching the self-test stay green. All
fixed: case-insensitive matching, forbidden columns matched as identifiers
independent of type, `IF (NOT) EXISTS`/`ONLY` skipped in the table-name
capture, and the vacuous fixture repaired plus three new ones added
(uppercase, an evading type, an `IF EXISTS` pair). Re-verified beyond the
self-test: the reviewer's exact seven reproduction cases were re-run from
scratch against the fixed script - all seven now correctly flagged. Also
added: `TRUST-NEG-02` (ADR-0004's own named gate-3 proof) had no mutation
anywhere - `collapse-trust-domain-to-one-slot` fills that gap, expect list
taken from an actual probe run.

Final tally after all fixes (SQL review + script review), re-verified with
Docker runs from scratch each time: **229/229 assertions**, **115/115
mutations killed** (0 vacuous/weak). Every new constraint (including the
ones the reviews added) reuses an already-reviewed idiom (the
scoped/required CHECK pair from 0007-0010, the composite typed-FK from
0001/0005, a plain partial unique index, the `SET LOCAL row_security =
off;` pattern from 0009) rather than inventing a new mechanism. Full
narrative in the migration's header comments and ADR-0004's
"Implementation note".

## Trust domain — Wave 5 gates *(new, ADR-0004 gates 4-5, migration-free — Node test only, no SQL)*

| ID | Setup | Must prove | Expected result |
|---|---|---|---|
| TRUST-NEG-03 *(implemented, Node)* | A Person-trust read response carries a bare top-level `trust_score`/`overall_trust`/`overall_score`/`composite_trust`/`aggregate_trust`/`universal_trust` field | Response is rejected before it can reach a caller | Validation error naming `TRUST-NEG-03` — `tests/unit/contracts/validate-trust-domain-response.test.mjs`, not SQL |
| METHOD-CONTRACT-NEG-01 *(implemented, Node)* | A method-catalog entry's `outputs.domains` names more than one Trust Domain but `decision_weight` is a single scalar (or an aggregate field is declared inside `outputs` itself) | Method definition is rejected and cannot be loaded | Validation error naming `METHOD-CONTRACT-NEG-01` (or, for the `outputs`-field case, `ADR-0004: forbidden cross-domain field in outputs`) — `tests/unit/contracts/validate-method-contract.test.mjs`, not SQL |

Gates 4-5 land as standalone enforcement infrastructure ahead of the actual
Wave 5 Intelligence-math roll-up work (P0-04, still unspecified) — there is
no real trust-read endpoint or method catalog yet, same sequencing gates
1-3 already used against the schema. `packages/contracts/trust-domains.mjs`
holds the shared domain enum and forbidden-name list both gates use; a
dedicated test (`tests/unit/contracts/trust-domains.test.mjs`) reads
migration 0011's actual `CHECK (domain IN (...))` text so the JS-side enum
cannot silently drift from the SQL-side one.

An independent critic review (0 Critical, 2 Major, 3 Minor, all fixed)
ran an actual 40-mutation sweep against scratch copies rather than
reasoning from the code, and found a real bypass: gate 5's `outputs` field
had no key whitelist, so a method could declare `outputs.overall_score`
directly — a more direct violation of ADR-0004's Decision bullet 3 than the
scalar `decision_weight` the gate was built to catch — and pass. Also
found: the shared domain enum's "keep in sync" comment was unenforced (the
drift test above closes it); 19 checks across both new test files were
vacuous by mutation (27 tests added to close them, most notably the
per-domain-weight finite-number check sitting *inside*
METHOD-CONTRACT-NEG-01's own multi-domain branch); and a `Number`-boxed
`decision_weight` carrying domain keys as own properties passed every check
and serialized back to a bare scalar (fixed by requiring a plain object,
not merely `typeof === 'object'`). Full account in ADR-0004's own
"Implementation note (2026-09-06, gates 4-5 landed)". Final tally: **50/50
Node assertions** across all four contract-test files (13 + 12 + 3 new,
plus the pre-existing 3), re-verified via a full `test-wave1-local.ps1` run
including the unrelated 11-migration SQL suite and reversibility check.

**Non-vacuity evidence.** A green suite is not by itself evidence that a gate is
closed. `scripts/mutation-check-wave1.ps1` deletes each control in turn and
requires the suite to go red on exactly the assertions covering it; **all 101
mutations killed** (15 original, 2026-09-02, + 11 Case-aggregate mutations,
2026-09-04, + 2 Regulatory-scope mutations + 2 Peer-boundary mutations + 7
Source-provenance mutations + 2 Consent-class mutations + 15 Bitemporal-
history mutations (7 landed pre-review + 6 added by the db-expert review pass
+ 2 added by a second critic review of the harness scripts themselves) + 4
Bitemporal-scope-fence mutations + 5 Crypto-shredding mutations + 15
Field/transition author-class policy mutations (10 landed pre-review + 5
added by the db-expert review round, one of them a regression guard for a
bug the review's own fix introduced) + 15 ADR-0019 hardening mutations
(migration 0009: three spotcheck-principal constraints, four composite-FK
weakenings/drops, six CHECK drops, two function-config resets) + 8
epistemic-label mutations (migration 0010: six CHECK/FK drops, the named
redline weakened, the default/inherit branch removed),
2026-09-05, covering every invariant listed above). This
exists because the first version of this suite
could not fail: four assertions caught their own failure signal with the same
handler that caught the control's rejection (both SQLSTATE P0001). That
defect was demonstrated, not merely argued - the original suite exits 0 with
the authorization, DSR-lifecycle, append-only, and identity-confirmation
triggers physically dropped from the schema.

**Node-level gate non-vacuity (2026-09-06, closes a debt tracked in TASKS.md
across the two commits that shipped the Node-level gates themselves)**:
`scripts/mutation-check-node-gates.ps1` is the `node --test` equivalent of
the SQL harness above, for `CONSENT-NEG-01` and the five ADR-0004/P0-04
Node-level gate/spec files (`validate-request.mjs`, `trust-domains.mjs`,
`validate-trust-domain-response.mjs`, `validate-method-contract.mjs`,
`rollup-trust-domains.mjs`) — **12/12 mutations killed**. Coarser than the
SQL harness by design and disclosed as such in the script's own header:
it checks "does the target test file's suite go red at all" rather than
naming the exact assertions expected to flip, since `node --test`'s default
reporter is not as reliably line-parseable as the SQL harness's
SQLSTATE-driven assertions. Self-verified non-vacuous the same way this
whole suite's own history required: a mutation deliberately pointed at an
unrelated test file (so it could have no observable effect) was confirmed
to report "vacuous" rather than silently passing.
`packages/intelligence/assessment-dimensions.mjs` is intentionally absent
from this harness — its own test file already carries a bespoke,
self-updating mutation test (re-reads the real source, applies a drift,
imports the mutated copy) that would be redundant with a second generic
entry here.

Portal-adapter tests (TENANT-ADAPTER-NEG-01..03) remain excluded from this local
skeleton. Passing these tests is a statement about the synthetic schema only. It
is not evidence of legal compliance, production readiness, or permission to
process a real person.

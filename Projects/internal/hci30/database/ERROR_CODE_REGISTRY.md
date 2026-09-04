# HCI-30 Domain Error-Code Registry (SSOT)

Single source of truth for every `H1xxx` domain SQLSTATE this schema raises
or reserves. `class 'H1'` is unassigned in PostgreSQL Appendix A (HV =
FDW-specific, HZ = SQL/MED remote database access; H1 is free), so these
never collide with an engine-raised condition.

**Why this file exists**: before it did, each migration/ADR computed "the
next free code after the last one I know about" independently, by reading
whichever other files happened to be open at the time. That produced two
real, separately-discovered collisions — `ADR-0012` and `ADR-0017` both
independently landed on `H1008`; `ADR-0018` and `ADR-0020` both
independently landed on `H1009` — recorded at `governance/ADR-0012-regulatory-market-scope.md:37`
and `governance/ADR-0020-case-engagement-aggregate.md:59`. Both were caught
and renumbered before merge, by luck of a cross-file grep rather than by any
structural guarantee. **The rule going forward: read this table, claim the
next free row in the same commit that allocates it, cite the row's `Source`
column. Do not compute "next free" from any other file.**

| Code | Meaning | Status | Raised by | Source |
|---|---|---|---|---|
| `H1001` | Tenant authorization is not `ACTIVE` / not currently valid | RAISED | `hci.require_active_authorization()` | `migrations/0001_wave1_synthetic_up.sql:101-114` |
| `H1002` | Data-subject-request lifecycle transition rejected | RAISED | `hci.enforce_dsr_transition()` | `migrations/0001_wave1_synthetic_up.sql:134-161` |
| `H1003` | Append-only table mutation rejected (trigger layer) | RAISED | `hci.reject_update_delete()` (shared, reused by every append-only/no-delete table in this schema, including `hci.cases`, `hci.source_snapshots`, `hci.source_relationships`) | `migrations/0001_wave1_synthetic_up.sql:179-183` |
| `H1004` | `MATCH_CONFIRMED` requires deterministic or human evidence | RAISED | `hci.require_identity_verification()` | `migrations/0001_wave1_synthetic_up.sql:214-235` |
| `H1005` | Last supporting evidence for a `MATCH_CONFIRMED` identity may not be removed | RAISED | `hci.protect_identity_evidence()` | `migrations/0001_wave1_synthetic_up.sql:238-267` |
| `H1006` | `tenant_id` is immutable | RAISED | `hci.reject_tenant_change()` (shared, reused for every tenant-owned table's `_tenant_immutable` trigger) | `migrations/0001_wave1_synthetic_up.sql:188-194` |
| `H1007` | Field is immutable in the row's current state (general-purpose "this specific field/row may not change right now" code, reused across unrelated invariants rather than each minting its own code) | RAISED | `hci.enforce_dsr_transition()` (person_id/request_type post-review), `hci.require_identity_verification()` (person_id post-confirmation), `hci.enforce_case_lifecycle()` (case fields post-CLOSED), `hci.reject_case_reassignment()` (case_id post-set) | `migrations/0001_wave1_synthetic_up.sql:147-151,221-225`; `migrations/0002_wave1_case_aggregate_up.sql:108-112,203-209` |
| `H1008` | Predecessor record already superseded (bitemporal supersession) | **RESERVED, NOT RAISED** — `ADR-0017`'s `hci.mark_superseded()` gate is `SPECIFIED — RUNTIME OPEN`, not built | (none yet) | `governance/ADR-0017-bitemporal-scope.md:37` |
| `H1009` | Record already erased (crypto-shredding tombstone) | **RESERVED, NOT RAISED** — `ADR-0018`'s `hci.tombstone_evidence()` gate is `SPECIFIED — RUNTIME OPEN`, not built | (none yet) | `governance/ADR-0018-crypto-shredding-for-erasure.md:34` |
| `H1010` | Case lifecycle transition rejected (includes the INSERT-side "must be created OPEN" case) | RAISED | `hci.enforce_case_lifecycle()` | `migrations/0002_wave1_case_aggregate_up.sql:100-119` |
| `H1011` | Case is not `OPEN`/`ACTIVE`; new `research_workflows`/`subject_records` row may not be admitted against it | RAISED | `hci.require_open_or_active_case()` | `migrations/0002_wave1_case_aggregate_up.sql:271-280` |
| `H1012` | Excluded jurisdiction or purpose | **RESERVED, NOT RAISED** — `ADR-0012` gates 1-2 are enforced by plain `CHECK` constraints instead (a `CHECK` has no bypass path a trigger could add; see that ADR's own "Gate 3 disposition"/"Implementation note"). Recorded as available-but-unused rather than silently dropped, in case a future migration has an actual distinct-SQLSTATE use for it. | (none — `REG-NEG-*` tests expect `23514`, the real `check_violation` SQLSTATE, not this code) | `governance/ADR-0012-regulatory-market-scope.md:37,82`; `migrations/0003_wave1_regulatory_market_scope_up.sql:174-182` |

`'H1TST'` is reserved separately for the test-harness sentinel
(`database/tests/00_test_harness.sql`) and must never be raised by schema
logic — it exists to distinguish "the statement under test unexpectedly
succeeded" from every real domain code.

## Next free code

**`H1013`.**

## Maintenance rule

Every migration or ADR that allocates a new `H1xxx` code must, in the same
commit:

1. Add a row to the table above.
2. Update "Next free code" to the following integer.
3. Cite this file (`database/ERROR_CODE_REGISTRY.md`) as the code's
   authoritative source, not the migration's own header comment — the
   per-migration header comments that used to serve this purpose
   (`0001_wave1_synthetic_up.sql:4-32`, `0002_wave1_case_aggregate_up.sql:6-18`,
   `0003_wave1_regulatory_market_scope_up.sql:94-103`) now point here instead
   of maintaining their own copy of the list.

# EC section 141 — Contract Compliance Tests (`golden/`)

EC §141 requires this directory's cases to jointly verify: state transitions,
required documents, gate injection, authority, rollback, final status, and
handoff. Rather than one fixture file asserting all seven at once (the
`run_golden_tests.py` fixture format validates one instance against one
schema fragment), this directory tells ONE coherent scenario across six
fixture files, all sharing the same `task_id`/`execution_id` pair so a
reader can trace the whole arc:

| Order | File | Schema exercised | EC §141 concern covered |
|---|---|---|---|
| 1 | `01-task.fixtures.yaml` | `execution/task.schema.yaml` | required documents (task context declares what's needed) |
| 2 | `02-authority.fixtures.yaml` | `execution/authority.schema.yaml` | authority |
| 3 | `03-gate-result.fixtures.yaml` | `execution/gate.schema.yaml#/gate_result` | gate injection |
| 4 | `04-rollback-plan.fixtures.yaml` | `execution/rollback.schema.yaml` | rollback |
| 5 | `05-result.fixtures.yaml` | `execution/result.schema.yaml` | state transitions, final status |
| 6 | `06-handoff.fixtures.yaml` | `execution/handoff.schema.yaml` | handoff |

Scenario: `TASK-2026-08-29-GOLDEN-001`, an R3-tier database migration
(`db-migration-expand-contract.recipe.yaml`, Wave 7) — chosen because R3 is
the lowest tier at which `risk-tier.schema.yaml`'s
`mandatory_gate_injection_trigger` fires (R3 ∪ R4), so a golden case at R3
exercises every one of the seven EC §141 concerns without needing the extra
R4-only fields (Recovery Drill / Emergency Stop) a minimal illustrative
case does not need to also cover.

As with the 12 category directories, no execution runtime exists yet in
this repo (Phase 3 is spec-only) — this is a worked EXAMPLE of what a
correct outcome looks like at each stage, structurally validated against
the already-built schemas, not a live behavioral/integration test against
a running state machine. See this Wave's WORKLOG entry for the honest
scope statement.

# Fourteenth Method Atlas slice: `architecture.atam` -- reusing a shape, not code, across two unrelated methods

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance. Third slice from the `architecture` family, a third member tool of Atlas's own F18 "Software Architecture Pack".

## What was built

Atlas §11.38 names ATAM's own 4 finding categories (Sensitivity Point / Tradeoff Point / Risk / Non-risk) plus two worked examples (encryption vs. latency; cache vs. consistency complexity), concrete enough for a closed 4-value enum directly. `AtamAnalysis` structurally mirrors `RedTeamChallenge` (a set of findings, each carrying a closed-category enum) -- reuse of a SHAPE pattern, not code, across two methods with unrelated subject matter (architecture tradeoffs vs. security critique). No forbidden_transition (Atlas's §22.3 gate table has no ATAM row).

* `methods/contracts/architecture.atam.contract.yaml`, `specs/cognitive/typed-objects/atam-analysis.schema.yaml` + fixtures (spec-root suite 2635 -> 2644).
* `ai_lego/modules/architecture/atam.py` -- builder + 2 gates.
* `ai_lego/apps/cli/run_atam_slice.py` -- Atlas's own two worked examples, real run.
* `tests/unit/test_atam.py` -- 8 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, `modules/architecture/adr.py`, `modules/architecture/event_storming.py`.

## Evidence

| Check | Result |
|---|---|
| CLI | `PASS architecture.atam: findings=[('F1','tradeoff_point'),('F2','risk')], gates [provenance_required=PASS, findings_present=PASS]` -- first run |
| Unit tests | 8 passed, first run |
| Spec-root golden suite | 2644 passed (2635 before) |
| Full product-root suite | see WORKLOG entry |

## Honest limits

`cognitive_primitives` inferred, not cited. `recommended_next` empty (no Atlas citation). `OQ-ATAM-1`: method-inventory.yaml has no machine_id row.

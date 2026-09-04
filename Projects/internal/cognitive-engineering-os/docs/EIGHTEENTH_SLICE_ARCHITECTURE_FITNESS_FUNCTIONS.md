# Eighteenth Method Atlas slice: `architecture.fitness_functions`

Status: **LANDED (2026-09-04)**. Seventh slice from the `architecture` family, a seventh member tool of F18's own Software Architecture Pack. Real-world pattern: Ford/Parsons/Kua's "Fitness Function" (Building Evolutionary Architectures).

## What was built

Atlas's own F18 table row (L823) gives a 3-stage pipeline: "invariant→test/metric→CI gate" -- continuously and automatically checking architecture invariants to prevent decay over time. No dedicated section, but the pipeline is concrete and industry-standard. The example CLI run governs this codebase's own real invariants (a domain-layer import restriction, a compute-to-modules dependency-direction check) -- self-referential grounding, same class as the ADR slice's own real-ADR-practice example.

* `methods/contracts/architecture.fitness_functions.contract.yaml`, `specs/cognitive/typed-objects/fitness-function-set.schema.yaml` + fixtures (spec-root suite 2671 -> 2680).
* `ai_lego/modules/architecture/fitness_functions.py` -- builder, two gates.
* `ai_lego/apps/cli/run_fitness_functions_slice.py` -- real functions governing this codebase's own `ai_lego` package.
* `tests/unit/test_fitness_functions.py` -- 7 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and all six sibling `architecture` family modules.

## Evidence

CLI: `PASS architecture.fitness_functions: functions=2, gates [provenance_required=PASS, functions_complete=PASS]` (first run). 7 unit tests passed first run. Golden suite 2680 (2671 before). Full regression: see WORKLOG.

## Honest limits

`ci_gate` is free text, no structured CI-tooling reference shape (Atlas gives no worked example). No method-inventory.yaml machine_id row.

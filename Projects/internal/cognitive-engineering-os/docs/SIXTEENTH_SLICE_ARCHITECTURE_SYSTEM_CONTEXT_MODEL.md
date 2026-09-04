# Sixteenth Method Atlas slice: `architecture.system_context_model` -- a real-world name that couldn't survive the machine_id pattern

Status: **LANDED (2026-09-04)**. Fifth slice from the `architecture` family, a fifth member tool of F18's own Software Architecture Pack. Real-world method name: "C4 Model".

## The digit problem

`method.schema.yaml`'s own `id`/`family` pattern is `^[a-z_]+\.[a-z_]+$` -- no digits admitted. "C4 Model" is unbuildable as `architecture.c4_model`: the schema itself rejected it on first validation attempt. No prior Tier 1 contract this session built needed a digit (checked exhaustively). Rather than working around the schema, the method was named by its own top level instead -- `architecture.system_context_model` -- disclosed explicitly in the contract's own description as a forced substitution, not a silent rename. This is the first time this session's own machine_id minting hit a real schema constraint mid-slice rather than a grounding-strength question.

## What was built

Atlas §11.34 gives a dedicated section: a 4-level hierarchy (System Context → Container → Component → Code, the last explicitly marked "必要時" -- when necessary, the only conditional level). Atlas names the 4 levels but no internal field shape for any one level's elements -- kept minimal (id + label only), disclosed as restraint rather than invention. The container/component/code parent-references form a structurally-necessary (not literally cited) integrity invariant, enforced at both construction time and gate re-derivation -- the CLI proves it by attempting to build a component that references a nonexistent container and confirming the guard fires.

* `methods/contracts/architecture.system_context_model.contract.yaml`, `specs/cognitive/typed-objects/system-context-model.schema.yaml` + fixtures (spec-root suite 2653 -> 2662).
* `ai_lego/modules/architecture/system_context_model.py` -- builder enforcing the hierarchy-integrity invariant, two gates.
* `ai_lego/apps/cli/run_system_context_model_slice.py` -- a real 3-level model plus an attack-and-confirm step.
* `tests/unit/test_system_context_model.py` -- 9 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and all four sibling `architecture` family modules.

## Evidence

CLI: `PASS architecture.system_context_model: containers=1, components=1, code=0, gates [provenance_required=PASS, hierarchy_integrity=PASS], integrity_invariant_verified=True` (first run). 9 unit tests passed first run. Golden suite 2662 (2653 before). Full regression: see WORKLOG.

## Honest limits

Container/Component/Code elements carry only id+label, no real-world C4 metadata like technology stack (`OQ-SYSTEMCONTEXTMODEL-1`). No method-inventory.yaml machine_id row (`OQ-SYSTEMCONTEXTMODEL-2`).

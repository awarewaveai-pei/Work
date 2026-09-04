# Nineteenth Method Atlas slice: `architecture.strangler_fig`

Status: **LANDED (2026-09-04)**. Eighth slice from the `architecture` family, an eighth member tool of F18's own Software Architecture Pack. Real-world pattern: Fowler's "Strangler Fig" incremental legacy migration.

## What was built

Atlas's own F18 table row (L824) gives a 5-stage pipeline: "seam→small slice→verify→expand→retire old". No dedicated section. Each migration slice references a real, named seam -- a structurally-necessary cross-reference, same class `architecture.system_context_model`'s own container/component reference already established. The CLI proves the seam-integrity invariant by attempting to build a slice referencing a nonexistent seam and confirming it is refused.

Disclosed restraint: `status` is a single closed-enum snapshot (`planned`/`verified`/`expanded`/`retired`) matching Atlas's own stage names, not an enforced state machine -- Atlas gives no transition-history shape to validate skipped stages against, and inventing one would be presenting a guess as a compiled fact.

* `methods/contracts/architecture.strangler_fig.contract.yaml`, `specs/cognitive/typed-objects/strangler-fig-plan.schema.yaml` + fixtures (spec-root suite 2680 -> 2689).
* `ai_lego/modules/architecture/strangler_fig.py` -- builder enforcing the seam-integrity invariant, two gates.
* `ai_lego/apps/cli/run_strangler_fig_slice.py` -- a real migration plan plus an attack-and-confirm step.
* `tests/unit/test_strangler_fig.py` -- 10 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and all seven sibling `architecture` family modules.

## Evidence

CLI: `PASS architecture.strangler_fig: seams=1, slices=2, gates [provenance_required=PASS, slice_seam_integrity=PASS], seam_integrity_verified=True` (first run). 10 unit tests passed first run. Golden suite 2689 (2680 before). Full regression: see WORKLOG.

## Honest limits

No enforced stage-order transitions (`OQ-STRANGLERFIG-1`). No method-inventory.yaml machine_id row (`OQ-STRANGLERFIG-2`).

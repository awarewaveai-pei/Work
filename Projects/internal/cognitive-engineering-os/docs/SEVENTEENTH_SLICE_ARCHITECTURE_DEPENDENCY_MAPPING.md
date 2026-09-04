# Seventeenth Method Atlas slice: `architecture.dependency_mapping` -- third graph shape, a different invariant than causal.dag or event_storming

Status: **LANDED (2026-09-04)**. Sixth slice from the `architecture` family, a sixth member tool of F18's own Software Architecture Pack.

## What was built

Atlas's own F18 table row (L826) gives a 4-stage pipeline: "nodes→edges→critical dependency→fallback" -- finding cross-service/vendor/data dependencies to surface hidden single points of failure. No dedicated section (same thinner-citation tier as Quality Attribute Scenario), but the pipeline's own final two stages directly imply a real invariant: every edge marked a critical dependency must specify a fallback. The CLI proves this by attempting to mark an edge critical with no fallback and confirming it is refused.

Third graph-shaped typed object this session builds (after `CausalDagAnalysis` and `EventStormingSession`), but distinct from both: no acyclicity requirement (dependency graphs are commonly cyclic in real systems), no fixed 7-value node vocabulary -- just a 3-value `service`/`vendor`/`data` node type drawn directly from Atlas's own purpose phrase ("跨服務/供應商/資料依賴").

* `methods/contracts/architecture.dependency_mapping.contract.yaml`, `specs/cognitive/typed-objects/dependency-map.schema.yaml` + fixtures (spec-root suite 2662 -> 2671).
* `ai_lego/modules/architecture/dependency_mapping.py` -- builder enforcing the fallback invariant, two gates.
* `ai_lego/apps/cli/run_dependency_mapping_slice.py` -- a real checkout-flow map plus an attack-and-confirm step.
* `tests/unit/test_dependency_mapping.py` -- 10 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and all five sibling `architecture` family modules.

## Evidence

CLI: `PASS architecture.dependency_mapping: nodes=3, edges=2, gates [provenance_required=PASS, critical_edges_have_fallback=PASS], fallback_invariant_verified=True` (first run). 10 unit tests passed first run. Golden suite 2671 (2662 before). Full regression: see WORKLOG.

## Honest limits

No dedicated Atlas section (table row only, `OQ-DEPENDENCYMAPPING-1`). `cognitive_primitives` inferred. `recommended_next` empty. The fallback invariant is a runtime, not schema, check (JSON Schema cannot express "required iff sibling field is true" for this shape without inventing structure).

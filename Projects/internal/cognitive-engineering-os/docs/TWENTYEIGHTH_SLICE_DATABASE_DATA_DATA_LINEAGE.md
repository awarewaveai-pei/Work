# Twenty-eighth Method Atlas slice: `database_data.data_lineage`

Status: **LANDED (2026-09-05)**. SECOND slice from the `database_data` family (F21), after `database_data.backup_restore_drill` (twenty-fifth slice).

## What was built

Atlas gives this method two citations with genuinely different vocabularies: the F21 tool table row (L901, a compressed 6-stage formula) and the dedicated §11.48 section (L2309-2328), whose own flow diagram (L2313-2322) gives a fuller 8-node chain (Source→Ingest→Transform→Dataset→AnalysisRun→Result→Claim→Paper/Decision). The diagram is treated as authoritative for the `stage` enum, disclosing rather than silently reconciling the divergence.

The real invariant, directly grounded in the diagram's own second benefit bullet (L2327, "一個數字可以回到原始來源" -- a number can trace back to its original source): every non-SOURCE node's own upstream chain must actually terminate at a real SOURCE node, computed by genuine graph traversal (`ai_lego/compute/lineage/traversal.py`), never caller-asserted -- the same Trusted Compute discipline `causal.dag`'s own acyclic verification (sixth slice) already established for a structurally analogous graph method.

* `methods/contracts/database_data.data_lineage.contract.yaml`, `specs/cognitive/typed-objects/data-lineage-record.schema.yaml` + fixtures (spec-root suite 2762 -> 2771).
* `ai_lego/compute/lineage/traversal.py` -- pure graph-traversal compute (`traces_to_source`), hand-verified against 7+ known shapes before being wired into the method layer.
* `ai_lego/modules/database_data/data_lineage.py` -- builder + 3 gates, sharing predicates with the builder's own construction-time checks.
* `ai_lego/apps/cli/run_data_lineage_slice.py` -- a real merge case (two independent SOURCE systems joined by one TRANSFORM) plus two-layer attack-and-confirm.
* `tests/unit/test_data_lineage.py` -- 36 tests.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, `modules.research.gates.evaluate_statistical_gate` (fifth reuse this session, after root_cause.pareto/decision.ahp/decision.mcda/devops_sre.error_budget), and every prior family module.

## Critic round: proactively applying four prior lessons surfaced a fifth, deeper one

This slice's own first draft explicitly tried to apply every lesson from the four prior critic rounds this session (shared predicates between builder and gate, full recomputation rather than trusting a stored value, careful citation verification, and a mandatory spec-root grep before minting a new concept). A `critic` subagent review confirmed all four held -- and found a fifth failure mode none of the prior four rounds had surfaced:

1. **Critical, fixed** -- duplicate node ids had NO guard anywhere (builder, gate, or schema). `traces_to_source` keys its own result by id, so a genuine orphan sharing an id with a valid decoy silently collapsed onto the decoy's own `traces_to_source: true` -- certified at every layer, including schema validation. Fixed with a new shared predicate, `_duplicate_node_ids`, checked by both the builder (raises) and the gate (fails) before the traversal ever runs.
2. **Major, fixed** -- the first draft's `traces_to_source` was a backward, per-node DFS whose memoization could permanently record a `False` that was only ever provisional (derived while cutting a cycle on one particular path) -- making the SAME graph give DIFFERENT answers depending on the input `nodes[]` list's own order. This directly contradicted the schema's own `engine: const local_python_deterministic_compute` claim and regressed from the exact precedent the contract cited (`causal.dag`'s own `compute/graph/dag.py`, which explicitly guarantees order never affects its verdict).
3. **Major, fixed** -- the same recursive implementation raised `RecursionError` on a reverse-ordered chain of only a few hundred nodes -- ordinary scale for a real lineage graph. Both (2) and (3) were fixed by ONE rewrite: replacing the backward DFS with iterative forward reachability (flood-fill) from the SOURCE set -- provably order-independent (a purely set-theoretic property of the graph) and needs no recursion at all.
4. **Major, fixed** -- the contract's own "grepped the full spec root for 'lineage', 9 hits, all read" due-diligence claim overstated its own scope (it actually searched `specs/**`+`methods/**` only) and misclassified 3 of those 9 hits as one concept when they were actually a third, separately distinct one (schema/document version-history "lineage", not workflow-execution "lineage"). Corrected in the contract, its schema, and `contract-backlog.yaml`; two additional genuinely supporting (not competing) references were found and added on the wider check -- a policy requirement and a registered gap describing exactly the absence this method now fills.

Four Minor findings also fixed: the gate originally re-derived only 4 of the 6 things the builder enforces (missing stage/description checks) -- expanded to cover all six; the schema's own `required[]` omitted `engine`/`computation_provenance_ref`, diverging from the sibling schemas it names as its own model; the builder validated 4 of 5 copied node fields but not `provenance` itself, letting a schema-invalid record be built from a well-formed-looking input; and the CLI's own gate-layer attack proof used a weak oracle ("any gate failed for any reason") instead of pinning to the specific `structural_integrity` gate and its own evidence -- the exact "test that didn't test what it claimed" class a critic review caught in an unrelated sibling family two slices earlier.

The broader lesson this round adds to the session's own running list: sharing a predicate between a builder and its own gate removes DRIFT between the two layers (the fix four prior rounds already established), but does **not** make either layer independently correct if the shared predicate itself has a bug -- "recomputed independently" and "computed correctly" are different claims, and this slice's own gate had been faithfully recomputing a wrong answer twice.

## Evidence

CLI (post-fix): `PASS database_data.data_lineage: 4 nodes, gates [provenance_required=PASS, genuine_compute=PASS, structural_integrity=PASS], invariant_verified(construction=True, gate=True)`. 36 unit tests passed, including 4 new compute-layer regression tests proving order-independence on two known-bad graphs (both orderings each) and a 1000-node reverse-ordered chain with no `RecursionError`. Golden suite 2771 (2762 before; unchanged across the fix round). Full product-root regression: 671 tests OK (663 before this slice's first pass -> 671 after the critic-fix round, zero regressions).

## Honest limits

No method-inventory.yaml machine_id row (`OQ-DATALINEAGE-1`). Only backward traceability (node-to-Source) is built; Atlas's own first benefit bullet (forward impact analysis, "which results does an error at this Source affect") is answerable from the same graph data but not implemented (`OQ-DATALINEAGE-2`). `upstream_refs[]` referential integrity and node-id uniqueness are both runtime-layer-only invariants, not schema-expressible without a verbose per-value construct (`OQ-DATALINEAGERECORD-1`, and the new uniqueness disclosure on the `nodes` property).

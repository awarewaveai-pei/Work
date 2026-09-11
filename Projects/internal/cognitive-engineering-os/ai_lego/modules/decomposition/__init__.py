"""F02 decomposition & structuring family (Atlas L359-373) -- COMPLETE, 9 of 9. Tenants:
``decomposition.issue_tree`` (recursive open-depth tree, whole-tree id uniqueness GENUINE_COMPUTE),
``decomposition.logic_tree`` (recursive tree, single classification_rule declared once, sibling
category_value uniqueness per level -- distinct invariant class from issue_tree's whole-tree check),
``decomposition.mece`` (a real CHECK not a generative tree -- overlaps/gaps/is_mece all GENUINE_COMPUTE
set arithmetic over a caller-given universe+categories, delegated to ai_lego/compute/mece/check.py;
Atlas's own explicit caution that not every system can be perfectly MECE means is_mece: false is a
legal, non-refused outcome, not an error), ``decomposition.problem_tree`` (flat causes[]/effects[]
split, disjoint-id-set invariant directly grounded in the method's own stated benefit "分離症狀與原因"),
``decomposition.objective_tree`` (Problem Tree -> Objective Tree transformation, deliberately NOT a
hard cross-module import of problem_tree to avoid an intra-batch build-order race -- takes a
self-contained problem-tree-shaped input; bijective source-item coverage is GENUINE_COMPUTE, plus an
anti-passthrough check that a "positive" statement isn't just the negative one copied verbatim),
``decomposition.functional_decomposition`` (recursive tree + flat interfaces[], whole-tree id
uniqueness AND interface referential integrity both GENUINE_COMPUTE-checked), ``decomposition.fast``
(Function Analysis System Technique -- a why_ref chain, GENUINE_COMPUTE exactly-one-root check plus
real acyclicity via the existing ai_lego.compute.graph.dag.is_acyclic utility, reused not duplicated),
``decomposition.hierarchical_task_analysis`` (recursive tree, external HTA-domain-grounded if/then/else
invariant: a non-null plan is REQUIRED iff a node has 2+ children, and structurally FORBIDDEN otherwise
-- same asymmetric-conditional-requiredness discipline strategy.blue_ocean's own CREATE/ELIMINATE split
already establishes), ``decomposition.wbs`` (Work Breakdown Structure -- recursive tree, external
"100% rule" grounded: owner/estimate_hours required on leaves only, and total_estimate_hours is a
GENUINE_COMPUTE bottom-up rollup, never caller-supplied, independently re-derived by the gate).

Built as one 9-agent parallel batch (2026-09-11) -- all 9 methods are structurally disjoint (no
cross-imports among each other by design, see objective_tree's own no-hard-import note above) and
each carries at least one real, mechanically fail-closed invariant (never a bare disclosed judgment
call alone), continuing this suite's GENUINE_COMPUTE / independent-gate-re-derivation / hand-tamper-
proof discipline established by strategy.bcg_matrix and root_cause.pareto.
"""

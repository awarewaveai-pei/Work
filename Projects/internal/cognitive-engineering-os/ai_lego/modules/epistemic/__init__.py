"""F10 assumption/evidence/epistemic-quality family (Atlas L566-600) -- COMPLETE, 10 of 10. Tenants:
``epistemic.assumption_mapping`` (quadrant GENUINE_COMPUTE from the (impact, uncertainty) pair via a total
4-cell map transcribed from Atlas's own quadrantChart, never caller-supplied),
``epistemic.assumption_registry`` (is_critical_assumption GENUINE_COMPUTE from impact_if_wrong == "Critical" --
this method is the "consuming engine" specs/evidence/assumption.schema.yaml names but never had; entry id
uniqueness; a status asserting validated/verified requires non-empty validation, EC §116 L3132),
``epistemic.ladder_of_inference`` (ascending completeness -- a higher rung may only be non-empty once every
lower rung already is), ``epistemic.toulmin_model`` (warrant, the reasoning bridge, must be non-blank whenever
claim+grounds are present; backing only with a warrant to back), ``epistemic.argument_mapping`` (every
rebuttal's objection_id resolves to a declared objection; >=1 support; unique objection ids),
``epistemic.evidence_matrix`` (link referential integrity both directions, no duplicate (claim_id,
evidence_id) cell, and no orphan claim -- Atlas's own "快速看到薄弱 claim" made structural),
``epistemic.evidence_hierarchy`` (rank uniqueness = a strict total order; assignments resolve to declared
levels -- deliberately per-domain levels, NOT a universal tier enum, honouring evidence.schema.yaml's own
stated reasoning), ``epistemic.contradiction_detection`` (claim-to-claim relations, orthogonal to
claim.schema.yaml's claim-to-evidence contradicting_evidence; no self-relation; no duplicate UNORDERED pair),
``epistemic.bayesian_updating`` (posterior GENUINE_COMPUTE via Bayes' rule, zero-denominator refused with its
own error code rather than silently returning 0), ``epistemic.confidence_calibration`` (brier_score
GENUINE_COMPUTE = mean((confidence - outcome)^2); >=2 predictions; actual_outcome must be a real bool, int
0/1 refused).

Composition over duplication was the binding constraint for this family, since it overlaps the pre-existing
specs/evidence/* types: assumption_registry $refs assumption.schema.yaml, evidence_matrix and argument_mapping
$ref claim.schema.yaml/evidence.schema.yaml, and no parallel claim/evidence/assumption record shape was
minted. 1 critic pass (Standard tier, hand-tamper-verified, 273 garbage-input checks across all 21 gates)
found 5 Major + 5 Minor, all fixed before registry sync -- the load-bearing ones: 3 gates crashed
(TypeError) instead of failing closed on malformed field-level input; evidence_matrix's gate never re-derived
link shape/relation enum, so it PASSED records its own builder refuses (fixed by a single ``_link_problem``
predicate both layers now call, rather than restating the rule twice); 2 builders never validated provenance
at all, emitting records their own provenance_required gate then failed; and the F09 nested-list-aliasing
defect recurred one level deeper in assumption_registry, where the "regression test" for it mutated only a
scalar and so passed against the shallow copy. See WORKLOG 2026-09-12 F10 entry.
"""

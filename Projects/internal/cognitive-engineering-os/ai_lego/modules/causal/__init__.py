"""F11 causal & research-reasoning family (Atlas L612-625) -- COMPLETE, 10 of 10. Tenants:
``causal.dag`` (variables -> edges -> confounders/mediators/colliders, acyclicity enforced via
``ai_lego.compute.graph.dag.is_acyclic``, closed ``VALID_ROLES`` vocabulary on every node),
``causal.counterfactual_reasoning`` (intervention/actual_outcome/counterfactual_outcome pairwise
distinct, non-empty ``assumptions[]`` grounded directly in Atlas L617's own 4-stage pipeline --
NOT a generalization of L635, which is causal.dag-scoped text, corrected 2026-09-10),
``causal.theory_of_change`` (fixed 6-stage ``inputs->activities->outputs->
short_term_outcomes->long_term_outcomes->impact`` pipeline, every one of the 5 transitions carries
a required non-empty assumption/evidence/indicator/risk per Atlas Section 11.22's unconditional
"每條箭頭都應有"), ``causal.logic_model`` (fixed 5-stage ``inputs->activities->outputs->
short_term_outcomes->long_term_outcomes`` pipeline -- deliberately no impact stage and no
per-transition assumptions field, distinguishing it from ``theory_of_change``'s own citation;
outcome stages require non-empty ``indicators[]`` for KPI/evaluation framing, enforced at both
schema ``prefixItems`` position and the runtime gate), ``causal.process_tracing`` (Van Evera
hoop/smoking-gun evidence typology, GENUINE_COMPUTE per-item ``implication`` derived from a closed
4-cell ``(test_type, result) -> implication`` lookup table plus a record-level ``hypothesis_status``
with ELIMINATED-overrides-CONFIRMED precedence, both independently re-derived by the gate),
``causal.rct`` (study DESIGN only, not a statistics engine -- randomization approach, required
power/sample-size justification, distinct treatment/control groups, analysis summary as
reported/provenanced content, matching the established restraint precedent
``association.morphological_analysis``/``decision.mcda`` already set),
``causal.instrumental_variables`` (instrument/endogenous_variable distinctness, separately required
relevance_justification and exclusion_justification -- the two named IV validity conditions, disclosed
not computed; no real 2SLS), ``causal.difference_in_differences`` (treated_group/control_group
distinctness, pre_period/post_period distinctness, required non-empty parallel_trends_justification
as DiD's defining identifying assumption; no real regression), ``causal.regression_discontinuity``
(running_variable/cutoff_value/bandwidth disclosed as design choices, required non-empty
pairwise-distinct ``checks[]`` -- an RDD with zero disclosed manipulation/placebo checks has not
validated its own identifying assumption; no real bandwidth optimization), ``causal.synthetic_control``
(``donor_pool`` requires >=2 entries -- a weighted counterfactual needs a real blend, not one donor;
treated_unit must not echo a donor; every ``weights[].donor`` referentially resolves to a real donor_pool
entry, same edges->nodes pattern ``causal.dag`` established, weight VALUES deliberately unvalidated;
required non-empty ``placebo_tests[]`` per Atlas's own explicit final pipeline stage; no real weight
optimization). All 4 econometric/quasi-experimental methods capture study DESIGN only, matching
``causal.rct``'s own restraint -- none implement real statistical estimation."""

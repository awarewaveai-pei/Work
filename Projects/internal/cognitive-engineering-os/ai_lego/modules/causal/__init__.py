"""F11 causal & research-reasoning family (Atlas L612-625) -- 6 of 10 built. Tenants:
``causal.dag`` (variables -> edges -> confounders/mediators/colliders, acyclicity enforced via
``ai_lego.compute.graph.dag.is_acyclic``, closed ``VALID_ROLES`` vocabulary on every node),
``causal.counterfactual_reasoning`` (intervention/actual_outcome/counterfactual_outcome pairwise
distinct, non-empty ``assumptions[]`` as the method's own single-claim analog of DAG's per-edge
evidence framing), ``causal.theory_of_change`` (fixed 6-stage ``inputs->activities->outputs->
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
``association.morphological_analysis``/``decision.mcda`` already set).

Remaining 4 (Atlas L622-625, all genuinely unbuilt econometric/quasi-experimental methods):
Difference-in-Differences, Regression Discontinuity, Instrumental Variables, Synthetic Control."""

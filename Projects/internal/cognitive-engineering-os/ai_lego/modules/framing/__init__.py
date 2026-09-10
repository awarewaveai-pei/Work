"""F01 framing family -- 8 of 11 built. Tenants: ``framing.goal_statement`` (goal/beneficiaries/timeframe/
success_condition/constraints flat framing record, distinct from learning.kill_criteria/reversal_criteria's
ongoing monitoring-rule shape), ``framing.smart`` (S/M/A/R/T fixed 5-criteria checklist REFINING an
already-stated goal, distinct from goal_statement's initial framing; Atlas Sec12.4 requires goal_statement
complete first), ``framing.non_goals`` (project-level flat excluded-scope list, every entry carrying
scope_item/reason/re_review_trigger -- verified distinct from decision.moscow's WONT bucket, which has no
re-review field; this tenant's own contract resolves that method's OQ-MOSCOW-1), ``framing.okr`` (one
qualitative objective + 2-5 owned, independently-measurable key_results + a review_cadence -- verified
distinct from smart's fixed 5-criteria single-goal checklist and from decision.rice/decision.moscow's
already-defined-item prioritization), ``framing.north_star_metric`` (core_value_proposition/proxy_metric/
anti_gaming_validation, ONGOING product-strategy metric distinct from goal_statement's static one-time
success_condition), ``framing.success_criteria`` (Must/Should/Guardrail/Stop pre-commitment classification
for a high-risk decision, fixed before it begins -- distinct from kill_criteria/reversal_criteria's ongoing
monitoring; resolves goal_statement's own OQ-GOALSTATEMENT-1 via an ``SC-`` id prefix, optional
``reversal_criteria_ref`` soft-link to the already-built ``learning.reversal_criteria``),
``framing.five_w_one_h`` (id spelled out -- method.schema.yaml's id pattern rejects digits, same precedent
``root_cause.five_whys`` set; 6 fixed Who/What/When/Where/Why/How dimensions, GENUINE_COMPUTE
``information_gaps`` re-derived from which dimensions are marked UNKNOWN, never caller-supplied),
``framing.problem_statement`` (current_state/expected_state/gap/impact/constraints chain-origin record,
reusing the pre-existing ``problem-statement.schema.yaml`` verbatim -- F01's first real producer for 5
sibling methods, root_cause.event_tree/fault_tree/kepner_tregoe/change_analysis + decision.decision_tree,
that already required it as an input; also closed 2 real gaps in that shared schema, missing
``additionalProperties: false`` and no ``minLength`` on its 3 required content strings). Remaining: How
Might We, Frame Storming, Boundary Critique."""

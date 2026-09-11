"""F07 stakeholder/power/negotiation family (Atlas L483-507) -- COMPLETE, 10 of 10. Tenants:
``stakeholders.stakeholder_map`` (whole-map relationship_types coverage across DIRECT/INDIRECT/BENEFICIARY/
RISK_BEARER must be >=2 distinct values -- a map where every entry is tagged only DIRECT has degenerated into
"只看決策者", the exact failure §11.14's own 效益 line names; 16-item Atlas checklist treated as a reference
list, not a mandatory closed set), ``stakeholders.power_interest`` (quadrant is GENUINE_COMPUTE from each
stakeholder's own power_score x interest_score via a TOTAL 4-cell lookup table, never a builder parameter;
mermaid quadrant-N geometry independently verified against mermaid-js's own docs, not guessed; no importance/
ranking field anywhere, mechanizing §11.15's own "不是判斷誰比較「重要的人」"), ``stakeholders.salience_model``
(3 named dimensions power/legitimacy/urgency, each {present, justification} with justification mandatory iff
present; dimension_count/salience_class GENUINE_COMPUTE over an 8-way combination -- deliberately NOT the
academic Mitchell-Agle-Wood 7-type labels, since Atlas L489 cites only the 3 dimension names, not that
classification table), ``stakeholders.incentive_mapping`` (incentive_cards[] is a PER-CARD completeness check,
all 5 fields required non-empty on each card independently -- one incomplete card is refused even when every
other card in the list is complete), ``stakeholders.raci`` (exactly one Accountable per task, >=1 Responsible,
closed R/A/C/I role enum; deliberately disambiguated via ``SRACI-`` id prefix and distinct method_id from
method-inventory.yaml's still-unbuilt, pending F22 pm-governance "RACI (delivery)" entry), ``stakeholders.batna``
(best_alternative_id is referential-integrity-checked against alternatives[], never an independently-typed
string; reservation_point is GENUINE_COMPUTE as the selected alternative's value_estimate minus cost_estimate,
mechanizing §11.16 step 5's causal "依 BATNA 推 reservation point"), ``stakeholders.zopa`` (zopa_exists and
zopa_range are BOTH GENUINE_COMPUTE from seller_minimum/buyer_maximum, no constructor parameter for either --
§11.17's own "找雙方 reservation point 是否有重疊" IS this comparison), ``stakeholders.interest_based_negotiation``
(all 4 of the table row's own literal pipeline stages required non-empty; an optional ``position`` field, if
present, may not be verbatim-echoed by any ``interests`` entry, mechanizing "從 position 轉 interests" --
mirrors ``framing.goal_statement``'s own echo-check class), ``stakeholders.game_theory`` (every declared
strategy must have exactly one matching payoff before construction succeeds, mechanizing §12.19's own
"Payoff 設錯，模型再漂亮也無用" limitation into a real completeness gate; no Nash-equilibrium solver implemented,
equilibrium is a caller-supplied conclusion whose supporting payoff data is what gets verified),
``stakeholders.coalition_mapping`` (stakeholder_profiles[] >=2 well-shaped entries; coalition_scenarios[]
member_ids must resolve to a real profiled stakeholder id, same referential-integrity class
``association.concept_map``'s own dangling-edge-reference check already establishes; no coalition-recommendation
algorithm run, caller-supplied content only structurally and referentially verified).

Built as one 10-agent parallel batch (2026-09-11, immediately following the F06 batch) -- all 10 methods are
structurally disjoint (no cross-imports among each other, verified by each agent's own grep) and each carries
at least one real, mechanically fail-closed invariant enforced at both the Python builder and an independent
gate. Provenance placement is UNIFORM across all 10 (record-level only, a single top-level `provenance` field),
the same prescribed batch-wide rule the F06 batch established, applied here from the start rather than
discovered ad hoc.
"""

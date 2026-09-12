"""F13 unknown-unknowns/foresight family (Atlas L668-685) -- COMPLETE, 14 of 14. Tenants:
``foresight.horizon_scanning`` (every signal requires all 6 mandatory fields from Atlas's own §12.22 L2817
engineering mandate -- source/date/geography/status/impact/confidence -- plus referential integrity to
declared domains/sources), ``foresight.weak_signal_detection`` (>=2 DISTINCT corroborating sources per signal,
whitespace-normalized -- Atlas's own "triangulate"), ``foresight.outlier_analysis`` (mechanism_hypothesis
legal only after data_error_ruled_out is True, real bool, with a non-empty assessment -- Atlas's own
identify->rule-out-data-error->dig-into-mechanism ordering made structural), ``foresight.historical_analogy``
(every analogy requires >=1 similarity AND >=1 difference AND a non-empty mechanism AND non-empty limits -- an
analogy with only similarities is the surface-level analogy Atlas exists to prevent),
``foresight.cross_industry_transfer`` (non-empty shared_job_or_constraint AND adaptation AND source!=target
industry), ``foresight.adjacent_discipline_search`` (adjacent_fields disjoint from current_disciplines,
normalized; imported_models referential integrity), ``foresight.scenario_planning`` (every scenario carries
ALL 9 of Atlas §11.27's own required elements transcribed verbatim -- Drivers/Assumptions/Narrative/
Stakeholder responses/Competitor responses/2nd-3rd order effects/Signposts/Strategy performance/Reversal
condition; exactly 2 critical_uncertainties and exactly 4 scenarios per the section's own literal
quadrantChart), ``foresight.futures_wheel`` (strict order-parent fan-out consistency: order-1 impacts parent
to the center event, order-N to a declared order-(N-1) impact -- no orphans, no skipped orders, no cycles),
``foresight.backcasting`` (milestones strictly decreasing in horizon with no duplicates; >=1 today_actions
required -- a backcast that never reaches the present is a wish, not a roadmap), ``foresight.black_swan_exercise``
(4-stage chain referential completeness: tail_event->exposure->survivability->hedges, every tail event covered
by an exposure, every exposure covered by a survivability assessment), ``foresight.wild_cards`` (every wild
card requires a non-empty, well-formed strategy_rerun -- Atlas's own "wild card->rerun strategy"),
``foresight.cross_country_comparison`` (>=2 jurisdictions; non-empty normalization_basis per comparison;
referential integrity), ``foresight.delphi`` (anonymity structural -- any identity-shaped key on a response is
refused at both the runtime layer and the schema's additionalProperties:false; minority-range preservation
per Atlas §12.23 L2827 -- a consensus requires a non-empty minority_positions or an explicit none-recorded
reason; dispersion is GENUINE_COMPUTE, population stdev of the final round, gate-recomputed within 1e-9),
``foresight.cross_impact_analysis`` (referential integrity, no self-pair, matrix completeness -- every
unordered event pair present exactly once, shift finite and in [-1,1]).

1 critic pass (Standard tier, hand-tamper-verified, ~340 adversarial inputs across all 14 families' gates)
found 0 Critical / 2 Major / 2 Minor, all fixed before registry sync: (a) 3 of 14 gate suites
(historical_analogy, cross_industry_transfer, scenario_planning) never re-derived their own builder's
duplicate-id check, so a hand-tampered record with two items sharing an id passed all gates despite the
builder refusing it -- fixed by adding the same inline re-derivation the other 11 sibling gates already had;
(b) 11 of 14 builders returned the caller's own `provenance` dict by reference instead of a copy, so mutating
the caller's dict after construction silently rewrote the already-returned "validated" record with no
exception -- fixed with `copy.deepcopy(provenance)`, matching the 3 files that already did this correctly.
Both defect classes now have dedicated regression tests. 2 stale Atlas line citations (scenario_planning's
§11.27 sub-references, futures_wheel's §11.28 order-1/order-2 fan-out reference) corrected against the live
Atlas file. See WORKLOG 2026-09-12 F13 entry.
"""

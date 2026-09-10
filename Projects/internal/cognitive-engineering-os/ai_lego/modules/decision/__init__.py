"""F16 prioritization/decision family -- COMPLETE, 13 of 13. Tenants: ``decision.ahp`` (pairwise-comparison
weights), ``decision.mcda`` (N arbitrary criteria, relative per-run weighted score+ranking),
``decision.impact_effort`` (2 fixed axes -> categorical quadrant, not a weighted score; dedicated Atlas
Sec11.30), ``decision.ice`` (3 fixed dimensions, absolute per-item mean score, distinct from mcda),
``decision.rice`` (4 fixed dimensions, effort as divisor -- distinct from mcda's weighted-sum shape and
from ice's Ease), ``decision.moscow`` (categorical 4-bucket classifier), ``decision.weighted_decision_matrix``
(caller-scored direct weighted sum on one common declared scale, no normalize stage -- distinct from
mcda, verified field-for-field), ``decision.topsis`` (ranks by Euclidean distance to computed
ideal/anti-ideal points, reuses mcda's normalize_scores -- distinct from mcda's weighted-sum),
``decision.decision_tree`` (branching decision/chance/terminal tree, probability-weighted expected-value
rollup via backward induction -- distinct from flat expected_value and from root_cause.fault_tree/
event_tree's own tree shapes), ``decision.expected_value`` (flat Sum(p*outcome) over exhaustive states,
distinct from monte_carlo's sampled mean and from decision_tree's branching rollup),
``decision.pareto_frontier`` (multi-objective dominance -> SET partition on_frontier/dominated, no score
at all -- distinct from root_cause.pareto's single-dimension 80/20 ranking), ``decision.wsjf`` (Cost of
Delay [external SAFe 3-factor sum] / Job Size, portfolio layer -- sum numerator, distinct from rice's
product numerator), ``decision.kano`` (feature classification by satisfaction-curve shape via a
functional x dysfunctional response-pair table lookup, GENUINE_COMPUTE -- distinct from moscow's
caller-asserted buckets and impact_effort's threshold-compared quadrant)."""

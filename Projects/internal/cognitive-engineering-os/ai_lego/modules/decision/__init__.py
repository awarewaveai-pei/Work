"""F16 prioritization/decision family -- 6 of 13 built. Tenants: ``decision.ahp`` (pairwise-comparison
weights), ``decision.mcda`` (N arbitrary criteria, relative per-run weighted score+ranking),
``decision.impact_effort`` (2 fixed axes -> categorical quadrant, not a weighted score; dedicated Atlas
Sec11.30), ``decision.ice`` (3 fixed dimensions, absolute per-item mean score, distinct from mcda),
``decision.rice`` (4 fixed dimensions, effort as divisor -- distinct from mcda's weighted-sum shape and
from ice's Ease), ``decision.moscow`` (categorical 4-bucket classifier). Remaining: Weighted Decision
Matrix, TOPSIS, Decision Tree, Expected Value, Pareto Frontier, WSJF, Kano."""

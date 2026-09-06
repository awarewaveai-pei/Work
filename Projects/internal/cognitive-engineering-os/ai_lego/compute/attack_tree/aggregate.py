"""Bottom-up AND/OR attack-tree aggregation -- deterministic compute, backing ``security.attack_tree``.

Atlas's own F20 table formula (L883, §12.38 L3046-3062: "root goal→
AND/OR subgoals→cost/skill/detectability") gives a tree, not a
statistical sample -- the benefit line ("找最便宜、最可能、最難偵測的
攻擊鏈", find the cheapest/most-likely/hardest-to-detect attack chain)
is a real bottom-up combinatorial-optimization question over that tree,
not a mean/stddev/threshold question `research.gates.evaluate_statistical
_gate` (this session's own shared genuine-compute reuse for numeric
samples) is built for. This module implements the textbook AND/OR-tree
aggregation instead:

- AND node (attacker needs EVERY child to succeed): cost is the SUM of
  children's costs (every step must be paid for); skill/detectability
  are the WORST case (max rank) across children -- an attacker's
  compound plan is only as easy/stealthy as its single hardest/most-
  detectable required step, the same "weakest link is the bottleneck"
  principle standard attack-tree literature already establishes.
- OR node (attacker needs ANY ONE child to succeed): cost/skill
  /detectability are each MINIMIZED INDEPENDENTLY across children (the
  cheapest cost found anywhere under this node; the lowest skill needed
  anywhere; the lowest detectability anywhere). CAUGHT BY CRITIC REVIEW,
  disclosed here rather than left implicit: because the three attributes
  are minimized independently, the resulting triple is a per-attribute
  BOUND, not necessarily three values drawn from the SAME child -- the
  cheapest alternative and the stealthiest alternative may be different
  children. This does NOT identify a single realisable cheapest/
  stealthiest attack CHAIN; recovering one requires joint (Pareto-
  efficient) selection across the three attributes together, a separate,
  harder problem this module does not solve (see the method contract's
  own `OQ-ATTACKTREE-5`).
- Leaf node: the caller-supplied cost/skill/detectability ARE the
  aggregate (no children to combine).

Deterministic / order-independent by construction: min/max are exact
comparisons (order-independent for any input, floats included), and
``sum`` is order-independent for the integer/exact-decimal costs this
module's own callers are expected to supply. For general IEEE-754
floats, plain ``sum`` is not strictly order-independent in principle
(float addition is commutative but not associative) -- on this
package's own pinned runtime (``requires-python = ">=3.12"``, see
`pyproject.toml`), CPython's `sum()` uses Neumaier compensated
summation, which resolved order-independent to the precision this
module's own tests probe (400,000 random-permutation trials, zero
counterexamples, verified by critic review); a future revision wanting
a portability guarantee independent of that CPython-specific behavior
could switch to ``math.fsum`` (exactly rounded, genuinely order-
independent on any conforming Python). Same discipline
``compute/normalization/closure.py``'s own monotonic-fixed-point
rewrite already establishes for this package: a child list's own order
never changes the result.

SCOPE: this module performs ONLY the aggregation arithmetic over an
ALREADY SHAPE-VALID tree (every internal node has a real node_type and
at least one child; every leaf has real cost/skill/detectability). Shape
validation is the caller's own responsibility (``ai_lego.modules.security
.attack_tree``'s own shared predicates), matching this package's family-
wide "validate first, then compute" split.
"""

from __future__ import annotations

from typing import Any

SKILL_RANK: dict[str, int] = {"low": 0, "medium": 1, "high": 2}
DETECTABILITY_RANK: dict[str, int] = {"low": 0, "medium": 1, "high": 2}
_RANK_TO_SKILL = {rank: label for label, rank in SKILL_RANK.items()}
_RANK_TO_DETECTABILITY = {rank: label for label, rank in DETECTABILITY_RANK.items()}


def aggregate_node(node: dict[str, Any]) -> dict[str, Any]:
    """Returns ``{cost, skill, detectability}`` for ``node``, computed bottom-up. ``node`` MUST already be
    shape-valid (see module scope note above) -- this function does not re-validate shape, only computes
    over it. A leaf (no ``children`` key) returns its own stored values unchanged; an internal node
    recursively aggregates every child first, then combines per its own ``node_type`` (AND: sum cost, max
    skill rank, max detectability rank; OR: min cost, min skill rank, min detectability rank -- each of the
    three attributes independently, see module docstring for why the OR result is a per-attribute bound, not
    a single realisable chain)."""
    if "children" not in node:
        return {"cost": node["cost"], "skill": node["skill"], "detectability": node["detectability"]}

    child_aggregates = [aggregate_node(child) for child in node["children"]]
    costs = [a["cost"] for a in child_aggregates]
    skill_ranks = [SKILL_RANK[a["skill"]] for a in child_aggregates]
    detectability_ranks = [DETECTABILITY_RANK[a["detectability"]] for a in child_aggregates]

    if node["node_type"] == "AND":
        cost = sum(costs)
        skill_rank = max(skill_ranks)
        detectability_rank = max(detectability_ranks)
    else:  # "OR"
        cost = min(costs)
        skill_rank = min(skill_ranks)
        detectability_rank = min(detectability_ranks)

    return {"cost": cost, "skill": _RANK_TO_SKILL[skill_rank], "detectability": _RANK_TO_DETECTABILITY[detectability_rank]}

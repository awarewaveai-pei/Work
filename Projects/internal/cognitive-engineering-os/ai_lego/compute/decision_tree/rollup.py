"""Bottom-up decision-tree expected-value rollup -- deterministic compute, backing ``decision.decision_tree``.

Atlas's own F16 table formula (L770: "Decision Tree | 決策/機率/payoff 分支 | decision nodes→chance→
probability→payoff | 呈現 uncertainty") names the textbook decision-analysis "fold-back"/"rollback" procedure:
walk the tree bottom-up, and at every node resolve a single scalar VALUE --

- a ``terminal`` node's own value IS its ``payoff`` (no computation);
- a ``chance`` node's value is the PROBABILITY-WEIGHTED SUM of its own branches' child values (``sum(p_i *
  value(child_i))``) -- real expected value, Atlas's own "機率×payoff";
- a ``decision`` node's value is the MAXIMUM across its own branches' child values (payoff models a value to
  be maximized -- profit/utility; a minimization framing is achievable by negating payoffs, not a separate
  mode, disclosed in the method contract) -- the branch achieving that maximum is also recorded
  (``optimal_branch_label``, first branch wins on an exact tie, deterministic).

Same shape as ``ai_lego.compute.attack_tree.aggregate.aggregate_node`` (this package's own closest
precedent: bottom-up recursion over an ALREADY SHAPE-VALID embedded tree), but returns a whole REBUILT,
ANNOTATED tree rather than a bare scalar -- this method's own analytical content is the value at EVERY
chance/decision node (backward induction is decision tree's own defining step at every choice point, not
just the top), not only a root-level summary (disclosed compilation decision, see method contract). One
recursive pass therefore does BOTH jobs ``security.attack_tree`` splits into two (``_rebuild_node`` +
``aggregate_node``): every returned node is simultaneously a fresh copy (never aliasing the caller's own
input) and carries its own freshly-computed value.

SCOPE (same split ``aggregate_node``'s own docstring establishes for its family): this module performs ONLY
the rollup arithmetic over an ALREADY SHAPE-VALID tree whose every chance node's own branch probabilities
already sum to 1.0 -- shape validation is ``ai_lego.modules.decision.decision_tree``'s own responsibility
(``_node_is_valid``), and the probability-sum precondition is ``probability_sum_violations`` below, called
separately BEFORE ``roll_up_node`` by both the builder and the gate (never trusting the other already ran).
Malformed input (missing keys, wrong types) raises a plain ``KeyError``/``TypeError`` here, not a
``DecisionTree``-specific error -- deliberately: callers are required to validate first, matching
``aggregate_node``'s own "does not re-validate shape, only computes" contract.

Deterministic / order-independent for any real input: ``max`` with a strict ``>`` first-wins tie-break is
exact and total-order-independent; ``sum`` over a probability-weighted list is the same CPython
Neumaier-compensated-summation case ``aggregate_node``'s own module docstring already discloses for this
package's pinned ``requires-python = ">=3.12"`` runtime.
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

PROBABILITY_TOLERANCE = 1e-6
# Same tolerance ai_lego/compute/mcda/scoring.py's own validate_weights_sum_to_one uses for its own
# sum-to-1.0 check -- one codebase-wide convention for "close enough to 1.0", not a value reinvented per
# method.


def resolved_value(annotated_node: dict[str, Any]) -> float:
    """The single scalar value ``annotated_node`` (a node already returned by ``roll_up_node``) resolves to:
    ``payoff`` for a terminal node, ``expected_value`` for a decision/chance node. Used by a parent's own
    rollup to combine this node's value into ITS OWN computation -- and by callers wanting the record's
    ``root_expected_value`` convenience field (``resolved_value(record["root"])`` after a roll-up)."""
    if annotated_node["node_type"] == "terminal":
        return annotated_node["payoff"]
    return annotated_node["expected_value"]


def probability_sum_violations(node: dict[str, Any], path: str = "root") -> list[str]:
    """Precondition check (not itself the rollup): every ``chance`` node ANYWHERE in the tree (not just at
    the top -- recurses through decision branches too) must have its own ``branches[].probability`` sum to
    1.0 within ``PROBABILITY_TOLERANCE``. Returns every violation found (does not stop at the first), each
    tagged with a breadcrumb ``path`` naming the specific node -- same "name the specific bug class and
    location" evidence discipline ``root_cause.fault_tree``'s own ``_referential_integrity_violations``
    already establishes. Empty list means the whole tree's own chance nodes are all well-formed
    probability distributions. Precondition: ``node`` already passed shape validation (``_node_is_valid`` in
    the module layer) -- this function trusts ``branches``/``probability``/``child`` are present and
    well-typed, and does not itself guard against a missing key."""
    violations: list[str] = []
    node_type = node["node_type"]
    if node_type == "chance":
        total = sum(branch["probability"] for branch in node["branches"])
        if abs(total - 1.0) > PROBABILITY_TOLERANCE:
            violations.append(f"{path} (chance node {node['label']!r}): branch probabilities sum to {total!r}, expected 1.0 (tolerance {PROBABILITY_TOLERANCE})")
    if node_type in ("decision", "chance"):
        for index, branch in enumerate(node["branches"]):
            violations.extend(probability_sum_violations(branch["child"], f"{path}.branches[{index}]({branch['label']!r})"))
    return violations


def validate_probability_sums(node: dict[str, Any]) -> None:
    """Raising wrapper around ``probability_sum_violations`` -- construction-time convenience, same
    "raise before any downstream write" discipline every builder in this package uses. The gate calls
    ``probability_sum_violations`` directly (needs the full evidence list, not just the first problem)."""
    violations = probability_sum_violations(node)
    if violations:
        raise InvariantViolation(f"DECISIONTREE_PROBABILITY_SUM_MISMATCH: {'; '.join(violations)}")


def roll_up_node(node: dict[str, Any]) -> dict[str, Any]:
    """THE rollup: returns a NEW node dict, recursively rebuilt bottom-up with ``expected_value``
    (decision/chance nodes) and ``optimal_branch_label`` (decision nodes only) computed fresh and baked in.
    Never aliases anything from ``node`` -- every dict/list returned is new, same "rebuild, don't alias"
    discipline every prior tree module in this codebase follows.

    A ``terminal`` node is rebuilt with just its own ``label``/``payoff`` (no ``expected_value`` field --
    ``payoff`` already IS the value; a redundant, potentially-drifting duplicate field is deliberately not
    added, see method contract compilation_decisions). A ``chance`` node's ``expected_value`` is
    ``sum(branch.probability * resolved_value(rolled_up_child) for branch in branches)``. A ``decision``
    node's ``expected_value`` is ``max(...)`` over its own branches' rolled-up child values, and
    ``optimal_branch_label`` is the label of the FIRST branch achieving that maximum (strict ``>`` update,
    so an exact tie keeps the earlier-declared branch -- deterministic, disclosed, Atlas gives no
    tie-breaking rule).

    Precondition: ``node`` is already shape-valid (module layer) AND every chance node's own branches
    already sum to 1.0 (``validate_probability_sums``/``probability_sum_violations`` above, called
    separately) -- this function does not re-validate either; malformed input raises a plain Python
    ``KeyError``/``TypeError``, not a ``DecisionTree``-specific error (matches ``aggregate_node``'s own
    scope). Called identically by both construction (``generate_decision_tree_record``, computing the
    STORED values) and the gate (``evaluate_expected_value_integrity_gate``, independently recomputing to
    compare against whatever is stored) -- ONE implementation of the arithmetic, never two that could drift
    (same discipline ``decision.impact_effort``'s own ``evaluate_quadrant_integrity_gate`` reusing
    ``classify_quadrant`` already establishes)."""
    if node["node_type"] == "terminal":
        return {"node_type": "terminal", "label": node["label"], "payoff": node["payoff"]}

    rolled_branches: list[dict[str, Any]] = []
    child_values: list[float] = []
    for branch in node["branches"]:
        rolled_child = roll_up_node(branch["child"])
        child_values.append(resolved_value(rolled_child))
        if node["node_type"] == "chance":
            rolled_branches.append({"label": branch["label"], "probability": branch["probability"], "child": rolled_child})
        else:  # "decision"
            rolled_branches.append({"label": branch["label"], "child": rolled_child})

    if node["node_type"] == "chance":
        expected_value = sum(branch["probability"] * value for branch, value in zip(node["branches"], child_values))
        return {"node_type": "chance", "label": node["label"], "branches": rolled_branches, "expected_value": expected_value}

    # "decision": maximize, first branch wins ties (strict > update).
    best_index = 0
    for index in range(1, len(child_values)):
        if child_values[index] > child_values[best_index]:
            best_index = index
    return {
        "node_type": "decision",
        "label": node["label"],
        "branches": rolled_branches,
        "expected_value": child_values[best_index],
        "optimal_branch_label": node["branches"][best_index]["label"],
    }

"""Mutation-style tests for ``decision.decision_tree`` (7th member of the `decision` family, F16, after
``ahp``/``mcda``/``impact_effort``/``ice``/``rice``/``moscow``).

Two-layer discipline proven for all THREE headline invariants, same split ``test_fault_tree.py``/
``test_impact_effort.py`` already establish for their own families:

1. Tree shape -- every decision/chance/terminal node shape, the >=2-branches minimum, and the
   decision-branch-never-carries-probability distinction are checked at construction (raises) and
   independently re-derived at the gate (``evaluate_tree_shape_gate``), never trusting a stored shape.
2. Probability-sum -- every chance node's own ``branches[].probability`` summing to 1.0 is checked at
   construction (raises) and independently re-derived at the gate (``evaluate_probability_sum_gate``), via
   the SAME ``probability_sum_violations`` function both layers call.
3. Expected-value genuine-compute -- ``expected_value``/``optimal_branch_label`` are never a constructor
   parameter (construction always produces a matching value, computed by ``roll_up_node``) and a
   hand-tampered mismatch ANYWHERE in the tree is caught independently by
   ``evaluate_expected_value_integrity_gate``, which reuses the SAME ``roll_up_node`` function construction
   uses (never a second, parallel arithmetic implementation that could drift).

A worked, hand-verified product-launch decision tree (root: decision with 3 alternatives; the middle one
branches through a chance node into a SECOND, nested decision) is used across
``ComputeRollupHandVerifiedTests`` and several construction/gate tests -- the SAME tree
``ai_lego/apps/cli/run_decision_tree_slice.py`` and ``decision-tree-record.schema.yaml``'s own first example
use, so all three stay consistent with each other (cross-checked directly in ``SpecConformanceTests``).
"""

from __future__ import annotations

import copy
import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.decision_tree.rollup import (
    PROBABILITY_TOLERANCE,
    probability_sum_violations,
    resolved_value,
    roll_up_node,
    validate_probability_sums,
)
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.decision_tree import (
    MAX_TREE_DEPTH,
    METHOD_ID,
    MIN_BRANCHES,
    RECORD_ID_PREFIX,
    all_gates_pass,
    chance_branch,
    chance_node,
    decision_branch,
    decision_node,
    evaluate_decision_tree_gates,
    evaluate_expected_value_integrity_gate,
    evaluate_genuine_compute_gate,
    evaluate_probability_sum_gate,
    evaluate_provenance_required_gate,
    evaluate_tree_shape_gate,
    generate_decision_tree_record,
    list_decision_points,
    terminal_node,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/decision-tree-record.schema.yaml"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
VALIDATOR = "test"
TS = "2026-09-08T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


# --------------------------------------------------------------------------------------------------------
# Small reusable raw (unrolled) trees
# --------------------------------------------------------------------------------------------------------


def _simple_chance_tree():
    """2 terminal branches, p=0.5/0.5, payoffs 100/200 -- EV = 0.5*100 + 0.5*200 = 150."""
    return chance_node(
        "coin flip",
        [
            chance_branch("heads", 0.5, terminal_node("heads outcome", 100)),
            chance_branch("tails", 0.5, terminal_node("tails outcome", 200)),
        ],
    )


def _simple_decision_tree():
    """2 terminal branches, payoffs 100/200 -- EV = max(100, 200) = 200, optimal = 'big'."""
    return decision_node(
        "pick one",
        [
            decision_branch("small", terminal_node("small payoff", 100)),
            decision_branch("big", terminal_node("big payoff", 200)),
        ],
    )


def _tie_decision_tree():
    """3 terminal branches, payoffs 50/-10/50 -- tie between index 0 and 2, first wins."""
    return decision_node(
        "tie test",
        [
            decision_branch("first-fifty", terminal_node("a", 50)),
            decision_branch("minus-ten", terminal_node("b", -10)),
            decision_branch("second-fifty", terminal_node("c", 50)),
        ],
    )


def _launch_tree_root():
    """The full product-launch worked example -- see module docstring and
    ``ai_lego/apps/cli/run_decision_tree_slice.py``'s own identical construction. Hand-verified::

        EV(Immediate market response) = 0.6*500000 + 0.4*(-100000) = 260000
        EV(Post-R&D market response)  = 0.8*800000 + 0.2*(-50000)  = 630000
        EV(Post-R&D launch decision)  = max(630000, -80000)        = 630000, optimal='Launch after success'
        EV(R&D outcome)               = 0.7*630000 + 0.3*(-150000) = 396000
        EV(root)                      = max(260000, 396000, 0)     = 396000, optimal='Invest in R&D first'
    """
    post_rd_market = chance_node(
        "Post-R&D market response",
        [
            chance_branch("High demand", 0.8, terminal_node("High demand outcome", 800000)),
            chance_branch("Low demand", 0.2, terminal_node("Low demand outcome", -50000)),
        ],
    )
    post_rd_decision = decision_node(
        "Post-R&D launch decision",
        [
            decision_branch("Launch after success", post_rd_market),
            decision_branch("Abandon after success", terminal_node("Abandon after successful R&D", -80000)),
        ],
    )
    rd_outcome = chance_node(
        "R&D outcome",
        [
            chance_branch("R&D succeeds", 0.7, post_rd_decision),
            chance_branch("R&D fails", 0.3, terminal_node("R&D failure outcome", -150000)),
        ],
    )
    immediate_market = chance_node(
        "Immediate market response",
        [
            chance_branch("High demand", 0.6, terminal_node("High demand outcome", 500000)),
            chance_branch("Low demand", 0.4, terminal_node("Low demand outcome", -100000)),
        ],
    )
    return decision_node(
        "Product launch strategy",
        [
            decision_branch("Launch immediately", immediate_market),
            decision_branch("Invest in R&D first", rd_outcome),
            decision_branch("Do not launch", terminal_node("No launch", 0)),
        ],
    )


def _deep_chain(levels):
    """A right-nested chain of ``levels`` decision nodes (each 2 branches: 'stop'->terminal,
    'continue'->deeper); the bottommost terminal is reached after exactly ``levels`` 'continue' hops from
    the root (root itself is depth 0). Used to probe the MAX_TREE_DEPTH boundary."""
    node = terminal_node("bottom", 1.0)
    for i in range(levels):
        node = decision_node(f"level-{i}", [decision_branch("stop", terminal_node(f"stop-{i}", 0.0)), decision_branch("continue", node)])
    return node


def _build(record_id="DECISIONTREE-T-001", decision_context="test decision", root=None, version="1.0.0"):
    return generate_decision_tree_record(record_id, decision_context, _launch_tree_root() if root is None else root, _prov(), version=version)


def _valid_record():
    return _build()


# --------------------------------------------------------------------------------------------------------
# Constructors
# --------------------------------------------------------------------------------------------------------


class NodeConstructorTests(unittest.TestCase):
    def test_terminal_node_builds_expected_shape(self):
        node = terminal_node("leaf", 42)
        self.assertEqual(node, {"node_type": "terminal", "label": "leaf", "payoff": 42})

    def test_terminal_node_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_NODE_LABEL"):
            terminal_node("", 42)

    def test_terminal_node_whitespace_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_NODE_LABEL"):
            terminal_node("   ", 42)

    def test_terminal_node_nan_payoff_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PAYOFF"):
            terminal_node("leaf", math.nan)

    def test_terminal_node_infinite_payoff_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PAYOFF"):
            terminal_node("leaf", math.inf)

    def test_terminal_node_boolean_payoff_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PAYOFF"):
            terminal_node("leaf", True)

    def test_decision_branch_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_BRANCH_LABEL"):
            decision_branch("", terminal_node("x", 1))

    def test_chance_branch_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_BRANCH_LABEL"):
            chance_branch("", 0.5, terminal_node("x", 1))

    def test_chance_branch_probability_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PROBABILITY"):
            chance_branch("x", 1.5, terminal_node("x", 1))

    def test_chance_branch_probability_below_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PROBABILITY"):
            chance_branch("x", -0.1, terminal_node("x", 1))

    def test_chance_branch_boolean_probability_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PROBABILITY"):
            chance_branch("x", True, terminal_node("x", 1))

    def test_decision_node_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_NODE_LABEL"):
            decision_node("", [decision_branch("a", terminal_node("x", 1))])

    def test_chance_node_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_NODE_LABEL"):
            chance_node("", [chance_branch("a", 1.0, terminal_node("x", 1))])

    def test_decision_node_copies_branches_list_not_aliased(self):
        branches = [decision_branch("a", terminal_node("x", 1)), decision_branch("b", terminal_node("y", 2))]
        node = decision_node("d", branches)
        branches.append(decision_branch("c", terminal_node("z", 3)))
        self.assertEqual(len(node["branches"]), 2)


# --------------------------------------------------------------------------------------------------------
# Pure compute layer: roll_up_node / resolved_value
# --------------------------------------------------------------------------------------------------------


class RollupComputeTests(unittest.TestCase):
    def test_terminal_rollup_returns_payoff_as_is(self):
        rolled = roll_up_node(terminal_node("leaf", 42))
        self.assertEqual(rolled, {"node_type": "terminal", "label": "leaf", "payoff": 42})

    def test_terminal_rollup_has_no_expected_value_field(self):
        rolled = roll_up_node(terminal_node("leaf", 42))
        self.assertNotIn("expected_value", rolled)

    def test_simple_chance_rollup_computes_weighted_sum(self):
        rolled = roll_up_node(_simple_chance_tree())
        self.assertEqual(rolled["expected_value"], 150)

    def test_simple_decision_rollup_picks_max_and_optimal_label(self):
        rolled = roll_up_node(_simple_decision_tree())
        self.assertEqual(rolled["expected_value"], 200)
        self.assertEqual(rolled["optimal_branch_label"], "big")

    def test_tie_decision_rollup_picks_first_branch_on_tie(self):
        rolled = roll_up_node(_tie_decision_tree())
        self.assertEqual(rolled["expected_value"], 50)
        self.assertEqual(rolled["optimal_branch_label"], "first-fifty")

    def test_rollup_does_not_mutate_input(self):
        tree = _simple_chance_tree()
        snapshot = copy.deepcopy(tree)
        roll_up_node(tree)
        self.assertEqual(tree, snapshot)

    def test_rollup_returns_new_dicts_not_aliased(self):
        tree = _simple_decision_tree()
        rolled = roll_up_node(tree)
        self.assertIsNot(rolled, tree)
        self.assertIsNot(rolled["branches"], tree["branches"])

    def test_resolved_value_terminal(self):
        self.assertEqual(resolved_value(roll_up_node(terminal_node("x", 7))), 7)

    def test_resolved_value_decision(self):
        self.assertEqual(resolved_value(roll_up_node(_simple_decision_tree())), 200)

    def test_resolved_value_chance(self):
        self.assertEqual(resolved_value(roll_up_node(_simple_chance_tree())), 150)

    def test_nested_chance_under_decision_rolls_up_correctly(self):
        """decision 'top': branch A -> chance(p=0.5/0.5, payoffs 10/30, EV=20); branch B -> terminal 15.
        EV(top) = max(20, 15) = 20, optimal='A'."""
        tree = decision_node(
            "top",
            [
                decision_branch("A", chance_node("inner", [chance_branch("x", 0.5, terminal_node("x", 10)), chance_branch("y", 0.5, terminal_node("y", 30))])),
                decision_branch("B", terminal_node("b", 15)),
            ],
        )
        rolled = roll_up_node(tree)
        self.assertEqual(rolled["expected_value"], 20)
        self.assertEqual(rolled["optimal_branch_label"], "A")

    def test_nested_decision_under_chance_rolls_up_correctly(self):
        """chance 'top': p=0.4 -> decision(terminal 5 vs terminal 25, picks 25); p=0.6 -> terminal 10.
        EV(top) = 0.4*25 + 0.6*10 = 16."""
        tree = chance_node(
            "top",
            [
                chance_branch("branch1", 0.4, decision_node("inner", [decision_branch("low", terminal_node("low", 5)), decision_branch("high", terminal_node("high", 25))])),
                chance_branch("branch2", 0.6, terminal_node("b2", 10)),
            ],
        )
        rolled = roll_up_node(tree)
        self.assertEqual(rolled["expected_value"], 16)

    def test_negative_payoffs_decision_picks_least_negative(self):
        tree = decision_node("losses", [decision_branch("worse", terminal_node("w", -10)), decision_branch("better", terminal_node("b", -5))])
        rolled = roll_up_node(tree)
        self.assertEqual(rolled["expected_value"], -5)
        self.assertEqual(rolled["optimal_branch_label"], "better")

    def test_three_branch_chance_weighted_sum(self):
        tree = chance_node(
            "three",
            [
                chance_branch("a", 0.2, terminal_node("a", 10)),
                chance_branch("b", 0.3, terminal_node("b", 20)),
                chance_branch("c", 0.5, terminal_node("c", 30)),
            ],
        )
        rolled = roll_up_node(tree)
        self.assertAlmostEqual(rolled["expected_value"], 23.0)

    def test_rollup_is_deterministic_repeated_calls_agree(self):
        tree = _launch_tree_root()
        first = roll_up_node(tree)
        second = roll_up_node(tree)
        self.assertEqual(first, second)

    def test_full_launch_tree_rolls_up_without_error(self):
        rolled = roll_up_node(_launch_tree_root())
        self.assertEqual(rolled["node_type"], "decision")
        self.assertEqual(len(rolled["branches"]), 3)


# --------------------------------------------------------------------------------------------------------
# Pure compute layer: probability_sum_violations / validate_probability_sums
# --------------------------------------------------------------------------------------------------------


class ProbabilitySumComputeTests(unittest.TestCase):
    def test_probabilities_summing_to_one_pass(self):
        self.assertEqual(probability_sum_violations(_simple_chance_tree()), [])

    def test_probabilities_summing_to_point_six_fail(self):
        tree = chance_node("bad", [chance_branch("a", 0.3, terminal_node("a", 1)), chance_branch("b", 0.3, terminal_node("b", 2))])
        violations = probability_sum_violations(tree)
        self.assertEqual(len(violations), 1)
        self.assertIn("bad", violations[0])

    def test_probabilities_summing_over_one_fail(self):
        tree = chance_node("bad", [chance_branch("a", 0.7, terminal_node("a", 1)), chance_branch("b", 0.7, terminal_node("b", 2))])
        self.assertEqual(len(probability_sum_violations(tree)), 1)

    def test_no_chance_nodes_returns_empty_list(self):
        self.assertEqual(probability_sum_violations(_simple_decision_tree()), [])
        self.assertEqual(probability_sum_violations(terminal_node("x", 1)), [])

    def test_nested_chance_violation_found_deep_in_tree(self):
        bad_chance = chance_node("deep bad", [chance_branch("a", 0.1, terminal_node("a", 1)), chance_branch("b", 0.1, terminal_node("b", 2))])
        tree = decision_node("top", [decision_branch("into-bad", bad_chance), decision_branch("fine", terminal_node("fine", 3))])
        violations = probability_sum_violations(tree)
        self.assertEqual(len(violations), 1)
        self.assertIn("deep bad", violations[0])

    def test_decision_branches_are_recursed_into_for_chance_descendants(self):
        good_chance = _simple_chance_tree()
        tree = decision_node("top", [decision_branch("into-good", good_chance), decision_branch("fine", terminal_node("fine", 3))])
        self.assertEqual(probability_sum_violations(tree), [])

    def test_multiple_violations_across_the_tree_are_all_collected(self):
        bad1 = chance_node("bad1", [chance_branch("a", 0.1, terminal_node("a", 1)), chance_branch("b", 0.1, terminal_node("b", 2))])
        bad2 = chance_node("bad2", [chance_branch("a", 0.9, terminal_node("a", 1)), chance_branch("b", 0.9, terminal_node("b", 2))])
        tree = decision_node("top", [decision_branch("one", bad1), decision_branch("two", bad2)])
        violations = probability_sum_violations(tree)
        self.assertEqual(len(violations), 2)

    def test_validate_probability_sums_raises_with_code(self):
        tree = chance_node("bad", [chance_branch("a", 0.3, terminal_node("a", 1)), chance_branch("b", 0.3, terminal_node("b", 2))])
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_PROBABILITY_SUM_MISMATCH"):
            validate_probability_sums(tree)

    def test_validate_probability_sums_does_not_raise_on_valid_tree(self):
        validate_probability_sums(_launch_tree_root())  # must not raise

    def test_tolerance_boundary_just_within_passes(self):
        """3 branches summing to 1.0000004 (diff 4e-7, strictly less than PROBABILITY_TOLERANCE=1e-6) --
        genuinely off-by-a-hair, not '1 - a' trivially-exact-by-construction."""
        tree = chance_node(
            "close",
            [chance_branch("a", 0.5, terminal_node("a", 1)), chance_branch("b", 0.3, terminal_node("b", 2)), chance_branch("c", 0.2000004, terminal_node("c", 3))],
        )
        self.assertEqual(probability_sum_violations(tree), [])

    def test_tolerance_boundary_just_outside_fails(self):
        """Same shape, sum 1.0000012 (diff 1.2e-6, strictly greater than PROBABILITY_TOLERANCE=1e-6)."""
        tree = chance_node(
            "off",
            [chance_branch("a", 0.5, terminal_node("a", 1)), chance_branch("b", 0.3, terminal_node("b", 2)), chance_branch("c", 0.2000012, terminal_node("c", 3))],
        )
        self.assertEqual(len(probability_sum_violations(tree)), 1)

    def test_clearly_outside_tolerance_fails(self):
        tree = chance_node("off", [chance_branch("a", 0.5, terminal_node("a", 1)), chance_branch("b", 0.5001, terminal_node("b", 2))])
        self.assertEqual(len(probability_sum_violations(tree)), 1)


# --------------------------------------------------------------------------------------------------------
# Hand-verified end-to-end arithmetic (the product-launch worked example)
# --------------------------------------------------------------------------------------------------------


class ComputeRollupHandVerifiedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rolled = roll_up_node(_launch_tree_root())

    def _branch(self, node, label):
        for b in node["branches"]:
            if b["label"] == label:
                return b["child"]
        raise KeyError(label)

    def test_immediate_market_response_ev(self):
        immediate = self._branch(self.rolled, "Launch immediately")
        self.assertEqual(immediate["expected_value"], 260000)

    def test_post_rd_launch_decision_ev_and_optimal(self):
        rd_outcome = self._branch(self.rolled, "Invest in R&D first")
        post_rd_decision = self._branch(rd_outcome, "R&D succeeds")
        self.assertEqual(post_rd_decision["expected_value"], 630000)
        self.assertEqual(post_rd_decision["optimal_branch_label"], "Launch after success")

    def test_rd_outcome_chance_ev(self):
        rd_outcome = self._branch(self.rolled, "Invest in R&D first")
        self.assertEqual(rd_outcome["expected_value"], 396000)

    def test_root_ev_and_optimal_branch(self):
        self.assertEqual(self.rolled["expected_value"], 396000)
        self.assertEqual(self.rolled["optimal_branch_label"], "Invest in R&D first")

    def test_post_rd_market_response_ev(self):
        rd_outcome = self._branch(self.rolled, "Invest in R&D first")
        post_rd_decision = self._branch(rd_outcome, "R&D succeeds")
        post_rd_market = self._branch(post_rd_decision, "Launch after success")
        self.assertEqual(post_rd_market["expected_value"], 630000)


# --------------------------------------------------------------------------------------------------------
# Construction: record-level fields
# --------------------------------------------------------------------------------------------------------


class RecordFieldConstructionTests(unittest.TestCase):
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_RECORD_ID"):
            _build(record_id="WRONG-001")

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_VERSION"):
            _build(version=1.0)

    def test_empty_decision_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_RECORD_FIELD"):
            _build(decision_context="")

    def test_whitespace_only_decision_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_EMPTY_RECORD_FIELD"):
            _build(decision_context="   ")

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_PROVENANCE"):
            generate_decision_tree_record("DECISIONTREE-T-002", "ctx", _simple_decision_tree(), {"epistemic_type": "NOT_REAL", "authorship_state": "AI_GENERATED"})


# --------------------------------------------------------------------------------------------------------
# Construction: tree shape (invariant #1)
# --------------------------------------------------------------------------------------------------------


class TreeShapeConstructionTests(unittest.TestCase):
    def test_root_non_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root="not a node")

    def test_root_missing_node_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root={"label": "x", "payoff": 1})

    def test_root_unknown_node_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root={"node_type": "maybe", "label": "x", "payoff": 1})

    def test_decision_node_with_one_branch_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root={"node_type": "decision", "label": "d", "branches": [decision_branch("only", terminal_node("x", 1))]})

    def test_chance_node_with_one_branch_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root={"node_type": "chance", "label": "c", "branches": [chance_branch("only", 1.0, terminal_node("x", 1))]})

    def test_decision_node_with_two_branches_is_the_minimum_and_is_accepted(self):
        record = _build(root=_simple_decision_tree())
        self.assertEqual(len(record["root"]["branches"]), MIN_BRANCHES)

    def test_decision_node_with_extra_key_is_refused(self):
        raw = dict(_simple_decision_tree(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_chance_node_missing_branches_key_is_refused(self):
        raw = {"node_type": "chance", "label": "c"}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_decision_branch_with_probability_key_is_refused(self):
        """The real structural distinction: a decision branch must NEVER carry probability."""
        raw = {"node_type": "decision", "label": "d", "branches": [{"label": "a", "probability": 0.5, "child": terminal_node("x", 1)}, {"label": "b", "child": terminal_node("y", 2)}]}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_chance_branch_missing_probability_is_refused(self):
        raw = {"node_type": "chance", "label": "c", "branches": [{"label": "a", "child": terminal_node("x", 1)}, {"label": "b", "probability": 1.0, "child": terminal_node("y", 2)}]}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_chance_branch_probability_out_of_range_is_refused(self):
        raw = {"node_type": "chance", "label": "c", "branches": [{"label": "a", "probability": 1.2, "child": terminal_node("x", 1)}, {"label": "b", "probability": -0.2, "child": terminal_node("y", 2)}]}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_terminal_node_with_extra_key_is_refused(self):
        raw = {"node_type": "terminal", "label": "x", "payoff": 1, "extra": "nope"}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_terminal_node_missing_payoff_is_refused(self):
        raw = {"node_type": "terminal", "label": "x"}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_terminal_payoff_nan_is_refused(self):
        raw = {"node_type": "terminal", "label": "x", "payoff": math.nan}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_terminal_payoff_infinite_is_refused(self):
        raw = {"node_type": "terminal", "label": "x", "payoff": math.inf}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_tree_at_max_depth_is_accepted(self):
        record = _build(root=_deep_chain(MAX_TREE_DEPTH))
        self.assertEqual(record["root"]["node_type"], "decision")

    def test_tree_exceeding_max_depth_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=_deep_chain(MAX_TREE_DEPTH + 1))

    def test_raw_input_carrying_expected_value_key_is_refused(self):
        """A caller must never be able to supply expected_value directly -- no constructor parameter exists,
        and a hand-crafted dict smuggling the key in is still rejected as an unknown key at shape time."""
        raw = dict(_simple_decision_tree(), expected_value=999)
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)

    def test_raw_input_carrying_optimal_branch_label_key_is_refused(self):
        raw = dict(_simple_decision_tree(), optimal_branch_label="big")
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_INVALID_TREE_SHAPE"):
            _build(root=raw)


# --------------------------------------------------------------------------------------------------------
# Construction: probability-sum (invariant #2)
# --------------------------------------------------------------------------------------------------------


class ProbabilitySumConstructionTests(unittest.TestCase):
    def test_chance_probabilities_not_summing_to_one_refused_at_construction(self):
        bad = chance_node("bad", [chance_branch("a", 0.3, terminal_node("a", 1)), chance_branch("b", 0.3, terminal_node("b", 2))])
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_PROBABILITY_SUM_MISMATCH"):
            _build(root=bad)

    def test_nested_chance_probability_violation_refused_at_construction(self):
        bad_chance = chance_node("deep bad", [chance_branch("a", 0.1, terminal_node("a", 1)), chance_branch("b", 0.1, terminal_node("b", 2))])
        tree = decision_node("top", [decision_branch("into-bad", bad_chance), decision_branch("fine", terminal_node("fine", 3))])
        with self.assertRaisesRegex(InvariantViolation, "DECISIONTREE_PROBABILITY_SUM_MISMATCH"):
            _build(root=tree)

    def test_valid_probabilities_construct_successfully(self):
        record = _build(root=_simple_chance_tree())
        self.assertEqual(record["root"]["expected_value"], 150)


# --------------------------------------------------------------------------------------------------------
# Construction: happy path
# --------------------------------------------------------------------------------------------------------


class HappyPathConstructionTests(unittest.TestCase):
    def test_valid_record_has_expected_top_level_fields(self):
        record = _valid_record()
        self.assertEqual(record["id"], "DECISIONTREE-T-001")
        self.assertEqual(record["decision_context"], "test decision")
        self.assertIn("root", record)
        self.assertIn("root_expected_value", record)
        self.assertIn("provenance", record)

    def test_generated_by_method_defaults_correctly(self):
        record = _valid_record()
        self.assertEqual(record["generated_by_method"], METHOD_ID)

    def test_engine_and_computation_provenance_ref_are_set(self):
        record = _valid_record()
        self.assertEqual(record["engine"], "local_python_deterministic_compute")
        self.assertEqual(record["computation_provenance_ref"], "ai_lego.compute.decision_tree.rollup.roll_up_node")

    def test_root_expected_value_matches_root_node_resolved_value(self):
        record = _valid_record()
        self.assertEqual(record["root_expected_value"], record["root"]["expected_value"])

    def test_construction_does_not_alias_callers_root(self):
        root = _simple_decision_tree()
        record = generate_decision_tree_record("DECISIONTREE-T-003", "ctx", root, _prov())
        root["branches"].append(decision_branch("smuggled", terminal_node("z", 999)))
        self.assertEqual(len(record["root"]["branches"]), 2)

    def test_minimal_terminal_only_root_constructs_successfully(self):
        record = generate_decision_tree_record("DECISIONTREE-T-004", "guaranteed outcome", terminal_node("only", 1000), _prov())
        self.assertEqual(record["root"], {"node_type": "terminal", "label": "only", "payoff": 1000})
        self.assertEqual(record["root_expected_value"], 1000)


# --------------------------------------------------------------------------------------------------------
# Gates: provenance + generic genuine_compute reuse
# --------------------------------------------------------------------------------------------------------


class GateProvenanceTests(unittest.TestCase):
    def test_valid_record_passes_provenance_gate(self):
        gate = evaluate_provenance_required_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_missing_provenance_fails_provenance_gate(self):
        record = _valid_record()
        del record["provenance"]
        gate = evaluate_provenance_required_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_provenance_gate_not_a_crash(self):
        gate = evaluate_provenance_required_gate("not a dict", VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


class GateGenuineComputeReuseTests(unittest.TestCase):
    def test_genuine_compute_gate_is_the_same_function_the_family_already_reuses(self):
        record = _valid_record()
        direct_pass, direct_evidence = evaluate_statistical_gate(record)
        gate = evaluate_genuine_compute_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_non_dict_record_fails_genuine_compute_gate_not_a_crash(self):
        gate = evaluate_genuine_compute_gate(None, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


# --------------------------------------------------------------------------------------------------------
# Gate: tree shape integrity (invariant #1, re-derived)
# --------------------------------------------------------------------------------------------------------


class GateTreeShapeTests(unittest.TestCase):
    def test_valid_record_passes_tree_shape_gate(self):
        gate = evaluate_tree_shape_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_hand_tampered_unknown_node_type_fails(self):
        record = _valid_record()
        record["root"]["node_type"] = "maybe"
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_too_few_branches_fails(self):
        record = _valid_record()
        record["root"]["branches"] = record["root"]["branches"][:1]
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_id_prefix_fails(self):
        record = _valid_record()
        record["id"] = "WRONG-001"
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_decision_context_fails(self):
        record = _valid_record()
        record["decision_context"] = ""
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_expected_value_on_stored_root_fails(self):
        record = _valid_record()
        del record["root"]["expected_value"]
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_optimal_branch_label_on_decision_root_fails(self):
        record = _valid_record()
        del record["root"]["optimal_branch_label"]
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_optimal_branch_label_not_a_real_branch_fails(self):
        record = _valid_record()
        record["root"]["optimal_branch_label"] = "not a real branch"
        gate = evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        snapshot = copy.deepcopy(record)
        evaluate_tree_shape_gate(record, VALIDATOR, TS)
        self.assertEqual(record, snapshot)

    def test_non_dict_record_fails_not_a_crash(self):
        gate = evaluate_tree_shape_gate(42, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


# --------------------------------------------------------------------------------------------------------
# Gate: probability-sum integrity (invariant #2, re-derived)
# --------------------------------------------------------------------------------------------------------


class GateProbabilitySumTests(unittest.TestCase):
    def test_valid_record_passes_probability_sum_gate(self):
        gate = evaluate_probability_sum_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_hand_tampered_probability_fails(self):
        record = _valid_record()
        # "Launch immediately" -> chance "Immediate market response" -> branches[0] "High demand"
        record["root"]["branches"][0]["child"]["branches"][0]["probability"] = 0.3
        gate = evaluate_probability_sum_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_nested_probability_fails(self):
        record = _valid_record()
        # "Invest in R&D first" -> chance "R&D outcome" -> branches[0] "R&D succeeds"
        record["root"]["branches"][1]["child"]["branches"][0]["probability"] = 0.9
        gate = evaluate_probability_sum_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_invalid_shape_fails_not_a_crash(self):
        record = _valid_record()
        del record["root"]["branches"]
        gate = evaluate_probability_sum_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


# --------------------------------------------------------------------------------------------------------
# Gate: expected-value integrity (invariant #3, THE genuine-compute re-derivation)
# --------------------------------------------------------------------------------------------------------


class GateExpectedValueIntegrityTests(unittest.TestCase):
    def test_valid_record_passes(self):
        gate = evaluate_expected_value_integrity_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_hand_tampered_root_expected_value_fails(self):
        record = _valid_record()
        record["root_expected_value"] = 999999
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_root_node_expected_value_fails(self):
        record = _valid_record()
        record["root"]["expected_value"] = 999999
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_root_optimal_branch_label_fails(self):
        record = _valid_record()
        record["root"]["optimal_branch_label"] = "Do not launch"  # was "Invest in R&D first"
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_deeply_nested_chance_expected_value_fails(self):
        record = _valid_record()
        record["root"]["branches"][1]["child"]["expected_value"] = 1  # "R&D outcome" chance node
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("R&D outcome", str(gate["evidence"]))

    def test_hand_tampered_deeply_nested_decision_optimal_branch_label_fails(self):
        record = _valid_record()
        post_rd_decision = record["root"]["branches"][1]["child"]["branches"][0]["child"]
        post_rd_decision["optimal_branch_label"] = "Abandon after success"  # was "Launch after success"
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_leaf_payoff_cascades_to_ancestor_mismatch(self):
        """Tampering a RAW leaf payoff (not touching any expected_value field at all) still gets caught --
        proves the gate genuinely recomputes from raw fields rather than trusting nearby stored values."""
        record = _valid_record()
        record["root"]["branches"][0]["child"]["branches"][0]["child"]["payoff"] = 999999999  # was 500000
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("Immediate market response", str(gate["evidence"]))

    def test_evidence_reports_recomputed_root_expected_value_on_pass(self):
        gate = evaluate_expected_value_integrity_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["evidence"][0]["recomputed_root_expected_value"], 396000)

    def test_invalid_shape_fails_not_a_crash(self):
        record = _valid_record()
        del record["root"]["expected_value"]
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_invalid_probability_sum_fails_not_a_crash(self):
        record = _valid_record()
        record["root"]["branches"][0]["child"]["branches"][0]["probability"] = 0.3
        gate = evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        snapshot = copy.deepcopy(record)
        evaluate_expected_value_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(record, snapshot)

    def test_non_dict_record_fails_not_a_crash(self):
        gate = evaluate_expected_value_integrity_gate([1, 2, 3], VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


# --------------------------------------------------------------------------------------------------------
# Bonus helper: list_decision_points
# --------------------------------------------------------------------------------------------------------


class HelperFunctionTests(unittest.TestCase):
    def test_list_decision_points_finds_both_decision_nodes(self):
        points = list_decision_points(_valid_record())
        labels = {p["label"] for p in points}
        self.assertEqual(labels, {"Product launch strategy", "Post-R&D launch decision"})

    def test_list_decision_points_excludes_chance_and_terminal_nodes(self):
        points = list_decision_points(_valid_record())
        for p in points:
            self.assertIn(p["label"], {"Product launch strategy", "Post-R&D launch decision"})

    def test_list_decision_points_reports_correct_ev_and_optimal_label(self):
        points = {p["label"]: p for p in list_decision_points(_valid_record())}
        self.assertEqual(points["Product launch strategy"]["expected_value"], 396000)
        self.assertEqual(points["Product launch strategy"]["optimal_branch_label"], "Invest in R&D first")
        self.assertEqual(points["Post-R&D launch decision"]["expected_value"], 630000)
        self.assertEqual(points["Post-R&D launch decision"]["optimal_branch_label"], "Launch after success")

    def test_list_decision_points_path_breadcrumb_for_nested_decision(self):
        points = {p["label"]: p for p in list_decision_points(_valid_record())}
        path = points["Post-R&D launch decision"]["path"]
        self.assertIn("Product launch strategy", path)
        self.assertIn("Invest in R&D first", path)
        self.assertIn("R&D succeeds", path)

    def test_list_decision_points_on_terminal_only_tree_returns_empty_list(self):
        record = generate_decision_tree_record("DECISIONTREE-T-005", "ctx", terminal_node("only", 1), _prov())
        self.assertEqual(list_decision_points(record), [])

    def test_list_decision_points_on_pure_chance_tree_returns_empty_list(self):
        record = _build(root=_simple_chance_tree())
        self.assertEqual(list_decision_points(record), [])


# --------------------------------------------------------------------------------------------------------
# Aggregate: all 5 gates together
# --------------------------------------------------------------------------------------------------------


class AllGatesPassAndAggregateTests(unittest.TestCase):
    def test_valid_record_passes_all_five_gates(self):
        results = evaluate_decision_tree_gates(_valid_record(), VALIDATOR, TS)
        self.assertEqual(
            {r["gate_id"] for r in results},
            {"provenance_required", "genuine_compute", "tree_shape_integrity", "probability_sum_integrity", "expected_value_integrity"},
        )
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_gate_fails(self):
        results = evaluate_decision_tree_gates(_valid_record(), VALIDATOR, TS)
        results[0] = dict(results[0], status="FAIL")
        self.assertFalse(all_gates_pass(results))

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        results = evaluate_decision_tree_gates("not a dict", VALIDATOR, TS)
        self.assertFalse(all_gates_pass(results))
        self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_tampered_expected_value_fails_only_the_relevant_gates(self):
        record = _valid_record()
        record["root"]["expected_value"] = -1
        results = {r["gate_id"]: r["status"] for r in evaluate_decision_tree_gates(record, VALIDATOR, TS)}
        self.assertEqual(results["provenance_required"], "PASS")
        self.assertEqual(results["tree_shape_integrity"], "PASS")  # shape is still well-typed, just wrong VALUE
        self.assertEqual(results["probability_sum_integrity"], "PASS")
        self.assertEqual(results["expected_value_integrity"], "FAIL")


# --------------------------------------------------------------------------------------------------------
# Spec conformance
# --------------------------------------------------------------------------------------------------------


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "decision tree record")

    def test_minimal_terminal_only_record_validates_against_schema(self):
        record = generate_decision_tree_record("DECISIONTREE-T-006", "ctx", terminal_node("only", 1000), _prov())
        self.contracts.validate(RECORD_SCHEMA, record, "minimal decision tree record")

    def test_method_contract_yaml_itself_validates_against_method_schema(self):
        """The contract's own `verification.method` text CLAIMS this was checked -- actually re-runs it here
        so the claim stays true if the contract file ever drifts (R4: claim-before-verify)."""
        import yaml

        contract_path = self.spec_root / "methods" / "contracts" / "decision.decision_tree.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "decision.decision_tree contract")

    def test_schema_first_example_matches_independently_constructed_tree(self):
        """Loads decision-tree-record.schema.yaml's own first worked example and cross-checks its
        root_expected_value/optimal_branch_label against a FRESH, independent construction of the same
        scenario via this module's own constructors + generate_decision_tree_record -- proves the schema
        doc's own hand-verified numbers actually match the real code, not just each other by coincidence."""
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "decision-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        example = schema_doc["examples"][0]["value"]

        record = _build()
        self.assertEqual(example["root_expected_value"], record["root_expected_value"])
        self.assertEqual(example["root"]["optimal_branch_label"], record["root"]["optimal_branch_label"])
        self.assertEqual(example["root_expected_value"], 396000)

    def test_schema_second_example_is_a_minimal_terminal_record(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "decision-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        example = schema_doc["examples"][1]["value"]
        self.assertEqual(example["root"]["node_type"], "terminal")
        self.assertEqual(example["root_expected_value"], example["root"]["payoff"])


if __name__ == "__main__":
    unittest.main()

"""Mutation-style tests for ``decision.pareto_frontier`` (seventh member of the `decision` family, F16, after
`decision.ahp`/`decision.mcda`/`decision.impact_effort`/`decision.ice`/`decision.rice`/`decision.moscow`).

Hand-verified 4-option/2-objective worked example (cost USD-thousands minimize, quality 1-10 maximize),
manually confirmed before any code was written:

    A(cost=10, quality=8)  B(cost=8, quality=8)  C(cost=12, quality=9)  D(cost=15, quality=5)

    B vs A: B cost 8<10 (better), quality 8=8 (equal) -> B dominates A.
    A vs C: A cost 10<12 (better), quality 8<9 (worse) -> mixed, neither dominates.
    B vs C: B cost 8<12 (better), quality 8<9 (worse) -> mixed, neither dominates (genuine tradeoff).
    A vs D: A cost 10<15 (better), quality 8>5 (better) -> A dominates D.
    B vs D: B cost 8<15 (better), quality 8>5 (better) -> B dominates D.
    C vs D: C cost 12<15 (better), quality 9>5 (better) -> C dominates D.

    => A: dominated by {B}.  B: on_frontier.  C: on_frontier.  D: dominated by {A, B, C}.

Two-layer discipline proven for BOTH headline invariants, same split ``test_fault_tree.py``/
``test_impact_effort.py`` already establish for their own families:

1. Frontier genuine-compute -- ``compute_frontier`` is checked against this hand-verified case (and smaller
   pure ``dominates()`` cases) at the compute layer, then re-proven end-to-end: construction always produces a
   matching classification (there is no constructor parameter for it), and a hand-tampered mismatched status
   is caught independently by ``evaluate_frontier_integrity_gate``, which never trusts a stored label.
2. Minimum-objective-count (and every other structural precondition: direction validity, option/value
   completeness) -- checked against accept/reject boundary cases at the compute layer, then re-proven at both
   construction (raises) and the gate (re-derives via the SAME ``compute_frontier`` call, never trusts).

The inferred no-automatic-authority guard (see the method contract's own compilation_decisions for why this is
disclosed as the weakest-grounded such citation in the decision family) is proven at both independent layers,
same discipline ``test_mcda.py``'s own ``NoAutomaticAuthorityTests`` class already established for a sibling
rule.
"""

from __future__ import annotations

import copy
import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.pareto_frontier.dominance import (
    STATUS_DOMINATED,
    STATUS_ON_FRONTIER,
    VALID_DIRECTIONS,
    VALID_STATUSES,
    compute_frontier,
    dominates,
)
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.pareto_frontier import (
    FORBIDDEN_AUTHORITY_KEYS,
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_frontier_integrity_gate,
    evaluate_genuine_compute_gate,
    evaluate_no_automatic_authority_gate,
    evaluate_pareto_frontier_gates,
    evaluate_provenance_required_gate,
    generate_pareto_frontier_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

FRONTIER_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pareto-frontier-record.schema.yaml"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
VALIDATOR = "test"
TS = "2026-09-08T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _objectives():
    return [
        {"id": "OBJ-COST", "label": "成本 (USD, 千)", "direction": "minimize"},
        {"id": "OBJ-QUALITY", "label": "品質評分 (1-10)", "direction": "maximize"},
    ]


def _options():
    return [
        {"id": "OPT-A", "label": "廠商 A"},
        {"id": "OPT-B", "label": "廠商 B"},
        {"id": "OPT-C", "label": "廠商 C"},
        {"id": "OPT-D", "label": "廠商 D"},
    ]


def _option_values():
    return [
        {"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": 10},
        {"option_id": "OPT-A", "objective_id": "OBJ-QUALITY", "value": 8},
        {"option_id": "OPT-B", "objective_id": "OBJ-COST", "value": 8},
        {"option_id": "OPT-B", "objective_id": "OBJ-QUALITY", "value": 8},
        {"option_id": "OPT-C", "objective_id": "OBJ-COST", "value": 12},
        {"option_id": "OPT-C", "objective_id": "OBJ-QUALITY", "value": 9},
        {"option_id": "OPT-D", "objective_id": "OBJ-COST", "value": 15},
        {"option_id": "OPT-D", "objective_id": "OBJ-QUALITY", "value": 5},
    ]


def _values(pairs):
    """``{(option_id, objective_id): value}`` -> the flat ``option_values[]`` shape."""
    return [{"option_id": option_id, "objective_id": objective_id, "value": value} for (option_id, objective_id), value in pairs.items()]


def _build(record_id="PARETOFRONTIER-T-001", subject="test shortlist", objectives=None, options=None, option_values=None, version="1.0.0"):
    return generate_pareto_frontier_record(
        record_id,
        subject,
        _objectives() if objectives is None else objectives,
        _options() if options is None else options,
        _option_values() if option_values is None else option_values,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


class DominatesComputeTests(unittest.TestCase):
    """Pure ``dominates()`` -- real pairwise boundary logic, not just 'does it run'."""

    OBJECTIVES_MIN = [{"id": "X", "label": "x", "direction": "minimize"}]
    OBJECTIVES_MAX = [{"id": "X", "label": "x", "direction": "maximize"}]
    OBJECTIVES_BOTH = [{"id": "COST", "label": "cost", "direction": "minimize"}, {"id": "QUALITY", "label": "quality", "direction": "maximize"}]

    def test_lower_value_dominates_higher_value_when_minimizing(self):
        self.assertTrue(dominates({"X": 1}, {"X": 5}, self.OBJECTIVES_MIN))

    def test_higher_value_does_not_dominate_lower_value_when_minimizing(self):
        self.assertFalse(dominates({"X": 5}, {"X": 1}, self.OBJECTIVES_MIN))

    def test_higher_value_dominates_lower_value_when_maximizing(self):
        self.assertTrue(dominates({"X": 5}, {"X": 1}, self.OBJECTIVES_MAX))

    def test_lower_value_does_not_dominate_higher_value_when_maximizing(self):
        self.assertFalse(dominates({"X": 1}, {"X": 5}, self.OBJECTIVES_MAX))

    def test_identical_single_objective_values_do_not_dominate(self):
        """Equal-everywhere, strictly-better-nowhere -- domination requires a STRICT improvement somewhere."""
        self.assertFalse(dominates({"X": 3}, {"X": 3}, self.OBJECTIVES_MIN))
        self.assertFalse(dominates({"X": 3}, {"X": 3}, self.OBJECTIVES_MAX))

    def test_dominance_is_not_symmetric(self):
        a, b = {"X": 1}, {"X": 5}
        self.assertTrue(dominates(a, b, self.OBJECTIVES_MIN))
        self.assertFalse(dominates(b, a, self.OBJECTIVES_MIN))

    def test_two_objective_mixed_directions_strict_win_on_both(self):
        a = {"COST": 8, "QUALITY": 8}
        d = {"COST": 15, "QUALITY": 5}
        self.assertTrue(dominates(a, d, self.OBJECTIVES_BOTH))
        self.assertFalse(dominates(d, a, self.OBJECTIVES_BOTH))

    def test_two_objective_tradeoff_neither_dominates(self):
        b = {"COST": 8, "QUALITY": 8}
        c = {"COST": 12, "QUALITY": 9}
        self.assertFalse(dominates(b, c, self.OBJECTIVES_BOTH))
        self.assertFalse(dominates(c, b, self.OBJECTIVES_BOTH))

    def test_at_least_as_good_plus_one_strict_improvement_dominates(self):
        """Equal on one objective, strictly better on the other -- still dominates (not required to beat
        every objective strictly, only 'at least as good everywhere')."""
        a = {"COST": 8, "QUALITY": 8}
        b = {"COST": 10, "QUALITY": 8}
        self.assertTrue(dominates(a, b, self.OBJECTIVES_BOTH))

    def test_three_objectives_full_win(self):
        objectives = [
            {"id": "X", "label": "x", "direction": "maximize"},
            {"id": "Y", "label": "y", "direction": "maximize"},
            {"id": "Z", "label": "z", "direction": "minimize"},
        ]
        winner = {"X": 5, "Y": 5, "Z": 1}
        loser = {"X": 3, "Y": 3, "Z": 5}
        self.assertTrue(dominates(winner, loser, objectives))
        self.assertFalse(dominates(loser, winner, objectives))

    def test_three_objectives_mixed_no_domination(self):
        objectives = [
            {"id": "X", "label": "x", "direction": "maximize"},
            {"id": "Y", "label": "y", "direction": "maximize"},
            {"id": "Z", "label": "z", "direction": "minimize"},
        ]
        p = {"X": 5, "Y": 1, "Z": 1}
        q = {"X": 1, "Y": 5, "Z": 1}
        self.assertFalse(dominates(p, q, objectives))
        self.assertFalse(dominates(q, p, objectives))


class ComputeFrontierAlgorithmTests(unittest.TestCase):
    """``compute_frontier`` against the hand-verified worked example and smaller constructed cases."""

    def test_hand_verified_four_option_two_objective_example(self):
        result = compute_frontier(_options(), _objectives(), _option_values())
        by_id = {entry["option_id"]: entry for entry in result}
        self.assertEqual(by_id["OPT-A"]["status"], STATUS_DOMINATED)
        self.assertEqual(by_id["OPT-A"]["dominated_by"], ["OPT-B"])
        self.assertEqual(by_id["OPT-B"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(by_id["OPT-B"]["dominated_by"], [])
        self.assertEqual(by_id["OPT-C"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(by_id["OPT-C"]["dominated_by"], [])
        self.assertEqual(by_id["OPT-D"]["status"], STATUS_DOMINATED)
        self.assertEqual(by_id["OPT-D"]["dominated_by"], ["OPT-A", "OPT-B", "OPT-C"])

    def test_frontier_classification_order_matches_input_option_order(self):
        reordered = list(reversed(_options()))
        result = compute_frontier(reordered, _objectives(), _option_values())
        self.assertEqual([entry["option_id"] for entry in result], ["OPT-D", "OPT-C", "OPT-B", "OPT-A"])

    def test_result_has_exactly_one_entry_per_option(self):
        result = compute_frontier(_options(), _objectives(), _option_values())
        self.assertEqual({entry["option_id"] for entry in result}, {"OPT-A", "OPT-B", "OPT-C", "OPT-D"})

    def test_two_options_simple_domination(self):
        objectives = [{"id": "COST", "label": "cost", "direction": "minimize"}, {"id": "QUALITY", "label": "quality", "direction": "maximize"}]
        options = [{"id": "P", "label": "p"}, {"id": "Q", "label": "q"}]
        values = _values({("P", "COST"): 5, ("P", "QUALITY"): 9, ("Q", "COST"): 8, ("Q", "QUALITY"): 3})
        result = {e["option_id"]: e for e in compute_frontier(options, objectives, values)}
        self.assertEqual(result["P"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(result["Q"]["status"], STATUS_DOMINATED)
        self.assertEqual(result["Q"]["dominated_by"], ["P"])

    def test_two_options_tradeoff_both_on_frontier(self):
        objectives = [{"id": "COST", "label": "cost", "direction": "minimize"}, {"id": "QUALITY", "label": "quality", "direction": "maximize"}]
        options = [{"id": "P", "label": "p"}, {"id": "Q", "label": "q"}]
        values = _values({("P", "COST"): 5, ("P", "QUALITY"): 3, ("Q", "COST"): 8, ("Q", "QUALITY"): 9})
        result = {e["option_id"]: e for e in compute_frontier(options, objectives, values)}
        self.assertEqual(result["P"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(result["Q"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(result["P"]["dominated_by"], [])
        self.assertEqual(result["Q"]["dominated_by"], [])

    def test_all_options_identical_all_on_frontier(self):
        """No strict improvement exists ANYWHERE in a tied set -- ties never dominate."""
        objectives = [{"id": "COST", "label": "cost", "direction": "minimize"}, {"id": "QUALITY", "label": "quality", "direction": "maximize"}]
        options = [{"id": "P", "label": "p"}, {"id": "Q", "label": "q"}, {"id": "R", "label": "r"}]
        values = _values({(oid, "COST"): 5 for oid in ("P", "Q", "R")} | {(oid, "QUALITY"): 7 for oid in ("P", "Q", "R")})
        result = compute_frontier(options, objectives, values)
        self.assertTrue(all(e["status"] == STATUS_ON_FRONTIER for e in result))
        self.assertTrue(all(e["dominated_by"] == [] for e in result))

    def test_single_dominant_option_dominates_all_others(self):
        """BEST beats both P and Q on every axis; P and Q are themselves a genuine tradeoff (mutually
        non-dominated) so each is dominated by BEST alone, not by each other too."""
        objectives = [{"id": "COST", "label": "cost", "direction": "minimize"}, {"id": "QUALITY", "label": "quality", "direction": "maximize"}]
        options = [{"id": "BEST", "label": "best"}, {"id": "P", "label": "p"}, {"id": "Q", "label": "q"}]
        values = _values(
            {
                ("BEST", "COST"): 1, ("BEST", "QUALITY"): 10,
                ("P", "COST"): 4, ("P", "QUALITY"): 6,   # cheaper than Q, lower quality than Q
                ("Q", "COST"): 6, ("Q", "QUALITY"): 7,   # pricier than P, higher quality than P
            }
        )
        result = {e["option_id"]: e for e in compute_frontier(options, objectives, values)}
        self.assertEqual(result["BEST"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(result["BEST"]["dominated_by"], [])
        self.assertEqual(result["P"]["dominated_by"], ["BEST"])
        self.assertEqual(result["Q"]["dominated_by"], ["BEST"])

    def test_three_objectives_hand_verified_small_case(self):
        objectives = [
            {"id": "SPEED", "label": "speed", "direction": "maximize"},
            {"id": "PRICE", "label": "price", "direction": "minimize"},
            {"id": "WEIGHT", "label": "weight", "direction": "minimize"},
        ]
        options = [{"id": "WIN", "label": "win"}, {"id": "LOSE", "label": "lose"}]
        values = _values({("WIN", "SPEED"): 9, ("WIN", "PRICE"): 100, ("WIN", "WEIGHT"): 2, ("LOSE", "SPEED"): 5, ("LOSE", "PRICE"): 150, ("LOSE", "WEIGHT"): 5})
        result = {e["option_id"]: e for e in compute_frontier(options, objectives, values)}
        self.assertEqual(result["WIN"]["status"], STATUS_ON_FRONTIER)
        self.assertEqual(result["LOSE"]["dominated_by"], ["WIN"])

    def test_result_is_a_new_list_not_mutating_caller_inputs(self):
        options = _options()
        snapshot = copy.deepcopy(options)
        compute_frontier(options, _objectives(), _option_values())
        self.assertEqual(options, snapshot)


class ComputeFrontierInvariantTests(unittest.TestCase):
    """Invariant #2 (>=2 objectives) and every other real domain precondition ``compute_frontier`` owns."""

    def test_zero_objectives_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_TOO_FEW_OBJECTIVES"):
            compute_frontier(_options(), [], _option_values())

    def test_one_objective_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_TOO_FEW_OBJECTIVES"):
            compute_frontier(_options(), [_objectives()[0]], [v for v in _option_values() if v["objective_id"] == "OBJ-COST"])

    def test_two_objectives_is_the_legal_floor(self):
        compute_frontier(_options(), _objectives(), _option_values())  # must not raise

    def test_invalid_direction_is_refused(self):
        bad_objectives = [{"id": "OBJ-COST", "label": "cost", "direction": "minimize"}, {"id": "OBJ-QUALITY", "label": "quality", "direction": "sideways"}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_DIRECTION"):
            compute_frontier(_options(), bad_objectives, _option_values())

    def test_zero_options_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_TOO_FEW_OPTIONS"):
            compute_frontier([], _objectives(), [])

    def test_one_option_is_refused(self):
        one = [_options()[0]]
        values = [v for v in _option_values() if v["option_id"] == "OPT-A"]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_TOO_FEW_OPTIONS"):
            compute_frontier(one, _objectives(), values)

    def test_value_referencing_unknown_option_is_refused(self):
        values = _option_values() + [{"option_id": "OPT-GHOST", "objective_id": "OBJ-COST", "value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_UNKNOWN_OPTION_IN_VALUES"):
            compute_frontier(_options(), _objectives(), values)

    def test_value_referencing_unknown_objective_is_refused(self):
        values = _option_values() + [{"option_id": "OPT-A", "objective_id": "OBJ-GHOST", "value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_UNKNOWN_OBJECTIVE_IN_VALUES"):
            compute_frontier(_options(), _objectives(), values)

    def test_nan_value_is_refused(self):
        values = [v for v in _option_values() if not (v["option_id"] == "OPT-A" and v["objective_id"] == "OBJ-COST")]
        values.append({"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": float("nan")})
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_VALUE"):
            compute_frontier(_options(), _objectives(), values)

    def test_infinite_value_is_refused(self):
        values = [v for v in _option_values() if not (v["option_id"] == "OPT-A" and v["objective_id"] == "OBJ-COST")]
        values.append({"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": float("inf")})
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_VALUE"):
            compute_frontier(_options(), _objectives(), values)

    def test_boolean_value_is_refused_not_silently_accepted_as_zero_or_one(self):
        """bool is a subclass of int in Python -- True must not silently pass as value=1."""
        values = [v for v in _option_values() if not (v["option_id"] == "OPT-A" and v["objective_id"] == "OBJ-COST")]
        values.append({"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": True})
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_VALUE"):
            compute_frontier(_options(), _objectives(), values)

    def test_duplicate_value_entry_is_refused(self):
        values = _option_values() + [{"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": 99}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_DUPLICATE_VALUE_ENTRY"):
            compute_frontier(_options(), _objectives(), values)

    def test_missing_value_entry_is_refused_as_incomplete(self):
        values = [v for v in _option_values() if not (v["option_id"] == "OPT-D" and v["objective_id"] == "OBJ-QUALITY")]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INCOMPLETE_VALUES"):
            compute_frontier(_options(), _objectives(), values)

    def test_incomplete_values_error_names_the_missing_pair(self):
        values = [v for v in _option_values() if not (v["option_id"] == "OPT-D" and v["objective_id"] == "OBJ-QUALITY")]
        with self.assertRaisesRegex(InvariantViolation, r"OPT-D.*OBJ-QUALITY|OBJ-QUALITY.*OPT-D"):
            compute_frontier(_options(), _objectives(), values)

    def test_valid_directions_constant_has_exactly_maximize_and_minimize(self):
        self.assertEqual(VALID_DIRECTIONS, frozenset({"maximize", "minimize"}))

    def test_valid_statuses_constant_has_exactly_on_frontier_and_dominated(self):
        self.assertEqual(VALID_STATUSES, frozenset({STATUS_ON_FRONTIER, STATUS_DOMINATED}))


class ConstructionShapeTests(unittest.TestCase):
    """``generate_pareto_frontier_record``'s own module-layer shape/identity checks (record id/subject/version,
    and the closed-key-set + id-uniqueness of objectives/options/option_values)."""

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_RECORD_ID"):
            _build(record_id="WRONG-001")

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_VERSION"):
            _build(version=1.0)

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_EMPTY_RECORD_FIELD"):
            _build(subject="")

    def test_whitespace_only_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_EMPTY_RECORD_FIELD"):
            _build(subject="   ")

    def test_objectives_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OBJECTIVES"):
            _build(objectives="not a list")

    def test_objective_missing_direction_key_is_refused(self):
        bad = [{"id": "X", "label": "x"}, {"id": "Y", "label": "y", "direction": "maximize"}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OBJECTIVES"):
            _build(objectives=bad, option_values=[])

    def test_objective_with_extra_key_is_refused(self):
        bad = [dict(o, unit="usd") for o in _objectives()]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OBJECTIVES"):
            _build(objectives=bad)

    def test_objective_empty_id_is_refused(self):
        bad = [{"id": "", "label": "x", "direction": "minimize"}, _objectives()[1]]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OBJECTIVES"):
            _build(objectives=bad)

    def test_objective_empty_label_is_refused(self):
        bad = [{"id": "X", "label": "", "direction": "minimize"}, _objectives()[1]]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OBJECTIVES"):
            _build(objectives=bad)

    def test_objective_non_string_direction_is_refused_at_shape_layer(self):
        bad = [{"id": "X", "label": "x", "direction": 1}, _objectives()[1]]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OBJECTIVES"):
            _build(objectives=bad)

    def test_duplicate_objective_id_is_refused(self):
        bad = [{"id": "OBJ-COST", "label": "cost", "direction": "minimize"}, {"id": "OBJ-COST", "label": "cost again", "direction": "maximize"}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_DUPLICATE_OBJECTIVE_ID"):
            _build(objectives=bad, option_values=[])

    def test_options_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTIONS"):
            _build(options="not a list")

    def test_option_missing_label_is_refused(self):
        bad = [{"id": "OPT-A"}, _options()[1]]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTIONS"):
            _build(options=bad, option_values=[])

    def test_option_with_extra_key_is_refused(self):
        bad = [dict(o, notes="x") for o in _options()]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTIONS"):
            _build(options=bad)

    def test_option_empty_id_is_refused(self):
        bad = [{"id": "", "label": "x"}, _options()[1]]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTIONS"):
            _build(options=bad, option_values=[])

    def test_duplicate_option_id_is_refused(self):
        bad = [{"id": "OPT-A", "label": "a"}, {"id": "OPT-A", "label": "a again"}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_DUPLICATE_OPTION_ID"):
            _build(options=bad, option_values=[])

    def test_option_values_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTION_VALUES"):
            _build(option_values="not a list")

    def test_option_value_missing_key_is_refused(self):
        bad = [{"option_id": "OPT-A", "value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTION_VALUES"):
            _build(option_values=bad)

    def test_option_value_with_extra_key_is_refused(self):
        bad = [dict(v, note="x") for v in _option_values()]
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTION_VALUES"):
            _build(option_values=bad)

    def test_option_value_boolean_value_is_refused_at_shape_layer(self):
        bad = [v for v in _option_values() if not (v["option_id"] == "OPT-A" and v["objective_id"] == "OBJ-COST")]
        bad.append({"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": False})
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTION_VALUES"):
            _build(option_values=bad)

    def test_option_value_string_value_is_refused_at_shape_layer(self):
        bad = [v for v in _option_values() if not (v["option_id"] == "OPT-A" and v["objective_id"] == "OBJ-COST")]
        bad.append({"option_id": "OPT-A", "objective_id": "OBJ-COST", "value": "10"})
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_INVALID_OPTION_VALUES"):
            _build(option_values=bad)

    def test_frontier_classification_is_not_a_constructor_parameter(self):
        with self.assertRaises(TypeError):
            generate_pareto_frontier_record(
                "PARETOFRONTIER-T-002", "x", _objectives(), _options(), _option_values(), _prov(), frontier_classification=[]
            )

    def test_too_few_objectives_propagates_from_compute_layer_through_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_TOO_FEW_OBJECTIVES"):
            _build(objectives=[_objectives()[0]], option_values=[v for v in _option_values() if v["objective_id"] == "OBJ-COST"])

    def test_too_few_options_propagates_from_compute_layer_through_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_TOO_FEW_OPTIONS"):
            _build(options=[_options()[0]], option_values=[v for v in _option_values() if v["option_id"] == "OPT-A"])

    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        objectives, options, values = _objectives(), _options(), _option_values()
        record = _build(objectives=objectives, options=options, option_values=values)
        objectives.append({"id": "OBJ-GHOST", "label": "ghost", "direction": "maximize"})
        options.append({"id": "OPT-GHOST", "label": "ghost"})
        values.append({"option_id": "OPT-GHOST", "objective_id": "OBJ-GHOST", "value": 0})
        self.assertEqual(len(record["objectives"]), 2)
        self.assertEqual(len(record["options"]), 4)
        self.assertEqual(len(record["option_values"]), 8)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_pareto_frontier_record("PARETOFRONTIER-T-003", "x", _objectives(), _options(), _option_values(), provenance)
        self.assertIs(record["provenance"], provenance)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(FRONTIER_RECORD_SCHEMA, _valid_record(), "pareto frontier record")

    def test_method_contract_yaml_itself_validates_against_method_schema(self):
        """The contract's own `verification.method` text CLAIMS this was checked -- actually re-runs it here
        so the claim stays true if the contract file ever drifts (R4: claim-before-verify)."""
        import yaml

        contract_path = self.spec_root / "methods" / "contracts" / "decision.pareto_frontier.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "decision.pareto_frontier contract")

    def test_frontier_matches_the_expected_spread_across_the_demo_batch(self):
        record = _valid_record()
        statuses = {e["option_id"]: e["status"] for e in record["frontier_classification"]}
        self.assertEqual(statuses, {"OPT-A": STATUS_DOMINATED, "OPT-B": STATUS_ON_FRONTIER, "OPT-C": STATUS_ON_FRONTIER, "OPT-D": STATUS_DOMINATED})

    def test_schema_layer_rejects_an_id_without_the_paretofrontier_prefix(self):
        record = _valid_record()
        record["id"] = "WRONG-001"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "bad id")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["option_values"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "missing field")

    def test_schema_layer_rejects_a_classification_entry_with_invalid_status_enum(self):
        record = _valid_record()
        record["frontier_classification"][0]["status"] = "maybe_frontier"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "bad status enum")

    def test_schema_layer_rejects_on_frontier_with_nonempty_dominated_by(self):
        """The schema's own if/then structural enforcement, independent of the runtime gate."""
        record = _valid_record()
        for entry in record["frontier_classification"]:
            if entry["option_id"] == "OPT-B":
                entry["dominated_by"] = ["OPT-C"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "on_frontier with nonempty dominated_by")

    def test_schema_layer_rejects_dominated_with_empty_dominated_by(self):
        record = _valid_record()
        for entry in record["frontier_classification"]:
            if entry["option_id"] == "OPT-A":
                entry["dominated_by"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "dominated with empty dominated_by")

    def test_schema_layer_rejects_objectives_with_fewer_than_two_entries(self):
        record = _valid_record()
        record["objectives"] = [record["objectives"][0]]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "single objective")

    def test_schema_layer_rejects_options_with_fewer_than_two_entries(self):
        record = _valid_record()
        record["options"] = [record["options"][0]]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "single option")

    def test_schema_layer_rejects_an_objective_with_extra_key(self):
        record = _valid_record()
        record["objectives"][0]["unit"] = "usd"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FRONTIER_RECORD_SCHEMA, record, "objective with extra key")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_pareto_frontier_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class NoAutomaticAuthorityTests(unittest.TestCase):
    """Inferred rule (see method contract compilation_decisions for the disclosed, weaker-than-usual
    grounding): a Pareto frontier is a non-dominated SET, never a single decided/approved winner. Proven at
    both independent layers, same discipline test_mcda.py's own NoAutomaticAuthorityTests class establishes."""

    def test_top_level_authority_key_is_refused_at_construction(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
            assert_no_automatic_authority_claim(record)

    def test_each_forbidden_key_individually_is_refused(self):
        for key in sorted(FORBIDDEN_AUTHORITY_KEYS):
            with self.subTest(key=key):
                record = _valid_record()
                record[key] = "x"
                with self.assertRaises(InvariantViolation):
                    assert_no_automatic_authority_claim(record)

    def test_forbidden_authority_keys_includes_frontier_specific_terms(self):
        """Widened beyond the family's usual set -- a frontier's own natural vocabulary invites these two."""
        self.assertIn("recommended_option", FORBIDDEN_AUTHORITY_KEYS)
        self.assertIn("winner", FORBIDDEN_AUTHORITY_KEYS)

    def test_clean_record_passes_the_authority_check(self):
        assert_no_automatic_authority_claim(_valid_record())  # must not raise

    def test_non_dict_record_is_refused_not_a_crash(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETOFRONTIER_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
            assert_no_automatic_authority_claim("not a dict")

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["winner"] = "OPT-B"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(FRONTIER_RECORD_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_fails_on_a_tampered_record(self):
        record = _valid_record()
        record["recommended_option"] = "OPT-B"
        gate = evaluate_no_automatic_authority_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_on_a_clean_record(self):
        gate = evaluate_no_automatic_authority_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")


class GateMutationTests(unittest.TestCase):
    """Every gate re-derives from the record's own raw fields -- a hand-tampered copy of an already-valid
    record must still be caught, same discipline test_fault_tree.py's/test_impact_effort.py's own
    GateMutationTests classes establish."""

    def test_valid_record_passes_all_four_gates(self):
        results = evaluate_pareto_frontier_gates(_valid_record(), VALIDATOR, TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "frontier_integrity", "no_automatic_authority_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_genuine_compute_gate_is_the_same_function_family_siblings_reuse(self):
        record = _valid_record()
        direct_pass, direct_evidence = evaluate_statistical_gate(record)
        gate = evaluate_genuine_compute_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_hand_tampered_status_mismatch_fails_the_integrity_gate(self):
        record = _valid_record()
        for entry in record["frontier_classification"]:
            if entry["option_id"] == "OPT-A":
                entry["status"] = STATUS_ON_FRONTIER
                entry["dominated_by"] = []
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("does not match recomputed", str(gate["evidence"]))

    def test_hand_tampered_dominated_by_mismatch_fails_the_integrity_gate(self):
        """status left correct (dominated), but the dominator LIST is wrong -- still caught."""
        record = _valid_record()
        for entry in record["frontier_classification"]:
            if entry["option_id"] == "OPT-D":
                entry["dominated_by"] = ["OPT-A"]  # true set is [OPT-A, OPT-B, OPT-C]
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_invalid_status_value_fails_the_integrity_gate(self):
        record = _valid_record()
        record["frontier_classification"][0]["status"] = "maybe"
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_id_prefix_fails_the_integrity_gate(self):
        record = _valid_record()
        record["id"] = "WRONG-001"
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_subject_fails_the_integrity_gate(self):
        record = _valid_record()
        record["subject"] = ""
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_too_few_objectives_fails_the_integrity_gate(self):
        record = _valid_record()
        record["objectives"] = [record["objectives"][0]]
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PARETOFRONTIER_TOO_FEW_OBJECTIVES", str(gate["evidence"]))

    def test_hand_tampered_invalid_direction_fails_the_integrity_gate(self):
        record = _valid_record()
        record["objectives"][1]["direction"] = "sideways"
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_incomplete_option_values_fails_the_integrity_gate(self):
        record = _valid_record()
        record["option_values"] = [v for v in record["option_values"] if not (v["option_id"] == "OPT-D" and v["objective_id"] == "OBJ-QUALITY")]
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PARETOFRONTIER_INCOMPLETE_VALUES", str(gate["evidence"]))

    def test_hand_tampered_duplicate_option_id_fails_the_integrity_gate(self):
        record = _valid_record()
        record["options"][1]["id"] = record["options"][0]["id"]
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_extra_option_in_classification_fails_the_integrity_gate(self):
        record = _valid_record()
        record["frontier_classification"].append({"option_id": "OPT-GHOST", "status": STATUS_ON_FRONTIER, "dominated_by": []})
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_missing_option_in_classification_fails_the_integrity_gate(self):
        record = _valid_record()
        record["frontier_classification"] = [e for e in record["frontier_classification"] if e["option_id"] != "OPT-D"]
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_option_in_classification_fails_the_integrity_gate(self):
        record = _valid_record()
        record["frontier_classification"].append(dict(record["frontier_classification"][0]))
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_malformed_classification_entry_fails_the_integrity_gate(self):
        record = _valid_record()
        del record["frontier_classification"][0]["dominated_by"]
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_frontier_classification_missing_or_not_a_list_fails_the_integrity_gate(self):
        record = _valid_record()
        record["frontier_classification"] = "not a list"
        gate = evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_evidence_reports_status_counts_on_pass(self):
        gate = evaluate_frontier_integrity_gate(_valid_record(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")
        counts = gate["evidence"][0]["status_counts"]
        self.assertEqual(counts[STATUS_ON_FRONTIER], 2)
        self.assertEqual(counts[STATUS_DOMINATED], 2)

    def test_integrity_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        snapshot = copy.deepcopy(record)
        evaluate_frontier_integrity_gate(record, VALIDATOR, TS)
        self.assertEqual(record, snapshot)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        results = evaluate_pareto_frontier_gates("not a dict", VALIDATOR, TS)
        self.assertFalse(all_gates_pass(results))
        self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_none_record_fails_all_gates_not_a_crash(self):
        results = evaluate_pareto_frontier_gates(None, VALIDATOR, TS)
        self.assertFalse(all_gates_pass(results))
        self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        del record["provenance"]
        gate = evaluate_provenance_required_gate(record, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        results = evaluate_pareto_frontier_gates(_valid_record(), VALIDATOR, TS)
        results[0] = dict(results[0], status="FAIL")
        self.assertFalse(all_gates_pass(results))

    def test_all_gates_pass_accepts_not_applicable(self):
        results = evaluate_pareto_frontier_gates(_valid_record(), VALIDATOR, TS)
        results[0] = dict(results[0], status="NOT_APPLICABLE")
        self.assertTrue(all_gates_pass(results))


if __name__ == "__main__":
    unittest.main()

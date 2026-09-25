"""Mutation-style tests for ``systems.behavior_over_time`` (F09 systems-thinking family, Atlas L551).

Atlas's own literal purpose ('畫變數隨時間變化') is proven at BOTH
independent layers: the construction-time builder refuses fewer than 2
points and any duplicate/out-of-order timestamp, and the independent gate
re-derives the same rule directly from a raw (possibly hand-tampered) dict,
never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.behavior_over_time import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_behavior_over_time_gates,
    evaluate_chronological_order_gate,
    evaluate_provenance_required_gate,
    generate_behavior_over_time_chart,
    point,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BEHAVIOR_OVER_TIME_CHART_SCHEMA = "ai-lego://specs/cognitive/typed-objects/behavior-over-time-chart.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _points() -> list[dict]:
    return [
        {"time": "2026-08-10", "value": 42},
        {"time": "2026-08-17", "value": 45},
        {"time": "2026-08-24", "value": 138},
        {"time": "2026-08-31", "value": 120},
        {"time": "2026-09-07", "value": 95},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(variable_name="每週客服工單量", points=_points(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_chart(*, record_id: str = "BOT-T-001", **overrides: object):
    return generate_behavior_over_time_chart(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_chart_validates_against_the_real_schema(self):
        self.contracts.validate(BEHAVIOR_OVER_TIME_CHART_SCHEMA, _valid_chart(), "behavior over time chart")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, chart = live.invoke(METHOD_ID, generate_behavior_over_time_chart, "BOT-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/systems.behavior_over_time.contract.yaml")
        self.assertEqual(chart["id"], "BOT-T-INVOKE")

    def test_empty_catalog_blocks_behavior_over_time_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        chart = _valid_chart()
        chart["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BEHAVIOR_OVER_TIME_CHART_SCHEMA, chart, "chart with a smuggled top-level key")

    def test_schema_rejects_fewer_than_two_points(self):
        chart = _valid_chart()
        chart["points"] = chart["points"][:1]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BEHAVIOR_OVER_TIME_CHART_SCHEMA, chart, "chart with only 1 point")

    def test_numeric_time_labels_validate_against_the_real_schema(self):
        chart = generate_behavior_over_time_chart(
            "BOT-T-NUMERIC", variable_name="t軸範例", points=[{"time": 0, "value": 1}, {"time": 1, "value": 2}], provenance=PROVENANCE
        )
        self.contracts.validate(BEHAVIOR_OVER_TIME_CHART_SCHEMA, chart, "chart with numeric time labels")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "systems.behavior_over_time.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "systems.behavior_over_time contract")


class ChronologicalOrderTests(unittest.TestCase):
    """Atlas L551's own literal purpose ('畫變數隨時間變化') -- points[] must contain >=2 entries and be
    strictly increasing in time."""

    def test_well_formed_five_point_chart_is_accepted(self):
        chart = _valid_chart()
        self.assertEqual(len(chart["points"]), 5)

    def test_fewer_than_two_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_TOO_FEW_POINTS"):
            _valid_chart(points=_points()[:1])

    def test_zero_points_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_TOO_FEW_POINTS"):
            _valid_chart(points=[])

    def test_duplicate_timestamp_is_refused(self):
        bad_points = _points()[:3] + [{"time": "2026-08-24", "value": 130}] + _points()[3:]
        with self.assertRaisesRegex(InvariantViolation, "BOT_POINTS_NOT_STRICTLY_INCREASING"):
            _valid_chart(points=bad_points)

    def test_out_of_order_timestamp_is_refused(self):
        bad_points = [_points()[1], _points()[0]] + _points()[2:]
        with self.assertRaisesRegex(InvariantViolation, "BOT_POINTS_NOT_STRICTLY_INCREASING"):
            _valid_chart(points=bad_points)

    def test_numeric_timestamps_strictly_increasing_is_accepted(self):
        chart = generate_behavior_over_time_chart(
            "BOT-T-NUM-OK", variable_name="v", points=[{"time": 0, "value": 1.0}, {"time": 1, "value": 2.0}, {"time": 2, "value": 3.0}], provenance=PROVENANCE
        )
        self.assertEqual(len(chart["points"]), 3)

    def test_non_orderable_mixed_time_types_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_TIME_NOT_ORDERABLE"):
            _valid_chart(points=[{"time": "2026-08-10", "value": 1}, {"time": 5, "value": 2}])

    def test_nan_value_is_refused(self):
        bad_points = _points()
        bad_points[0] = {**bad_points[0], "value": float("nan")}
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_VALUE"):
            _valid_chart(points=bad_points)

    def test_infinite_value_is_refused(self):
        bad_points = _points()
        bad_points[0] = {**bad_points[0], "value": float("inf")}
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_VALUE"):
            _valid_chart(points=bad_points)

    def test_boolean_value_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, (int, float)) would silently accept
        True/False as values 1/0. Must be explicitly refused."""
        bad_points = _points()
        bad_points[0] = {**bad_points[0], "value": True}
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_VALUE"):
            _valid_chart(points=bad_points)

    def test_blank_string_time_is_refused(self):
        bad_points = _points()
        bad_points[0] = {**bad_points[0], "time": "   "}
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_TIME"):
            _valid_chart(points=bad_points)

    def test_non_dict_point_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_POINT"):
            _valid_chart(points=["not-a-dict", {"time": "2026-08-10", "value": 1}])


class PointHelperTests(unittest.TestCase):
    def test_valid_point_constructs(self):
        self.assertEqual(point("2026-08-10", 42), {"time": "2026-08-10", "value": 42})

    def test_boolean_time_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_TIME"):
            point(True, 1)

    def test_invalid_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_VALUE"):
            point("t", "not-a-number")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID chart's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_chart(self):
        results = evaluate_behavior_over_time_gates(_valid_chart(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_chronological_gate_catches_hand_tampered_duplicate_timestamp(self):
        record = copy.deepcopy(_valid_chart())
        record["points"] = record["points"][:3] + [dict(record["points"][2])] + record["points"][3:]
        gate = evaluate_chronological_order_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_chronological_gate_catches_hand_tampered_too_few_points(self):
        record = copy.deepcopy(_valid_chart())
        record["points"] = record["points"][:1]
        gate = evaluate_chronological_order_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_chronological_gate_catches_hand_tampered_non_numeric_value(self):
        record = copy.deepcopy(_valid_chart())
        record["points"][0]["value"] = "not-a-number"
        gate = evaluate_chronological_order_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_chronological_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_chronological_order_gate(_valid_chart(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_chronological_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_chronological_order_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_behavior_over_time_gates(bad, "test", "2026-09-11T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_chart(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_chart())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BOT-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_ID"):
            _valid_chart(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_VERSION"):
            generate_behavior_over_time_chart("BOT-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_PROVENANCE"):
            _valid_chart(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_variable_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOT_INVALID_VARIABLE_NAME"):
            _valid_chart(variable_name="   ")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "systems.behavior_over_time")

    def test_evaluate_behavior_over_time_gates_returns_two_gates_in_order(self):
        results = evaluate_behavior_over_time_gates(_valid_chart(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "chronological_order"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        chart = _valid_chart()
        self.assertEqual(
            set(chart.keys()),
            {"id", "version", "generated_by_method", "variable_name", "points", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()

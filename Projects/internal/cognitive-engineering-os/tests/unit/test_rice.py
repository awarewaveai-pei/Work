"""Mutation-style tests for ``decision.rice`` (third Method Atlas slice from the decision family, after
``decision.ahp``/``decision.mcda``).

The compute layer (``ai_lego/compute/rice/scoring.py``) is checked against
a known arithmetic case plus boundary/edge inputs for every one of its 4
factors, including a combination that individually-valid inputs can still
overflow float64 on. Atlas §12.32's own no-automatic-authority rule
(L2965) is proven at BOTH independent layers, the same discipline
``test_mcda.py`` already established for its own table-cited sibling rule.
The ``genuine_compute`` gate is proven to actually RE-DERIVE ``rice_score``
from the record's own raw fields (not merely check shape/resolvability the
way ``decision.mcda``/``decision.ahp``'s own gate does) via a battery of
hand-tampered records.
"""

from __future__ import annotations

import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.rice.scoring import compute_rice_score
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.rice import (
    FORBIDDEN_AUTHORITY_KEYS,
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_no_automatic_authority_gate,
    evaluate_provenance_required_gate,
    evaluate_reach_unit_required_gate,
    evaluate_rice_gates,
    evaluate_rice_genuine_compute_gate,
    generate_rice_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RICE_SCORE_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/rice-score-record.schema.yaml"
GATE_RESULT_SCHEMA = "ai-lego://specs/execution/gate.schema.yaml#/gate_result"
TS = "2026-09-08T00:00:00Z"


def _idea():
    return {"id": "IDEA-1", "label": "onboarding checklist"}


def _reach(value=1200, unit="users/quarter"):
    return {"value": value, "unit": unit}


def _provenance():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _valid_record(**overrides):
    kwargs = dict(record_id="RICE-T-001", idea=_idea(), reach=_reach(), impact=2, confidence=0.8, effort=3, provenance=_provenance())
    kwargs.update(overrides)
    return generate_rice_record(**kwargs)


class ComputeLayerArithmeticTests(unittest.TestCase):
    """Real arithmetic against known cases, not just 'does it run'."""

    def test_known_case_computes_correctly(self):
        self.assertEqual(compute_rice_score(1200, 2, 0.8, 3), 640.0)  # (1200*2*0.8)/3 = 1920/3

    def test_zero_reach_yields_zero_score(self):
        self.assertEqual(compute_rice_score(0, 5, 1.0, 2), 0.0)

    def test_zero_impact_yields_zero_score(self):
        self.assertEqual(compute_rice_score(100, 0, 1.0, 2), 0.0)

    def test_zero_confidence_yields_zero_score(self):
        self.assertEqual(compute_rice_score(100, 5, 0.0, 2), 0.0)

    def test_confidence_of_one_applies_full_multiplier(self):
        self.assertEqual(compute_rice_score(10, 10, 1.0, 5), 20.0)

    def test_result_rounded_to_eight_decimals(self):
        result = compute_rice_score(1, 1, 1 / 3, 3)
        self.assertEqual(result, round((1 * 1 * (1 / 3)) / 3, 8))

    def test_large_but_finite_inputs_compute_without_error(self):
        self.assertEqual(compute_rice_score(1_000_000, 3, 1.0, 2), 1_500_000.0)

    def test_tiny_positive_effort_is_not_floored(self):
        """The task's own invariant: no silent floor. A tiny effort produces a large, not clamped, score."""
        self.assertEqual(compute_rice_score(10, 1, 1.0, 0.001), 10000.0)

    def test_integer_inputs_accepted(self):
        self.assertEqual(compute_rice_score(10, 2, 1, 5), 4.0)


class ComputeLayerEffortInvariantTests(unittest.TestCase):
    """Invariant #1: Effort must be > 0, rejected explicitly, never silently floored."""

    def test_zero_effort_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_NONPOSITIVE_EFFORT"):
            compute_rice_score(100, 2, 0.5, 0)

    def test_negative_effort_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_NONPOSITIVE_EFFORT"):
            compute_rice_score(100, 2, 0.5, -3)

    def test_tiny_negative_effort_is_not_silently_made_positive(self):
        """A negative effort must not be treated as its absolute value -- it is rejected, not repaired."""
        with self.assertRaises(InvariantViolation):
            compute_rice_score(100, 2, 0.5, -0.001)

    def test_effort_of_bool_true_is_refused(self):
        """bool is a subclass of int in Python -- True must not silently pass as effort=1."""
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_EFFORT"):
            compute_rice_score(100, 2, 0.5, True)

    def test_effort_of_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_EFFORT"):
            compute_rice_score(100, 2, 0.5, float("nan"))

    def test_effort_of_infinity_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_EFFORT"):
            compute_rice_score(100, 2, 0.5, float("inf"))

    def test_effort_of_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_EFFORT"):
            compute_rice_score(100, 2, 0.5, None)

    def test_effort_of_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_EFFORT"):
            compute_rice_score(100, 2, 0.5, "3")


class ComputeLayerOtherFactorValidationTests(unittest.TestCase):
    def test_negative_reach_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_NEGATIVE_REACH"):
            compute_rice_score(-1, 2, 0.5, 3)

    def test_negative_impact_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_NEGATIVE_IMPACT"):
            compute_rice_score(100, -2, 0.5, 3)

    def test_confidence_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_CONFIDENCE_OUT_OF_RANGE"):
            compute_rice_score(100, 2, 1.5, 3)

    def test_confidence_below_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_CONFIDENCE_OUT_OF_RANGE"):
            compute_rice_score(100, 2, -0.1, 3)

    def test_reach_value_of_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH_VALUE"):
            compute_rice_score(float("nan"), 2, 0.5, 3)

    def test_reach_value_of_infinity_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH_VALUE"):
            compute_rice_score(float("inf"), 2, 0.5, 3)

    def test_reach_value_of_bool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH_VALUE"):
            compute_rice_score(True, 2, 0.5, 3)

    def test_impact_of_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IMPACT"):
            compute_rice_score(100, float("nan"), 0.5, 3)

    def test_impact_of_bool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IMPACT"):
            compute_rice_score(100, False, 0.5, 3)

    def test_confidence_of_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_CONFIDENCE"):
            compute_rice_score(100, 2, float("nan"), 3)

    def test_confidence_of_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_CONFIDENCE"):
            compute_rice_score(100, 2, None, 3)


class ComputeLayerOverflowTests(unittest.TestCase):
    """Individually-valid inputs whose COMBINATION overflows float64 -- rejected, not silently returned as inf."""

    def test_overflowing_combination_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_SCORE_OVERFLOW"):
            compute_rice_score(1e200, 1e200, 1.0, 1e-200)

    def test_non_overflowing_extreme_combination_still_computes(self):
        result = compute_rice_score(1e10, 1e10, 1.0, 1e-10)
        self.assertTrue(math.isfinite(result))


class GenerateRiceRecordConstructionTests(unittest.TestCase):
    def test_valid_record_validates_against_the_real_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        contracts.validate(RICE_SCORE_RECORD_SCHEMA, _valid_record(), "rice score record")

    def test_rice_score_matches_manual_calculation(self):
        record = _valid_record(reach=_reach(1200), impact=2, confidence=0.8, effort=3)
        self.assertEqual(record["rice_score"], 640.0)

    def test_record_id_must_start_with_prefix(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_RECORD_ID"):
            _valid_record(record_id="NOT-RICE-001")

    def test_record_id_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_RECORD_ID"):
            _valid_record(record_id="")

    def test_record_id_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_RECORD_ID"):
            _valid_record(record_id=None)

    def test_version_must_be_a_string(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_VERSION"):
            _valid_record(version=1.0)

    def test_idea_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IDEA"):
            _valid_record(idea={"id": "IDEA-1"})

    def test_idea_missing_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IDEA"):
            _valid_record(idea={"label": "x"})

    def test_idea_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IDEA"):
            _valid_record(idea={"id": "IDEA-1", "label": "x", "extra": "y"})

    def test_idea_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IDEA"):
            _valid_record(idea={"id": "IDEA-1", "label": "   "})

    def test_idea_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_IDEA"):
            _valid_record(idea="IDEA-1")

    def test_reach_missing_unit_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH\\b"):
            _valid_record(reach={"value": 100})

    def test_reach_missing_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH\\b"):
            _valid_record(reach={"unit": "users/quarter"})

    def test_reach_empty_unit_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH\\b"):
            _valid_record(reach={"value": 100, "unit": "  "})

    def test_reach_negative_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH\\b"):
            _valid_record(reach={"value": -5, "unit": "users/quarter"})

    def test_reach_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH\\b"):
            _valid_record(reach={"value": 100, "unit": "users/quarter", "extra": 1})

    def test_reach_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_INVALID_REACH\\b"):
            _valid_record(reach=100)

    def test_nonpositive_effort_propagates_from_compute_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_NONPOSITIVE_EFFORT"):
            _valid_record(effort=0)

    def test_out_of_range_confidence_propagates_from_compute_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "RICE_CONFIDENCE_OUT_OF_RANGE"):
            _valid_record(confidence=1.5)

    def test_generated_by_method_defaults_correctly(self):
        self.assertEqual(_valid_record()["generated_by_method"], "decision.rice")

    def test_version_defaults_to_one_zero_zero(self):
        self.assertEqual(_valid_record()["version"], "1.0.0")

    def test_custom_version_is_accepted(self):
        self.assertEqual(_valid_record(version="2.1.0")["version"], "2.1.0")

    def test_engine_field_is_the_deterministic_compute_literal(self):
        self.assertEqual(_valid_record()["engine"], "local_python_deterministic_compute")

    def test_computation_provenance_ref_points_at_compute_rice_score(self):
        self.assertEqual(_valid_record()["computation_provenance_ref"], "ai_lego.compute.rice.scoring.compute_rice_score")

    def test_idea_and_reach_are_copied_not_aliased(self):
        idea, reach = _idea(), _reach()
        record = _valid_record(idea=idea, reach=reach)
        record["idea"]["label"] = "mutated"
        record["reach"]["unit"] = "mutated"
        self.assertNotEqual(idea["label"], "mutated")
        self.assertNotEqual(reach["unit"], "mutated")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(resolve_spec_root())
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_rice_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class NoAutomaticAuthorityTests(unittest.TestCase):
    """Atlas §12.32 L2965: 'RICE 分數是 decision aid，不是 authority.' Proven at both independent layers, same
    discipline test_mcda.py's own NoAutomaticAuthorityTests class already established for a sibling rule."""

    def test_clean_record_passes_the_authority_check(self):
        assert_no_automatic_authority_claim(_valid_record())  # must not raise

    def test_each_forbidden_key_is_individually_refused_at_construction(self):
        for key in sorted(FORBIDDEN_AUTHORITY_KEYS):
            with self.subTest(key=key):
                record = _valid_record()
                record[key] = True
                with self.assertRaisesRegex(InvariantViolation, "RICE_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
                    assert_no_automatic_authority_claim(record)

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(RICE_SCORE_RECORD_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_fails_on_a_tampered_record(self):
        record = _valid_record()
        record["decision"] = "ship it"
        gate = evaluate_no_automatic_authority_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_on_a_clean_record(self):
        gate = evaluate_no_automatic_authority_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_no_automatic_authority_gate("not a dict", "test", TS)
        self.assertEqual(gate["status"], "FAIL")


class GenuineComputeGateTests(unittest.TestCase):
    """Invariant #2: the gate RE-INVOKES compute_rice_score against the record's own raw fields and compares
    to the stored rice_score -- never trusts it. Strictly stronger than decision.mcda/decision.ahp's own
    genuine_compute gate (mcda.py:119-124, ahp.py:104-108), which checks only shape/resolvability."""

    def test_valid_record_passes_the_gate(self):
        gate = evaluate_rice_genuine_compute_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_inflated_rice_score_is_caught(self):
        record = _valid_record()
        record["rice_score"] = record["rice_score"] * 1000
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_deflated_rice_score_is_caught(self):
        record = _valid_record()
        record["rice_score"] = 0.0001
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_reach_value_without_recomputed_score_is_caught(self):
        """A caller who edits reach.value but forgets to recompute rice_score must be caught."""
        record = _valid_record()
        record["reach"]["value"] = 999999
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_effort_to_zero_is_caught_without_crashing(self):
        record = _valid_record()
        record["effort"] = 0
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["effort_positive"])

    def test_tampered_effort_to_negative_is_caught_without_crashing(self):
        record = _valid_record()
        record["effort"] = -3
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["effort_positive"])

    def test_tampered_confidence_out_of_range_is_caught(self):
        record = _valid_record()
        record["confidence"] = 5.0
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["confidence_valid"])

    def test_tampered_reach_missing_unit_is_caught(self):
        record = _valid_record()
        del record["reach"]["unit"]
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_engine_field_is_caught(self):
        record = _valid_record()
        record["engine"] = "llm_mental_math"
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["engine_is_deterministic_compute_not_llm"])

    def test_tampered_computation_provenance_ref_is_caught(self):
        record = _valid_record()
        record["computation_provenance_ref"] = "ai_lego.compute.nonexistent.nope"
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["computation_provenance_ref_resolves"])

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_rice_genuine_compute_gate(None, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_a_stored_score_that_overflowed_before_recompute_is_even_attempted(self):
        """A hand-crafted record whose raw fields individually pass shape/range checks but whose
        combination overflows float64 -- the gate must not crash, and must report the recompute failure."""
        record = _valid_record()
        record["reach"]["value"] = 1e200
        record["impact"] = 1e200
        record["effort"] = 1e-200
        record["confidence"] = 1.0
        record["rice_score"] = 123.0  # any stored value -- the recompute itself fails first
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["recompute_succeeded"])
        self.assertIn("RICE_SCORE_OVERFLOW", gate["evidence"][1]["recompute_error"])

    def test_gate_reports_both_recomputed_and_stored_values_as_evidence(self):
        record = _valid_record()
        record["rice_score"] = 1.0
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertIn("recomputed_rice_score", gate["evidence"][1])
        self.assertIn("stored_rice_score", gate["evidence"][1])
        self.assertEqual(gate["evidence"][1]["stored_rice_score"], 1.0)

    def test_this_gate_is_strictly_stronger_than_a_resolvability_only_check(self):
        """A record with a schema-valid, resolvable computation_provenance_ref but a WRONG stored score
        would pass decision.mcda/decision.ahp's own resolvability-only genuine_compute gate design -- this
        gate must still catch it."""
        record = _valid_record()
        record["rice_score"] = record["rice_score"] + 1.0
        self.assertTrue(record["computation_provenance_ref"].startswith("ai_lego.compute."))  # ref still resolves
        gate = evaluate_rice_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")


class ReachUnitRequiredGateTests(unittest.TestCase):
    """Atlas F16 table (L762): '納入受影響人數' -- reach.unit presence, disclosure-only (same honesty
    decision.mcda's own sensitivity_disclosed gate applies to its differently-cited requirement)."""

    def test_valid_record_passes(self):
        gate = evaluate_reach_unit_required_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_missing_unit_fails(self):
        record = _valid_record()
        del record["reach"]["unit"]
        gate = evaluate_reach_unit_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_blank_unit_fails(self):
        record = _valid_record()
        record["reach"]["unit"] = "   "
        gate = evaluate_reach_unit_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_reach_not_a_dict_fails_closed(self):
        record = _valid_record()
        record["reach"] = "1200 users"
        gate = evaluate_reach_unit_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_reach_unit_required_gate([], "test", TS)
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceRequiredGateTests(unittest.TestCase):
    def test_valid_record_passes(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_missing_provenance_fails(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_malformed_provenance_fails(self):
        record = _valid_record()
        record["provenance"] = {"epistemic_type": "NOT_REAL"}
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_provenance_required_gate(42, "test", TS)
        self.assertEqual(gate["status"], "FAIL")


class EvaluateRiceGatesTests(unittest.TestCase):
    def test_valid_record_passes_all_four_gates(self):
        results = evaluate_rice_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "reach_unit_required", "no_automatic_authority_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_gates_returned_in_a_stable_order(self):
        results = evaluate_rice_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "genuine_compute", "reach_unit_required", "no_automatic_authority_claim"])

    def test_all_gates_pass_returns_false_when_any_gate_fails(self):
        record = _valid_record()
        record["effort"] = -1
        results = evaluate_rice_gates(record, "test", TS)
        self.assertFalse(all_gates_pass(results))

    def test_every_gate_result_validates_against_the_gate_result_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        results = evaluate_rice_gates(_valid_record(), "test", TS)
        for gate in results:
            with self.subTest(gate_id=gate["gate_id"]):
                contracts.validate(GATE_RESULT_SCHEMA, gate, f"rice gate {gate['gate_id']}")


if __name__ == "__main__":
    unittest.main()

"""Mutation-style tests for ``decision.wsjf`` (12th Method Atlas slice from the decision family).

The compute layer (``ai_lego/compute/wsjf/scoring.py``) is checked against a
known arithmetic case plus boundary/edge inputs for every one of its 4 raw
factors (business_value/time_criticality/risk_reduction_opportunity_enablement/
job_size), including combinations that individually-valid inputs can still
overflow float64 on -- at BOTH the cost-of-delay-sum stage and the
final-division stage independently, since WSJF (unlike ``decision.rice``)
has two separate arithmetic steps each capable of overflowing on its own.
The inferred no-automatic-authority rule is proven at both independent
layers, the same discipline ``test_rice.py`` already established for its
own (more strongly cited) sibling rule. The ``genuine_compute`` gate is
proven to actually RE-DERIVE BOTH ``cost_of_delay_total`` AND ``wsjf_score``
from the record's own raw fields (not merely check shape/resolvability the
way ``decision.mcda``/``decision.ahp``'s own gate does) via a battery of
hand-tampered records.
"""

from __future__ import annotations

import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.wsjf.scoring import compute_cost_of_delay, compute_wsjf_score
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.wsjf import (
    FORBIDDEN_AUTHORITY_KEYS,
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_cost_of_delay_breakdown_disclosed_gate,
    evaluate_no_automatic_authority_gate,
    evaluate_provenance_required_gate,
    evaluate_wsjf_gates,
    evaluate_wsjf_genuine_compute_gate,
    generate_wsjf_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

WSJF_SCORE_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/wsjf-score-record.schema.yaml"
GATE_RESULT_SCHEMA = "ai-lego://specs/execution/gate.schema.yaml#/gate_result"
TS = "2026-09-08T00:00:00Z"


def _job():
    return {"id": "JOB-1", "label": "API rate-limiting fix"}


def _cost_of_delay(business_value=5, time_criticality=3, risk_reduction_opportunity_enablement=2):
    return {"business_value": business_value, "time_criticality": time_criticality, "risk_reduction_opportunity_enablement": risk_reduction_opportunity_enablement}


def _provenance():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _valid_record(**overrides):
    kwargs = dict(record_id="WSJF-T-001", job=_job(), cost_of_delay=_cost_of_delay(), job_size=4, provenance=_provenance())
    kwargs.update(overrides)
    return generate_wsjf_record(**kwargs)


class ComputeLayerArithmeticTests(unittest.TestCase):
    """Real arithmetic against known cases, not just 'does it run'."""

    def test_known_cost_of_delay_computes_correctly(self):
        self.assertEqual(compute_cost_of_delay(5, 3, 2), 10.0)

    def test_known_wsjf_score_computes_correctly(self):
        self.assertEqual(compute_wsjf_score(5, 3, 2, 4), 2.5)  # (5+3+2)/4 = 10/4

    def test_zero_all_factors_yields_zero_cost_of_delay(self):
        self.assertEqual(compute_cost_of_delay(0, 0, 0), 0.0)

    def test_zero_all_factors_yields_zero_wsjf_score(self):
        self.assertEqual(compute_wsjf_score(0, 0, 0, 5), 0.0)

    def test_one_zero_factor_still_contributes_the_other_two(self):
        """Additive, not multiplicative -- a single zero factor does not collapse the whole sum to zero
        (the real WSJF-vs-RICE arithmetic-shape distinction this module's own docstring documents)."""
        self.assertEqual(compute_cost_of_delay(0, 3, 2), 5.0)

    def test_integer_inputs_accepted(self):
        self.assertEqual(compute_wsjf_score(2, 3, 5, 10), 1.0)

    def test_result_rounded_to_eight_decimals(self):
        result = compute_wsjf_score(1, 0, 0, 3)
        self.assertEqual(result, round(1 / 3, 8))

    def test_cost_of_delay_rounded_to_eight_decimals(self):
        result = compute_cost_of_delay(1 / 3, 1 / 3, 1 / 3)
        self.assertEqual(result, round((1 / 3) + (1 / 3) + (1 / 3), 8))

    def test_large_but_finite_inputs_compute_without_error(self):
        self.assertEqual(compute_wsjf_score(1_000_000, 0, 0, 2), 500_000.0)

    def test_tiny_positive_job_size_is_not_floored(self):
        """The task's own invariant: no silent floor. A tiny job_size produces a large, not clamped, score."""
        self.assertEqual(compute_wsjf_score(10, 0, 0, 0.001), 10000.0)


class ComputeLayerJobSizeInvariantTests(unittest.TestCase):
    """Invariant #1: Job Size must be > 0, rejected explicitly, never silently floored."""

    def test_zero_job_size_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_NONPOSITIVE_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, 0)

    def test_negative_job_size_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_NONPOSITIVE_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, -3)

    def test_tiny_negative_job_size_is_not_silently_made_positive(self):
        """A negative job_size must not be treated as its absolute value -- it is rejected, not repaired."""
        with self.assertRaises(InvariantViolation):
            compute_wsjf_score(5, 3, 2, -0.001)

    def test_job_size_of_bool_true_is_refused(self):
        """bool is a subclass of int in Python -- True must not silently pass as job_size=1."""
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, True)

    def test_job_size_of_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, float("nan"))

    def test_job_size_of_infinity_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, float("inf"))

    def test_job_size_of_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, None)

    def test_job_size_of_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB_SIZE"):
            compute_wsjf_score(5, 3, 2, "3")


class ComputeLayerCostOfDelayFactorValidationTests(unittest.TestCase):
    def test_negative_business_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_NEGATIVE_BUSINESS_VALUE"):
            compute_cost_of_delay(-1, 3, 2)

    def test_negative_time_criticality_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_NEGATIVE_TIME_CRITICALITY"):
            compute_cost_of_delay(5, -3, 2)

    def test_negative_risk_reduction_opportunity_enablement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_NEGATIVE_RISK_REDUCTION_OPPORTUNITY_ENABLEMENT"):
            compute_cost_of_delay(5, 3, -2)

    def test_business_value_of_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_BUSINESS_VALUE"):
            compute_cost_of_delay(float("nan"), 3, 2)

    def test_business_value_of_bool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_BUSINESS_VALUE"):
            compute_cost_of_delay(True, 3, 2)

    def test_time_criticality_of_infinity_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_TIME_CRITICALITY"):
            compute_cost_of_delay(5, float("inf"), 2)

    def test_time_criticality_of_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_TIME_CRITICALITY"):
            compute_cost_of_delay(5, None, 2)

    def test_risk_reduction_opportunity_enablement_of_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_RISK_REDUCTION_OPPORTUNITY_ENABLEMENT"):
            compute_cost_of_delay(5, 3, "2")

    def test_risk_reduction_opportunity_enablement_of_bool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_RISK_REDUCTION_OPPORTUNITY_ENABLEMENT"):
            compute_cost_of_delay(5, 3, False)


class ComputeLayerOverflowTests(unittest.TestCase):
    """Individually-valid inputs whose COMBINATION overflows float64 -- rejected, not silently returned as
    inf. WSJF has TWO independent arithmetic stages (sum, then divide), each tested separately -- a real
    structural difference from decision.rice's own single-stage formula."""

    def test_overflowing_sum_is_refused_at_the_cost_of_delay_stage(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_COST_OF_DELAY_OVERFLOW"):
            compute_cost_of_delay(1e308, 1e308, 1e308)

    def test_overflowing_division_is_refused_at_the_score_stage(self):
        """cost_of_delay itself is finite here (1e300) -- only the DIVISION by a tiny job_size overflows."""
        with self.assertRaisesRegex(InvariantViolation, "WSJF_SCORE_OVERFLOW"):
            compute_wsjf_score(1e300, 0, 0, 1e-300)

    def test_non_overflowing_extreme_combination_still_computes(self):
        result = compute_wsjf_score(1e10, 0, 0, 1e-10)
        self.assertTrue(math.isfinite(result))


class GenerateWsjfRecordConstructionTests(unittest.TestCase):
    def test_valid_record_validates_against_the_real_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        contracts.validate(WSJF_SCORE_RECORD_SCHEMA, _valid_record(), "wsjf score record")

    def test_cost_of_delay_total_matches_manual_calculation(self):
        record = _valid_record(cost_of_delay=_cost_of_delay(5, 3, 2), job_size=4)
        self.assertEqual(record["cost_of_delay_total"], 10.0)

    def test_wsjf_score_matches_manual_calculation(self):
        record = _valid_record(cost_of_delay=_cost_of_delay(5, 3, 2), job_size=4)
        self.assertEqual(record["wsjf_score"], 2.5)

    def test_record_id_must_start_with_prefix(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_RECORD_ID"):
            _valid_record(record_id="NOT-WSJF-001")

    def test_record_id_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_RECORD_ID"):
            _valid_record(record_id="")

    def test_record_id_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_RECORD_ID"):
            _valid_record(record_id=None)

    def test_version_must_be_a_string(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_VERSION"):
            _valid_record(version=1.0)

    def test_job_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB\\b"):
            _valid_record(job={"id": "JOB-1"})

    def test_job_missing_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB\\b"):
            _valid_record(job={"label": "x"})

    def test_job_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB\\b"):
            _valid_record(job={"id": "JOB-1", "label": "x", "extra": "y"})

    def test_job_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB\\b"):
            _valid_record(job={"id": "JOB-1", "label": "   "})

    def test_job_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_JOB\\b"):
            _valid_record(job="JOB-1")

    def test_cost_of_delay_missing_business_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_COST_OF_DELAY"):
            _valid_record(cost_of_delay={"time_criticality": 3, "risk_reduction_opportunity_enablement": 2})

    def test_cost_of_delay_missing_time_criticality_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_COST_OF_DELAY"):
            _valid_record(cost_of_delay={"business_value": 5, "risk_reduction_opportunity_enablement": 2})

    def test_cost_of_delay_missing_risk_reduction_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_COST_OF_DELAY"):
            _valid_record(cost_of_delay={"business_value": 5, "time_criticality": 3})

    def test_cost_of_delay_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_COST_OF_DELAY"):
            _valid_record(cost_of_delay={"business_value": 5, "time_criticality": 3, "risk_reduction_opportunity_enablement": 2, "extra": 1})

    def test_cost_of_delay_negative_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_COST_OF_DELAY"):
            _valid_record(cost_of_delay={"business_value": -5, "time_criticality": 3, "risk_reduction_opportunity_enablement": 2})

    def test_cost_of_delay_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_INVALID_COST_OF_DELAY"):
            _valid_record(cost_of_delay=10)

    def test_nonpositive_job_size_propagates_from_compute_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "WSJF_NONPOSITIVE_JOB_SIZE"):
            _valid_record(job_size=0)

    def test_generated_by_method_defaults_correctly(self):
        self.assertEqual(_valid_record()["generated_by_method"], "decision.wsjf")

    def test_version_defaults_to_one_zero_zero(self):
        self.assertEqual(_valid_record()["version"], "1.0.0")

    def test_custom_version_is_accepted(self):
        self.assertEqual(_valid_record(version="2.1.0")["version"], "2.1.0")

    def test_engine_field_is_the_deterministic_compute_literal(self):
        self.assertEqual(_valid_record()["engine"], "local_python_deterministic_compute")

    def test_computation_provenance_ref_points_at_compute_wsjf_score(self):
        self.assertEqual(_valid_record()["computation_provenance_ref"], "ai_lego.compute.wsjf.scoring.compute_wsjf_score")

    def test_job_and_cost_of_delay_are_copied_not_aliased(self):
        job, cost_of_delay = _job(), _cost_of_delay()
        record = _valid_record(job=job, cost_of_delay=cost_of_delay)
        record["job"]["label"] = "mutated"
        record["cost_of_delay"]["business_value"] = 999
        self.assertNotEqual(job["label"], "mutated")
        self.assertNotEqual(cost_of_delay["business_value"], 999)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(resolve_spec_root())
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_wsjf_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class NoAutomaticAuthorityTests(unittest.TestCase):
    """The inferred no-automatic-authority rule (weakest-grounded citation in the family -- see the
    module's own docstring), proven at both independent layers regardless of citation strength, same
    discipline test_rice.py's own NoAutomaticAuthorityTests class already established for its own (more
    strongly cited) sibling rule."""

    def test_clean_record_passes_the_authority_check(self):
        assert_no_automatic_authority_claim(_valid_record())  # must not raise

    def test_each_forbidden_key_is_individually_refused_at_construction(self):
        for key in sorted(FORBIDDEN_AUTHORITY_KEYS):
            with self.subTest(key=key):
                record = _valid_record()
                record[key] = True
                with self.assertRaisesRegex(InvariantViolation, "WSJF_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
                    assert_no_automatic_authority_claim(record)

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(WSJF_SCORE_RECORD_SCHEMA, tampered, "hand-crafted bypass")

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
    """Invariant #2: the gate RE-INVOKES compute_cost_of_delay AND compute_wsjf_score against the record's
    own raw fields and compares BOTH to the stored cost_of_delay_total/wsjf_score -- never trusts either.
    Strictly stronger than decision.mcda/decision.ahp's own genuine_compute gate (shape/resolvability only)
    and extends decision.rice's own single-quantity recompute-and-compare gate to two quantities."""

    def test_valid_record_passes_the_gate(self):
        gate = evaluate_wsjf_genuine_compute_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_inflated_wsjf_score_is_caught(self):
        record = _valid_record()
        record["wsjf_score"] = record["wsjf_score"] * 1000
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["stored_wsjf_score_matches_recomputed_value"])

    def test_deflated_wsjf_score_is_caught(self):
        record = _valid_record()
        record["wsjf_score"] = 0.0001
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_inflated_cost_of_delay_total_is_caught_even_when_wsjf_score_is_untouched(self):
        """A caller who tampers with the intermediate cost_of_delay_total but leaves the final wsjf_score
        alone must still be caught -- proving the gate re-derives BOTH quantities independently, not just
        the final ratio."""
        record = _valid_record()
        record["cost_of_delay_total"] = record["cost_of_delay_total"] * 1000
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["stored_cost_of_delay_total_matches_recomputed_value"])

    def test_deflated_cost_of_delay_total_is_caught(self):
        record = _valid_record()
        record["cost_of_delay_total"] = 0.0001
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_cost_of_delay_subfactor_without_recomputed_totals_is_caught(self):
        """A caller who edits cost_of_delay.business_value but forgets to recompute cost_of_delay_total/
        wsjf_score must be caught."""
        record = _valid_record()
        record["cost_of_delay"]["business_value"] = 999999
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_job_size_to_zero_is_caught_without_crashing(self):
        record = _valid_record()
        record["job_size"] = 0
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["job_size_positive"])

    def test_tampered_job_size_to_negative_is_caught_without_crashing(self):
        record = _valid_record()
        record["job_size"] = -3
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["job_size_positive"])

    def test_tampered_cost_of_delay_missing_key_is_caught(self):
        record = _valid_record()
        del record["cost_of_delay"]["time_criticality"]
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["cost_of_delay_valid"])

    def test_tampered_engine_field_is_caught(self):
        record = _valid_record()
        record["engine"] = "llm_mental_math"
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["engine_is_deterministic_compute_not_llm"])

    def test_tampered_computation_provenance_ref_is_caught(self):
        record = _valid_record()
        record["computation_provenance_ref"] = "ai_lego.compute.nonexistent.nope"
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["computation_provenance_ref_resolves"])

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_wsjf_genuine_compute_gate(None, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_a_stored_score_that_overflowed_before_recompute_is_even_attempted(self):
        """A hand-crafted record whose raw fields individually pass shape/range checks but whose
        combination overflows float64 -- the gate must not crash, and must report the recompute failure."""
        record = _valid_record()
        record["cost_of_delay"]["business_value"] = 1e300
        record["cost_of_delay"]["time_criticality"] = 0
        record["cost_of_delay"]["risk_reduction_opportunity_enablement"] = 0
        record["job_size"] = 1e-300
        record["cost_of_delay_total"] = 1e300
        record["wsjf_score"] = 123.0  # any stored value -- the recompute itself fails first
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["recompute_succeeded"])
        self.assertIn("WSJF_SCORE_OVERFLOW", gate["evidence"][1]["recompute_error"])

    def test_gate_reports_all_recomputed_and_stored_values_as_evidence(self):
        record = _valid_record()
        record["wsjf_score"] = 1.0
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertIn("recomputed_cost_of_delay_total", gate["evidence"][1])
        self.assertIn("stored_cost_of_delay_total", gate["evidence"][1])
        self.assertIn("recomputed_wsjf_score", gate["evidence"][1])
        self.assertIn("stored_wsjf_score", gate["evidence"][1])
        self.assertEqual(gate["evidence"][1]["stored_wsjf_score"], 1.0)

    def test_this_gate_is_strictly_stronger_than_a_resolvability_only_check(self):
        """A record with a schema-valid, resolvable computation_provenance_ref but a WRONG stored score
        would pass decision.mcda/decision.ahp's own resolvability-only genuine_compute gate design -- this
        gate must still catch it."""
        record = _valid_record()
        record["wsjf_score"] = record["wsjf_score"] + 1.0
        self.assertTrue(record["computation_provenance_ref"].startswith("ai_lego.compute."))  # ref still resolves
        gate = evaluate_wsjf_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")


class CostOfDelayBreakdownDisclosedGateTests(unittest.TestCase):
    """Atlas F16 table (L764): '突出延遲成本' -- cost_of_delay's full 3-factor breakdown presence,
    disclosure-only (same honesty decision.rice's own reach_unit_required gate applies to its
    differently-cited requirement)."""

    def test_valid_record_passes(self):
        gate = evaluate_cost_of_delay_breakdown_disclosed_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_missing_subfactor_fails(self):
        for key in ("business_value", "time_criticality", "risk_reduction_opportunity_enablement"):
            with self.subTest(key=key):
                record = _valid_record()
                del record["cost_of_delay"][key]
                gate = evaluate_cost_of_delay_breakdown_disclosed_gate(record, "test", TS)
                self.assertEqual(gate["status"], "FAIL")

    def test_negative_subfactor_fails(self):
        record = _valid_record()
        record["cost_of_delay"]["business_value"] = -1
        gate = evaluate_cost_of_delay_breakdown_disclosed_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_cost_of_delay_not_a_dict_fails_closed(self):
        record = _valid_record()
        record["cost_of_delay"] = "10 points"
        gate = evaluate_cost_of_delay_breakdown_disclosed_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_cost_of_delay_breakdown_disclosed_gate([], "test", TS)
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


class EvaluateWsjfGatesTests(unittest.TestCase):
    def test_valid_record_passes_all_four_gates(self):
        results = evaluate_wsjf_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "cost_of_delay_breakdown_disclosed", "no_automatic_authority_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_gates_returned_in_a_stable_order(self):
        results = evaluate_wsjf_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "genuine_compute", "cost_of_delay_breakdown_disclosed", "no_automatic_authority_claim"])

    def test_all_gates_pass_returns_false_when_any_gate_fails(self):
        record = _valid_record()
        record["job_size"] = -1
        results = evaluate_wsjf_gates(record, "test", TS)
        self.assertFalse(all_gates_pass(results))

    def test_every_gate_result_validates_against_the_gate_result_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        results = evaluate_wsjf_gates(_valid_record(), "test", TS)
        for gate in results:
            with self.subTest(gate_id=gate["gate_id"]):
                contracts.validate(GATE_RESULT_SCHEMA, gate, f"wsjf gate {gate['gate_id']}")


if __name__ == "__main__":
    unittest.main()

"""Mutation-style tests for ``delivery.change_risk_matrix`` (F22 PM/Delivery/Governance Pack, Atlas L922).

Atlas's own "高風險自動增加控制" benefit is proven at BOTH independent
layers: the construction-time builder mechanically DERIVES (never accepts)
risk_tier from the 5 factors via a worst-of-5 rule, and refuses an
under-controlled required_controls declaration for the derived tier; the
independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already
ran. A dedicated ``ControlBaselineMonotonicityTests`` class proves the 3
tier baselines are nested by construction, not merely asserted.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.change_risk_matrix import (
    HIGH_CONTROL_BASELINE,
    LOW_CONTROL_BASELINE,
    MEDIUM_CONTROL_BASELINE,
    METHOD_ID,
    MINIMUM_CONTROLS_BY_TIER,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_change_risk_matrix_gates,
    evaluate_control_sufficiency_gate,
    evaluate_provenance_required_gate,
    evaluate_risk_tier_derivation_gate,
    generate_change_risk_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CHANGE_RISK_MATRIX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/change-risk-matrix-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        change_description="移除舊版付款 API 的 legacy auth fallback",
        factors={"scope": "MEDIUM", "reversibility": "LOW", "data_sensitivity": "HIGH", "traffic_impact": "MEDIUM", "security_impact": "HIGH"},
        required_controls=sorted(HIGH_CONTROL_BASELINE),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_matrix(*, record_id: str = "CRMATRIX-T-001", **overrides: object):
    return generate_change_risk_matrix(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(CHANGE_RISK_MATRIX_SCHEMA, _valid_matrix(), "change risk matrix record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_change_risk_matrix, "CRMATRIX-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.change_risk_matrix.contract.yaml")
        self.assertEqual(matrix["id"], "CRMATRIX-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CHANGE_RISK_MATRIX_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.change_risk_matrix.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.change_risk_matrix contract")


class ControlBaselineMonotonicityTests(unittest.TestCase):
    """The task's own core ask: higher tiers must require a monotonically-larger-or-equal set of controls."""

    def test_low_baseline_is_a_subset_of_medium(self):
        self.assertTrue(LOW_CONTROL_BASELINE <= MEDIUM_CONTROL_BASELINE)

    def test_medium_baseline_is_a_subset_of_high(self):
        self.assertTrue(MEDIUM_CONTROL_BASELINE <= HIGH_CONTROL_BASELINE)

    def test_low_baseline_is_a_subset_of_high(self):
        self.assertTrue(LOW_CONTROL_BASELINE <= HIGH_CONTROL_BASELINE)

    def test_high_baseline_is_strictly_larger_than_medium(self):
        """Not just >=, but a REAL increase -- Atlas's own '自動增加控制' (automatically INCREASES controls)."""
        self.assertTrue(MEDIUM_CONTROL_BASELINE < HIGH_CONTROL_BASELINE)

    def test_medium_baseline_is_strictly_larger_than_low(self):
        self.assertTrue(LOW_CONTROL_BASELINE < MEDIUM_CONTROL_BASELINE)

    def test_minimum_controls_by_tier_covers_all_three_tiers(self):
        self.assertEqual(set(MINIMUM_CONTROLS_BY_TIER.keys()), {"LOW", "MEDIUM", "HIGH"})


class RiskTierDerivationTests(unittest.TestCase):
    """risk_tier must be the worst-of-5 mechanical recomputation, not a narrative override."""

    def test_all_low_factors_derive_low_tier(self):
        matrix = generate_change_risk_matrix(
            "CRMATRIX-T-002",
            change_description="d",
            factors={"scope": "LOW", "reversibility": "LOW", "data_sensitivity": "LOW", "traffic_impact": "LOW", "security_impact": "LOW"},
            required_controls=sorted(LOW_CONTROL_BASELINE),
            provenance=PROVENANCE,
        )
        self.assertEqual(matrix["risk_tier"], "LOW")

    def test_one_high_factor_among_four_lows_derives_high_tier(self):
        """Worst-of-5: a single catastrophic factor dominates, is not diluted by the other 4."""
        matrix = generate_change_risk_matrix(
            "CRMATRIX-T-003",
            change_description="d",
            factors={"scope": "LOW", "reversibility": "LOW", "data_sensitivity": "LOW", "traffic_impact": "LOW", "security_impact": "HIGH"},
            required_controls=sorted(HIGH_CONTROL_BASELINE),
            provenance=PROVENANCE,
        )
        self.assertEqual(matrix["risk_tier"], "HIGH")

    def test_medium_ceiling_with_no_high_derives_medium_tier(self):
        matrix = generate_change_risk_matrix(
            "CRMATRIX-T-004",
            change_description="d",
            factors={"scope": "MEDIUM", "reversibility": "LOW", "data_sensitivity": "LOW", "traffic_impact": "LOW", "security_impact": "LOW"},
            required_controls=sorted(MEDIUM_CONTROL_BASELINE),
            provenance=PROVENANCE,
        )
        self.assertEqual(matrix["risk_tier"], "MEDIUM")

    def test_invalid_factor_level_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["scope"] = "EXTREME"
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_FACTORS"):
            generate_change_risk_matrix("CRMATRIX-T-005", **kwargs)

    def test_missing_factor_is_refused(self):
        kwargs = _kwargs()
        del kwargs["factors"]["scope"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_FACTORS"):
            generate_change_risk_matrix("CRMATRIX-T-006", **kwargs)

    def test_unknown_extra_factor_is_refused(self):
        kwargs = _kwargs()
        kwargs["factors"]["blast_radius"] = "HIGH"
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_FACTORS"):
            generate_change_risk_matrix("CRMATRIX-T-007", **kwargs)


class ControlSufficiencyTests(unittest.TestCase):
    def test_high_tier_with_only_low_baseline_is_refused(self):
        kwargs = _kwargs()
        kwargs["required_controls"] = sorted(LOW_CONTROL_BASELINE)
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INSUFFICIENT_CONTROLS"):
            generate_change_risk_matrix("CRMATRIX-T-008", **kwargs)

    def test_high_tier_with_full_high_baseline_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(matrix["risk_tier"], "HIGH")
        self.assertTrue(HIGH_CONTROL_BASELINE <= set(matrix["required_controls"]))

    def test_high_tier_with_extra_controls_beyond_baseline_is_accepted(self):
        kwargs = _kwargs()
        kwargs["required_controls"] = sorted(HIGH_CONTROL_BASELINE | {"extra_manual_qa_pass"})
        matrix = generate_change_risk_matrix("CRMATRIX-T-009", **kwargs)
        self.assertIn("extra_manual_qa_pass", matrix["required_controls"])

    def test_empty_required_controls_is_refused(self):
        kwargs = _kwargs()
        kwargs["required_controls"] = []
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_CONTROLS"):
            generate_change_risk_matrix("CRMATRIX-T-010", **kwargs)

    def test_duplicate_required_controls_is_refused(self):
        kwargs = _kwargs()
        kwargs["required_controls"] = ["peer_review", "peer_review"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_CONTROLS"):
            generate_change_risk_matrix("CRMATRIX-T-011", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        matrix = generate_change_risk_matrix("CRMATRIX-T-012", **kwargs)
        kwargs["required_controls"].append("MUTATED_AFTER_RETURN")
        self.assertNotIn("MUTATED_AFTER_RETURN", matrix["required_controls"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_matrix(self):
        results = evaluate_change_risk_matrix_gates(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_risk_tier_derivation_gate_catches_hand_downgraded_tier(self):
        record = copy.deepcopy(_valid_matrix())
        record["risk_tier"] = "LOW"
        gate = evaluate_risk_tier_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_risk_tier_derivation_gate_catches_hand_upgraded_tier(self):
        record = copy.deepcopy(
            generate_change_risk_matrix(
                "CRMATRIX-T-013",
                change_description="d",
                factors={"scope": "LOW", "reversibility": "LOW", "data_sensitivity": "LOW", "traffic_impact": "LOW", "security_impact": "LOW"},
                required_controls=sorted(LOW_CONTROL_BASELINE),
                provenance=PROVENANCE,
            )
        )
        record["risk_tier"] = "HIGH"
        gate = evaluate_risk_tier_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_control_sufficiency_gate_catches_hand_stripped_controls(self):
        record = copy.deepcopy(_valid_matrix())
        record["required_controls"] = ["peer_review"]
        gate = evaluate_control_sufficiency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_control_sufficiency_gate_passes_a_genuinely_sufficient_record(self):
        gate = evaluate_control_sufficiency_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_change_risk_matrix_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_matrix())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CRMATRIX-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_ID"):
            _valid_matrix(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_VERSION"):
            generate_change_risk_matrix("CRMATRIX-T-014", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_PROVENANCE"):
            _valid_matrix(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_change_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGE_RISK_INVALID_CHANGE_DESCRIPTION"):
            _valid_matrix(change_description="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.change_risk_matrix")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_change_risk_matrix_gates(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "risk_tier_derivation", "control_sufficiency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(
            set(matrix.keys()),
            {"id", "version", "generated_by_method", "change_description", "factors", "risk_tier", "required_controls", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13/F15 batches found in a majority of their builders -- returning the
    caller's own ``provenance`` dict BY REFERENCE rather than a copy. Guards against regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_matrix()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_change_risk_matrix(base["id"], base["change_description"], base["factors"], base["required_controls"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

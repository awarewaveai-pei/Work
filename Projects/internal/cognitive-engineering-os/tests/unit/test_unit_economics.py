"""Mutation-style tests for ``feasibility.unit_economics`` (F14 feasibility & economics family, sibling method
2/2 built this batch).

THE two real invariants (``ltv_to_cac_ratio`` GENUINE_COMPUTE with ``cac<=0`` refused, and ``scalable``
GENUINE_COMPUTE that MUST be false whenever ``contribution_margin < 0`` -- Atlas section 12.27's own named
failure mode "營收成長但越賣越虧" made structural), plus the structural invariants supporting them (real finite
numbers excluding bool, field-specific ranges, non-empty subject_ref, id/version/provenance shape), exercised
at BOTH layers: construction-time refusal (``generate_unit_economics`` raising a specific
``InvariantViolation`` code, or a plain ``TypeError`` for either GENUINE_COMPUTE smuggling attempt) and
independent gate re-derivation (``evaluate_unit_economics_content_integrity_gate`` catching a hand-tampered raw
dict that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same batch added
(``typed-objects/unit-economics-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import inspect
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.feasibility.unit_economics import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_ltv_to_cac_ratio,
    compute_scalable,
    evaluate_provenance_required_gate,
    evaluate_unit_economics_content_integrity_gate,
    evaluate_unit_economics_gates,
    generate_unit_economics,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

UNIT_ECONOMICS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/unit-economics-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        subject_ref="SaaS 中小企業方案（月訂閱）",
        cac=1200,
        ltv=4200,
        gross_margin=0.72,
        payback_period=8,
        churn_rate=0.03,
        arpu=350,
        contribution_margin=180,
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "UECON-T-001", **overrides: object):
    return generate_unit_economics(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(UNIT_ECONOMICS_SCHEMA, _valid_analysis(), "unit economics analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_unit_economics, "UECON-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.unit_economics.contract.yaml")
        self.assertEqual(analysis["id"], "UECON-T-INVOKE")

    def test_empty_catalog_blocks_unit_economics_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["gross_margin"] = 1.5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(UNIT_ECONOMICS_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_unit_economics_content_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(UNIT_ECONOMICS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_missing_subject_ref(self):
        analysis = _valid_analysis()
        del analysis["subject_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(UNIT_ECONOMICS_SCHEMA, analysis, "analysis with subject_ref removed")

    def test_schema_rejects_cac_at_or_below_zero(self):
        analysis = _valid_analysis()
        analysis["cac"] = 0
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(UNIT_ECONOMICS_SCHEMA, analysis, "analysis with cac=0")

    def test_id_is_distinct_from_a_sibling_f14_machine_id(self):
        self.assertEqual(METHOD_ID, "feasibility.unit_economics")
        self.assertNotEqual(METHOD_ID, "feasibility.tco")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.unit_economics.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.unit_economics contract")


class GenuineComputeTests(unittest.TestCase):
    """ltv_to_cac_ratio and scalable are both GENUINE_COMPUTE -- never accepted as caller-supplied input,
    always derived."""

    def test_builder_signature_has_no_ltv_to_cac_ratio_parameter(self):
        params = inspect.signature(generate_unit_economics).parameters
        self.assertNotIn("ltv_to_cac_ratio", params)

    def test_builder_signature_has_no_scalable_parameter(self):
        params = inspect.signature(generate_unit_economics).parameters
        self.assertNotIn("scalable", params)

    def test_caller_supplied_ltv_to_cac_ratio_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_unit_economics("UECON-T-002", **_kwargs(), ltv_to_cac_ratio=99.0)  # type: ignore[call-arg]

    def test_caller_supplied_scalable_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_unit_economics("UECON-T-003", **_kwargs(), scalable=True)  # type: ignore[call-arg]

    def test_generated_ratio_matches_the_pure_function(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["ltv_to_cac_ratio"], compute_ltv_to_cac_ratio(4200, 1200))

    def test_generated_scalable_matches_the_pure_function(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["scalable"], compute_scalable(180))


class HandComputedWorkedExampleTests(unittest.TestCase):
    def test_ratio_matches_the_hand_computed_fraction(self):
        self.assertEqual(compute_ltv_to_cac_ratio(4200, 1200), 3.5)

    def test_built_analysis_carries_the_hand_computed_ratio_and_scalable(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["ltv_to_cac_ratio"], 3.5)
        self.assertTrue(analysis["scalable"])


class ScalableSharpInvariantTests(unittest.TestCase):
    """Atlas section 12.27's own named failure mode ("營收成長但越賣越虧") made structural: scalable MUST be
    false whenever contribution_margin < 0, regardless of how healthy every other metric looks."""

    def test_negative_contribution_margin_forces_scalable_false(self):
        self.assertFalse(compute_scalable(-25))

    def test_zero_contribution_margin_is_scalable(self):
        self.assertTrue(compute_scalable(0))

    def test_loss_making_record_is_not_scalable_even_with_a_healthy_looking_ratio(self):
        """cac=800, ltv=2400 -> ratio=3.0 (looks healthy in isolation), but contribution_margin=-25 must still
        force scalable=False."""
        analysis = _valid_analysis(cac=800, ltv=2400, contribution_margin=-25)
        self.assertEqual(analysis["ltv_to_cac_ratio"], 3.0)
        self.assertFalse(analysis["scalable"])

    def test_positive_contribution_margin_is_scalable(self):
        analysis = _valid_analysis(contribution_margin=1)
        self.assertTrue(analysis["scalable"])


class NumericValidationTests(unittest.TestCase):
    """Each of the 7 named metrics must be a real finite number, bool excluded (Python's bool is an int
    subclass -- the same documented trap stakeholders.game_theory's own _is_number_excluding_bool guards
    against)."""

    def test_cac_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CAC"):
            _valid_analysis(cac=0)

    def test_cac_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CAC"):
            _valid_analysis(cac=-100)

    def test_cac_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CAC"):
            _valid_analysis(cac=True)

    def test_ltv_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_LTV"):
            _valid_analysis(ltv=-1)

    def test_ltv_zero_is_legal(self):
        analysis = _valid_analysis(ltv=0, contribution_margin=-1)
        self.assertEqual(analysis["ltv_to_cac_ratio"], 0)

    def test_gross_margin_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_GROSS_MARGIN"):
            _valid_analysis(gross_margin=1.5)

    def test_gross_margin_below_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_GROSS_MARGIN"):
            _valid_analysis(gross_margin=-0.1)

    def test_gross_margin_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_GROSS_MARGIN"):
            _valid_analysis(gross_margin=True)

    def test_payback_period_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_PAYBACK_PERIOD"):
            _valid_analysis(payback_period=-1)

    def test_churn_rate_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CHURN_RATE"):
            _valid_analysis(churn_rate=1.1)

    def test_churn_rate_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CHURN_RATE"):
            _valid_analysis(churn_rate=False)

    def test_arpu_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_ARPU"):
            _valid_analysis(arpu=-1)

    def test_contribution_margin_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin="180")

    def test_contribution_margin_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin=float("nan"))

    def test_contribution_margin_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin=float("inf"))

    def test_contribution_margin_boolean_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_CONTRIBUTION_MARGIN"):
            _valid_analysis(contribution_margin=True)

    def test_contribution_margin_negative_is_a_legal_number_by_itself(self):
        """Negative is legal for the FIELD ITSELF -- only scalable's own derived value is forced false, the
        raw contribution_margin is not refused (that's the entire point of this metric)."""
        analysis = _valid_analysis(contribution_margin=-999999)
        self.assertEqual(analysis["contribution_margin"], -999999)

    def test_empty_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_SUBJECT_REF"):
            _valid_analysis(subject_ref="   ")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "UECON-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_VERSION"):
            generate_unit_economics("UECON-T-004", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "UECON_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class ProvenanceAliasingTests(unittest.TestCase):
    def test_mutating_caller_provenance_after_construction_does_not_affect_the_record(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        analysis = _valid_analysis(provenance=provenance)
        provenance["epistemic_type"] = "TAMPERED"
        self.assertEqual(analysis["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_unit_economics_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_wrong_ratio(self):
        record = copy.deepcopy(_valid_analysis())
        record["ltv_to_cac_ratio"] = 99.0  # true ratio for (4200, 1200) is 3.5
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_scalable_true_over_negative_contribution_margin(self):
        """THE sharpest hand-tamper case: a hand-crafted record claims scalable=True while its own stored
        contribution_margin is negative -- must be caught."""
        record = copy.deepcopy(_valid_analysis())
        record["contribution_margin"] = -25
        record["scalable"] = True  # was True for +180, but caller/tamperer left it True after flipping the margin
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_scalable_false_over_non_negative_contribution_margin(self):
        record = copy.deepcopy(_valid_analysis())
        record["scalable"] = False  # contribution_margin is +180 -- should be True
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_a_hand_tampered_record_whose_stored_cac_is_zero(self):
        record = copy.deepcopy(_valid_analysis())
        record["cac"] = 0
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_cac(self):
        record = copy.deepcopy(_valid_analysis())
        record["cac"] = True
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        record["extra_field"] = "smuggled"
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        del record["arpu"]
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42, True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_unit_economics_content_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_analysis())
        record["ltv_to_cac_ratio"] = 3.5 + 1e-10  # well within the 1e-9 tolerance
        gate = evaluate_unit_economics_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_unit_economics_gates_returns_two_gates_in_order(self):
        results = evaluate_unit_economics_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "unit_economics_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.unit_economics")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {
                "id", "version", "generated_by_method", "subject_ref",
                "cac", "ltv", "gross_margin", "payback_period", "churn_rate", "arpu", "contribution_margin",
                "ltv_to_cac_ratio", "scalable", "provenance",
            },
        )


if __name__ == "__main__":
    unittest.main()

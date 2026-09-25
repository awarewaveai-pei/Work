"""Mutation-style tests for ``strategy.tows`` (F08 context/strategy family, 2nd member after ``strategy.swot``).

Every real invariant (referenced-SwotAnalysis validity, factor-id referential integrity, internal/external
category placement, pairing_type never caller-supplied, non-empty strategy_option) is exercised at BOTH layers:
construction-time refusal (``generate_tows_matrix`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_tows_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, checked against a REAL ``SwotAnalysis`` fixture built via
``ai_lego.modules.strategy.swot``'s own real functions -- not a duplicated mock). Schema conformance is checked
against the real spec-root schema this same slice added (``typed-objects/tows-matrix.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.swot import generate_swot_analysis, swot_factor
from ai_lego.modules.strategy.tows import (
    AUTOMATIC_DEPLOYMENT_HAZARD_ID,
    COMPUTATION_PROVENANCE_REF,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    derive_pairing_type,
    evaluate_provenance_required_gate,
    evaluate_tows_gates,
    evaluate_tows_integrity_gate,
    generate_tows_matrix,
    tows_pairing,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SWOT_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/swot-analysis.schema.yaml"
TOWS_MATRIX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/tows-matrix.schema.yaml"


def _real_swot_analysis(*, analysis_id: str = "SWOT-T-001"):
    """A REAL SwotAnalysis built via strategy.swot's own real functions -- the literal upstream data this
    method's tests validate pairings against, not a hand-rolled dict shaped to look like one."""
    knowledge_set = [evidence_record("E-901", "some observation", "SRC-1", make_provenance("EVIDENCE", "HUMAN_APPROVED"))]
    factors = [
        swot_factor(f"{analysis_id}-F1", "STRENGTH", "loyal customer base", "TW", "2026-Q3", "internal report", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        swot_factor(f"{analysis_id}-F2", "WEAKNESS", "single-timezone support", "TW", "2026-Q3", "ticket analysis", make_provenance("EVIDENCE", "AI_SUGGESTED")),
        swot_factor(f"{analysis_id}-F3", "OPPORTUNITY", "adjacent market opened up", "SG", "2026-Q3", "field note", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        swot_factor(f"{analysis_id}-F4", "THREAT", "two new entrants in the region", "TW", "2026-Q3", "market brief", make_provenance("EVIDENCE", "AI_SUGGESTED")),
    ]
    return generate_swot_analysis(analysis_id, "KS-T-001", knowledge_set, factors)


def _valid_matrix(swot_analysis=None, *, record_id: str = "TOWS-T-001", pairings=None):
    swot_analysis = swot_analysis if swot_analysis is not None else _real_swot_analysis()
    prefix = swot_analysis["id"]
    if pairings is None:
        pairings = [
            tows_pairing(f"{record_id}-P1", f"{prefix}-F1", f"{prefix}-F3", "use the loyal base to enter the adjacent market"),
            tows_pairing(f"{record_id}-P2", f"{prefix}-F2", f"{prefix}-F4", "fix support coverage before new entrants exploit it"),
        ]
    return generate_tows_matrix(record_id, swot_analysis, pairings, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_real_swot_analysis_fixture_validates_against_the_real_schema(self):
        self.contracts.validate(SWOT_ANALYSIS_SCHEMA, _real_swot_analysis(), "swot analysis fixture")

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(TOWS_MATRIX_SCHEMA, _valid_matrix(), "tows matrix")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_tows_and_swot_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.swot"])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_tows_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("TOWS-T-INVOKE-P1", f"{prefix}-F1", f"{prefix}-F3", "an option")
        descriptor, matrix = live.invoke(METHOD_ID, generate_tows_matrix, "TOWS-T-INVOKE", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.tows.contract.yaml")
        self.assertEqual(matrix["id"], "TOWS-T-INVOKE")

    def test_schema_rejects_an_unknown_top_level_key(self):
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOWS_MATRIX_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_pairings_item(self):
        matrix = _valid_matrix()
        matrix["pairings"][0]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOWS_MATRIX_SCHEMA, matrix, "matrix with a smuggled pairings[] key")

    def test_schema_rejects_a_pairing_type_outside_the_4_value_enum(self):
        matrix = _valid_matrix()
        matrix["pairings"][0]["pairing_type"] = "XX"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOWS_MATRIX_SCHEMA, matrix, "matrix with an invalid pairing_type")

    def test_hand_tampered_matrix_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        matrix = copy.deepcopy(_valid_matrix())
        matrix["pairings"][0]["strategy_option"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOWS_MATRIX_SCHEMA, matrix, "tampered matrix")
        swot_analysis = _real_swot_analysis()  # NOTE: a fresh analysis -- ref-mismatch is a separate concern; this test only checks schema-vs-gate agreement on field-shape
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.tows.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.tows contract")

    def test_id_is_distinct_from_strategy_swot_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.swot")
        self.assertEqual(METHOD_ID, "strategy.tows")


class DerivePairingTypeTests(unittest.TestCase):
    """Atlas L519/§11.8's own SO/ST/WO/WT table, transcribed as a lookup."""

    def test_strength_opportunity_is_so(self):
        self.assertEqual(derive_pairing_type("STRENGTH", "OPPORTUNITY"), "SO")

    def test_strength_threat_is_st(self):
        self.assertEqual(derive_pairing_type("STRENGTH", "THREAT"), "ST")

    def test_weakness_opportunity_is_wo(self):
        self.assertEqual(derive_pairing_type("WEAKNESS", "OPPORTUNITY"), "WO")

    def test_weakness_threat_is_wt(self):
        self.assertEqual(derive_pairing_type("WEAKNESS", "THREAT"), "WT")

    def test_two_internal_categories_is_unresolvable(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_UNRESOLVABLE_PAIRING_TYPE"):
            derive_pairing_type("STRENGTH", "WEAKNESS")

    def test_two_external_categories_is_unresolvable(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_UNRESOLVABLE_PAIRING_TYPE"):
            derive_pairing_type("OPPORTUNITY", "THREAT")


class InvalidSwotAnalysisTests(unittest.TestCase):
    def test_non_dict_swot_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INVALID_SWOT_ANALYSIS"):
            generate_tows_matrix("TOWS-T-002", "not-a-dict", [tows_pairing("P1", "F1", "F2", "x")], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_swot_analysis_with_no_factors_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INVALID_SWOT_ANALYSIS"):
            generate_tows_matrix("TOWS-T-003", {"id": "SWOT-EMPTY", "factors": []}, [tows_pairing("P1", "F1", "F2", "x")], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_swot_analysis_with_malformed_factor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INVALID_SWOT_ANALYSIS"):
            generate_tows_matrix(
                "TOWS-T-004", {"id": "SWOT-BAD", "factors": [{"id": "F1", "category": "NOT_A_REAL_CATEGORY"}]}, [tows_pairing("P1", "F1", "F2", "x")], make_provenance("AI_INFERENCE", "AI_SUGGESTED")
            )


class ReferentialIntegrityTests(unittest.TestCase):
    """The core 'pairings must reference real, correctly-sided SwotAnalysis factors' invariant."""

    def test_unknown_internal_factor_id_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", "DOES-NOT-EXIST", f"{prefix}-F3", "x")
        with self.assertRaisesRegex(InvariantViolation, "TOWS_UNKNOWN_FACTOR_ID"):
            generate_tows_matrix("TOWS-T-005", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_external_factor_id_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F1", "DOES-NOT-EXIST", "x")
        with self.assertRaisesRegex(InvariantViolation, "TOWS_UNKNOWN_FACTOR_ID"):
            generate_tows_matrix("TOWS-T-006", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_internal_factor_id_pointing_to_an_external_category_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F3", f"{prefix}-F1", "x")  # F3=OPPORTUNITY used as internal
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INTERNAL_FACTOR_NOT_INTERNAL"):
            generate_tows_matrix("TOWS-T-007", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_external_factor_id_pointing_to_an_internal_category_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F2", "x")  # F2=WEAKNESS used as external
        with self.assertRaisesRegex(InvariantViolation, "TOWS_EXTERNAL_FACTOR_NOT_EXTERNAL"):
            generate_tows_matrix("TOWS-T-008", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_two_internal_factors_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F2", "x")  # both STRENGTH/WEAKNESS
        with self.assertRaisesRegex(InvariantViolation, "TOWS_EXTERNAL_FACTOR_NOT_EXTERNAL"):
            generate_tows_matrix("TOWS-T-009", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_two_external_factors_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F3", f"{prefix}-F4", "x")  # both OPPORTUNITY/THREAT
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INTERNAL_FACTOR_NOT_INTERNAL"):
            generate_tows_matrix("TOWS-T-010", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_all_4_pairing_types_are_reachable_against_one_real_swot_analysis(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairings = [
            tows_pairing("P-SO", f"{prefix}-F1", f"{prefix}-F3", "so"),
            tows_pairing("P-ST", f"{prefix}-F1", f"{prefix}-F4", "st"),
            tows_pairing("P-WO", f"{prefix}-F2", f"{prefix}-F3", "wo"),
            tows_pairing("P-WT", f"{prefix}-F2", f"{prefix}-F4", "wt"),
        ]
        matrix = generate_tows_matrix("TOWS-T-011", swot_analysis, pairings, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual([p["pairing_type"] for p in matrix["pairings"]], ["SO", "ST", "WO", "WT"])


class PairingTypeNeverCallerSuppliedTests(unittest.TestCase):
    """The core 'pairing_type is GENUINE_COMPUTE, never trusted from input' invariant."""

    def test_caller_supplied_correct_type_is_still_refused(self):
        """Even a CORRECT caller-supplied label is refused -- the field must never be accepted as input at all,
        not merely validated-if-present."""
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = {**tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F3", "x"), "pairing_type": "SO"}
        with self.assertRaisesRegex(InvariantViolation, "TOWS_PAIRING_TYPE_MUST_NOT_BE_CALLER_SUPPLIED"):
            generate_tows_matrix("TOWS-T-012", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_caller_supplied_wrong_type_is_refused(self):
        """A caller asserting 'SO' on what is actually a WEAKNESS+THREAT (WT) pair -- the exact hazard this
        invariant exists to prevent."""
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = {**tows_pairing("P1", f"{prefix}-F2", f"{prefix}-F4", "x"), "pairing_type": "SO"}
        with self.assertRaisesRegex(InvariantViolation, "TOWS_PAIRING_TYPE_MUST_NOT_BE_CALLER_SUPPLIED"):
            generate_tows_matrix("TOWS-T-013", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_tows_pairing_constructor_never_produces_a_pairing_type_key(self):
        pairing = tows_pairing("P1", "F1", "F3", "x")
        self.assertNotIn("pairing_type", pairing)


class FieldCompletenessTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INVALID_ID"):
            _valid_matrix(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F3", "x")
        with self.assertRaisesRegex(InvariantViolation, "TOWS_INVALID_VERSION"):
            generate_tows_matrix("TOWS-T-014", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)

    def test_empty_pairings_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOWS_EMPTY_PAIRINGS"):
            _valid_matrix(pairings=[])

    def test_pairing_missing_id_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = {"internal_factor_id": f"{prefix}-F1", "external_factor_id": f"{prefix}-F3", "strategy_option": "x"}
        with self.assertRaisesRegex(InvariantViolation, "TOWS_PAIRING_MISSING_ID"):
            generate_tows_matrix("TOWS-T-015", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_pairing_id_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairings = [tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F3", "x"), tows_pairing("P1", f"{prefix}-F2", f"{prefix}-F4", "y")]
        with self.assertRaisesRegex(InvariantViolation, "TOWS_DUPLICATE_PAIRING_ID"):
            generate_tows_matrix("TOWS-T-016", swot_analysis, pairings, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_strategy_option_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F3", "")
        with self.assertRaisesRegex(InvariantViolation, "TOWS_EMPTY_STRATEGY_OPTION"):
            generate_tows_matrix("TOWS-T-017", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_strategy_option_is_refused(self):
        swot_analysis = _real_swot_analysis()
        prefix = swot_analysis["id"]
        pairing = tows_pairing("P1", f"{prefix}-F1", f"{prefix}-F3", "   ")
        with self.assertRaisesRegex(InvariantViolation, "TOWS_EMPTY_STRATEGY_OPTION"):
            generate_tows_matrix("TOWS-T-018", swot_analysis, [pairing], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_builder_does_not_leak_extra_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(
            set(matrix.keys()),
            {"id", "version", "generated_by_method", "swot_analysis_ref", "pairings", "referential_integrity_verified", "computation_provenance_ref", "provenance"},
        )
        self.assertEqual(set(matrix["pairings"][0].keys()), {"id", "internal_factor_id", "external_factor_id", "pairing_type", "strategy_option"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID matrix's raw dict directly (never going through the builder again), then call the
    gate against the SAME real SwotAnalysis. These prove the gate re-derives from raw fields rather than
    trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_matrix(self):
        swot_analysis = _real_swot_analysis()
        matrix = _valid_matrix(swot_analysis)
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_pairing_type(self):
        swot_analysis = _real_swot_analysis()
        matrix = copy.deepcopy(_valid_matrix(swot_analysis))
        matrix["pairings"][0]["pairing_type"] = "WT"  # was genuinely SO
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p.get("reason") == "PAIRING_TYPE_MISMATCH" for p in gate["evidence"][0]["problems"]))

    def test_gate_catches_hand_tampered_unknown_factor_id(self):
        swot_analysis = _real_swot_analysis()
        matrix = copy.deepcopy(_valid_matrix(swot_analysis))
        matrix["pairings"][0]["external_factor_id"] = "DOES-NOT-EXIST"
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_swot_analysis_ref_mismatch(self):
        """A matrix checked against a DIFFERENT (but otherwise valid) SwotAnalysis than the one it claims to
        reference must fail, not silently pass because the shapes happen to both be valid."""
        swot_analysis_a = _real_swot_analysis(analysis_id="SWOT-T-A")
        swot_analysis_b = _real_swot_analysis(analysis_id="SWOT-T-B")
        matrix = _valid_matrix(swot_analysis_a)
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis_b, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_strategy_option(self):
        swot_analysis = _real_swot_analysis()
        matrix = copy.deepcopy(_valid_matrix(swot_analysis))
        matrix["pairings"][0]["strategy_option"] = ""
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_referential_integrity_verified_flag(self):
        swot_analysis = _real_swot_analysis()
        matrix = copy.deepcopy(_valid_matrix(swot_analysis))
        matrix["referential_integrity_verified"] = False
        gate = evaluate_tows_integrity_gate(matrix, swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        swot_analysis = _real_swot_analysis()
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_tows_integrity_gate(bad_record, swot_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_invalid_swot_analysis_argument(self):
        matrix = _valid_matrix()
        gate = evaluate_tows_integrity_gate(matrix, {"id": "SWOT-BAD", "factors": []}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_matrix_provenance_invalid(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_tows_gates_returns_two_gates_in_order(self):
        swot_analysis = _real_swot_analysis()
        results = evaluate_tows_gates(_valid_matrix(swot_analysis), swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "tows_integrity"])

    def test_evaluate_tows_gates_all_pass_on_a_valid_matrix(self):
        swot_analysis = _real_swot_analysis()
        results = evaluate_tows_gates(_valid_matrix(swot_analysis), swot_analysis, "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TOWS-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.tows")

    def test_computation_provenance_ref_constant(self):
        self.assertEqual(COMPUTATION_PROVENANCE_REF, "ai_lego.modules.strategy.tows.derive_pairing_type")

    def test_automatic_deployment_hazard_id_matches_swot_own_value_but_is_independently_defined(self):
        from ai_lego.modules.strategy import swot as swot_module

        self.assertEqual(AUTOMATIC_DEPLOYMENT_HAZARD_ID, swot_module.AUTOMATIC_DEPLOYMENT_HAZARD_ID)

    def test_tows_pairing_builds_the_expected_pre_type_shape(self):
        self.assertEqual(
            tows_pairing("P1", "F1", "F3", "an option"),
            {"id": "P1", "internal_factor_id": "F1", "external_factor_id": "F3", "strategy_option": "an option"},
        )


if __name__ == "__main__":
    unittest.main()

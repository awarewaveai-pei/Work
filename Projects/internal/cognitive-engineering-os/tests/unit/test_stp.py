"""Mutation-style tests for ``strategy.stp`` (F08 context/strategy family, 7th member after
``strategy.swot``/``strategy.pestel``/``strategy.steepv``/``strategy.three_c``/``strategy.tows``/
``strategy.porter_five_forces``).

Every real invariant (segments non-empty, targeting_decision referential integrity against segments[], every
segment field-complete, targeting rationale non-empty, positioning_statement non-empty) is exercised at BOTH
layers: construction-time refusal (``generate_stp_analysis`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_stp_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely). Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/stp-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.stp import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_stp_gates,
    evaluate_stp_integrity_gate,
    generate_stp_analysis,
    segment,
    targeting_decision,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

STP_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stp-analysis.schema.yaml"


def _valid_segments(prefix: str = "STP-T-001") -> list[dict]:
    return [
        segment(f"{prefix}-S1", "price-sensitive solo freelancers", ["solo team size", "budget < $50/mo"]),
        segment(f"{prefix}-S2", "mid-size marketing agencies", ["5-50 person team", "wants white-label reporting"], supporting_evidence_refs=["E-1"]),
    ]


def _valid_analysis(*, record_id: str = "STP-T-001", segments=None, target=None, positioning: str = "a disclosed positioning statement"):
    segments = segments if segments is not None else _valid_segments(record_id)
    if target is None:
        target = targeting_decision(f"{record_id}-S2", "agencies have higher retention and ACV")
    return generate_stp_analysis(record_id, segments, target, positioning, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(STP_ANALYSIS_SCHEMA, _valid_analysis(), "stp analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_stp_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        segments = _valid_segments("STP-T-INVOKE")
        target = targeting_decision("STP-T-INVOKE-S2", "rationale")
        descriptor, analysis = live.invoke(METHOD_ID, generate_stp_analysis, "STP-T-INVOKE", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.stp.contract.yaml")
        self.assertEqual(analysis["id"], "STP-T-INVOKE")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STP_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_segments_item(self):
        analysis = _valid_analysis()
        analysis["segments"][0]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STP_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled segments[] key")

    def test_schema_rejects_an_unknown_key_inside_targeting_decision(self):
        analysis = _valid_analysis()
        analysis["targeting_decision"]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STP_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled targeting_decision key")

    def test_schema_rejects_empty_criteria_list(self):
        analysis = _valid_analysis()
        analysis["segments"][0]["criteria"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STP_ANALYSIS_SCHEMA, analysis, "analysis with empty criteria")

    def test_hand_tampered_analysis_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        analysis = copy.deepcopy(_valid_analysis())
        analysis["positioning_statement"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STP_ANALYSIS_SCHEMA, analysis, "tampered analysis")
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.stp.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.stp contract")

    def test_id_is_distinct_from_sibling_strategy_machine_ids(self):
        self.assertEqual(METHOD_ID, "strategy.stp")
        self.assertNotIn(METHOD_ID, {"strategy.swot", "strategy.tows", "strategy.pestel", "strategy.steepv", "strategy.three_c", "strategy.porter_five_forces"})


class SegmentationTests(unittest.TestCase):
    """Real invariant #1: segments must be non-empty and every entry field-complete."""

    def test_empty_segments_is_refused(self):
        target = targeting_decision("X", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_EMPTY_SEGMENTS"):
            generate_stp_analysis("STP-T-002", [], target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_segments_not_a_list_is_refused(self):
        target = targeting_decision("X", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_EMPTY_SEGMENTS"):
            generate_stp_analysis("STP-T-003", "not-a-list", target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_segment_missing_id_is_refused(self):
        segments = [{"description": "x", "criteria": ["c"]}]
        target = targeting_decision("X", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_SEGMENT_MISSING_ID"):
            generate_stp_analysis("STP-T-004", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_segment_id_is_refused(self):
        segments = [segment("S1", "a", ["c1"]), segment("S1", "b", ["c2"])]
        target = targeting_decision("S1", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_DUPLICATE_SEGMENT_ID"):
            generate_stp_analysis("STP-T-005", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_segment_missing_description_is_refused(self):
        segments = [{"id": "S1", "description": "", "criteria": ["c"]}]
        target = targeting_decision("S1", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_SEGMENT_MISSING_DESCRIPTION"):
            generate_stp_analysis("STP-T-006", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_segment_missing_criteria_is_refused(self):
        segments = [segment("S1", "a", [])]
        target = targeting_decision("S1", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_SEGMENT_MISSING_CRITERIA"):
            generate_stp_analysis("STP-T-007", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_segment_whitespace_only_criteria_entry_is_refused(self):
        segments = [segment("S1", "a", ["   "])]
        target = targeting_decision("S1", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_SEGMENT_MISSING_CRITERIA"):
            generate_stp_analysis("STP-T-008", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class TargetingReferentialIntegrityTests(unittest.TestCase):
    """Real invariant #2: targeting_decision.targeted_segment_id must resolve to a real segments[] entry --
    the citation-mandated 'Targeting cannot choose a segment Segmentation never identified' check."""

    def test_unknown_target_segment_id_is_refused(self):
        segments = _valid_segments("STP-T-009")
        target = targeting_decision("STP-DOES-NOT-EXIST", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_UNKNOWN_TARGET_SEGMENT_ID"):
            generate_stp_analysis("STP-T-009", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_targeting_decision_not_a_dict_is_refused(self):
        segments = _valid_segments("STP-T-010")
        with self.assertRaisesRegex(InvariantViolation, "STP_INVALID_TARGETING_DECISION"):
            generate_stp_analysis("STP-T-010", segments, "not-a-dict", "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_targeting_rationale_is_refused(self):
        segments = _valid_segments("STP-T-011")
        target = targeting_decision(f"STP-T-011-S1", "")
        with self.assertRaisesRegex(InvariantViolation, "STP_EMPTY_TARGETING_RATIONALE"):
            generate_stp_analysis("STP-T-011", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_targeting_rationale_is_refused(self):
        segments = _valid_segments("STP-T-012")
        target = targeting_decision(f"STP-T-012-S1", "   ")
        with self.assertRaisesRegex(InvariantViolation, "STP_EMPTY_TARGETING_RATIONALE"):
            generate_stp_analysis("STP-T-012", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_all_identified_segments_are_individually_reachable_as_a_target(self):
        segments = _valid_segments("STP-T-013")
        for suffix in ("S1", "S2"):
            with self.subTest(segment=suffix):
                target = targeting_decision(f"STP-T-013-{suffix}", "r")
                analysis = generate_stp_analysis("STP-T-013", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
                self.assertEqual(analysis["targeting_decision"]["targeted_segment_id"], f"STP-T-013-{suffix}")


class PositioningTests(unittest.TestCase):
    """Real invariant #3: positioning_statement must be non-empty -- Atlas's own final, required stage."""

    def test_empty_positioning_statement_is_refused(self):
        segments = _valid_segments("STP-T-014")
        target = targeting_decision("STP-T-014-S1", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_EMPTY_POSITIONING_STATEMENT"):
            generate_stp_analysis("STP-T-014", segments, target, "", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_positioning_statement_is_refused(self):
        segments = _valid_segments("STP-T-015")
        target = targeting_decision("STP-T-015-S1", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_EMPTY_POSITIONING_STATEMENT"):
            generate_stp_analysis("STP-T-015", segments, target, "   ", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class FieldCompletenessTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STP_INVALID_ID"):
            segments = _valid_segments("WRONG-PREFIX-001")
            target = targeting_decision("WRONG-PREFIX-001-S2", "r")
            generate_stp_analysis("WRONG-PREFIX-001", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_invalid_version_non_string_is_refused(self):
        segments = _valid_segments("STP-T-016")
        target = targeting_decision("STP-T-016-S2", "r")
        with self.assertRaisesRegex(InvariantViolation, "STP_INVALID_VERSION"):
            generate_stp_analysis("STP-T-016", segments, target, "positioning", make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)

    def test_builder_does_not_leak_extra_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "segments", "targeting_decision", "positioning_statement", "referential_integrity_verified", "provenance"},
        )
        self.assertEqual(set(analysis["segments"][0].keys()), {"id", "description", "criteria"})
        self.assertEqual(set(analysis["targeting_decision"].keys()), {"targeted_segment_id", "rationale"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_analysis(self):
        analysis = _valid_analysis()
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_unknown_target_segment_id(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["targeting_decision"]["targeted_segment_id"] = "STP-DOES-NOT-EXIST"
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p.get("reason") == "STP_UNKNOWN_TARGET_SEGMENT_ID" for p in gate["evidence"][0]["problems"]))

    def test_gate_catches_hand_tampered_empty_segments(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["segments"] = []
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_positioning_statement(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["positioning_statement"] = ""
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_targeting_rationale(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["targeting_decision"]["rationale"] = ""
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_referential_integrity_verified_flag(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["referential_integrity_verified"] = False
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_stp_integrity_gate(bad_record, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["id"] = "WRONG-001"
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["version"] = 1
        gate = evaluate_stp_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_analysis_provenance_invalid(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_stp_gates_returns_two_gates_in_order(self):
        results = evaluate_stp_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "stp_integrity"])

    def test_evaluate_stp_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_stp_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "STP-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.stp")

    def test_segment_helper_omits_supporting_evidence_refs_when_none(self):
        entry = segment("S1", "x", ["c"])
        self.assertNotIn("supporting_evidence_refs", entry)

    def test_segment_helper_includes_supporting_evidence_refs_when_given(self):
        entry = segment("S1", "x", ["c"], supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])

    def test_targeting_decision_helper_builds_the_expected_shape(self):
        self.assertEqual(targeting_decision("S1", "why"), {"targeted_segment_id": "S1", "rationale": "why"})


if __name__ == "__main__":
    unittest.main()

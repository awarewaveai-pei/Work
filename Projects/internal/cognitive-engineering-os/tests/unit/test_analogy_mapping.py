"""Mutation-style tests for ``association.analogy_mapping`` (F04 associative-mapping family, Atlas F04
table row L416 -- the ONLY citation; 6th and LAST F04 member, family COMPLETE 6/6 after this module).

The real invariant, exercised at BOTH layers: construction-time refusal (``generate_analogy_mapping_record``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_analogy_mapping_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real, newly-minted
spec-root schema (``typed-objects/analogy-mapping-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.association.analogy_mapping import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_analogy_mapping_gates,
    evaluate_analogy_mapping_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_analogy_mapping_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ANALOGY_MAPPING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/analogy-mapping-record.schema.yaml"

TARGET_PROBLEM = "倉儲揀貨路徑在尖峰時段壅塞"
SOURCE_DOMAIN_DESCRIPTION = "螞蟻覓食：個別螞蟻靠地面費洛蒙濃度局部決策，族群整體收斂到近似最短路徑"
ABSTRACTED_MECHANISM = "stigmergic coordination -- 大量代理人透過對共享環境留下的局部訊號做出反應，不需要中央協調者"
TARGET_MAPPING = "揀貨員改用動態地板訊號取代中央路徑指派，讓路徑分佈自然收斂"


def _record(
    *,
    record_id: str = "ANALOGY-T-001",
    target_problem: str = TARGET_PROBLEM,
    source_domain_description: str = SOURCE_DOMAIN_DESCRIPTION,
    abstracted_mechanism: str = ABSTRACTED_MECHANISM,
    target_mapping: str = TARGET_MAPPING,
    provenance=None,
    version: str = "1.0.0",
    supporting_evidence_refs=None,
    informs_historical_analogy_ref=None,
):
    return generate_analogy_mapping_record(
        record_id,
        target_problem,
        source_domain_description,
        abstracted_mechanism,
        target_mapping,
        provenance if provenance is not None else make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        version=version,
        supporting_evidence_refs=supporting_evidence_refs,
        informs_historical_analogy_ref=informs_historical_analogy_ref,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(ANALOGY_MAPPING_SCHEMA, _record(), "analogy mapping record")

    def test_valid_record_with_all_optional_fields_validates(self):
        record = _record(supporting_evidence_refs=["E-1"], informs_historical_analogy_ref="HISTANALOGY-001")
        self.contracts.validate(ANALOGY_MAPPING_SCHEMA, record, "analogy mapping record with all optional fields")
        self.assertEqual(record["supporting_evidence_refs"], ["E-1"])
        self.assertEqual(record["informs_historical_analogy_ref"], "HISTANALOGY-001")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_analogy_mapping_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_ID"):
            _record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_ID"):
            _record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_VERSION"):
            generate_analogy_mapping_record(
                "ANALOGY-T-002", TARGET_PROBLEM, SOURCE_DOMAIN_DESCRIPTION, ABSTRACTED_MECHANISM, TARGET_MAPPING, make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1
            )

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _record()
        record["smuggled"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANALOGY_MAPPING_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_zero_supporting_evidence_refs(self):
        """Regression test for minItems:1 on supporting_evidence_refs -- a hand-crafted empty array must fail
        real schema validation too, not just the runtime shape check."""
        record = _record(supporting_evidence_refs=["E-1"])
        record["supporting_evidence_refs"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANALOGY_MAPPING_SCHEMA, record, "record with zero supporting_evidence_refs")

    def test_schema_rejects_a_malformed_evidence_ref(self):
        """Regression test for supporting_evidence_refs[].pattern -- the builder itself does not validate the
        E-NNN shape (only the schema does), so a hand-crafted bad ref must be caught here."""
        record = _record(supporting_evidence_refs=["E-1"])
        record["supporting_evidence_refs"] = ["NOT-AN-EVIDENCE-ID"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANALOGY_MAPPING_SCHEMA, record, "record with a malformed evidence ref")

    def test_schema_rejects_empty_target_problem(self):
        """Regression test for minLength:1 -- schema itself refuses an empty target_problem, not just the
        runtime InvariantViolation the builder already raises."""
        record = _record()
        record["target_problem"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANALOGY_MAPPING_SCHEMA, record, "record with empty target_problem")


class RequiredFieldTests(unittest.TestCase):
    def test_empty_target_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_EMPTY_TARGET_PROBLEM"):
            _record(target_problem="")

    def test_whitespace_only_target_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_EMPTY_TARGET_PROBLEM"):
            _record(target_problem="   ")

    def test_empty_source_domain_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_EMPTY_SOURCE_DOMAIN"):
            _record(source_domain_description="")

    def test_empty_abstracted_mechanism_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_EMPTY_ABSTRACTED_MECHANISM"):
            _record(abstracted_mechanism="   ")

    def test_empty_target_mapping_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_EMPTY_TARGET_MAPPING"):
            _record(target_mapping="")


class PairwiseDistinctnessTests(unittest.TestCase):
    """The core invariant: source_domain_description/abstracted_mechanism/target_mapping must be pairwise
    genuinely distinct -- any two stages collapsing to the same text skipped the row's own abstraction step."""

    def test_mechanism_echoing_source_exactly_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE"):
            _record(source_domain_description="同一段文字", abstracted_mechanism="同一段文字")

    def test_mechanism_echoing_source_case_and_whitespace_insensitive_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE"):
            _record(source_domain_description="Some Source Domain", abstracted_mechanism="  some   source domain  ")

    def test_mapping_echoing_mechanism_exactly_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MAPPING_ECHOES_MECHANISM"):
            _record(abstracted_mechanism="同一段文字", target_mapping="同一段文字")

    def test_mapping_echoing_mechanism_case_and_whitespace_insensitive_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MAPPING_ECHOES_MECHANISM"):
            _record(abstracted_mechanism="Some Mechanism", target_mapping="  SOME   mechanism  ")

    def test_mapping_echoing_source_exactly_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MAPPING_ECHOES_SOURCE"):
            _record(source_domain_description="同一段文字", target_mapping="同一段文字")

    def test_mapping_echoing_source_case_and_whitespace_insensitive_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MAPPING_ECHOES_SOURCE"):
            _record(source_domain_description="Some Source Domain", target_mapping="  some   source domain  ")

    def test_nfkc_width_variant_characters_do_not_defeat_distinctness(self):
        """Full-width Latin characters normalize to their ASCII equivalents under NFKC -- an echo disguised by
        width variants must still be caught, same precedent ``association.attribute_listing``'s own
        ``_normalize`` already establishes."""
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_MECHANISM_ECHOES_SOURCE"):
            _record(source_domain_description="ABC mechanism", abstracted_mechanism="ＡＢＣ mechanism")

    def test_genuinely_distinct_stages_are_accepted(self):
        record = _record()
        self.assertNotEqual(record["source_domain_description"], record["abstracted_mechanism"])
        self.assertNotEqual(record["abstracted_mechanism"], record["target_mapping"])
        self.assertNotEqual(record["source_domain_description"], record["target_mapping"])


class OptionalFieldValidationTests(unittest.TestCase):
    def test_supporting_evidence_refs_absent_by_default(self):
        record = _record()
        self.assertNotIn("supporting_evidence_refs", record)

    def test_supporting_evidence_refs_present_when_given(self):
        record = _record(supporting_evidence_refs=["E-1", "E-2"])
        self.assertEqual(record["supporting_evidence_refs"], ["E-1", "E-2"])

    def test_invalid_supporting_evidence_refs_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_SUPPORTING_EVIDENCE_REFS"):
            _record(supporting_evidence_refs=[])

    def test_invalid_supporting_evidence_refs_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_SUPPORTING_EVIDENCE_REFS"):
            _record(supporting_evidence_refs="E-1")

    def test_invalid_supporting_evidence_refs_with_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_SUPPORTING_EVIDENCE_REFS"):
            _record(supporting_evidence_refs=["E-1", 42])

    def test_informs_historical_analogy_ref_absent_by_default(self):
        record = _record()
        self.assertNotIn("informs_historical_analogy_ref", record)

    def test_informs_historical_analogy_ref_present_when_given(self):
        record = _record(informs_historical_analogy_ref="HISTANALOGY-001")
        self.assertEqual(record["informs_historical_analogy_ref"], "HISTANALOGY-001")

    def test_informs_historical_analogy_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANALOGYMAPPING_INVALID_INFORMS_HISTORICAL_ANALOGY_REF"):
            _record(informs_historical_analogy_ref="")

    def test_builder_does_not_mutate_caller_supplied_refs_list(self):
        refs = ["E-1"]
        record = _record(supporting_evidence_refs=refs)
        refs.append("E-2")
        self.assertEqual(record["supporting_evidence_refs"], ["E-1"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_analogy_mapping_integrity_gate(_record(supporting_evidence_refs=["E-1"]), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_mechanism_echoes_source(self):
        record = copy.deepcopy(_record())
        record["abstracted_mechanism"] = record["source_domain_description"]
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("MECHANISM_ECHOES_SOURCE", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_mapping_echoes_mechanism(self):
        record = copy.deepcopy(_record())
        record["target_mapping"] = record["abstracted_mechanism"]
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("MAPPING_ECHOES_MECHANISM", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_mapping_echoes_source(self):
        record = copy.deepcopy(_record())
        record["target_mapping"] = record["source_domain_description"]
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("MAPPING_ECHOES_SOURCE", gate["evidence"][0]["reason"])

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_record())
        record["id"] = "WRONG-001"
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_record())
        record["version"] = 1
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_target_problem(self):
        record = copy.deepcopy(_record())
        record["target_problem"] = ""
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_supporting_evidence_refs(self):
        record = copy.deepcopy(_record(supporting_evidence_refs=["E-1"]))
        record["supporting_evidence_refs"] = []
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_informs_historical_analogy_ref(self):
        record = copy.deepcopy(_record(informs_historical_analogy_ref="HISTANALOGY-001"))
        record["informs_historical_analogy_ref"] = ""
        gate = evaluate_analogy_mapping_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_analogy_mapping_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class EvidenceLabelingGateTests(unittest.TestCase):
    def test_gate_passes_when_evidence_labeled_and_refs_present(self):
        record = _record(provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_passes_when_hypothesis_labeled_with_no_refs(self):
        record = _record(provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_fails_when_evidence_labeled_cites_no_refs(self):
        record = _record(provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_on_missing_epistemic_type_label(self):
        record = copy.deepcopy(_record())
        record["provenance"] = {"authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_on_non_dict_record(self):
        gate = evaluate_evidence_labeling_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_analogy_mapping_gates_returns_three_gates_in_order(self):
        results = evaluate_analogy_mapping_gates(_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "analogy_mapping_integrity"])

    def test_evaluate_analogy_mapping_gates_all_pass_on_a_valid_record(self):
        results = evaluate_analogy_mapping_gates(_record(supporting_evidence_refs=["E-1"]), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ANALOGY-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "association.analogy_mapping")

    def test_method_id_matches_schema_pattern(self):
        import re

        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))

    def test_record_preserves_all_4_content_fields(self):
        record = _record()
        self.assertEqual(record["target_problem"], TARGET_PROBLEM)
        self.assertEqual(record["source_domain_description"], SOURCE_DOMAIN_DESCRIPTION)
        self.assertEqual(record["abstracted_mechanism"], ABSTRACTED_MECHANISM)
        self.assertEqual(record["target_mapping"], TARGET_MAPPING)

    def test_generated_by_method_defaults_correctly(self):
        record = _record()
        self.assertEqual(record["generated_by_method"], METHOD_ID)


if __name__ == "__main__":
    unittest.main()

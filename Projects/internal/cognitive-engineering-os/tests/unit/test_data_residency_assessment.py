"""Mutation-style tests for ``jurisdiction.data_residency_assessment`` (F23 jurisdiction family, Atlas L943).

Atlas's own "regions->routing" pipeline stage is proven at BOTH independent
layers: the construction-time builder refuses a data class with zero routing
decisions, a dangling data_class_id reference, and a duplicate data class id,
and the independent gates re-derive the same rules directly from a raw
(possibly hand-tampered) dict, never trusting that the builder's own check
already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.data_residency_assessment import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_data_residency_assessment_gates,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    evaluate_routing_completeness_gate,
    generate_data_residency_assessment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

DATA_RESIDENCY_ASSESSMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/data-residency-assessment-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        data_classes=[
            {"data_class_id": "DC-EU-CUSTOMER-PII", "description": "EU customer PII", "subjects": ["EU residents"], "applicable_laws": ["LAW-GDPR"]},
            {"data_class_id": "DC-FINANCIAL-RECORDS", "description": "Transaction records", "subjects": ["EU residents", "US residents"], "applicable_laws": ["LAW-GDPR", "LAW-CCPA"]},
        ],
        routing_decisions=[
            {"data_class_id": "DC-EU-CUSTOMER-PII", "region": "EU", "rationale": "GDPR localization preference"},
            {"data_class_id": "DC-FINANCIAL-RECORDS", "region": "EU", "rationale": "Primary EU-resident processing region"},
            {"data_class_id": "DC-FINANCIAL-RECORDS", "region": "US-EAST", "rationale": "US-resident subset under PSP DPA"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_assessment(*, record_id: str = "DRA-T-001", **overrides: object):
    return generate_data_residency_assessment(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_assessment_validates_against_the_real_schema(self):
        self.contracts.validate(DATA_RESIDENCY_ASSESSMENT_SCHEMA, _valid_assessment(), "data residency assessment")

    def test_one_data_class_one_routing_decision_is_a_complete_minimal_assessment(self):
        assessment = generate_data_residency_assessment(
            "DRA-T-002",
            data_classes=[{"data_class_id": "DC-1", "description": "d1", "subjects": ["s1"], "applicable_laws": ["LAW-1"]}],
            routing_decisions=[{"data_class_id": "DC-1", "region": "EU", "rationale": "r1"}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(DATA_RESIDENCY_ASSESSMENT_SCHEMA, assessment, "minimal complete assessment")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, assessment = live.invoke(METHOD_ID, generate_data_residency_assessment, "DRA-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.data_residency_assessment.contract.yaml")
        self.assertEqual(assessment["id"], "DRA-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        assessment = _valid_assessment()
        assessment["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DATA_RESIDENCY_ASSESSMENT_SCHEMA, assessment, "assessment with a smuggled top-level key")

    def test_schema_rejects_empty_subjects_list(self):
        assessment = _valid_assessment()
        assessment["data_classes"][0]["subjects"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DATA_RESIDENCY_ASSESSMENT_SCHEMA, assessment, "assessment with empty subjects")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.data_residency_assessment.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.data_residency_assessment contract")


class DataClassTests(unittest.TestCase):
    def test_zero_data_classes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRA_TOO_FEW_DATA_CLASSES"):
            generate_data_residency_assessment("DRA-T-003", data_classes=[], routing_decisions=[], provenance=PROVENANCE)

    def test_duplicate_data_class_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["data_classes"].append(dict(kwargs["data_classes"][0]))
        with self.assertRaisesRegex(InvariantViolation, "DRA_DUPLICATE_DATA_CLASS_ID"):
            generate_data_residency_assessment("DRA-T-004", **kwargs)

    def test_empty_subjects_list_is_refused(self):
        kwargs = _kwargs()
        kwargs["data_classes"][0]["subjects"] = []
        with self.assertRaisesRegex(InvariantViolation, "DRA_INVALID_DATA_CLASS"):
            generate_data_residency_assessment("DRA-T-005", **kwargs)

    def test_empty_applicable_laws_list_is_refused(self):
        kwargs = _kwargs()
        kwargs["data_classes"][0]["applicable_laws"] = []
        with self.assertRaisesRegex(InvariantViolation, "DRA_INVALID_DATA_CLASS"):
            generate_data_residency_assessment("DRA-T-006", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_data_class_ref_in_routing_is_refused(self):
        kwargs = _kwargs()
        kwargs["routing_decisions"][0]["data_class_id"] = "DC-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "DRA_DANGLING_DATA_CLASS_REF"):
            generate_data_residency_assessment("DRA-T-007", **kwargs)


class RoutingCompletenessTests(unittest.TestCase):
    """Atlas L943's own 'regions->routing' pipeline stage -- every declared data class routed."""

    def test_unrouted_data_class_is_refused(self):
        kwargs = _kwargs()
        kwargs["routing_decisions"] = [r for r in kwargs["routing_decisions"] if r["data_class_id"] != "DC-FINANCIAL-RECORDS"]
        with self.assertRaisesRegex(InvariantViolation, "DRA_UNROUTED_DATA_CLASS"):
            generate_data_residency_assessment("DRA-T-008", **kwargs)

    def test_data_class_with_no_routing_decisions_at_all_is_refused(self):
        kwargs = _kwargs()
        kwargs["routing_decisions"] = []
        with self.assertRaisesRegex(InvariantViolation, "DRA_UNROUTED_DATA_CLASS"):
            generate_data_residency_assessment("DRA-T-009", **kwargs)

    def test_multi_region_routing_for_one_data_class_is_accepted(self):
        assessment = _valid_assessment()
        financial_routes = [r for r in assessment["routing_decisions"] if r["data_class_id"] == "DC-FINANCIAL-RECORDS"]
        self.assertEqual(len(financial_routes), 2)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        assessment = generate_data_residency_assessment("DRA-T-010", **kwargs)
        kwargs["routing_decisions"][0]["region"] = "TAMPERED"
        self.assertNotEqual(assessment["routing_decisions"][0]["region"], "TAMPERED")
        self.assertIsNot(assessment["routing_decisions"], kwargs["routing_decisions"])
        kwargs["data_classes"][0]["subjects"][0] = "TAMPERED-SUBJECT"
        self.assertNotEqual(assessment["data_classes"][0]["subjects"][0], "TAMPERED-SUBJECT")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_assessment(self):
        results = evaluate_data_residency_assessment_gates(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_assessment())
        record["routing_decisions"][0]["data_class_id"] = "DC-NONEXISTENT"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_duplicate_id(self):
        record = copy.deepcopy(_valid_assessment())
        record["data_classes"].append(dict(record["data_classes"][0]))
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_routing_completeness_gate_catches_hand_tampered_unrouted_data_class(self):
        record = copy.deepcopy(_valid_assessment())
        record["routing_decisions"] = [r for r in record["routing_decisions"] if r["data_class_id"] != "DC-FINANCIAL-RECORDS"]
        gate = evaluate_routing_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_routing_completeness_gate_passes_a_genuinely_complete_assessment(self):
        gate = evaluate_routing_completeness_gate(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_data_residency_assessment_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_assessment())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DRA-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRA_INVALID_ID"):
            _valid_assessment(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRA_INVALID_VERSION"):
            generate_data_residency_assessment("DRA-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRA_INVALID_PROVENANCE"):
            _valid_assessment(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.data_residency_assessment")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_data_residency_assessment_gates(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "routing_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        assessment = _valid_assessment()
        self.assertEqual(
            set(assessment.keys()),
            {"id", "version", "generated_by_method", "data_classes", "routing_decisions", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of the F13 corpus's 14 builders returned the caller's own
    ``provenance`` dict BY REFERENCE rather than a copy -- mutating the caller's dict after
    construction silently rewrote the already-returned 'validated' record's provenance too, with no
    exception. That exact class recurred a 4th time in the immediately-prior F22 batch. Fixed here by
    ``copy.deepcopy``ing provenance at the return statement; this test proves the fix and guards
    against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_assessment()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_data_residency_assessment(base["id"], base["data_classes"], base["routing_decisions"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

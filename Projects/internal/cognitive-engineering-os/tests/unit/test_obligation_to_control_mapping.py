"""Mutation-style tests for ``jurisdiction.obligation_to_control_mapping`` (F23 global jurisdiction/
compliance/localization family, Atlas L937).

Atlas's own "obligation->control" pipeline stage is proven at BOTH independent layers: the construction-time
builder refuses an uncovered obligation, an orphan control, a duplicate obligation/control id, and an
incomplete control (missing owner/evidence/test), and the independent gates re-derive the same rules directly
from a raw (possibly hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.obligation_to_control_mapping import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_obligation_coverage_gate,
    evaluate_obligation_to_control_mapping_gates,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_obligation_to_control_mapping,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

OCM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/obligation-to-control-mapping-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        obligations=[
            {"obligation_id": "OBL-1", "description": "GDPR Art.17 -- honor erasure requests"},
            {"obligation_id": "OBL-2", "description": "PCI-DSS 3.2.1 -- encrypt cardholder data at rest"},
        ],
        controls=[
            {"control_id": "CTRL-1", "obligation_id": "OBL-1", "owner": "Data Protection Steward", "evidence": "erasure-request audit log", "test": "monthly sample audit"},
            {"control_id": "CTRL-2", "obligation_id": "OBL-1", "owner": "Platform Eng Lead", "evidence": "deletion pipeline runbook", "test": "quarterly game-day"},
            {"control_id": "CTRL-3", "obligation_id": "OBL-2", "owner": "Security Lead", "evidence": "AES-256 config export", "test": "annual QSA audit"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_mapping(*, record_id: str = "OCM-T-001", **overrides: object):
    return generate_obligation_to_control_mapping(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_mapping_validates_against_the_real_schema(self):
        self.contracts.validate(OCM_SCHEMA, _valid_mapping(), "obligation to control mapping")

    def test_one_obligation_one_control_is_a_complete_minimal_mapping(self):
        mapping = generate_obligation_to_control_mapping(
            "OCM-T-002",
            obligations=[{"obligation_id": "OBL-1", "description": "d1"}],
            controls=[{"control_id": "CTRL-1", "obligation_id": "OBL-1", "owner": "o", "evidence": "e", "test": "t"}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(OCM_SCHEMA, mapping, "minimal complete mapping")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, mapping = live.invoke(METHOD_ID, generate_obligation_to_control_mapping, "OCM-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.obligation_to_control_mapping.contract.yaml")
        self.assertEqual(mapping["id"], "OCM-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        mapping = _valid_mapping()
        mapping["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OCM_SCHEMA, mapping, "mapping with a smuggled top-level key")

    def test_schema_rejects_a_control_missing_test_field(self):
        mapping = _valid_mapping()
        del mapping["controls"][0]["test"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OCM_SCHEMA, mapping, "mapping with a control missing test")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.obligation_to_control_mapping.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.obligation_to_control_mapping contract")


class ObligationCountTests(unittest.TestCase):
    def test_zero_obligations_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OCM_EMPTY_OBLIGATIONS"):
            generate_obligation_to_control_mapping("OCM-T-003", obligations=[], controls=[], provenance=PROVENANCE)

    def test_duplicate_obligation_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["obligations"].append({"obligation_id": "OBL-1", "description": "duplicate"})
        with self.assertRaisesRegex(InvariantViolation, "OCM_DUPLICATE_OBLIGATION_ID"):
            generate_obligation_to_control_mapping("OCM-T-004", **kwargs)


class ControlShapeTests(unittest.TestCase):
    def test_control_missing_owner_is_refused(self):
        kwargs = _kwargs()
        kwargs["controls"][0]["owner"] = ""
        with self.assertRaisesRegex(InvariantViolation, "OCM_INVALID_CONTROL"):
            generate_obligation_to_control_mapping("OCM-T-005", **kwargs)

    def test_control_missing_evidence_is_refused(self):
        kwargs = _kwargs()
        kwargs["controls"][0]["evidence"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "OCM_INVALID_CONTROL"):
            generate_obligation_to_control_mapping("OCM-T-006", **kwargs)

    def test_control_missing_test_is_refused(self):
        kwargs = _kwargs()
        kwargs["controls"][0]["test"] = None
        with self.assertRaisesRegex(InvariantViolation, "OCM_INVALID_CONTROL"):
            generate_obligation_to_control_mapping("OCM-T-007", **kwargs)

    def test_duplicate_control_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["controls"].append(dict(kwargs["controls"][0]))
        with self.assertRaisesRegex(InvariantViolation, "OCM_DUPLICATE_CONTROL_ID"):
            generate_obligation_to_control_mapping("OCM-T-008", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_orphan_control_is_refused(self):
        kwargs = _kwargs()
        kwargs["controls"][0]["obligation_id"] = "OBL-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "OCM_ORPHAN_CONTROL"):
            generate_obligation_to_control_mapping("OCM-T-009", **kwargs)


class ObligationCoverageTests(unittest.TestCase):
    """Atlas L937's own 'obligation->control' pipeline stage -- every declared obligation covered by >=1 control."""

    def test_uncovered_obligation_is_refused(self):
        kwargs = _kwargs()
        kwargs["controls"] = [c for c in kwargs["controls"] if c["obligation_id"] != "OBL-2"]
        with self.assertRaisesRegex(InvariantViolation, "OCM_UNCOVERED_OBLIGATION"):
            generate_obligation_to_control_mapping("OCM-T-010", **kwargs)

    def test_fully_covered_mapping_is_accepted(self):
        mapping = _valid_mapping()
        self.assertEqual(len(mapping["controls"]), 3)

    def test_two_controls_for_one_obligation_is_legal(self):
        mapping = _valid_mapping()
        obl1_controls = [c for c in mapping["controls"] if c["obligation_id"] == "OBL-1"]
        self.assertEqual(len(obl1_controls), 2)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        mapping = generate_obligation_to_control_mapping("OCM-T-011", **kwargs)
        kwargs["controls"][0]["owner"] = "Someone Else Entirely"
        self.assertEqual(mapping["controls"][0]["owner"], "Data Protection Steward")
        self.assertIsNot(mapping["controls"], kwargs["controls"])
        self.assertIsNot(mapping["obligations"], kwargs["obligations"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_mapping(self):
        results = evaluate_obligation_to_control_mapping_gates(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_orphan_control(self):
        record = copy.deepcopy(_valid_mapping())
        record["controls"][0]["obligation_id"] = "OBL-NONEXISTENT"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_duplicate_control_id(self):
        record = copy.deepcopy(_valid_mapping())
        record["controls"].append(dict(record["controls"][0]))
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_obligation_coverage_gate_catches_hand_tampered_uncovered_obligation(self):
        record = copy.deepcopy(_valid_mapping())
        record["controls"] = [c for c in record["controls"] if c["obligation_id"] != "OBL-2"]
        gate = evaluate_obligation_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_obligation_coverage_gate_passes_a_genuinely_covered_mapping(self):
        gate = evaluate_obligation_coverage_gate(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_obligation_to_control_mapping_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_mapping())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "OCM-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OCM_INVALID_ID"):
            _valid_mapping(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OCM_INVALID_VERSION"):
            generate_obligation_to_control_mapping("OCM-T-012", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OCM_INVALID_PROVENANCE"):
            _valid_mapping(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.obligation_to_control_mapping")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_obligation_to_control_mapping_gates(_valid_mapping(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "obligation_coverage"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        mapping = _valid_mapping()
        self.assertEqual(
            set(mapping.keys()),
            {"id", "version", "generated_by_method", "obligations", "controls", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This corpus's own ``foresight.cross_impact_analysis`` module docstring records that 11 of a prior
    14-method batch returned the caller's own ``provenance`` dict BY REFERENCE rather than a copy -- mutating
    the caller's dict after construction silently rewrote the already-returned 'validated' record's provenance
    too, with no exception. This method's builder ``copy.deepcopy``s provenance at the return statement; this
    test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_mapping()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_obligation_to_control_mapping(base["id"], base["obligations"], base["controls"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

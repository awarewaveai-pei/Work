"""Mutation-style tests for ``experiment.wizard_of_oz`` (F15 experiment & validation family, Atlas L743).

Atlas's own "mock automation->human backend" contrast is proven at BOTH independent layers: the
construction-time builder refuses a front end not presented as automated, a backend not actually
human-operated, and an undisclosed fake; the independent gates re-derive the same rules directly from a
raw (possibly hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.wizard_of_oz import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_disclosure_integrity_gate,
    evaluate_provenance_required_gate,
    evaluate_wizard_of_oz_gates,
    evaluate_woz_contrast_integrity_gate,
    generate_wizard_of_oz_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

WIZARD_OF_OZ_SCHEMA = "ai-lego://specs/cognitive/typed-objects/wizard-of-oz-record.schema.yaml"
PROVENANCE = make_provenance("EVIDENCE", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        interaction_description="User asks a chat widget to 'find me a meeting slot next week' and receives a proposed time",
        front_end={
            "presented_as_automated": True,
            "description": "Chat widget labeled 'AI Scheduling Assistant' with instant-looking replies",
        },
        back_end={
            "actually_human_operated": True,
            "operator_role": "ops analyst manually reading the calendar",
            "description": "A human reads the request and types the proposed slot",
        },
        disclosure={
            "faked_components": ["the 'AI' scheduling logic (a human decides every slot)"],
            "real_components": ["the underlying calendar data"],
            "disclosed_to": "WILL_DISCLOSE_TO_USER_AT_STUDY_END",
        },
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "WOZ-T-001", **overrides: object):
    return generate_wizard_of_oz_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(WIZARD_OF_OZ_SCHEMA, _valid_record(), "wizard of oz record")

    def test_empty_real_components_is_a_valid_minimal_record(self):
        kwargs = _kwargs()
        kwargs["disclosure"]["real_components"] = []
        record = generate_wizard_of_oz_record("WOZ-T-002", **kwargs)
        self.contracts.validate(WIZARD_OF_OZ_SCHEMA, record, "record with no declared real components")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_wizard_of_oz_record, "WOZ-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.wizard_of_oz.contract.yaml")
        self.assertEqual(record["id"], "WOZ-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WIZARD_OF_OZ_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_disclosed_to_value(self):
        record = _valid_record()
        record["disclosure"]["disclosed_to"] = "MAYBE_LATER"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WIZARD_OF_OZ_SCHEMA, record, "record with an illegal disclosed_to")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.wizard_of_oz.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.wizard_of_oz contract")


class FrontEndContrastTests(unittest.TestCase):
    """THE defining contrast half distinguishing this method from experiment.concierge_test."""

    def test_front_not_presented_as_automated_is_refused(self):
        kwargs = _kwargs()
        kwargs["front_end"]["presented_as_automated"] = False
        with self.assertRaisesRegex(InvariantViolation, "WOZ_FRONT_NOT_AUTOMATED_LOOKING"):
            generate_wizard_of_oz_record("WOZ-T-003", **kwargs)

    def test_front_end_empty_description_is_refused(self):
        kwargs = _kwargs()
        kwargs["front_end"]["description"] = ""
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_FRONT_END"):
            generate_wizard_of_oz_record("WOZ-T-004", **kwargs)

    def test_front_end_non_bool_flag_is_refused(self):
        kwargs = _kwargs()
        kwargs["front_end"]["presented_as_automated"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_FRONT_END"):
            generate_wizard_of_oz_record("WOZ-T-005", **kwargs)


class BackEndContrastTests(unittest.TestCase):
    """THE other defining contrast half -- a False here is just claiming a real automated feature shipped."""

    def test_back_not_actually_human_operated_is_refused(self):
        kwargs = _kwargs()
        kwargs["back_end"]["actually_human_operated"] = False
        with self.assertRaisesRegex(InvariantViolation, "WOZ_BACK_NOT_HUMAN"):
            generate_wizard_of_oz_record("WOZ-T-006", **kwargs)

    def test_back_end_empty_operator_role_is_refused(self):
        kwargs = _kwargs()
        kwargs["back_end"]["operator_role"] = ""
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_BACK_END"):
            generate_wizard_of_oz_record("WOZ-T-007", **kwargs)


class DisclosureTests(unittest.TestCase):
    """The invariant this method's own name implies: the record must disclose what it fakes, to itself."""

    def test_zero_faked_components_is_refused(self):
        kwargs = _kwargs()
        kwargs["disclosure"]["faked_components"] = []
        with self.assertRaisesRegex(InvariantViolation, "WOZ_NO_DISCLOSURE"):
            generate_wizard_of_oz_record("WOZ-T-008", **kwargs)

    def test_illegal_disclosed_to_is_refused(self):
        kwargs = _kwargs()
        kwargs["disclosure"]["disclosed_to"] = "MAYBE_LATER"
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_DISCLOSURE"):
            generate_wizard_of_oz_record("WOZ-T-009", **kwargs)

    def test_empty_string_faked_component_is_refused(self):
        kwargs = _kwargs()
        kwargs["disclosure"]["faked_components"] = [""]
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_DISCLOSURE"):
            generate_wizard_of_oz_record("WOZ-T-010", **kwargs)

    def test_one_faked_component_is_the_legal_boundary(self):
        record = _valid_record()
        self.assertEqual(len(record["disclosure"]["faked_components"]), 1)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_wizard_of_oz_record("WOZ-T-011", **kwargs)
        kwargs["disclosure"]["faked_components"].append("late-addition")
        self.assertEqual(len(record["disclosure"]["faked_components"]), 1)

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("EVIDENCE", "HUMAN_ORIGINAL")
        record = generate_wizard_of_oz_record("WOZ-T-012", **_kwargs(provenance=provenance))
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "EVIDENCE")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_wizard_of_oz_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_woz_contrast_integrity_gate_catches_hand_tampered_front_not_automated(self):
        record = copy.deepcopy(_valid_record())
        record["front_end"]["presented_as_automated"] = False
        gate = evaluate_woz_contrast_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_woz_contrast_integrity_gate_catches_hand_tampered_back_not_human(self):
        record = copy.deepcopy(_valid_record())
        record["back_end"]["actually_human_operated"] = False
        gate = evaluate_woz_contrast_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_disclosure_integrity_gate_catches_hand_tampered_emptied_fakes(self):
        record = copy.deepcopy(_valid_record())
        record["disclosure"]["faked_components"] = []
        gate = evaluate_disclosure_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_wizard_of_oz_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "WOZ-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_VERSION"):
            generate_wizard_of_oz_record("WOZ-T-013", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WOZ_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_interaction_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WOZ_EMPTY_INTERACTION_DESCRIPTION"):
            _valid_record(interaction_description="   ")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.wizard_of_oz")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_wizard_of_oz_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "woz_contrast_integrity", "disclosure_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "interaction_description", "front_end", "back_end", "disclosure", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()

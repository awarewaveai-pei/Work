"""Mutation-style tests for ``representation.audio_conversational_view`` (F24 representation family,
Atlas L970).

Atlas's own "speech->structured objects->readback/confirm" pipeline is
proven at BOTH independent layers: the construction-time builder refuses a
CONFIRMED structured object with no readback/confirm evidence, and the
independent gate re-derives the same rule directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.audio_conversational_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_audio_conversational_view_gates,
    evaluate_provenance_required_gate,
    evaluate_readback_confirm_required_gate,
    generate_audio_conversational_view,
    structured_object,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

AUDIO_VIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/audio-conversational-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        knowledge_ref="KNOW-2026-09-12-001",
        structured_objects=[
            {
                "object_id": "SO-1",
                "status": "CONFIRMED",
                "transcript": "把截止日改成下週五",
                "readback_transcript": "你是說把截止日改成下週五，對嗎？",
                "confirmed_by_user": True,
            },
            {
                "object_id": "SO-2",
                "status": "DRAFT",
                "transcript": "新增一個負責人叫做小陳",
                "readback_transcript": None,
                "confirmed_by_user": False,
            },
        ],
        state={"visible_fields": ["object_id", "status", "transcript"]},
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "ACVIEW-T-001", **overrides: object):
    return generate_audio_conversational_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(AUDIO_VIEW_SCHEMA, _valid_view(), "audio conversational view")

    def test_all_draft_objects_is_a_valid_view(self):
        view = generate_audio_conversational_view(
            "ACVIEW-T-002",
            knowledge_ref="KNOW-1",
            structured_objects=[{"object_id": "SO-1", "status": "DRAFT", "transcript": "t1", "readback_transcript": None, "confirmed_by_user": False}],
            state={},
            provenance=PROVENANCE,
        )
        self.contracts.validate(AUDIO_VIEW_SCHEMA, view, "all-draft view")

    def test_zero_structured_objects_is_a_valid_vacuous_view(self):
        view = generate_audio_conversational_view("ACVIEW-T-003", knowledge_ref="KNOW-1", structured_objects=[], state={}, provenance=PROVENANCE)
        self.contracts.validate(AUDIO_VIEW_SCHEMA, view, "zero-object view")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_audio_conversational_view, "ACVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.audio_conversational_view.contract.yaml")
        self.assertEqual(view["id"], "ACVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AUDIO_VIEW_SCHEMA, view, "view with a smuggled top-level key")

    def test_schema_rejects_invalid_status_enum_value(self):
        view = _valid_view()
        view["structured_objects"][0]["status"] = "REJECTED"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AUDIO_VIEW_SCHEMA, view, "view with an invalid status enum value")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.audio_conversational_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.audio_conversational_view contract")


class ReadbackConfirmRequiredTests(unittest.TestCase):
    """Atlas L970's own 'readback/confirm' pipeline stage -- a CONFIRMED structured object must carry a
    non-empty readback_transcript AND confirmed_by_user=true."""

    def test_confirmed_with_no_readback_transcript_is_refused(self):
        kwargs = _kwargs()
        kwargs["structured_objects"][1]["status"] = "CONFIRMED"  # SO-2: readback_transcript still None, confirmed_by_user still False
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_MISSING_READBACK_CONFIRM"):
            generate_audio_conversational_view("ACVIEW-T-004", **kwargs)

    def test_confirmed_with_readback_but_confirmed_by_user_false_is_refused(self):
        kwargs = _kwargs()
        kwargs["structured_objects"][1]["status"] = "CONFIRMED"
        kwargs["structured_objects"][1]["readback_transcript"] = "你是說新增負責人小陳，對嗎？"
        # confirmed_by_user still False
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_MISSING_READBACK_CONFIRM"):
            generate_audio_conversational_view("ACVIEW-T-005", **kwargs)

    def test_confirmed_with_confirmed_by_user_true_but_no_readback_is_refused(self):
        kwargs = _kwargs()
        kwargs["structured_objects"][1]["status"] = "CONFIRMED"
        kwargs["structured_objects"][1]["confirmed_by_user"] = True
        # readback_transcript still None
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_MISSING_READBACK_CONFIRM"):
            generate_audio_conversational_view("ACVIEW-T-006", **kwargs)

    def test_whitespace_only_readback_is_refused_at_the_shape_layer(self):
        """readback_transcript, when not null, must be a genuine non-empty string -- whitespace-only is
        rejected as a shape defect regardless of status, before the CONFIRMED cross-field rule even runs."""
        kwargs = _kwargs()
        kwargs["structured_objects"][1]["readback_transcript"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_INVALID_STRUCTURED_OBJECT"):
            generate_audio_conversational_view("ACVIEW-T-007", **kwargs)

    def test_draft_with_no_readback_is_accepted(self):
        view = _valid_view()
        self.assertEqual(view["structured_objects"][1]["status"], "DRAFT")

    def test_confirmed_with_full_evidence_is_accepted(self):
        view = _valid_view()
        self.assertEqual(view["structured_objects"][0]["status"], "CONFIRMED")
        self.assertTrue(view["structured_objects"][0]["confirmed_by_user"])


class ObjectIdTests(unittest.TestCase):
    def test_duplicate_object_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["structured_objects"].append(dict(kwargs["structured_objects"][0]))
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_DUPLICATE_OBJECT_ID"):
            generate_audio_conversational_view("ACVIEW-T-008", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_audio_conversational_view("ACVIEW-T-009", **kwargs)
        kwargs["structured_objects"][0]["confirmed_by_user"] = False
        kwargs["state"]["visible_fields"].append("MUTATED")
        self.assertTrue(view["structured_objects"][0]["confirmed_by_user"])
        self.assertNotIn("MUTATED", view["state"]["visible_fields"])
        self.assertIsNot(view["structured_objects"], kwargs["structured_objects"])
        self.assertIsNot(view["state"], kwargs["state"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_audio_conversational_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_readback_confirm_gate_catches_hand_tampered_confirmed_by_user_flip(self):
        record = copy.deepcopy(_valid_view())
        record["structured_objects"][0]["confirmed_by_user"] = False
        gate = evaluate_readback_confirm_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_readback_confirm_gate_catches_hand_tampered_blanked_readback(self):
        record = copy.deepcopy(_valid_view())
        record["structured_objects"][0]["readback_transcript"] = None
        gate = evaluate_readback_confirm_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_readback_confirm_gate_passes_a_genuinely_valid_view(self):
        gate = evaluate_readback_confirm_required_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_audio_conversational_view_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_view())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ACVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_INVALID_VERSION"):
            generate_audio_conversational_view("ACVIEW-T-010", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_knowledge_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_INVALID_KNOWLEDGE_REF"):
            _valid_view(knowledge_ref="")

    def test_structured_object_helper_rejects_invalid_status(self):
        with self.assertRaisesRegex(InvariantViolation, "ACVIEW_INVALID_STRUCTURED_OBJECT"):
            structured_object("SO-1", "REJECTED", "t", None, False)

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.audio_conversational_view")

    def test_evaluate_gates_returns_two_gates_in_order(self):
        results = evaluate_audio_conversational_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "readback_confirm_required"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "knowledge_ref", "structured_objects", "state", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Guards against the recurring provenance-by-reference aliasing bug this corpus's F10/F13/F15/F22
    batches each found at least once: the returned record must never share the caller's own provenance
    dict object -- mutating the caller's dict after construction must not silently rewrite the
    already-returned 'validated' record's provenance too."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_audio_conversational_view(base["id"], base["knowledge_ref"], base["structured_objects"], base["state"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

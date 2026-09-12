"""Mutation-style tests for ``representation.switching`` (F24 representation family, Atlas L963, §11.55).

Atlas §11.55's own "Provenance 保持一致" / "不會...複製出多份互相衝突內容"
benefits are proven at BOTH independent layers: the construction-time
builder refuses a knowledge_object_id mismatch, a provenance mismatch, a
malformed view, and too few views, and the independent gates re-derive the
same rules directly from a raw (possibly hand-tampered) dict, never trusting
that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.switching import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VIEW_CATEGORIES,
    all_gates_pass,
    evaluate_cross_view_consistency_gate,
    evaluate_provenance_required_gate,
    evaluate_representation_switch_event_gates,
    evaluate_view_shape_gate,
    generate_representation_switch_event,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

REPRESENTATION_SWITCH_EVENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/representation-switch-event.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    shared_provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
    base = dict(
        views=[
            {"category": "text", "knowledge_object_id": "KO-001", "provenance": shared_provenance},
            {"category": "table", "knowledge_object_id": "KO-001", "provenance": shared_provenance},
            {"category": "mindmap", "knowledge_object_id": "KO-001", "provenance": shared_provenance},
        ],
        # A FRESH dict per call, not the module-level PROVENANCE constant -- some tests mutate
        # kwargs["provenance"] in place after construction to prove non-aliasing, which would otherwise
        # corrupt the shared PROVENANCE singleton for every other test in this module.
        provenance=make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    base.update(overrides)
    return base


def _valid_event(*, record_id: str = "REPSWITCH-T-001", **overrides: object):
    return generate_representation_switch_event(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_event_validates_against_the_real_schema(self):
        self.contracts.validate(REPRESENTATION_SWITCH_EVENT_SCHEMA, _valid_event(), "representation switch event")

    def test_two_views_is_a_complete_minimal_switch(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        event = generate_representation_switch_event(
            "REPSWITCH-T-002",
            views=[
                {"category": "text", "knowledge_object_id": "KO-002", "provenance": provenance},
                {"category": "table", "knowledge_object_id": "KO-002", "provenance": provenance},
            ],
            provenance=PROVENANCE,
        )
        self.contracts.validate(REPRESENTATION_SWITCH_EVENT_SCHEMA, event, "minimal complete switch")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, event = live.invoke(METHOD_ID, generate_representation_switch_event, "REPSWITCH-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.switching.contract.yaml")
        self.assertEqual(event["id"], "REPSWITCH-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        event = _valid_event()
        event["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(REPRESENTATION_SWITCH_EVENT_SCHEMA, event, "event with a smuggled top-level key")

    def test_schema_rejects_an_invalid_category(self):
        event = _valid_event()
        event["views"][0]["category"] = "not-a-real-category"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(REPRESENTATION_SWITCH_EVENT_SCHEMA, event, "event with an invalid category")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.switching.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.switching contract")


class ViewCategoryTests(unittest.TestCase):
    def test_view_categories_constant_matches_representation_schema_enum(self):
        self.assertEqual(VIEW_CATEGORIES, frozenset({"text", "outline", "table", "matrix", "mindmap", "conceptmap", "timeline", "causal", "graph", "canvas", "audio"}))

    def test_invalid_category_is_refused(self):
        kwargs = _kwargs()
        kwargs["views"][0]["category"] = "not-a-real-category"
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_INVALID_VIEWS"):
            generate_representation_switch_event("REPSWITCH-T-003", **kwargs)


class ViewCountTests(unittest.TestCase):
    def test_one_view_is_refused(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_TOO_FEW_VIEWS"):
            generate_representation_switch_event(
                "REPSWITCH-T-004",
                views=[{"category": "text", "knowledge_object_id": "KO-001", "provenance": provenance}],
                provenance=PROVENANCE,
            )

    def test_zero_views_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_TOO_FEW_VIEWS"):
            generate_representation_switch_event("REPSWITCH-T-005", views=[], provenance=PROVENANCE)


class KnowledgeObjectConsistencyTests(unittest.TestCase):
    """The FIRST half of Atlas §11.55's own real invariant."""

    def test_mismatched_knowledge_object_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["views"][-1]["knowledge_object_id"] = "KO-DIFFERENT"
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_KNOWLEDGE_OBJECT_MISMATCH"):
            generate_representation_switch_event("REPSWITCH-T-006", **kwargs)

    def test_consistent_knowledge_object_id_is_accepted(self):
        event = _valid_event()
        ids = {v["knowledge_object_id"] for v in event["views"]}
        self.assertEqual(ids, {"KO-001"})


class ProvenanceConsistencyTests(unittest.TestCase):
    """THE real invariant this method exists to enforce -- Atlas §11.55's own 'Provenance 保持一致'."""

    def test_mismatched_provenance_is_refused(self):
        kwargs = _kwargs()
        kwargs["views"][-1]["provenance"] = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_PROVENANCE_MISMATCH"):
            generate_representation_switch_event("REPSWITCH-T-007", **kwargs)

    def test_consistent_provenance_is_accepted(self):
        event = _valid_event()
        provenances = [v["provenance"] for v in event["views"]]
        self.assertTrue(all(p == provenances[0] for p in provenances))


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_top_level_provenance_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        event = generate_representation_switch_event("REPSWITCH-T-008", **kwargs)
        kwargs["provenance"]["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(event["provenance"]["epistemic_type"], "AI_INFERENCE")
        self.assertIsNot(event["provenance"], kwargs["provenance"])

    def test_mutating_caller_per_view_provenance_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        event = generate_representation_switch_event("REPSWITCH-T-009", **kwargs)
        kwargs["views"][0]["provenance"]["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(event["views"][0]["provenance"]["epistemic_type"], "AI_INFERENCE")
        self.assertIsNot(event["views"][0]["provenance"], kwargs["views"][0]["provenance"])

    def test_mutating_one_returned_views_provenance_does_not_affect_sibling_views(self):
        """The 3 rebuilt views[] entries must not all alias the SAME provenance dict object -- each is an
        independent copy, even though the caller supplied the same source dict for all 3."""
        event = _valid_event()
        event["views"][0]["provenance"]["epistemic_type"] = "MUTATED_IN_PLACE"
        self.assertEqual(event["views"][1]["provenance"]["epistemic_type"], "AI_INFERENCE")
        self.assertEqual(event["views"][2]["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_event(self):
        results = evaluate_representation_switch_event_gates(_valid_event(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_view_shape_gate_catches_hand_tampered_malformed_view(self):
        record = copy.deepcopy(_valid_event())
        del record["views"][0]["knowledge_object_id"]
        gate = evaluate_view_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_view_shape_gate_catches_hand_tampered_too_few_views(self):
        record = copy.deepcopy(_valid_event())
        record["views"] = record["views"][:1]
        gate = evaluate_view_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cross_view_consistency_gate_catches_hand_tampered_knowledge_object_mismatch(self):
        record = copy.deepcopy(_valid_event())
        record["views"][-1]["knowledge_object_id"] = "KO-DIFFERENT"
        gate = evaluate_cross_view_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cross_view_consistency_gate_catches_hand_tampered_provenance_mismatch(self):
        record = copy.deepcopy(_valid_event())
        record["views"][-1]["provenance"]["epistemic_type"] = "HUMAN_OPINION"
        gate = evaluate_cross_view_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cross_view_consistency_gate_passes_a_genuinely_consistent_event(self):
        gate = evaluate_cross_view_consistency_gate(_valid_event(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_representation_switch_event_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_event(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_event())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "REPSWITCH-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_INVALID_ID"):
            _valid_event(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_INVALID_VERSION"):
            generate_representation_switch_event("REPSWITCH-T-010", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REPSWITCH_INVALID_PROVENANCE"):
            _valid_event(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.switching")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_representation_switch_event_gates(_valid_event(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "view_shape", "cross_view_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        event = _valid_event()
        self.assertEqual(set(event.keys()), {"id", "version", "generated_by_method", "views", "provenance"})


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This session's own standing instruction after the recurring F10/F13/F15/F22 aliasing bug (a builder
    returning `provenance` BY REFERENCE instead of via `copy.deepcopy`): proves the fix and guards against a
    future regression, for BOTH the record-level `provenance` field and the per-view `provenance` field this
    method's own real invariant depends on."""

    def test_returned_record_does_not_alias_the_callers_top_level_provenance_dict(self):
        base = _valid_event()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        event = generate_representation_switch_event(base["id"], base["views"], provenance)
        self.assertIsNot(event["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(event["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_returned_record_does_not_alias_the_callers_per_view_provenance_dict(self):
        view_provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        views = [
            {"category": "text", "knowledge_object_id": "KO-ALIAS", "provenance": view_provenance},
            {"category": "table", "knowledge_object_id": "KO-ALIAS", "provenance": view_provenance},
        ]
        event = generate_representation_switch_event("REPSWITCH-T-ALIAS-001", views, PROVENANCE)
        self.assertIsNot(event["views"][0]["provenance"], view_provenance)
        view_provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(event["views"][0]["provenance"]["epistemic_type"], "AI_INFERENCE")
        self.assertEqual(event["views"][1]["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

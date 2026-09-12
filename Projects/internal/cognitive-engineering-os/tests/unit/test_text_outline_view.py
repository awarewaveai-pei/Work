"""Mutation-style tests for ``representation.text_outline_view`` (F24 Representation family, Atlas L964).

The shared F24 View law (no content duplication, Atlas §9 L1053) is proven at BOTH independent layers: the
construction-time builder refuses an inline-evidence-shaped reference, a non-reference-shaped
`source_knowledge_object_id`/`details_ref`, and an oversized summary; the independent gates re-derive the
same rules directly from a raw (possibly hand-tampered) dict, never trusting that the builder's own check
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
from ai_lego.modules.representation.text_outline_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    SUMMARY_MAX_LENGTH,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_reference_shape_gate,
    evaluate_summary_length_gate,
    evaluate_text_outline_view_gates,
    generate_text_outline_view,
    outline_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

TEXT_OUTLINE_VIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/text-outline-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        source_knowledge_object_id="KO-2026-09-12-001",
        summary="季度營運回顧的重點摘要",
        outline=[
            {
                "id": "N1",
                "summary": "營收成長 12%",
                "details_ref": "KO-2026-09-12-001/section/revenue",
                "evidence_links": ["EVID-2026-09-001", "EVID-2026-09-002"],
                "children": [
                    {"id": "N1.1", "summary": "主要來自海外市場", "evidence_links": ["EVID-2026-09-003"]},
                ],
            },
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "TXTVIEW-T-001", **overrides: object):
    return generate_text_outline_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(TEXT_OUTLINE_VIEW_SCHEMA, _valid_view(), "text outline view")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_text_outline_view, "TXTVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.text_outline_view.contract.yaml")
        self.assertEqual(view["id"], "TXTVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["content"] = "smuggled full text of the knowledge object"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TEXT_OUTLINE_VIEW_SCHEMA, view, "view with a smuggled top-level key")

    def test_schema_rejects_an_unknown_outline_node_key(self):
        view = _valid_view()
        view["outline"][0]["content"] = "smuggled full text"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TEXT_OUTLINE_VIEW_SCHEMA, view, "outline node with a smuggled content key")

    def test_schema_rejects_oversized_summary(self):
        view = _valid_view()
        view["summary"] = "x" * (SUMMARY_MAX_LENGTH + 1)
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TEXT_OUTLINE_VIEW_SCHEMA, view, "view with an oversized top-level summary")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.text_outline_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.text_outline_view contract")


class NoContentDuplicationTests(unittest.TestCase):
    """The shared F24 View law (Atlas §9 L1053) -- no field anywhere may hold copied Knowledge content."""

    def test_non_reference_shaped_source_knowledge_object_id_is_refused(self):
        kwargs = _kwargs(source_knowledge_object_id="this has a space")
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_NOT_A_REFERENCE"):
            generate_text_outline_view("TXTVIEW-T-002", **kwargs)

    def test_inline_evidence_text_in_evidence_links_is_refused(self):
        kwargs = _kwargs()
        kwargs["outline"][0]["evidence_links"].append("see page 12 for details")
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE_NODE"):
            generate_text_outline_view("TXTVIEW-T-003", **kwargs)

    def test_inline_text_in_details_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["outline"][0]["details_ref"] = "the full detail text lives right here"
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE_NODE"):
            generate_text_outline_view("TXTVIEW-T-004", **kwargs)

    def test_nested_child_with_inline_evidence_text_is_refused(self):
        kwargs = _kwargs()
        kwargs["outline"][0]["children"][0]["evidence_links"] = ["not a reference at all"]
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE_NODE"):
            generate_text_outline_view("TXTVIEW-T-005", **kwargs)

    def test_bare_id_reference_without_whitespace_is_accepted(self):
        view = _valid_view()
        self.assertEqual(view["outline"][0]["details_ref"], "KO-2026-09-12-001/section/revenue")


class SummaryLengthTests(unittest.TestCase):
    def test_oversized_top_level_summary_is_refused(self):
        kwargs = _kwargs(summary="x" * (SUMMARY_MAX_LENGTH + 1))
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_SUMMARY_TOO_LONG"):
            generate_text_outline_view("TXTVIEW-T-006", **kwargs)

    def test_oversized_nested_node_summary_is_refused(self):
        kwargs = _kwargs()
        kwargs["outline"][0]["children"][0]["summary"] = "x" * (SUMMARY_MAX_LENGTH + 1)
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE_NODE"):
            generate_text_outline_view("TXTVIEW-T-007", **kwargs)

    def test_empty_summary_is_refused(self):
        kwargs = _kwargs(summary="")
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_SUMMARY_TOO_LONG"):
            generate_text_outline_view("TXTVIEW-T-008", **kwargs)

    def test_boundary_summary_length_is_legal(self):
        kwargs = _kwargs(summary="x" * SUMMARY_MAX_LENGTH)
        view = generate_text_outline_view("TXTVIEW-T-009", **kwargs)
        self.assertEqual(len(view["summary"]), SUMMARY_MAX_LENGTH)


class OutlineShapeTests(unittest.TestCase):
    def test_empty_outline_is_refused(self):
        kwargs = _kwargs(outline=[])
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE"):
            generate_text_outline_view("TXTVIEW-T-010", **kwargs)

    def test_outline_node_missing_summary_is_refused(self):
        kwargs = _kwargs()
        del kwargs["outline"][0]["summary"]
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE_NODE"):
            generate_text_outline_view("TXTVIEW-T-011", **kwargs)

    def test_outline_node_constructor_rejects_bad_shape(self):
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_OUTLINE_NODE"):
            outline_node("N1", "x" * (SUMMARY_MAX_LENGTH + 1))

    def test_outline_node_constructor_builds_a_well_shaped_node(self):
        node = outline_node("N1", "summary", details_ref="REF-1", evidence_links=["EVID-1"])
        self.assertEqual(node, {"id": "N1", "summary": "summary", "details_ref": "REF-1", "evidence_links": ["EVID-1"]})


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_outline_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_text_outline_view("TXTVIEW-T-012", **kwargs)
        kwargs["outline"][0]["evidence_links"].append("EVID-MUTATED")
        self.assertNotIn("EVID-MUTATED", view["outline"][0]["evidence_links"])
        self.assertIsNot(view["outline"], kwargs["outline"])

    def test_mutating_caller_children_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_text_outline_view("TXTVIEW-T-013", **kwargs)
        kwargs["outline"][0]["children"][0]["summary"] = "MUTATED"
        self.assertEqual(view["outline"][0]["children"][0]["summary"], "主要來自海外市場")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_text_outline_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_reference_shape_gate_catches_hand_tampered_evidence_link(self):
        record = copy.deepcopy(_valid_view())
        record["outline"][0]["evidence_links"].append("inline text with spaces")
        gate = evaluate_reference_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_reference_shape_gate_catches_hand_tampered_nested_details_ref(self):
        record = copy.deepcopy(_valid_view())
        record["outline"][0]["children"][0]["details_ref"] = "not a reference"
        gate = evaluate_reference_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_reference_shape_gate_catches_hand_tampered_source_knowledge_object_id(self):
        record = copy.deepcopy(_valid_view())
        record["source_knowledge_object_id"] = "not a reference"
        gate = evaluate_reference_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_summary_length_gate_catches_hand_tampered_oversized_summary(self):
        record = copy.deepcopy(_valid_view())
        record["outline"][0]["summary"] = "x" * (SUMMARY_MAX_LENGTH + 1)
        gate = evaluate_summary_length_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_summary_length_gate_catches_hand_tampered_nested_oversized_summary(self):
        record = copy.deepcopy(_valid_view())
        record["outline"][0]["children"][0]["summary"] = "x" * (SUMMARY_MAX_LENGTH + 1)
        gate = evaluate_summary_length_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_summary_length_gate_passes_a_genuinely_valid_view(self):
        gate = evaluate_summary_length_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_text_outline_view_gates(bad, "test", "2026-09-12T00:00:00Z")
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
        self.assertEqual(RECORD_ID_PREFIX, "TXTVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_VERSION"):
            generate_text_outline_view("TXTVIEW-T-014", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TXTVIEW_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.text_outline_view")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_text_outline_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "reference_shape", "summary_length"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "source_knowledge_object_id", "summary", "outline", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Standing instruction after the recurring F10/F13/F15/F22 aliasing bug: a builder must never return the
    caller's own `provenance` dict BY REFERENCE. This test proves the fix and guards against a regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_text_outline_view(base["id"], base["source_knowledge_object_id"], base["summary"], base["outline"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

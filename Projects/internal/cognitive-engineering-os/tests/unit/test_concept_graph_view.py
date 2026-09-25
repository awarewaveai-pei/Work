"""Mutation-style tests for ``representation.concept_graph_view`` (F24 representation family, Atlas L967).

Atlas's own "render relations/provenance" pipeline stage is proven at BOTH independent layers: the
construction-time builder refuses an edge fabricating a relation_type/provenance_ref the source data does not
have, and the independent gates re-derive the same rule directly from a raw (possibly hand-tampered) dict plus
a fresh ground-truth source_relations[] list, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.concept_graph_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_concept_graph_view_gates,
    evaluate_no_content_duplication_gate,
    evaluate_provenance_required_gate,
    evaluate_rendering_fidelity_gate,
    generate_concept_graph_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CGRAPH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/concept-graph-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _source_relations() -> list[dict[str, object]]:
    return [
        {"relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-REL-1"},
        {"relation_id": "REL-2", "relation_type": "contradicts", "provenance_ref": "PROV-REL-2"},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        knowledge_ref="KO-T-001",
        source_relations=[
            {"relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-REL-1"},
            {"relation_id": "REL-2", "relation_type": "contradicts", "provenance_ref": "PROV-REL-2"},
        ],
        edges=[
            {"edge_id": "EDGE-1", "relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-REL-1", "layout_position": {"x": 0, "y": 0}, "visible": True},
            {"edge_id": "EDGE-2", "relation_id": "REL-2", "relation_type": "contradicts", "provenance_ref": "PROV-REL-2", "layout_position": {"x": 10, "y": 20}, "visible": True},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "CGRAPH-T-001", **overrides: object):
    return generate_concept_graph_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(CGRAPH_SCHEMA, _valid_view(), "concept graph view")

    def test_one_edge_is_a_valid_minimal_graph(self):
        view = generate_concept_graph_view(
            "CGRAPH-T-002",
            knowledge_ref="KO-T-002",
            source_relations=[{"relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-1"}],
            edges=[{"edge_id": "EDGE-1", "relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-1", "layout_position": {"x": 0, "y": 0}, "visible": True}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(CGRAPH_SCHEMA, view, "minimal graph")

    def test_zero_edges_is_a_valid_empty_graph(self):
        view = generate_concept_graph_view("CGRAPH-T-003", knowledge_ref="KO-T-003", source_relations=[], edges=[], provenance=PROVENANCE)
        self.assertEqual(view["edges"], [])
        self.contracts.validate(CGRAPH_SCHEMA, view, "empty graph")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_concept_graph_view, "CGRAPH-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.concept_graph_view.contract.yaml")
        self.assertEqual(view["id"], "CGRAPH-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CGRAPH_SCHEMA, view, "view with a smuggled top-level key")

    def test_schema_rejects_an_edge_with_a_smuggled_content_field(self):
        view = _valid_view()
        view["edges"][0]["description"] = "sneaked-in content"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CGRAPH_SCHEMA, view, "view with a smuggled edge content field")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.concept_graph_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.concept_graph_view contract")


class RenderingFidelityTests(unittest.TestCase):
    """Atlas L967's own 'render relations/provenance' pipeline stage -- an edge must exactly mirror its
    referenced source relation, never fabricate a different one."""

    def test_fabricated_relation_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][1]["relation_type"] = "supports"  # REL-2 is actually "contradicts"
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_RELATION_TYPE_MISMATCH"):
            generate_concept_graph_view("CGRAPH-T-004", **kwargs)

    def test_fabricated_provenance_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["provenance_ref"] = "PROV-WRONG"
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_PROVENANCE_REF_MISMATCH"):
            generate_concept_graph_view("CGRAPH-T-005", **kwargs)

    def test_dangling_relation_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["relation_id"] = "REL-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_DANGLING_RELATION_REF"):
            generate_concept_graph_view("CGRAPH-T-006", **kwargs)

    def test_faithful_edges_are_accepted(self):
        view = _valid_view()
        self.assertEqual(len(view["edges"]), 2)
        self.assertEqual(view["edges"][0]["relation_type"], "supports")
        self.assertEqual(view["edges"][1]["relation_type"], "contradicts")

    def test_duplicate_source_relation_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["source_relations"].append({"relation_id": "REL-1", "relation_type": "supports", "provenance_ref": "PROV-DUP"})
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_DUPLICATE_SOURCE_RELATION"):
            generate_concept_graph_view("CGRAPH-T-007", **kwargs)

    def test_duplicate_edge_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"].append(dict(kwargs["edges"][0]))
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_DUPLICATE_EDGE_ID"):
            generate_concept_graph_view("CGRAPH-T-008", **kwargs)


class EdgeShapeTests(unittest.TestCase):
    def test_edge_extra_key_on_caller_input_is_silently_dropped_never_persisted(self):
        """The builder rebuilds every edge from its own named fields (same ``.get()``-extraction convention
        ``foresight.cross_impact_analysis``'s ``event()`` uses) -- an extra key on the CALLER's raw input dict
        is dropped, not smuggled through. Hand-tampering the RETURNED record afterwards is what
        ``evaluate_no_content_duplication_gate``/the schema's ``additionalProperties: false`` catch instead
        (see GateIndependenceTests / SpecConformanceTests)."""
        kwargs = _kwargs()
        kwargs["edges"][0]["description"] = "sneaked-in content"
        view = generate_concept_graph_view("CGRAPH-T-009", **kwargs)
        self.assertNotIn("description", view["edges"][0])

    def test_edge_missing_layout_position_is_refused(self):
        kwargs = _kwargs()
        del kwargs["edges"][0]["layout_position"]
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_EDGES"):
            generate_concept_graph_view("CGRAPH-T-010", **kwargs)

    def test_edge_with_non_numeric_layout_position_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["layout_position"] = {"x": "zero", "y": 0}
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_EDGES"):
            generate_concept_graph_view("CGRAPH-T-011", **kwargs)

    def test_edge_with_non_bool_visible_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["visible"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_EDGES"):
            generate_concept_graph_view("CGRAPH-T-012", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_concept_graph_view("CGRAPH-T-013", **kwargs)
        kwargs["edges"][0]["layout_position"]["x"] = 999
        self.assertEqual(view["edges"][0]["layout_position"]["x"], 0)
        self.assertIsNot(view["edges"], kwargs["edges"])
        self.assertIsNot(view["edges"][0]["layout_position"], kwargs["edges"][0]["layout_position"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_concept_graph_view_gates(_valid_view(), _source_relations(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_rendering_fidelity_gate_catches_hand_tampered_relation_type(self):
        record = copy.deepcopy(_valid_view())
        record["edges"][0]["relation_type"] = "contradicts"  # was "supports"
        gate = evaluate_rendering_fidelity_gate(record, _source_relations(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_rendering_fidelity_gate_catches_hand_tampered_provenance_ref(self):
        record = copy.deepcopy(_valid_view())
        record["edges"][0]["provenance_ref"] = "PROV-WRONG"
        gate = evaluate_rendering_fidelity_gate(record, _source_relations(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_rendering_fidelity_gate_passes_a_genuinely_faithful_view(self):
        gate = evaluate_rendering_fidelity_gate(_valid_view(), _source_relations(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_no_content_duplication_gate_catches_hand_tampered_smuggled_key(self):
        record = copy.deepcopy(_valid_view())
        record["edges"][0]["description"] = "sneaked-in content"
        gate = evaluate_no_content_duplication_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_no_content_duplication_gate_passes_a_genuinely_closed_shape_view(self):
        gate = evaluate_no_content_duplication_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_concept_graph_view_gates(bad, _source_relations(), "test", "2026-09-12T00:00:00Z")
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
        self.assertEqual(RECORD_ID_PREFIX, "CGRAPH-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_VERSION"):
            generate_concept_graph_view("CGRAPH-T-014", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_knowledge_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CGRAPH_INVALID_KNOWLEDGE_REF"):
            _valid_view(knowledge_ref="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.concept_graph_view")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_concept_graph_view_gates(_valid_view(), _source_relations(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "no_content_duplication", "rendering_fidelity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "knowledge_ref", "edges", "provenance"},
        )

    def test_builder_never_persists_source_relations_onto_the_record(self):
        """Direct proof of Atlas L1053's no-duplication law: the ground-truth source_relations[] the builder
        was given never appears anywhere on the returned record."""
        view = _valid_view()
        self.assertNotIn("source_relations", view)


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This corpus's own ``foresight.cross_impact_analysis`` module docstring records that 11 of a prior
    14-method batch returned the caller's own ``provenance`` dict BY REFERENCE rather than a copy -- mutating
    the caller's dict after construction silently rewrote the already-returned 'validated' record's provenance
    too, with no exception. This method's builder ``copy.deepcopy``s provenance at the return statement; this
    test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_concept_graph_view(base["id"], base["knowledge_ref"], _source_relations(), base["edges"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

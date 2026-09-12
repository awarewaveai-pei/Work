"""Mutation-style tests for ``representation.mind_map_view`` (F24 Representation family, Atlas L966).

Includes an explicit disambiguation test proving structural type-incompatibility with
``association.mind_map``'s own ``MINDMAP-`` records (different id pattern, no shared content fields). The
shared F24 View law (no content duplication, Atlas §9 L1053) and referential integrity are each proven at
BOTH independent layers: the construction-time builder refuses a non-reference-shaped id, a dangling center
reference, and a duplicate node_id; the independent gates re-derive the same rules directly from a raw
(possibly hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.mind_map_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_mind_map_view_gates,
    evaluate_position_validity_gate,
    evaluate_provenance_required_gate,
    evaluate_reference_integrity_gate,
    generate_mind_map_view,
    node_position,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

MIND_MAP_VIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/mind-map-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        source_knowledge_object_id="KO-2026-09-12-003",
        node_positions=[
            {"node_id": "KNODE-CENTER", "x": 0, "y": 0, "distance_from_center": 0},
            {"node_id": "KNODE-A", "x": 100, "y": 0, "distance_from_center": 100},
            {"node_id": "KNODE-B", "x": -70.7, "y": 70.7, "distance_from_center": 100},
        ],
        layout={"center_node_id": "KNODE-CENTER", "orientation": "radial"},
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "MMVIEW-T-001", **overrides: object):
    return generate_mind_map_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(MIND_MAP_VIEW_SCHEMA, _valid_view(), "mind map view")

    def test_minimal_view_with_no_layout_validates(self):
        view = generate_mind_map_view(
            "MMVIEW-T-002",
            source_knowledge_object_id="KO-1",
            node_positions=[{"node_id": "N1", "x": 0, "y": 0}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(MIND_MAP_VIEW_SCHEMA, view, "minimal mind map view")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_mind_map_view, "MMVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.mind_map_view.contract.yaml")
        self.assertEqual(view["id"], "MMVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["central_topic"] = "smuggled association.mind_map content field"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MIND_MAP_VIEW_SCHEMA, view, "view with a smuggled central_topic key")

    def test_schema_rejects_keywords_on_a_node_position(self):
        view = _valid_view()
        view["node_positions"][0]["keywords"] = ["smuggled", "content"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MIND_MAP_VIEW_SCHEMA, view, "node_position with a smuggled keywords key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.mind_map_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.mind_map_view contract")


class DisambiguationFromAssociationMindMapTests(unittest.TestCase):
    """Proves this method's records are structurally TYPE-INCOMPATIBLE with association.mind_map's own
    MINDMAP- records -- the highest-risk duplication point named by this task."""

    def test_record_id_prefix_is_not_mindmap(self):
        self.assertEqual(RECORD_ID_PREFIX, "MMVIEW-")
        self.assertNotEqual(RECORD_ID_PREFIX, "MINDMAP-")

    def test_a_mindmap_shaped_record_fails_this_schema(self):
        """A MINDMAP- record (association.mind_map's own shape) must fail MMVIEW's schema: wrong id
        pattern, missing required fields, and unknown keys (central_topic/main_branches)."""
        contracts = SchemaContracts(resolve_spec_root())
        mindmap_shaped_record = {
            "id": "MINDMAP-2026-09-12-001",
            "version": "1.0.0",
            "generated_by_method": "association.mind_map",
            "central_topic": "some topic",
            "main_branches": [{"id": "B1", "label": "branch one", "provenance": PROVENANCE}],
            "provenance": PROVENANCE,
        }
        with self.assertRaises(SchemaValidationError):
            contracts.validate(MIND_MAP_VIEW_SCHEMA, mindmap_shaped_record, "a MINDMAP- shaped record must fail MMVIEW schema")

    def test_builder_never_accepts_a_central_topic_or_label_kwarg(self):
        """The builder's own signature has no field capable of carrying association.mind_map's content --
        passing one would be a TypeError, not a silently-accepted extra field."""
        with self.assertRaises(TypeError):
            generate_mind_map_view("MMVIEW-T-003", **_kwargs(), central_topic="smuggled")  # type: ignore[call-arg]

    def test_view_record_carries_no_label_or_keyword_field_anywhere(self):
        view = _valid_view()
        self.assertNotIn("central_topic", view)
        self.assertNotIn("main_branches", view)
        for position in view["node_positions"]:
            self.assertNotIn("label", position)
            self.assertNotIn("keywords", position)


class NoContentDuplicationTests(unittest.TestCase):
    """The shared F24 View law (Atlas §9 L1053) -- node_id/center_node_id are references, never content."""

    def test_non_reference_shaped_source_knowledge_object_id_is_refused(self):
        kwargs = _kwargs(source_knowledge_object_id="this has a space")
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_NOT_A_REFERENCE"):
            generate_mind_map_view("MMVIEW-T-004", **kwargs)

    def test_non_reference_shaped_node_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["node_positions"][0]["node_id"] = "this has a space"
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITION_ENTRY"):
            generate_mind_map_view("MMVIEW-T-005", **kwargs)

    def test_non_reference_shaped_center_node_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["layout"]["center_node_id"] = "this has a space"
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_DANGLING_CENTER_REF"):
            generate_mind_map_view("MMVIEW-T-006", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_center_node_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["layout"]["center_node_id"] = "KNODE-NEVER-RENDERED"
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_DANGLING_CENTER_REF"):
            generate_mind_map_view("MMVIEW-T-007", **kwargs)

    def test_duplicate_node_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["node_positions"].append(dict(kwargs["node_positions"][0]))
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_DUPLICATE_NODE_ID"):
            generate_mind_map_view("MMVIEW-T-008", **kwargs)

    def test_empty_node_positions_is_refused(self):
        kwargs = _kwargs(node_positions=[])
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITIONS"):
            generate_mind_map_view("MMVIEW-T-009", **kwargs)


class PositionValidityTests(unittest.TestCase):
    def test_nan_x_is_refused(self):
        kwargs = _kwargs()
        kwargs["node_positions"][0]["x"] = float("nan")
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITION_ENTRY"):
            generate_mind_map_view("MMVIEW-T-010", **kwargs)

    def test_infinite_y_is_refused(self):
        kwargs = _kwargs()
        kwargs["node_positions"][0]["y"] = float("inf")
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITION_ENTRY"):
            generate_mind_map_view("MMVIEW-T-011", **kwargs)

    def test_negative_distance_from_center_is_refused(self):
        kwargs = _kwargs()
        kwargs["node_positions"][0]["distance_from_center"] = -1
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITION_ENTRY"):
            generate_mind_map_view("MMVIEW-T-012", **kwargs)

    def test_boolean_x_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["node_positions"][0]["x"] = True
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITION_ENTRY"):
            generate_mind_map_view("MMVIEW-T-013", **kwargs)

    def test_zero_and_negative_coordinates_are_legal(self):
        view = generate_mind_map_view(
            "MMVIEW-T-014",
            source_knowledge_object_id="KO-1",
            node_positions=[{"node_id": "N1", "x": -50, "y": 0}],
            provenance=PROVENANCE,
        )
        self.assertEqual(view["node_positions"][0]["x"], -50)


class NodePositionConstructorTests(unittest.TestCase):
    def test_constructor_builds_a_well_shaped_entry(self):
        entry = node_position("N1", 1.5, -2.5, distance_from_center=3.0)
        self.assertEqual(entry, {"node_id": "N1", "x": 1.5, "y": -2.5, "distance_from_center": 3.0})

    def test_constructor_rejects_bad_shape(self):
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_NODE_POSITION_ENTRY"):
            node_position("has a space", 0, 0)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_node_positions_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_mind_map_view("MMVIEW-T-015", **kwargs)
        kwargs["node_positions"][0]["x"] = -999
        self.assertEqual(view["node_positions"][0]["x"], 0)
        self.assertIsNot(view["node_positions"], kwargs["node_positions"])

    def test_mutating_caller_layout_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_mind_map_view("MMVIEW-T-016", **kwargs)
        kwargs["layout"]["orientation"] = "MUTATED"
        self.assertEqual(view["layout"]["orientation"], "radial")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_mind_map_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_reference_integrity_gate_catches_hand_tampered_duplicate_node_id(self):
        record = copy.deepcopy(_valid_view())
        record["node_positions"].append(dict(record["node_positions"][0]))
        gate = evaluate_reference_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_reference_integrity_gate_catches_hand_tampered_dangling_center(self):
        record = copy.deepcopy(_valid_view())
        record["layout"]["center_node_id"] = "KNODE-NEVER-RENDERED"
        gate = evaluate_reference_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_position_validity_gate_catches_hand_tampered_nan(self):
        record = copy.deepcopy(_valid_view())
        record["node_positions"][0]["x"] = float("nan")
        gate = evaluate_position_validity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_position_validity_gate_passes_a_genuinely_valid_view(self):
        gate = evaluate_position_validity_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_mind_map_view_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))


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
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_VERSION"):
            generate_mind_map_view("MMVIEW-T-017", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MMVIEW_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.mind_map_view")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_mind_map_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "reference_integrity", "position_validity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "source_knowledge_object_id", "node_positions", "layout", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Standing instruction after the recurring F10/F13/F15/F22 aliasing bug: a builder must never return the
    caller's own `provenance` dict BY REFERENCE. This test proves the fix and guards against a regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_mind_map_view(base["id"], base["source_knowledge_object_id"], base["node_positions"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

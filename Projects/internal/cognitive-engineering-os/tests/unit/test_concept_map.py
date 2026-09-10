"""Mutation-style tests for ``association.concept_map`` (F04 associative-mapping family's 1st member, Atlas
F04 table row L412 + §11.2, L1176-1203).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_concept_map_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_concept_map_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/concept-map-record.schema.yaml``), including an
``additionalProperties: false`` top-level and nested-item rejection check.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.association.concept_map import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    concept_edge,
    concept_node,
    evaluate_concept_map_gates,
    evaluate_concept_map_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_concept_map_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CONCEPT_MAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/concept-map-record.schema.yaml"


def _nodes() -> list[dict]:
    return [concept_node("N1", "AI 教育平台"), concept_node("N2", "學生"), concept_node("N3", "教育規範"), concept_node("N4", "競品觀察")]


def _edges(*, evidence_refs: list[str] | None = ("E-1",)) -> list[dict]:
    # N1->N2 sourced (EVIDENCE), N1->N3 inferred (AI_INFERENCE, no refs claimed) -- N4 is a deliberate orphan.
    return [
        concept_edge("N1", "N2", "服務", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=list(evidence_refs) if evidence_refs else None),
        concept_edge("N1", "N3", "需符合", make_provenance("AI_INFERENCE", "AI_SUGGESTED")),
    ]


def _valid_record(*, record_id: str = "CONCEPTMAP-T-001", context: str = "test context", nodes=None, edges=None):
    return generate_concept_map_record(
        record_id,
        context,
        nodes if nodes is not None else _nodes(),
        edges if edges is not None else _edges(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(CONCEPT_MAP_SCHEMA, _valid_record(), "concept map record")

    def test_orphan_node_is_exactly_n4(self):
        record = _valid_record()
        self.assertEqual(record["orphan_node_ids"], ["N4"])

    def test_fully_connected_graph_has_empty_orphan_node_ids_and_validates(self):
        nodes = [concept_node("N1", "a"), concept_node("N2", "b")]
        edges = [concept_edge("N1", "N2", "relates_to", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])]
        record = _valid_record(nodes=nodes, edges=edges)
        self.contracts.validate(CONCEPT_MAP_SCHEMA, record, "fully connected record")
        self.assertEqual(record["orphan_node_ids"], [])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_concept_map_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_VERSION"):
            generate_concept_map_record("CONCEPTMAP-T-002", "context", _nodes(), _edges(), make_provenance("AI_INFERENCE", "AI_GENERATED"), version=1)

    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_EMPTY_CONTEXT"):
            _valid_record(context="   ")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: an EVIDENCE-labeled edge hand-tampered to drop its refs fails BOTH the runtime
        gate and the real JSON schema's own if/then branch independently."""
        tampered = copy.deepcopy(_valid_record())
        del tampered["edges"][0]["supporting_evidence_refs"]  # N1->N2 is EVIDENCE-labeled
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCEPT_MAP_SCHEMA, tampered, "tampered record")
        gate = evaluate_evidence_labeling_required_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCEPT_MAP_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_node_key(self):
        record = _valid_record()
        record["nodes"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCEPT_MAP_SCHEMA, record, "record with unknown node key")

    def test_schema_rejects_unknown_edge_key(self):
        record = _valid_record()
        record["edges"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCEPT_MAP_SCHEMA, record, "record with unknown edge key")

    def test_schema_rejects_edge_missing_relationship_type(self):
        record = _valid_record()
        del record["edges"][0]["relationship_type"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCEPT_MAP_SCHEMA, record, "record with missing relationship_type")


class NodeShapeTests(unittest.TestCase):
    def test_too_few_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_NODES"):
            _valid_record(nodes=[concept_node("N1", "solo")], edges=[])

    def test_nodes_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_NODES"):
            _valid_record(nodes="not-a-list")

    def test_node_missing_required_key_is_refused(self):
        nodes = _nodes()
        del nodes[0]["label"]
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_NODES"):
            _valid_record(nodes=nodes)

    def test_node_unknown_extra_key_is_refused(self):
        nodes = _nodes()
        nodes[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_NODES"):
            _valid_record(nodes=nodes)

    def test_node_empty_label_is_refused(self):
        nodes = _nodes()
        nodes[0]["label"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_NODES"):
            _valid_record(nodes=nodes)

    def test_duplicate_node_id_is_refused(self):
        nodes = _nodes()
        nodes[1]["id"] = nodes[0]["id"]
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_DUPLICATE_NODE_ID"):
            _valid_record(nodes=nodes)


class EdgeShapeAndReferentialIntegrityTests(unittest.TestCase):
    """The core invariant this method exists for: every edge must resolve to real declared nodes and carry a
    non-empty relationship type."""

    def test_empty_edges_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_EMPTY_EDGES"):
            _valid_record(edges=[])

    def test_edges_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_EMPTY_EDGES"):
            _valid_record(edges="not-a-list")

    def test_edge_missing_relationship_type_key_entirely_is_refused(self):
        edges = _edges()
        del edges[0]["relationship_type"]
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_EDGES"):
            _valid_record(edges=edges)

    def test_edge_blank_relationship_type_is_refused(self):
        edges = _edges()
        edges[0]["relationship_type"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_EDGE_MISSING_RELATIONSHIP_TYPE"):
            _valid_record(edges=edges)

    def test_edge_referencing_undeclared_from_node_is_refused(self):
        """THE core invariant: a dangling from_node_id/to_node_id must be refused, never silently accepted."""
        edges = _edges() + [concept_edge("N99", "N2", "影響", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_EDGE_DANGLING_REF"):
            _valid_record(edges=edges)

    def test_edge_referencing_undeclared_to_node_is_refused(self):
        edges = _edges() + [concept_edge("N2", "N99", "影響", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_EDGE_DANGLING_REF"):
            _valid_record(edges=edges)

    def test_edge_unknown_extra_key_is_refused(self):
        edges = _edges()
        edges[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_EDGES"):
            _valid_record(edges=edges)

    def test_edge_with_malformed_evidence_refs_shape_is_refused(self):
        edges = _edges()
        edges[0]["supporting_evidence_refs"] = []  # present but empty -- malformed, not "absent"
        with self.assertRaisesRegex(InvariantViolation, "CONCEPTMAP_INVALID_EDGES"):
            _valid_record(edges=edges)


class OrphanNodeComputeTests(unittest.TestCase):
    """GENUINE_COMPUTE: orphan_node_ids is derived, never caller-supplied, verified re-derivable."""

    def test_generate_concept_map_record_accepts_no_orphan_node_ids_parameter(self):
        """The builder signature itself has no orphan_node_ids parameter -- there is no code path for a caller
        to inject a mismatched value at construction time."""
        import inspect

        sig = inspect.signature(generate_concept_map_record)
        self.assertNotIn("orphan_node_ids", sig.parameters)

    def test_zero_orphans_when_every_node_is_referenced(self):
        nodes = [concept_node("N1", "a"), concept_node("N2", "b")]
        edges = [concept_edge("N1", "N2", "relates_to", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        record = _valid_record(nodes=nodes, edges=edges)
        self.assertEqual(record["orphan_node_ids"], [])

    def test_multiple_orphans_preserve_nodes_order(self):
        nodes = [concept_node("N1", "a"), concept_node("N2", "b"), concept_node("N3", "c"), concept_node("N4", "d")]
        edges = [concept_edge("N2", "N3", "relates_to", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        record = _valid_record(nodes=nodes, edges=edges)
        self.assertEqual(record["orphan_node_ids"], ["N1", "N4"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_orphan_node_ids_claiming_fewer_orphans_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["orphan_node_ids"] = []  # lies -- N4 is still unreferenced
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH")

    def test_gate_catches_hand_tampered_orphan_node_ids_claiming_more_orphans_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["orphan_node_ids"] = ["N1", "N2", "N3", "N4"]  # lies -- N1/N2/N3 are all referenced
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH")

    def test_gate_catches_hand_tampered_dangling_edge(self):
        record = copy.deepcopy(_valid_record())
        record["edges"][0]["to_node_id"] = "N99"
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_blank_relationship_type(self):
        record = copy.deepcopy(_valid_record())
        record["edges"][0]["relationship_type"] = ""
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_concept_map_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_context(self):
        record = copy.deepcopy(_valid_record())
        record["context"] = ""
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_too_few_nodes(self):
        record = copy.deepcopy(_valid_record())
        record["nodes"] = record["nodes"][:1]
        gate = evaluate_concept_map_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_an_edge_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["edges"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_edges_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_edge_cites_no_refs(self):
        record = _valid_record(edges=_edges(evidence_refs=None))  # N1->N2 labeled EVIDENCE but no refs
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_ignores_non_evidence_edges_with_no_refs(self):
        """An AI_INFERENCE-labeled edge (N1->N3) has no refs and must not be penalized -- only EVIDENCE-labeled
        edges are required to cite refs (Atlas §11.2 step 3)."""
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        problems = gate["evidence"][0]["problems"]
        self.assertFalse(any(p["edge"] == "N1->N3" for p in problems))


class HelperFunctionTests(unittest.TestCase):
    def test_concept_node_helper_shape(self):
        node = concept_node("N1", "AI 教育平台")
        self.assertEqual(node, {"id": "N1", "label": "AI 教育平台"})

    def test_concept_edge_helper_omits_supporting_evidence_refs_when_none(self):
        edge = concept_edge("N1", "N2", "服務", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertNotIn("supporting_evidence_refs", edge)

    def test_concept_edge_helper_includes_supporting_evidence_refs_when_given(self):
        edge = concept_edge("N1", "N2", "服務", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(edge["supporting_evidence_refs"], ["E-1"])

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_concept_map_gates_returns_three_gates_in_order(self):
        results = evaluate_concept_map_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "concept_map_integrity"])

    def test_evaluate_concept_map_gates_all_pass_on_a_valid_record(self):
        results = evaluate_concept_map_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CONCEPTMAP-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) -- verify the constant itself actually
        conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "association.concept_map")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()

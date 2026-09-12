"""Mutation-style tests for ``delivery.dependency_graph`` (F22 PM/Delivery/Governance Pack, Atlas L920).

Atlas's own "critical edges->owner->fallback" pipeline stage is proven at
BOTH independent layers: the construction-time builder refuses a critical
edge with no owner or no fallback, a dangling node reference, and a
duplicate node_id; the independent gates re-derive the same rules directly
from a raw (possibly hand-tampered) dict, never trusting that the builder's
own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.dependency_graph import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_critical_edge_completeness_gate,
    evaluate_dependency_graph_gates,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_dependency_graph,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

DEPENDENCY_GRAPH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/dependency-graph-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        nodes=[
            {"node_id": "T1", "node_type": "task", "description": "資料庫 schema migration"},
            {"node_id": "T2", "node_type": "task", "description": "API 層改動"},
            {"node_id": "M1", "node_type": "milestone", "description": "v2 API 上線"},
        ],
        edges=[
            {"from_node_id": "T1", "to_node_id": "T2", "critical": True, "owner": "資料庫團隊", "fallback": "改用 expand-contract 分兩階段上線"},
            {"from_node_id": "T2", "to_node_id": "M1", "critical": False, "owner": "", "fallback": ""},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_graph(*, record_id: str = "DEPGRAPH-T-001", **overrides: object):
    return generate_dependency_graph(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_graph_validates_against_the_real_schema(self):
        self.contracts.validate(DEPENDENCY_GRAPH_SCHEMA, _valid_graph(), "dependency graph")

    def test_single_node_no_edges_is_a_valid_minimal_graph(self):
        graph = generate_dependency_graph(
            "DEPGRAPH-T-002",
            nodes=[{"node_id": "T1", "node_type": "task", "description": "d1"}],
            edges=[],
            provenance=PROVENANCE,
        )
        self.contracts.validate(DEPENDENCY_GRAPH_SCHEMA, graph, "minimal single-node graph")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, graph = live.invoke(METHOD_ID, generate_dependency_graph, "DEPGRAPH-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.dependency_graph.contract.yaml")
        self.assertEqual(graph["id"], "DEPGRAPH-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        graph = _valid_graph()
        graph["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DEPENDENCY_GRAPH_SCHEMA, graph, "graph with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.dependency_graph.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.dependency_graph contract")


class NodeCountTests(unittest.TestCase):
    def test_zero_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_TOO_FEW_NODES"):
            generate_dependency_graph("DEPGRAPH-T-003", nodes=[], edges=[], provenance=PROVENANCE)

    def test_duplicate_node_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["nodes"].append({"node_id": "T1", "node_type": "task", "description": "duplicate"})
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_DUPLICATE_NODE_ID"):
            generate_dependency_graph("DEPGRAPH-T-004", **kwargs)

    def test_invalid_node_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["nodes"][0]["node_type"] = "service"
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_INVALID_NODE"):
            generate_dependency_graph("DEPGRAPH-T-005", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_from_node_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["from_node_id"] = "T-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_DANGLING_NODE_REF"):
            generate_dependency_graph("DEPGRAPH-T-006", **kwargs)

    def test_dangling_to_node_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["to_node_id"] = "T-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_DANGLING_NODE_REF"):
            generate_dependency_graph("DEPGRAPH-T-007", **kwargs)


class CriticalEdgeCompletenessTests(unittest.TestCase):
    """Atlas L920's own 'critical edges->owner->fallback' pipeline stage -- every critical edge needs both."""

    def test_critical_edge_with_empty_owner_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["owner"] = ""
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_CRITICAL_EDGE_INCOMPLETE"):
            generate_dependency_graph("DEPGRAPH-T-008", **kwargs)

    def test_critical_edge_with_empty_fallback_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["fallback"] = ""
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_CRITICAL_EDGE_INCOMPLETE"):
            generate_dependency_graph("DEPGRAPH-T-009", **kwargs)

    def test_critical_edge_with_both_owner_and_fallback_empty_is_refused(self):
        kwargs = _kwargs()
        kwargs["edges"][0]["owner"] = ""
        kwargs["edges"][0]["fallback"] = ""
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_CRITICAL_EDGE_INCOMPLETE"):
            generate_dependency_graph("DEPGRAPH-T-010", **kwargs)

    def test_non_critical_edge_may_have_empty_owner_and_fallback(self):
        graph = _valid_graph()
        non_critical = graph["edges"][1]
        self.assertFalse(non_critical["critical"])
        self.assertEqual(non_critical["owner"], "")
        self.assertEqual(non_critical["fallback"], "")

    def test_unrelated_shape_error_on_a_critical_edge_is_not_mislabeled(self):
        """Regression guard for the exact bug class experiment.mvp's decision_threshold documents: an
        unrelated failure (non-bool critical) on an edge that also happens to have empty owner/fallback
        must NOT be mislabeled DEPGRAPH_CRITICAL_EDGE_INCOMPLETE."""
        kwargs = _kwargs()
        kwargs["edges"][0]["critical"] = "yes"
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_INVALID_EDGE(?!_)") as ctx:
            generate_dependency_graph("DEPGRAPH-T-011", **kwargs)
        self.assertNotIn("DEPGRAPH_CRITICAL_EDGE_INCOMPLETE", str(ctx.exception))


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        graph = generate_dependency_graph("DEPGRAPH-T-012", **kwargs)
        kwargs["edges"][0]["fallback"] = "MUTATED AFTER RETURN"
        self.assertEqual(graph["edges"][0]["fallback"], "改用 expand-contract 分兩階段上線")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_graph(self):
        results = evaluate_dependency_graph_gates(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_graph())
        record["edges"][0]["from_node_id"] = "T-NONEXISTENT"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_too_few_nodes(self):
        record = copy.deepcopy(_valid_graph())
        record["nodes"] = []
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_critical_edge_completeness_gate_catches_hand_cleared_fallback(self):
        record = copy.deepcopy(_valid_graph())
        record["edges"][0]["fallback"] = ""
        gate = evaluate_critical_edge_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_critical_edge_completeness_gate_catches_hand_cleared_owner(self):
        record = copy.deepcopy(_valid_graph())
        record["edges"][0]["owner"] = ""
        gate = evaluate_critical_edge_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_critical_edge_completeness_gate_passes_a_genuinely_complete_graph(self):
        gate = evaluate_critical_edge_completeness_gate(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_dependency_graph_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_graph())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DEPGRAPH-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_INVALID_ID"):
            _valid_graph(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_INVALID_VERSION"):
            generate_dependency_graph("DEPGRAPH-T-013", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEPGRAPH_INVALID_PROVENANCE"):
            _valid_graph(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.dependency_graph")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_dependency_graph_gates(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "critical_edge_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        graph = _valid_graph()
        self.assertEqual(
            set(graph.keys()),
            {"id", "version", "generated_by_method", "nodes", "edges", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13/F15 batches found in a majority of their builders -- returning the
    caller's own ``provenance`` dict BY REFERENCE rather than a copy. Guards against regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_graph()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_dependency_graph(base["id"], base["nodes"], base["edges"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

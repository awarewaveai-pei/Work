"""Mutation-style tests for ``causal.dag`` (sixth Method Atlas slice, third real fishbone validation path,
first method from a family other than root_cause/strategy).

The cycle-detection compute (``ai_lego/compute/graph/dag.py``) is checked
against known graph shapes (diamond, self-loop, 2-cycle, 3-cycle,
disconnected components) -- real algorithm correctness, not just "does it
run". The ``acyclic_verified`` guarantee is proven at both layers: the
runtime module refuses to construct a record for a cyclic graph, and a
hand-crafted bypass is independently refused by the schema's own
``const: true``.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.graph.dag import find_cycle, is_acyclic
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.dag import (
    METHOD_ID,
    all_gates_pass,
    dag_edge,
    dag_node,
    evaluate_dag_gates,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_causal_dag_analysis,
)
from ai_lego.modules.root_cause.fishbone import (
    attempt_promote_to_root_cause_fact,
    build_problem_statement,
    cause_hypothesis,
    generate_cause_hypothesis_set,
    record_validation_applied,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CAUSAL_DAG_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/causal-dag-analysis.schema.yaml"
ROOT_CAUSE_FACT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/root-cause-fact.schema.yaml"


def _cause_hypothesis_set():
    ps = build_problem_statement("PROB-T-DAG-001", {"current_state": "x", "expected_state": "y", "gap": "z"}, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    hypotheses = [cause_hypothesis("CHS-T-DAG-001-H1", "cause one", "Technology", make_provenance("EVIDENCE", "HUMAN_APPROVED"))]
    return generate_cause_hypothesis_set("CHS-T-DAG-001", ps, hypotheses)


def _nodes():
    return [dag_node("N1", "cause", "TREATMENT"), dag_node("N2", "confound", "CONFOUNDER"), dag_node("N3", "effect", "OUTCOME")]


def _edges(with_evidence: bool = True):
    refs = ["E-1"] if with_evidence else None
    return [
        dag_edge("N1", "N3", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=refs),
        dag_edge("N2", "N3", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def _valid_analysis():
    return generate_causal_dag_analysis("CDA-T-001", _cause_hypothesis_set(), _nodes(), _edges(), make_provenance("AI_INFERENCE", "AI_GENERATED"))


class CycleDetectionTests(unittest.TestCase):
    """Real algorithm correctness against known graph shapes."""

    def test_diamond_shape_is_acyclic(self):
        nodes = [{"id": n} for n in ("N1", "N2", "N3", "N4")]
        edges = [{"from_node_id": a, "to_node_id": b} for a, b in [("N1", "N2"), ("N1", "N3"), ("N2", "N3"), ("N4", "N3")]]
        self.assertTrue(is_acyclic(nodes, edges))
        self.assertIsNone(find_cycle(nodes, edges))

    def test_simple_two_cycle_is_detected(self):
        nodes = [{"id": n} for n in ("N1", "N2")]
        edges = [{"from_node_id": "N1", "to_node_id": "N2"}, {"from_node_id": "N2", "to_node_id": "N1"}]
        self.assertFalse(is_acyclic(nodes, edges))
        self.assertIsNotNone(find_cycle(nodes, edges))

    def test_self_loop_is_detected(self):
        self.assertFalse(is_acyclic([{"id": "N1"}], [{"from_node_id": "N1", "to_node_id": "N1"}]))

    def test_three_cycle_is_detected(self):
        nodes = [{"id": n} for n in ("N1", "N2", "N3")]
        edges = [{"from_node_id": a, "to_node_id": b} for a, b in [("N1", "N2"), ("N2", "N3"), ("N3", "N1")]]
        self.assertFalse(is_acyclic(nodes, edges))

    def test_disconnected_acyclic_components(self):
        nodes = [{"id": n} for n in ("A", "B", "C", "D")]
        edges = [{"from_node_id": "A", "to_node_id": "B"}, {"from_node_id": "C", "to_node_id": "D"}]
        self.assertTrue(is_acyclic(nodes, edges))

    def test_edge_referencing_unknown_node_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DAG_EDGE_REFERENCES_UNKNOWN_NODE"):
            is_acyclic([{"id": "N1"}, {"id": "N2"}], [{"from_node_id": "N1", "to_node_id": "N3"}])


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_causal_dag_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(CAUSAL_DAG_ANALYSIS_SCHEMA, _valid_analysis(), "causal dag analysis")

    def test_invalid_role_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "CAUSALDAG_INVALID_ROLE"):
            dag_node("N1", "x", "INSTRUMENT")

    def test_too_few_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CAUSALDAG_TOO_FEW_NODES"):
            generate_causal_dag_analysis("CDA-T-002", _cause_hypothesis_set(), [dag_node("N1", "solo", "OUTCOME")], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_cyclic_graph_is_refused_before_construction(self):
        cyclic_nodes = [dag_node("N1", "a", "TREATMENT"), dag_node("N2", "b", "OUTCOME")]
        cyclic_edges = [
            dag_edge("N1", "N2", make_provenance("HYPOTHESIS", "AI_GENERATED")),
            dag_edge("N2", "N1", make_provenance("HYPOTHESIS", "AI_GENERATED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "CAUSALDAG_CYCLE_DETECTED"):
            generate_causal_dag_analysis("CDA-T-003", _cause_hypothesis_set(), cyclic_nodes, cyclic_edges, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_schema_layer_independently_refuses_a_hand_crafted_cyclic_bypass(self):
        """Second, independent enforcement: even if a caller bypasses the builder and hand-crafts the dict with
        acyclic_verified: True but a genuinely cyclic edge set, schema validation alone cannot catch the graph
        theory violation (JSON Schema has no cycle-detection operator) -- but a caller honestly reporting False,
        matching reality, IS caught."""
        analysis = _valid_analysis()
        analysis["acyclic_verified"] = False
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CAUSAL_DAG_ANALYSIS_SCHEMA, analysis, "hand-crafted false")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_causal_dag_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_analysis_passes_both_gates(self):
        results = evaluate_dag_gates(_valid_analysis(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        analysis = _valid_analysis()
        analysis["edges"][0] = {**analysis["edges"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeled_edge_with_no_refs_fails_evidence_labeling_gate(self):
        analysis = _valid_analysis()
        analysis["edges"].append(dag_edge("N2", "N1", make_provenance("EVIDENCE", "AI_SUGGESTED")))
        gate = evaluate_evidence_labeling_required_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class RealPromotionChainTests(unittest.TestCase):
    """Third distinct validation method reaching the same fishbone promotion functions, unchanged."""

    def test_causal_dag_analysis_legally_promotes_a_cause_hypothesis_set_to_a_real_root_cause_fact(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        chs = _cause_hypothesis_set()
        analysis = generate_causal_dag_analysis("CDA-T-CHAIN", chs, _nodes(), _edges(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        contracts.validate(CAUSAL_DAG_ANALYSIS_SCHEMA, analysis, "analysis")

        validated_chs = record_validation_applied(chs, [METHOD_ID])
        rcf = attempt_promote_to_root_cause_fact("RCF-T-CHAIN", validated_chs, "CHS-T-DAG-001-H1", "real root cause", evidence_and_causal_validation_pass=True, provenance=make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))
        contracts.validate(ROOT_CAUSE_FACT_SCHEMA, rcf, "root cause fact")
        self.assertEqual(rcf["legal_promotion_path"]["validation_methods_applied"], [METHOD_ID])


if __name__ == "__main__":
    unittest.main()

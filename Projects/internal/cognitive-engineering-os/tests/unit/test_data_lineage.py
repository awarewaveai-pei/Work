"""Mutation-style tests for ``database_data.data_lineage`` (twenty-eighth Method Atlas slice, second from the
`database_data` family). Atlas's own benefit bullet (a number can trace back to its original source) is proven
at BOTH independent layers -- construction-time and gate re-derivation, the gate RECOMPUTING traces_to_source
fresh rather than trusting a stored value -- same discipline a critic review of the sibling
`challenge.independent_judge` slice (WORKLOG continuation 40) already taught this session applies here from
the first draft, not after the fact.

Includes regressions for a SECOND critic review of THIS slice's own first draft, which found that sharing a
predicate between builder and gate removes drift but does not make either layer independently correct if the
shared predicate itself has a bug: (1) the original backward-DFS `traces_to_source` was order-dependent (the
identical graph gave different answers depending on `nodes[]` list order) and could raise `RecursionError` on
a reverse-ordered chain of a few hundred nodes -- both fixed by rewriting it as iterative forward reachability
from the SOURCE set; (2) duplicate node ids were not rejected anywhere (builder, gate, or schema), letting a
genuine orphan silently collapse onto a valid decoy's id and be certified `traces_to_source: true` at every
layer including schema validation -- fixed with a new shared `_duplicate_node_ids` predicate.

The compute layer (``ai_lego/compute/lineage/traversal.py``) is tested for real graph-traversal correctness
against known shapes (a single source, a linear chain, an orphan, a dangling reference, a 2-node cycle, a
3-node cycle with an exit to SOURCE, a real merge/join, and a 1000-node reverse-ordered chain), not just "does
it run" -- and the cycle/merge cases are each tested in BOTH node orderings to prove the result no longer
depends on input order."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.lineage.traversal import traces_to_source
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.data_lineage import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_lineage_gates,
    evaluate_genuine_compute_gate,
    evaluate_provenance_required_gate,
    evaluate_structural_integrity_gate,
    generate_data_lineage_record,
    node,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

DATA_LINEAGE_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/data-lineage-record.schema.yaml"


def _chain():
    return [
        node("DLR-T-001-N1", "SOURCE", "source system", make_provenance("AI_INFERENCE", "AI_GENERATED")),
        node("DLR-T-001-N2", "DATASET", "final dataset", make_provenance("AI_INFERENCE", "AI_GENERATED"), upstream_refs=["DLR-T-001-N1"]),
    ]


def _valid_record():
    return generate_data_lineage_record("DLR-T-001", "PROP-T-001", _chain(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))


class ComputeTests(unittest.TestCase):
    """Real graph traversal, not just 'does it run'."""

    def test_a_lone_source_traces_to_itself(self):
        nodes = [{"id": "N1", "stage": "SOURCE", "upstream_refs": []}]
        self.assertEqual(traces_to_source(nodes), {"N1": True})

    def test_a_linear_chain_all_traces(self):
        nodes = [
            {"id": "S", "stage": "SOURCE", "upstream_refs": []},
            {"id": "I", "stage": "INGEST", "upstream_refs": ["S"]},
            {"id": "T", "stage": "TRANSFORM", "upstream_refs": ["I"]},
            {"id": "D", "stage": "DATASET", "upstream_refs": ["T"]},
        ]
        self.assertEqual(traces_to_source(nodes), {"S": True, "I": True, "T": True, "D": True})

    def test_an_orphan_with_no_upstream_does_not_trace(self):
        nodes = [{"id": "N1", "stage": "DATASET", "upstream_refs": []}]
        self.assertEqual(traces_to_source(nodes), {"N1": False})

    def test_a_dangling_upstream_ref_does_not_trace(self):
        nodes = [{"id": "N1", "stage": "DATASET", "upstream_refs": ["DOES-NOT-EXIST"]}]
        self.assertEqual(traces_to_source(nodes), {"N1": False})

    def test_a_two_node_cycle_that_never_touches_source_does_not_trace(self):
        nodes = [
            {"id": "A", "stage": "TRANSFORM", "upstream_refs": ["B"]},
            {"id": "B", "stage": "TRANSFORM", "upstream_refs": ["A"]},
        ]
        self.assertEqual(traces_to_source(nodes), {"A": False, "B": False})

    def test_a_real_merge_of_two_sources_traces(self):
        """A Dataset with two independent upstream Sources -- a genuine merge/join, not a strict linear chain."""
        nodes = [
            {"id": "S1", "stage": "SOURCE", "upstream_refs": []},
            {"id": "S2", "stage": "SOURCE", "upstream_refs": []},
            {"id": "T", "stage": "TRANSFORM", "upstream_refs": ["S1", "S2"]},
        ]
        self.assertEqual(traces_to_source(nodes), {"S1": True, "S2": True, "T": True})

    def test_one_good_and_one_broken_upstream_still_traces_via_the_good_one(self):
        """A node with multiple upstream_refs is traced if AT LEAST ONE path resolves -- real-world merges
        often have one broken input without invalidating the whole node."""
        nodes = [
            {"id": "S1", "stage": "SOURCE", "upstream_refs": []},
            {"id": "T", "stage": "TRANSFORM", "upstream_refs": ["S1", "DOES-NOT-EXIST"]},
        ]
        self.assertEqual(traces_to_source(nodes), {"S1": True, "T": True})

    def test_three_node_cycle_with_an_exit_to_source_traces_regardless_of_node_order(self):
        """Regression for the critic-caught order-dependence bug: A->B->C->{A,S}, S=SOURCE. The original
        backward-DFS implementation memoized a provisional False derived from cutting the A/B/C cycle before
        ever reaching S, and that wrong answer depended on which node the top-level loop resolved first. The
        fixed forward-reachability implementation gives the SAME correct answer (every node reaches S)
        regardless of input order -- both orderings asserted here."""
        forward_order = [
            {"id": "S", "stage": "SOURCE", "upstream_refs": []},
            {"id": "A", "stage": "TRANSFORM", "upstream_refs": ["B"]},
            {"id": "B", "stage": "TRANSFORM", "upstream_refs": ["C"]},
            {"id": "C", "stage": "TRANSFORM", "upstream_refs": ["A", "S"]},
        ]
        reverse_order = list(reversed(forward_order))
        expected = {"S": True, "A": True, "B": True, "C": True}
        self.assertEqual(traces_to_source(forward_order), expected)
        self.assertEqual(traces_to_source(reverse_order), expected)

    def test_specific_order_dependence_regression_graph(self):
        """The exact graph a critic review used to demonstrate the original bug: W.upstream=[X,S],
        X.upstream=[W], S=SOURCE. The old backward-DFS gave {'W': True, 'X': False, 'S': True} in one node
        order and a DIFFERENT map in another -- X genuinely reaches S via X->W->S, so False was wrong in
        both orders it appeared in. Both orderings must now agree and both must be correct."""
        order_a = [
            {"id": "W", "stage": "TRANSFORM", "upstream_refs": ["X", "S"]},
            {"id": "X", "stage": "TRANSFORM", "upstream_refs": ["W"]},
            {"id": "S", "stage": "SOURCE", "upstream_refs": []},
        ]
        order_b = [
            {"id": "X", "stage": "TRANSFORM", "upstream_refs": ["W"]},
            {"id": "W", "stage": "TRANSFORM", "upstream_refs": ["X", "S"]},
            {"id": "S", "stage": "SOURCE", "upstream_refs": []},
        ]
        expected = {"W": True, "X": True, "S": True}
        self.assertEqual(traces_to_source(order_a), expected)
        self.assertEqual(traces_to_source(order_b), expected)

    def test_thousand_node_reverse_ordered_chain_does_not_raise_recursion_error(self):
        """Regression for the critic-caught RecursionError: the original backward-DFS's recursion depth
        scaled with chain length for a reverse-ordered input, raising RecursionError at a few hundred nodes.
        The fixed iterative implementation is a plain work-list loop with no recursion at all."""
        chain_length = 1000
        forward_nodes = [{"id": "N0", "stage": "SOURCE", "upstream_refs": []}]
        for i in range(1, chain_length):
            forward_nodes.append({"id": f"N{i}", "stage": "TRANSFORM", "upstream_refs": [f"N{i - 1}"]})
        reverse_nodes = list(reversed(forward_nodes))
        result = traces_to_source(reverse_nodes)  # must not raise RecursionError
        self.assertTrue(all(result.values()))
        self.assertEqual(len(result), chain_length)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_record_validates_against_the_real_schema(self):
        self.contracts.validate(DATA_LINEAGE_RECORD_SCHEMA, _valid_record(), "data lineage record")

    def test_merge_record_validates(self):
        nodes = [
            node("DLR-T-002-N1", "SOURCE", "CRM", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            node("DLR-T-002-N2", "SOURCE", "orders", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            node("DLR-T-002-N3", "TRANSFORM", "join", make_provenance("AI_INFERENCE", "AI_GENERATED"), upstream_refs=["DLR-T-002-N1", "DLR-T-002-N2"]),
        ]
        record = generate_data_lineage_record("DLR-T-002", "combined_view", nodes, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.contracts.validate(DATA_LINEAGE_RECORD_SCHEMA, record, "merge record")

    def test_zero_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_NO_NODES"):
            generate_data_lineage_record("DLR-T-003", "x", [], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_no_source_node_is_refused(self):
        nodes = [node("DLR-T-004-N1", "DATASET", "no source anywhere", make_provenance("AI_INFERENCE", "AI_GENERATED"))]
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_NO_SOURCE_NODE"):
            generate_data_lineage_record("DLR-T-004", "x", nodes, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_orphaned_non_source_node_is_refused(self):
        """Atlas's own benefit text (§11.48 L2327): a number can trace back to its original source."""
        nodes = [
            node("DLR-T-005-N1", "SOURCE", "real source", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            node("DLR-T-005-N2", "DATASET", "claims no upstream", make_provenance("AI_INFERENCE", "AI_GENERATED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_NODE_DOES_NOT_TRACE_TO_SOURCE"):
            generate_data_lineage_record("DLR-T-005", "x", nodes, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_invalid_stage_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_INVALID_STAGE"):
            node("DLR-T-006-N1", "MODEL", "x", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_node_description_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_EMPTY_NODE_DESCRIPTION"):
            node("DLR-T-007-N1", "SOURCE", "", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_source_with_upstream_refs_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_SOURCE_HAS_UPSTREAM"):
            node("DLR-T-008-N1", "SOURCE", "x", make_provenance("AI_INFERENCE", "AI_GENERATED"), upstream_refs=["DLR-T-008-N0"])

    def test_hand_built_node_dict_with_invalid_stage_is_refused_not_crashed(self):
        hand_built = {"id": "DLR-T-009-N1", "stage": "MODEL", "description": "x", "upstream_refs": [], "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_INVALID_STAGE"):
            generate_data_lineage_record("DLR-T-009", "x", [hand_built], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_non_dict_node_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_INVALID_NODE_SHAPE"):
            generate_data_lineage_record("DLR-T-010", "x", ["not-a-dict"], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_duplicate_node_id_is_refused_at_construction(self):
        """Regression for the critic-caught Critical: two nodes sharing an id -- a real orphan disguised as
        a valid decoy -- must be refused outright, not silently collapsed by traces_to_source's own
        id-keyed result dict."""
        orphan = {"id": "DLR-T-011-N2", "stage": "DATASET", "description": "a real orphan", "upstream_refs": [], "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}
        decoy = {"id": "DLR-T-011-N2", "stage": "DATASET", "description": "a valid decoy sharing the same id", "upstream_refs": ["DLR-T-011-N1"], "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}
        source = node("DLR-T-011-N1", "SOURCE", "real source", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_DUPLICATE_NODE_ID"):
            generate_data_lineage_record("DLR-T-011", "x", [source, orphan, decoy], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_node_missing_provenance_is_refused_at_construction(self):
        hand_built = {"id": "DLR-T-012-N1", "stage": "SOURCE", "description": "x", "upstream_refs": []}
        with self.assertRaisesRegex(InvariantViolation, "DATALINEAGE_NODE_MISSING_PROVENANCE"):
            generate_data_lineage_record("DLR-T-012", "x", [hand_built], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_data_lineage_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_data_lineage_gates(_valid_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "structural_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_merge_record_passes_all_three_gates(self):
        nodes = [
            node("DLR-T-011-N1", "SOURCE", "CRM", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            node("DLR-T-011-N2", "SOURCE", "orders", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            node("DLR-T-011-N3", "TRANSFORM", "join", make_provenance("AI_INFERENCE", "AI_GENERATED"), upstream_refs=["DLR-T-011-N1", "DLR-T-011-N2"]),
        ]
        record = generate_data_lineage_record("DLR-T-011", "x", nodes, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        results = evaluate_data_lineage_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_dangling_upstream_ref_fails_the_gate_via_recomputation(self):
        """The critical regression this slice was built to avoid from the start: the gate RECOMPUTES
        traces_to_source from the raw nodes[], so injecting a dangling upstream_ref (while leaving the
        node's own stored traces_to_source:true untouched) is still caught -- a gate that only re-read the
        stored flag would NOT catch this."""
        record = _valid_record()
        record["nodes"][-1]["upstream_refs"] = ["DOES-NOT-EXIST"]
        self.assertTrue(record["nodes"][-1]["traces_to_source"])  # stored flag deliberately left stale/true
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_source_with_injected_upstream_fails_the_gate(self):
        record = _valid_record()
        record["nodes"][0]["upstream_refs"] = ["some-other-id"]
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_emptied_nodes_fails_the_gate(self):
        record = _valid_record()
        record["nodes"] = []
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_all_source_removed_fails_the_gate(self):
        record = _valid_record()
        record["nodes"] = [n for n in record["nodes"] if n["stage"] != "SOURCE"]
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_node_id_fails_the_gate(self):
        """Regression for the critic-caught Critical: a record hand-tampered so a real orphan shares an id
        with a valid decoy must be caught by the gate too, not just at construction."""
        record = _valid_record()
        record["nodes"][-1] = dict(record["nodes"][-1], id=record["nodes"][0]["id"])
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["nodes"][0]["id"], gate["evidence"][0].get("duplicate_ids", []))

    def test_hand_tampered_invalid_stage_fails_the_gate(self):
        """A critic-caught gate-coverage gap: the gate originally only re-derived 4 of the 6 things the
        builder enforces (missing stage/description). A record tampered to the table row's own divergent
        vocabulary ('MODEL', deliberately rejected by this contract's own enum) must now be caught."""
        record = _valid_record()
        record["nodes"][0]["stage"] = "MODEL"
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_emptied_description_fails_the_gate(self):
        record = _valid_record()
        record["nodes"][0]["description"] = ""
        gate = evaluate_structural_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_node_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["nodes"] = ["not-a-dict"]
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_genuine_compute_gate_is_the_real_evaluate_statistical_gate_function_reused_unchanged(self):
        """Proves the reuse is real function identity -- fifth reuse this session, after root_cause.pareto/
        decision.ahp/decision.mcda/devops_sre.error_budget."""
        from ai_lego.modules.database_data import data_lineage as data_lineage_module

        self.assertIs(data_lineage_module.evaluate_statistical_gate, evaluate_statistical_gate)

    def test_hand_tampered_wrong_epistemic_type_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["provenance"] = make_provenance("AI_INFERENCE", "AI_GENERATED")
        gate = evaluate_genuine_compute_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family. The prior
        ``test_non_dict_node_fails_the_provenance_gate_not_a_crash`` above covers a malformed ENTRY inside
        ``nodes``; this covers ``record`` itself not being a dict at all."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_data_lineage_gates(bad_record, "test", "2026-09-05T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()

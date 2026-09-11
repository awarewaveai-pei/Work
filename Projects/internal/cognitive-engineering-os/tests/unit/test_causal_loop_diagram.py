"""Mutation-style tests for ``systems.causal_loop_diagram`` (F09 systems thinking family, opening member this
batch).

The loop_type recompute rule is proven at BOTH independent layers: the builder refuses to construct a record
whose caller-claimed loop_type disagrees with the edges' own recomputed polarity parity, and the gate
independently re-derives the same check against a hand-tampered record that bypassed the builder entirely.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.systems.causal_loop_diagram import (
    METHOD_ID,
    all_gates_pass,
    edge,
    evaluate_causal_loop_diagram_gates,
    evaluate_loop_type_integrity_gate,
    evaluate_provenance_required_gate,
    generate_causal_loop_diagram,
    loop,
    variable,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CAUSAL_LOOP_DIAGRAM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/causal-loop-diagram.schema.yaml"


def _variables():
    return [variable("V1", "價格"), variable("V2", "需求"), variable("V3", "負載")]


def _edges():
    # V1 -> V2 (+), V2 -> V3 (+), V3 -> V1 (-): 1 negative edge (odd) -> BALANCING.
    return [edge("E1", "V1", "V2", "+"), edge("E2", "V2", "V3", "+"), edge("E3", "V3", "V1", "-")]


def _reinforcing_edges():
    # X -> Y (+), Y -> X (+): 0 negative edges (even) -> REINFORCING.
    return [edge("EX1", "V1", "V2", "+"), edge("EX2", "V2", "V1", "+")]


def _valid_diagram():
    return generate_causal_loop_diagram("CLD-T-001", _variables(), _edges(), [loop("L1", ["E1", "E2", "E3"], "BALANCING")], make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_diagram_validates_against_the_real_schema(self):
        self.contracts.validate(CAUSAL_LOOP_DIAGRAM_SCHEMA, _valid_diagram(), "causal loop diagram")

    def test_empty_loops_is_legal_a_diagram_may_map_variables_and_edges_without_closing_a_cycle(self):
        diagram = generate_causal_loop_diagram("CLD-T-002", _variables(), _edges(), [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(CAUSAL_LOOP_DIAGRAM_SCHEMA, diagram, "diagram with no closed loops yet")

    def test_reinforcing_loop_is_correctly_recomputed(self):
        diagram = generate_causal_loop_diagram(
            "CLD-T-003",
            _variables(),
            _reinforcing_edges(),
            [loop("L1", ["EX1", "EX2"], "REINFORCING")],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        self.contracts.validate(CAUSAL_LOOP_DIAGRAM_SCHEMA, diagram, "reinforcing-loop diagram")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_causal_loop_diagram_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class ConstructionInvariantTests(unittest.TestCase):
    def test_too_few_variables_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_TOO_FEW_VARIABLES"):
            generate_causal_loop_diagram("CLD-T-010", [variable("V1", "solo")], [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_variable_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_DUPLICATE_VARIABLE_ID"):
            generate_causal_loop_diagram("CLD-T-011", [variable("V1", "a"), variable("V1", "b")], [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_edges_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_EMPTY_EDGES"):
            generate_causal_loop_diagram("CLD-T-012", _variables(), [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_polarity_is_refused_at_the_edge_constructor(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_INVALID_POLARITY"):
            edge("E1", "V1", "V2", "neutral")

    def test_edge_referencing_unknown_variable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_EDGE_UNKNOWN_VARIABLE"):
            generate_causal_loop_diagram("CLD-T-013", _variables(), [edge("E1", "V1", "V-GHOST", "+")], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_edge_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_DUPLICATE_EDGE_ID"):
            generate_causal_loop_diagram("CLD-T-014", _variables(), [edge("E1", "V1", "V2", "+"), edge("E1", "V2", "V3", "-")], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_loop_type_is_refused_at_the_loop_constructor(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_INVALID_LOOP_TYPE"):
            loop("L1", ["E1", "E2"], "NEUTRAL")

    def test_loop_referencing_unknown_edge_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_LOOP_UNKNOWN_EDGE"):
            generate_causal_loop_diagram("CLD-T-015", _variables(), _edges(), [loop("L1", ["E1", "E-GHOST"], "BALANCING")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_loop_with_too_few_edges_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_LOOP_TOO_FEW_EDGES"):
            generate_causal_loop_diagram("CLD-T-016", _variables(), _edges(), [loop("L1", ["E1"], "REINFORCING")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_closing_edge_chain_is_refused(self):
        """E1 (V1->V2) then E2 (V2->V3) does not chain back to V1 -- not a closed cycle."""
        with self.assertRaisesRegex(InvariantViolation, "CLD_LOOP_NOT_CLOSED"):
            generate_causal_loop_diagram("CLD-T-017", _variables(), _edges(), [loop("L1", ["E1", "E2"], "REINFORCING")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_loop_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_DUPLICATE_LOOP_ID"):
            generate_causal_loop_diagram(
                "CLD-T-018",
                _variables(),
                _edges(),
                [loop("L1", ["E1", "E2", "E3"], "BALANCING"), loop("L1", ["E1", "E2", "E3"], "BALANCING")],
                make_provenance("AI_INFERENCE", "AI_GENERATED"),
            )


class LoopTypeMismatchTests(unittest.TestCase):
    """The GENUINE_COMPUTE core: loop_type is never a trusted caller value. Proven at both independent layers."""

    def test_claimed_reinforcing_but_actually_balancing_loop_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_LOOP_TYPE_MISMATCH"):
            generate_causal_loop_diagram("CLD-T-020", _variables(), _edges(), [loop("L1", ["E1", "E2", "E3"], "REINFORCING")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_claimed_balancing_but_actually_reinforcing_loop_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CLD_LOOP_TYPE_MISMATCH"):
            generate_causal_loop_diagram(
                "CLD-T-021", _variables(), _reinforcing_edges(), [loop("L1", ["EX1", "EX2"], "BALANCING")], make_provenance("AI_INFERENCE", "AI_GENERATED")
            )

    def test_correctly_labeled_loop_passes_construction(self):
        generate_causal_loop_diagram("CLD-T-022", _variables(), _edges(), [loop("L1", ["E1", "E2", "E3"], "BALANCING")], make_provenance("AI_INFERENCE", "AI_GENERATED"))  # must not raise

    def test_schema_layer_admits_both_enum_values_the_arithmetic_lives_only_in_the_runtime_module(self):
        """Unlike causal.dag's const:true, JSON Schema cannot express the parity computation -- a hand-crafted
        instance with either enum value passes schema validation. The gate below is the real second layer."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_diagram()
        tampered["loops"][0]["loop_type"] = "REINFORCING"
        contracts.validate(CAUSAL_LOOP_DIAGRAM_SCHEMA, tampered, "schema cannot catch this -- gate must")  # must not raise

    def test_gate_independently_recomputes_and_catches_a_hand_tampered_mismatch(self):
        """Second, independent enforcement layer: a record that bypassed the builder entirely (loop_type flipped
        after construction) is still caught by the gate's own re-derivation from raw edges."""
        tampered = _valid_diagram()
        tampered["loops"][0]["loop_type"] = "REINFORCING"
        gate = evaluate_loop_type_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GateMutationTests(unittest.TestCase):
    def test_valid_diagram_passes_both_gates(self):
        results = evaluate_causal_loop_diagram_gates(_valid_diagram(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "loop_type_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        diagram = _valid_diagram()
        diagram["provenance"] = None
        gate = evaluate_provenance_required_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_causal_loop_diagram_gates(bad_record, "test", "2026-09-11T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_dangling_edge_reference_on_a_hand_tampered_record_fails_the_integrity_gate(self):
        diagram = _valid_diagram()
        diagram["edges"][0]["to_variable_id"] = "V-GHOST"
        gate = evaluate_loop_type_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_closing_loop_on_a_hand_tampered_record_fails_the_integrity_gate(self):
        diagram = _valid_diagram()
        diagram["loops"][0]["edge_ids"] = ["E1", "E2"]  # E1->E2 chain never closes back to E1's own from_variable_id
        gate = evaluate_loop_type_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_unknown_top_level_key_on_a_hand_tampered_record_fails_the_integrity_gate(self):
        diagram = _valid_diagram()
        diagram["approved"] = True
        gate = evaluate_loop_type_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()

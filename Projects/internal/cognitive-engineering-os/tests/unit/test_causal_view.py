"""Mutation-style tests for ``representation.causal_view`` (F24 representation family, Atlas L969).

Atlas's own "避免一般圖誤當因果" benefit is proven at BOTH independent
layers: the construction-time builder refuses an edge with no declared
assumption, and the independent gate re-derives the same rule directly from
a raw (possibly hand-tampered) dict, never trusting that the builder's own
check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.causal_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_causal_view_gates,
    evaluate_edge_assumption_required_gate,
    evaluate_provenance_required_gate,
    generate_causal_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CAUSAL_VIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/causal-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        knowledge_ref="CDAG-2026-09-01-001",
        rendered_edges=[
            {"edge_id": "E-price-to-demand", "assumption": "價格上升在需求彈性 > 0.3 的市場中降低需求"},
            {"edge_id": "E-demand-to-revenue", "assumption": "需求變動在庫存充足時線性轉換為營收變動"},
        ],
        state={"visible_fields": ["edge_id", "assumption"]},
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "CVIEW-T-001", **overrides: object):
    return generate_causal_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(CAUSAL_VIEW_SCHEMA, _valid_view(), "causal view")

    def test_one_edge_is_a_valid_minimal_view(self):
        view = generate_causal_view(
            "CVIEW-T-002",
            knowledge_ref="CDAG-1",
            rendered_edges=[{"edge_id": "E1", "assumption": "a1"}],
            state={},
            provenance=PROVENANCE,
        )
        self.contracts.validate(CAUSAL_VIEW_SCHEMA, view, "minimal one-edge view")

    def test_zero_edges_is_a_valid_vacuous_view(self):
        view = generate_causal_view("CVIEW-T-003", knowledge_ref="CDAG-1", rendered_edges=[], state={}, provenance=PROVENANCE)
        self.contracts.validate(CAUSAL_VIEW_SCHEMA, view, "zero-edge view")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_causal_view, "CVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.causal_view.contract.yaml")
        self.assertEqual(view["id"], "CVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CAUSAL_VIEW_SCHEMA, view, "view with a smuggled top-level key")

    def test_schema_rejects_edge_with_unknown_key(self):
        view = _valid_view()
        view["rendered_edges"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CAUSAL_VIEW_SCHEMA, view, "view with a smuggled edge key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.causal_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.causal_view contract")


class MissingAssumptionTests(unittest.TestCase):
    """Atlas L969's own '避免一般圖誤當因果' benefit -- every rendered edge must carry a non-empty assumption."""

    def test_empty_string_assumption_is_refused(self):
        kwargs = _kwargs()
        kwargs["rendered_edges"][0]["assumption"] = ""
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_MISSING_ASSUMPTION"):
            generate_causal_view("CVIEW-T-004", **kwargs)

    def test_whitespace_only_assumption_is_refused(self):
        kwargs = _kwargs()
        kwargs["rendered_edges"][0]["assumption"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_MISSING_ASSUMPTION"):
            generate_causal_view("CVIEW-T-005", **kwargs)

    def test_missing_assumption_key_entirely_is_refused(self):
        kwargs = _kwargs()
        del kwargs["rendered_edges"][0]["assumption"]
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_MISSING_ASSUMPTION"):
            generate_causal_view("CVIEW-T-006", **kwargs)

    def test_none_assumption_is_refused(self):
        kwargs = _kwargs()
        kwargs["rendered_edges"][0]["assumption"] = None
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_MISSING_ASSUMPTION"):
            generate_causal_view("CVIEW-T-007", **kwargs)

    def test_well_formed_edges_are_accepted(self):
        view = _valid_view()
        self.assertEqual(len(view["rendered_edges"]), 2)


class EdgeIdTests(unittest.TestCase):
    def test_duplicate_edge_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["rendered_edges"].append({"edge_id": kwargs["rendered_edges"][0]["edge_id"], "assumption": "another assumption"})
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_DUPLICATE_EDGE_ID"):
            generate_causal_view("CVIEW-T-008", **kwargs)

    def test_empty_edge_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["rendered_edges"][0]["edge_id"] = ""
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_INVALID_EDGE"):
            generate_causal_view("CVIEW-T-009", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_causal_view("CVIEW-T-010", **kwargs)
        kwargs["rendered_edges"][0]["assumption"] = "MUTATED_AFTER_RETURN"
        kwargs["state"]["visible_fields"].append("MUTATED")
        self.assertEqual(view["rendered_edges"][0]["assumption"], "價格上升在需求彈性 > 0.3 的市場中降低需求")
        self.assertNotIn("MUTATED", view["state"]["visible_fields"])
        self.assertIsNot(view["rendered_edges"], kwargs["rendered_edges"])
        self.assertIsNot(view["state"], kwargs["state"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_causal_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_edge_assumption_gate_catches_hand_tampered_blanked_assumption(self):
        record = copy.deepcopy(_valid_view())
        record["rendered_edges"][0]["assumption"] = ""
        gate = evaluate_edge_assumption_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_edge_assumption_gate_catches_hand_tampered_duplicate_edge_id(self):
        record = copy.deepcopy(_valid_view())
        record["rendered_edges"].append(dict(record["rendered_edges"][0]))
        gate = evaluate_edge_assumption_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_edge_assumption_gate_passes_a_genuinely_valid_view(self):
        gate = evaluate_edge_assumption_required_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_causal_view_gates(bad, "test", "2026-09-12T00:00:00Z")
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
        self.assertEqual(RECORD_ID_PREFIX, "CVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_INVALID_VERSION"):
            generate_causal_view("CVIEW-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_knowledge_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CVIEW_INVALID_KNOWLEDGE_REF"):
            _valid_view(knowledge_ref="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.causal_view")

    def test_evaluate_gates_returns_two_gates_in_order(self):
        results = evaluate_causal_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "edge_assumption_required"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "knowledge_ref", "rendered_edges", "state", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Guards against the recurring provenance-by-reference aliasing bug this corpus's F10/F13/F15/F22
    batches each found at least once: the returned record must never share the caller's own provenance
    dict object -- mutating the caller's dict after construction must not silently rewrite the
    already-returned 'validated' record's provenance too."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_causal_view(base["id"], base["knowledge_ref"], base["rendered_edges"], base["state"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

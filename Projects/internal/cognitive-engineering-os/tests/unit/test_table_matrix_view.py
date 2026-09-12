"""Mutation-style tests for ``representation.table_matrix_view`` (F24 Representation family, Atlas L965).

The shared F24 View law (no content duplication, Atlas §9 L1053) and the computed-artifact labeling
invariant are each proven at BOTH independent layers: the construction-time builder refuses a
non-reference-shaped id, a dangling filter/sort_spec/score reference, and an unmarked score; the independent
gates re-derive the same rules directly from a raw (possibly hand-tampered) dict, never trusting that the
builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.table_matrix_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_reference_integrity_gate,
    evaluate_score_computed_flag_gate,
    evaluate_table_matrix_view_gates,
    generate_table_matrix_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

TABLE_MATRIX_VIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/table-matrix-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        source_knowledge_object_id="KO-2026-09-12-002",
        entities=["ENT-VENDOR-A", "ENT-VENDOR-B"],
        criteria=["CRIT-COST", "CRIT-SLA"],
        filters=[{"criterion_id": "CRIT-SLA", "operator": "gte", "value": 99.5}],
        sort_spec={"criterion_id": "CRIT-COST", "direction": "asc"},
        score_config={"method": "weighted_sum", "weights": {"CRIT-COST": 0.6, "CRIT-SLA": 0.4}},
        scores=[{"entity_id": "ENT-VENDOR-A", "criterion_id": "CRIT-COST", "score": 0.8, "computed": True}],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "TBLVIEW-T-001", **overrides: object):
    return generate_table_matrix_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(TABLE_MATRIX_VIEW_SCHEMA, _valid_view(), "table matrix view")

    def test_minimal_view_with_no_filters_sort_or_scores_validates(self):
        view = generate_table_matrix_view(
            "TBLVIEW-T-002",
            source_knowledge_object_id="KO-1",
            entities=["ENT-1"],
            criteria=["CRIT-1"],
            provenance=PROVENANCE,
        )
        self.contracts.validate(TABLE_MATRIX_VIEW_SCHEMA, view, "minimal table matrix view")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_table_matrix_view, "TBLVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.table_matrix_view.contract.yaml")
        self.assertEqual(view["id"], "TBLVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["entity_content"] = {"ENT-VENDOR-A": "smuggled full entity data"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TABLE_MATRIX_VIEW_SCHEMA, view, "view with a smuggled top-level key")

    def test_schema_rejects_score_without_computed_flag(self):
        view = _valid_view()
        del view["scores"][0]["computed"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TABLE_MATRIX_VIEW_SCHEMA, view, "score missing computed flag")

    def test_schema_rejects_score_with_computed_false(self):
        view = _valid_view()
        view["scores"][0]["computed"] = False
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TABLE_MATRIX_VIEW_SCHEMA, view, "score with computed:false")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.table_matrix_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.table_matrix_view contract")


class NoContentDuplicationTests(unittest.TestCase):
    """The shared F24 View law (Atlas §9 L1053) -- entities[]/criteria[] are references, never content."""

    def test_non_reference_shaped_entity_id_is_refused(self):
        kwargs = _kwargs(entities=["this has a space"])
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_ENTITIES"):
            generate_table_matrix_view("TBLVIEW-T-003", **kwargs)

    def test_non_reference_shaped_criterion_id_is_refused(self):
        kwargs = _kwargs(criteria=["not a reference"])
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_CRITERIA"):
            generate_table_matrix_view("TBLVIEW-T-004", **kwargs)

    def test_duplicate_entity_id_is_refused(self):
        kwargs = _kwargs(entities=["ENT-1", "ENT-1"])
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_ENTITIES"):
            generate_table_matrix_view("TBLVIEW-T-005", **kwargs)

    def test_empty_entities_is_refused(self):
        kwargs = _kwargs(entities=[])
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_ENTITIES"):
            generate_table_matrix_view("TBLVIEW-T-006", **kwargs)

    def test_non_reference_shaped_source_knowledge_object_id_is_refused(self):
        kwargs = _kwargs(source_knowledge_object_id="this has a space")
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_NOT_A_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-007", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_filter_dangling_criterion_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["filters"][0]["criterion_id"] = "CRIT-NEVER-DECLARED"
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_DANGLING_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-008", **kwargs)

    def test_sort_spec_dangling_criterion_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["sort_spec"]["criterion_id"] = "CRIT-NEVER-DECLARED"
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_DANGLING_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-009", **kwargs)

    def test_score_config_weights_dangling_criterion_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["score_config"]["weights"]["CRIT-NEVER-DECLARED"] = 1.0
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_DANGLING_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-010", **kwargs)

    def test_score_dangling_entity_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["scores"][0]["entity_id"] = "ENT-NEVER-DECLARED"
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_DANGLING_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-011", **kwargs)

    def test_score_dangling_criterion_ref_is_refused(self):
        """Symmetric case to test_score_dangling_entity_ref_is_refused -- a critic pass (2026-09-12) found
        this reference sub-case had no dedicated test, the same gap that let the entity_id case's error code
        go unnoticed as mislabeled."""
        kwargs = _kwargs()
        kwargs["scores"][0]["criterion_id"] = "CRIT-NEVER-DECLARED"
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_DANGLING_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-011B", **kwargs)

    def test_sort_spec_invalid_direction_is_refused(self):
        kwargs = _kwargs()
        kwargs["sort_spec"]["direction"] = "sideways"
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_DANGLING_REFERENCE"):
            generate_table_matrix_view("TBLVIEW-T-012", **kwargs)


class ComputedScoreLabelingTests(unittest.TestCase):
    """The score-as-computed-presentation-artifact invariant this task specifically names."""

    def test_score_with_computed_false_is_refused(self):
        kwargs = _kwargs()
        kwargs["scores"][0]["computed"] = False
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_SCORE_NOT_MARKED_COMPUTED"):
            generate_table_matrix_view("TBLVIEW-T-013", **kwargs)

    def test_score_missing_computed_key_is_refused(self):
        """Deleting the ``computed`` key changes the entry's key set, so this is now correctly caught as a
        shape problem (TBLVIEW_INVALID_SCORE_ENTRY), not mislabeled as TBLVIEW_SCORE_NOT_MARKED_COMPUTED --
        the computed-flag code is reserved for a well-shaped entry whose computed value is present but not
        literal True (see test_score_with_computed_false_is_refused /
        test_score_with_truthy_non_bool_computed_is_refused below)."""
        kwargs = _kwargs()
        del kwargs["scores"][0]["computed"]
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_SCORE_ENTRY"):
            generate_table_matrix_view("TBLVIEW-T-014", **kwargs)

    def test_score_with_truthy_non_bool_computed_is_refused(self):
        """``1`` is truthy but not the literal boolean ``True`` -- must not be silently accepted."""
        kwargs = _kwargs()
        kwargs["scores"][0]["computed"] = 1
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_SCORE_NOT_MARKED_COMPUTED"):
            generate_table_matrix_view("TBLVIEW-T-015", **kwargs)

    def test_score_with_bool_value_is_refused_as_score(self):
        kwargs = _kwargs()
        kwargs["scores"][0]["score"] = True
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_SCORE_ENTRY"):
            generate_table_matrix_view("TBLVIEW-T-016", **kwargs)

    def test_well_formed_computed_score_is_accepted(self):
        view = _valid_view()
        self.assertTrue(view["scores"][0]["computed"] is True)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_scores_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_table_matrix_view("TBLVIEW-T-017", **kwargs)
        kwargs["scores"][0]["score"] = -99
        self.assertEqual(view["scores"][0]["score"], 0.8)
        self.assertIsNot(view["scores"], kwargs["scores"])

    def test_mutating_caller_score_config_weights_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_table_matrix_view("TBLVIEW-T-018", **kwargs)
        kwargs["score_config"]["weights"]["CRIT-COST"] = -1.0
        self.assertEqual(view["score_config"]["weights"]["CRIT-COST"], 0.6)


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_table_matrix_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_reference_integrity_gate_catches_hand_tampered_dangling_score_criterion(self):
        record = copy.deepcopy(_valid_view())
        record["scores"][0]["criterion_id"] = "CRIT-NEVER-DECLARED"
        gate = evaluate_reference_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_reference_integrity_gate_catches_hand_tampered_duplicate_entity(self):
        record = copy.deepcopy(_valid_view())
        record["entities"].append(record["entities"][0])
        gate = evaluate_reference_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_computed_flag_gate_catches_hand_tampered_computed_false(self):
        record = copy.deepcopy(_valid_view())
        record["scores"][0]["computed"] = False
        gate = evaluate_score_computed_flag_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_score_computed_flag_gate_passes_when_no_scores_present(self):
        record = copy.deepcopy(_valid_view())
        del record["scores"]
        gate = evaluate_score_computed_flag_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_table_matrix_view_gates(bad, "test", "2026-09-12T00:00:00Z")
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
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TBLVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_VERSION"):
            generate_table_matrix_view("TBLVIEW-T-019", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TBLVIEW_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.table_matrix_view")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_table_matrix_view_gates(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "reference_integrity", "score_computed_flag"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "source_knowledge_object_id", "entities", "criteria", "provenance", "filters", "sort_spec", "score_config", "scores"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Standing instruction after the recurring F10/F13/F15/F22 aliasing bug: a builder must never return the
    caller's own `provenance` dict BY REFERENCE. This test proves the fix and guards against a regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_table_matrix_view(base["id"], base["source_knowledge_object_id"], base["entities"], base["criteria"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

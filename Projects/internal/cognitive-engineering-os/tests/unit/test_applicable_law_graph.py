"""Mutation-style tests for ``jurisdiction.applicable_law_graph`` (F23 jurisdiction family, Atlas L936).

Atlas L936's own "支援版本與衝突法" (support versioning AND conflict-of-law)
benefit is proven at BOTH independent layers: the construction-time builder
refuses an unflagged overlapping same-jurisdiction+scope pair, a dangling
jurisdiction reference, and malformed date/source fields, and the
independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already
ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.applicable_law_graph import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_applicable_law_graph_gates,
    evaluate_conflict_flagging_gate,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_applicable_law_graph,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

APPLICABLE_LAW_GRAPH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/applicable-law-graph-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        jurisdiction_nodes=[
            {"jurisdiction_id": "DE", "description": "Germany"},
            {"jurisdiction_id": "FR", "description": "France"},
        ],
        law_entries=[
            {"law_id": "LAW-DE-PRIVACY-2020", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Bundesdatenschutzgesetz 2020", "effective_date": "2020-01-01", "expiry_date": "2024-06-01", "conflict": None},
            {"law_id": "LAW-DE-PRIVACY-2024", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Bundesdatenschutzgesetz 2024 amendment", "effective_date": "2024-06-01", "expiry_date": None, "conflict": None},
            {"law_id": "LAW-FR-PRIVACY-2021", "jurisdiction_id": "FR", "scope": "data_privacy", "source": "Loi Informatique et Libertes 2021", "effective_date": "2021-03-01", "expiry_date": None, "conflict": None},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_graph(*, record_id: str = "ALG-T-001", **overrides: object):
    return generate_applicable_law_graph(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_graph_validates_against_the_real_schema(self):
        self.contracts.validate(APPLICABLE_LAW_GRAPH_SCHEMA, _valid_graph(), "applicable law graph")

    def test_one_node_one_entry_is_a_valid_minimal_graph(self):
        record = generate_applicable_law_graph(
            "ALG-T-002",
            jurisdiction_nodes=[{"jurisdiction_id": "JP", "description": "Japan"}],
            law_entries=[{"law_id": "LAW-JP-1", "jurisdiction_id": "JP", "scope": "ai_regulation", "source": "AI Guidelines 2024", "effective_date": "2024-04-01", "expiry_date": None, "conflict": None}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(APPLICABLE_LAW_GRAPH_SCHEMA, record, "minimal single-entry graph")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_applicable_law_graph, "ALG-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.applicable_law_graph.contract.yaml")
        self.assertEqual(record["id"], "ALG-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_graph()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(APPLICABLE_LAW_GRAPH_SCHEMA, record, "graph with a smuggled top-level key")

    def test_schema_rejects_a_law_entry_missing_conflict_key(self):
        record = _valid_graph()
        del record["law_entries"][0]["conflict"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(APPLICABLE_LAW_GRAPH_SCHEMA, record, "law entry missing the required conflict key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.applicable_law_graph.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.applicable_law_graph contract")


class CountAndUniquenessTests(unittest.TestCase):
    def test_zero_jurisdiction_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ALG_TOO_FEW_JURISDICTION_NODES"):
            generate_applicable_law_graph("ALG-T-003", jurisdiction_nodes=[], law_entries=[], provenance=PROVENANCE)

    def test_zero_law_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ALG_TOO_FEW_LAW_ENTRIES"):
            generate_applicable_law_graph(
                "ALG-T-004",
                jurisdiction_nodes=[{"jurisdiction_id": "DE", "description": "Germany"}],
                law_entries=[],
                provenance=PROVENANCE,
            )

    def test_duplicate_jurisdiction_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["jurisdiction_nodes"].append({"jurisdiction_id": "DE", "description": "duplicate"})
        with self.assertRaisesRegex(InvariantViolation, "ALG_DUPLICATE_JURISDICTION_ID"):
            generate_applicable_law_graph("ALG-T-005", **kwargs)

    def test_duplicate_law_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["law_entries"].append(dict(kwargs["law_entries"][0]))
        with self.assertRaisesRegex(InvariantViolation, "ALG_DUPLICATE_LAW_ID"):
            generate_applicable_law_graph("ALG-T-006", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_jurisdiction_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["law_entries"][0]["jurisdiction_id"] = "IT"
        with self.assertRaisesRegex(InvariantViolation, "ALG_DANGLING_JURISDICTION_REF"):
            generate_applicable_law_graph("ALG-T-007", **kwargs)


class WellFormednessTests(unittest.TestCase):
    def test_empty_source_is_refused(self):
        kwargs = _kwargs()
        kwargs["law_entries"][0]["source"] = ""
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_LAW_ENTRIES"):
            generate_applicable_law_graph("ALG-T-008", **kwargs)

    def test_malformed_effective_date_is_refused_fail_closed(self):
        kwargs = _kwargs()
        kwargs["law_entries"][0]["effective_date"] = "not-a-date"
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_LAW_ENTRIES"):
            generate_applicable_law_graph("ALG-T-009", **kwargs)

    def test_malformed_expiry_date_is_refused_fail_closed(self):
        kwargs = _kwargs()
        kwargs["law_entries"][0]["expiry_date"] = "31-12-2024"
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_LAW_ENTRIES"):
            generate_applicable_law_graph("ALG-T-010", **kwargs)

    def test_empty_string_conflict_is_refused_not_treated_as_flagged(self):
        kwargs = _kwargs()
        kwargs["law_entries"][0]["conflict"] = ""
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_LAW_ENTRIES"):
            generate_applicable_law_graph("ALG-T-011", **kwargs)


class ConflictFlaggingTests(unittest.TestCase):
    """Atlas L936's own '支援版本與衝突法' benefit -- overlapping same-jurisdiction+scope entries must be
    flagged, never silently coexist."""

    def test_back_to_back_non_overlapping_entries_are_accepted(self):
        record = _valid_graph()
        self.assertEqual(len(record["law_entries"]), 3)

    def test_overlapping_unflagged_pair_is_refused(self):
        kwargs = _kwargs()
        kwargs["law_entries"].append({"law_id": "LAW-DE-DRAFT", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Draft amendment", "effective_date": "2023-01-01", "expiry_date": "2023-12-31", "conflict": None})
        with self.assertRaisesRegex(InvariantViolation, "ALG_UNFLAGGED_CONFLICT"):
            generate_applicable_law_graph("ALG-T-012", **kwargs)

    def test_overlapping_pair_flagged_on_both_sides_is_accepted(self):
        kwargs = _kwargs()
        kwargs["law_entries"][0]["conflict"] = "Superseded mid-term by draft amendment, DE-DRAFT-2023"
        kwargs["law_entries"].append({"law_id": "LAW-DE-DRAFT", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Draft amendment", "effective_date": "2023-01-01", "expiry_date": "2023-12-31", "conflict": "Overlaps LAW-DE-PRIVACY-2020, pending legal review"})
        record = generate_applicable_law_graph("ALG-T-013", **kwargs)
        self.assertEqual(len(record["law_entries"]), 4)

    def test_overlapping_pair_flagged_on_only_one_side_is_still_refused(self):
        kwargs = _kwargs()
        kwargs["law_entries"].append({"law_id": "LAW-DE-DRAFT", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Draft amendment", "effective_date": "2023-01-01", "expiry_date": "2023-12-31", "conflict": "Overlaps LAW-DE-PRIVACY-2020"})
        with self.assertRaisesRegex(InvariantViolation, "ALG_UNFLAGGED_CONFLICT"):
            generate_applicable_law_graph("ALG-T-014", **kwargs)

    def test_different_scope_same_jurisdiction_does_not_conflict(self):
        kwargs = _kwargs()
        kwargs["law_entries"].append({"law_id": "LAW-DE-AI-2023", "jurisdiction_id": "DE", "scope": "ai_regulation", "source": "AI Act national implementation", "effective_date": "2020-06-01", "expiry_date": None, "conflict": None})
        record = generate_applicable_law_graph("ALG-T-015", **kwargs)
        self.assertEqual(len(record["law_entries"]), 4)

    def test_boundary_touching_ranges_do_not_overlap(self):
        # LAW-DE-PRIVACY-2020 expires exactly when LAW-DE-PRIVACY-2024 begins (2024-06-01) -- half-open
        # interval semantics mean this is contiguous, not overlapping.
        record = _valid_graph()
        de_entries = [e for e in record["law_entries"] if e["jurisdiction_id"] == "DE"]
        self.assertEqual(de_entries[0]["expiry_date"], de_entries[1]["effective_date"])
        self.assertIsNone(de_entries[0]["conflict"])
        self.assertIsNone(de_entries[1]["conflict"])


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_applicable_law_graph("ALG-T-016", **kwargs)
        kwargs["law_entries"][0]["source"] = "MUTATED AFTER RETURN"
        self.assertEqual(record["law_entries"][0]["source"], "Bundesdatenschutzgesetz 2020")
        self.assertIsNot(record["law_entries"], kwargs["law_entries"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_graph(self):
        results = evaluate_applicable_law_graph_gates(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_graph())
        record["law_entries"][0]["jurisdiction_id"] = "IT"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_too_few_nodes(self):
        record = copy.deepcopy(_valid_graph())
        record["jurisdiction_nodes"] = []
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_conflict_flagging_gate_catches_hand_tampered_unflagged_overlap(self):
        record = copy.deepcopy(_valid_graph())
        record["law_entries"].append({"law_id": "LAW-DE-DRAFT", "jurisdiction_id": "DE", "scope": "data_privacy", "source": "Draft amendment", "effective_date": "2023-01-01", "expiry_date": "2023-12-31", "conflict": None})
        gate = evaluate_conflict_flagging_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_conflict_flagging_gate_passes_a_genuinely_conflict_free_graph(self):
        gate = evaluate_conflict_flagging_gate(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_applicable_law_graph_gates(bad, "test", "2026-09-12T00:00:00Z")
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
        self.assertEqual(RECORD_ID_PREFIX, "ALG-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_ID"):
            _valid_graph(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_VERSION"):
            generate_applicable_law_graph("ALG-T-017", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ALG_INVALID_PROVENANCE"):
            _valid_graph(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.applicable_law_graph")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_applicable_law_graph_gates(_valid_graph(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "conflict_flagging"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_graph()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "jurisdiction_nodes", "law_entries", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Recurring bug class across F10/F13/F15/F22: builders returning the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy, so mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too. Fixed by ``copy.deepcopy``ing provenance at the
    return statement; this test proves the fix and guards against a 5th recurrence."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_graph()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_applicable_law_graph(base["id"], base["jurisdiction_nodes"], base["law_entries"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

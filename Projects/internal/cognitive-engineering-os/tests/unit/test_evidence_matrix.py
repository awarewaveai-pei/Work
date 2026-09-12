"""Mutation-style tests for ``epistemic.evidence_matrix`` (F10 epistemic-quality family, Atlas L575).

Atlas's own real invariant is proven at BOTH independent layers: the
construction-time builder refuses a dangling `links[]` reference (either
direction), a duplicate `(claim_id, evidence_id)` pair, and an orphan claim
(a declared claim with zero links -- exactly the "快速看到薄弱 claim" case
this method exists to surface), and the independent gates re-derive the
same rules directly from a raw (possibly hand-tampered) dict, never
trusting that the builder's own check already ran. A dedicated
``NestedListAliasingTests`` class proves `claims[]`/`evidence_items[]`
entries are deep-copied, not shallow-copied -- the F09-batch critic lesson
this module's own docstring cites.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.evidence_matrix import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_RELATIONS,
    all_gates_pass,
    evaluate_evidence_matrix_gates,
    evaluate_no_orphan_claim_gate,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_evidence_matrix,
    link,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

EVIDENCE_MATRIX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/evidence-matrix.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _claims() -> list[dict]:
    return [
        {"claim_id": "C-1", "statement": "本產品在東南亞市場有成長潛力", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")},
        {"claim_id": "C-2", "statement": "目標客群的價格敏感度高於預期", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")},
    ]


def _evidence_items() -> list[dict]:
    return [
        {"evidence_id": "E-1", "content": "東南亞電商年成長報告", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")},
        {"evidence_id": "E-2", "content": "客戶訪談紀錄顯示對價格敏感", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")},
        {"evidence_id": "E-3", "content": "競品定價分析", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")},
    ]


def _links() -> list[dict]:
    return [
        {"claim_id": "C-1", "evidence_id": "E-1", "relation": "SUPPORTS"},
        {"claim_id": "C-2", "evidence_id": "E-2", "relation": "SUPPORTS"},
        {"claim_id": "C-2", "evidence_id": "E-3", "relation": "CONTRADICTS"},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(claims=_claims(), evidence_items=_evidence_items(), links=_links(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_matrix(*, record_id: str = "EVIDMATRIX-T-001", **overrides: object):
    return generate_evidence_matrix(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(EVIDENCE_MATRIX_SCHEMA, _valid_matrix(), "evidence matrix")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_evidence_matrix, "EVIDMATRIX-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.evidence_matrix.contract.yaml")
        self.assertEqual(matrix["id"], "EVIDMATRIX-T-INVOKE")

    def test_empty_catalog_blocks_evidence_matrix_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_MATRIX_SCHEMA, matrix, "evidence matrix with a smuggled top-level key")

    def test_schema_rejects_zero_claims(self):
        matrix = _valid_matrix()
        matrix["claims"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_MATRIX_SCHEMA, matrix, "evidence matrix with zero claims")

    def test_schema_rejects_zero_evidence_items(self):
        matrix = _valid_matrix()
        matrix["evidence_items"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_MATRIX_SCHEMA, matrix, "evidence matrix with zero evidence items")

    def test_schema_rejects_an_invalid_relation_value(self):
        matrix = _valid_matrix()
        matrix["links"][0]["relation"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_MATRIX_SCHEMA, matrix, "evidence matrix with an invalid relation")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.evidence_matrix.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.evidence_matrix contract")


class ReferentialIntegrityTests(unittest.TestCase):
    """Atlas L575's own real invariant -- every link resolves both directions, no duplicate cell, no orphan claim."""

    def test_well_formed_matrix_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(len(matrix["claims"]), 2)
        self.assertEqual(len(matrix["evidence_items"]), 3)
        self.assertEqual(len(matrix["links"]), 3)

    def test_zero_claims_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_NO_CLAIMS"):
            _valid_matrix(claims=[])

    def test_zero_evidence_items_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_NO_EVIDENCE_ITEMS"):
            _valid_matrix(evidence_items=[])

    def test_dangling_claim_ref_is_refused(self):
        bad_links = _links() + [{"claim_id": "C-999", "evidence_id": "E-1", "relation": "SUPPORTS"}]
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_DANGLING_CLAIM_REF"):
            _valid_matrix(links=bad_links)

    def test_dangling_evidence_ref_is_refused(self):
        bad_links = _links() + [{"claim_id": "C-1", "evidence_id": "E-999", "relation": "SUPPORTS"}]
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_DANGLING_EVIDENCE_REF"):
            _valid_matrix(links=bad_links)

    def test_duplicate_link_pair_is_refused(self):
        bad_links = _links() + [{"claim_id": "C-1", "evidence_id": "E-1", "relation": "CONTRADICTS"}]
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_DUPLICATE_LINK_PAIR"):
            _valid_matrix(links=bad_links)

    def test_orphan_claim_is_refused(self):
        orphan = {"claim_id": "C-3", "statement": "新功能會顯著提升留存率", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")}
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_ORPHAN_CLAIM"):
            _valid_matrix(claims=_claims() + [orphan])

    def test_zero_links_with_nonempty_claims_is_refused_as_orphan(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_ORPHAN_CLAIM"):
            _valid_matrix(links=[])

    def test_non_dict_link_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_LINK\\b"):
            _valid_matrix(links=["not-a-dict"])

    def test_claim_missing_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_CLAIM"):
            _valid_matrix(claims=[{"claim_id": "C-1"}], links=[])

    def test_evidence_item_missing_evidence_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_EVIDENCE_ITEM"):
            _valid_matrix(evidence_items=[{"content": "no id here"}], links=[])


class LinkHelperTests(unittest.TestCase):
    def test_link_helper_constructs(self):
        self.assertEqual(link("C-1", "E-1", "SUPPORTS"), {"claim_id": "C-1", "evidence_id": "E-1", "relation": "SUPPORTS"})

    def test_link_helper_invalid_relation_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_RELATION"):
            link("C-1", "E-1", "MAYBE")

    def test_link_helper_blank_claim_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_LINK_CLAIM_ID"):
            link("   ", "E-1", "SUPPORTS")

    def test_link_helper_blank_evidence_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_LINK_EVIDENCE_ID"):
            link("C-1", "   ", "SUPPORTS")

    def test_valid_relations_constant(self):
        self.assertEqual(VALID_RELATIONS, frozenset({"SUPPORTS", "CONTRADICTS", "NEUTRAL"}))


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "EVIDMATRIX-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_ID"):
            _valid_matrix(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_VERSION"):
            generate_evidence_matrix("EVIDMATRIX-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDMATRIX_INVALID_PROVENANCE"):
            _valid_matrix(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.evidence_matrix")

    def test_evaluate_evidence_matrix_gates_returns_three_gates_in_order(self):
        results = evaluate_evidence_matrix_gates(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "no_orphan_claim"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(
            set(matrix.keys()),
            {"id", "version", "generated_by_method", "claims", "evidence_items", "links", "provenance"},
        )


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID matrix's raw dict directly (never going through the builder again), then call the
    gates. Proves the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_matrix(self):
        results = evaluate_evidence_matrix_gates(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_claim_ref(self):
        record = copy.deepcopy(_valid_matrix())
        record["links"][0]["claim_id"] = "C-999"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_dangling_evidence_ref(self):
        record = copy.deepcopy(_valid_matrix())
        record["links"][0]["evidence_id"] = "E-999"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_duplicate_pair(self):
        record = copy.deepcopy(_valid_matrix())
        record["links"].append(dict(record["links"][0]))
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_referential_integrity_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_referential_integrity_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_referential_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_no_orphan_claim_gate_catches_hand_tampered_orphaned_claim(self):
        record = copy.deepcopy(_valid_matrix())
        record["links"] = [l for l in record["links"] if l["claim_id"] != "C-2"]
        gate = evaluate_no_orphan_claim_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_no_orphan_claim_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_no_orphan_claim_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_no_orphan_claim_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_no_orphan_claim_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_evidence_matrix_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_matrix())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class NestedListAliasingTests(unittest.TestCase):
    """F09-batch critic lesson (ai_lego/modules/systems/__init__.py): a shallow dict(item) copy does NOT copy
    that item's own nested list fields. claims[] entries may carry claim.schema.yaml's own nested
    supporting_evidence/contradicting_evidence arrays -- generate_evidence_matrix must deep-copy each entry, not
    alias the caller's own mutable list."""

    def test_returned_claim_does_not_share_a_mutable_list_with_the_caller(self):
        caller_claim = {
            "claim_id": "C-1",
            "statement": "本產品在東南亞市場有成長潛力",
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
            "supporting_evidence": [{"evidence_id": "E-1", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")}],
        }
        matrix = _valid_matrix(claims=[caller_claim, _claims()[1]])
        caller_claim["supporting_evidence"].append({"evidence_id": "E-2", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")})
        returned_claim = next(c for c in matrix["claims"] if c["claim_id"] == "C-1")
        self.assertEqual(len(returned_claim["supporting_evidence"]), 1, "returned record's claim must not alias the caller's own nested list")

    def test_mutating_the_returned_evidence_item_does_not_affect_the_caller(self):
        caller_evidence = dict(_evidence_items()[0])
        caller_evidence["quality_assessment"] = {"source_authority": "high"}
        matrix = _valid_matrix(evidence_items=[caller_evidence, *_evidence_items()[1:]])
        returned_item = next(e for e in matrix["evidence_items"] if e["evidence_id"] == "E-1")
        returned_item["quality_assessment"]["source_authority"] = "mutated"
        self.assertEqual(caller_evidence["quality_assessment"]["source_authority"], "high", "mutating the returned record must not affect the caller's own original dict")


if __name__ == "__main__":
    unittest.main()

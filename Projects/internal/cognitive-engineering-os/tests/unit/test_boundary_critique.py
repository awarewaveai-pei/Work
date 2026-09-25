"""Mutation-style tests for ``framing.boundary_critique`` (F01 framing family, Atlas F01 table row L344 +
F01 mermaid flowchart L348-354 + §13.7 Public Policy Recipe L3378-3389).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_boundary_critique_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_boundary_critique_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/boundary-critique-record.schema.yaml``), including
an ``additionalProperties: false`` top-level rejection check.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.boundary_critique import (
    CATEGORY_ORDER,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    boundary_item,
    category_entry,
    derive_empty_categories,
    evaluate_boundary_critique_gates,
    evaluate_boundary_critique_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_boundary_critique_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BOUNDARY_CRITIQUE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/boundary-critique-record.schema.yaml"


def _populated(category: str, name: str = "an item", refs: list[str] | None = ("E-1",)) -> dict:
    return category_entry(category, "POPULATED", [boundary_item(name, make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=list(refs) if refs else None)])


def _declared_empty(category: str, justification: str | None = "no known items under this category") -> dict:
    return category_entry(category, "DECLARED_EMPTY", [], empty_justification=justification)


def _all_populated_categories() -> list[dict]:
    return [_populated(c) for c in CATEGORY_ORDER]


def _mixed_categories() -> list[dict]:
    # DECISION_MAKER/AFFECTED/RESOURCES/VALUES populated, EXCLUDED declared empty -- matches the CLI demo's
    # own "1 legitimately declared-empty category" shape.
    return [_populated("DECISION_MAKER"), _populated("AFFECTED"), _declared_empty("EXCLUDED"), _populated("RESOURCES"), _populated("VALUES")]


def _valid_record(*, categories=None, record_id: str = "BCRIT-T-001", decision_context: str = "test decision context", problem_statement_ref=None):
    return generate_boundary_critique_record(
        record_id,
        decision_context,
        categories if categories is not None else _mixed_categories(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        problem_statement_ref=problem_statement_ref,
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, _valid_record(), "boundary critique record")

    def test_valid_record_with_problem_statement_ref_validates(self):
        record = _valid_record(problem_statement_ref="PROB-2026-09-10-001")
        self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, record, "boundary critique record with backward link")
        self.assertEqual(record["problem_statement_ref"], "PROB-2026-09-10-001")

    def test_all_populated_record_has_empty_empty_categories_and_validates(self):
        record = _valid_record(categories=_all_populated_categories())
        self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, record, "boundary critique record, zero declared-empty")
        self.assertEqual(record["empty_categories"], [])

    def test_all_declared_empty_record_has_all_five_empty_categories_and_validates(self):
        record = _valid_record(categories=[_declared_empty(c) for c in CATEGORY_ORDER])
        self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, record, "boundary critique record, all declared-empty")
        self.assertEqual(record["empty_categories"], list(CATEGORY_ORDER))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_boundary_critique_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_VERSION"):
            generate_boundary_critique_record("BCRIT-T-002", "ctx", _mixed_categories(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_empty_decision_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_EMPTY_DECISION_CONTEXT"):
            _valid_record(decision_context="   ")

    def test_invalid_problem_statement_ref_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_PROBLEM_STATEMENT_REF"):
            _valid_record(problem_statement_ref="WRONG-001")

    def test_invalid_problem_statement_ref_blank_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_PROBLEM_STATEMENT_REF"):
            _valid_record(problem_statement_ref="   ")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: a DECLARED_EMPTY category hand-tampered to carry an item fails BOTH the
        runtime gate and the real JSON schema's own if/then/not branch independently."""
        tampered = copy.deepcopy(_valid_record())
        tampered["categories"][2]["items"].append({"name": "smuggled in", "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED")})  # EXCLUDED is declared-empty
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, tampered, "tampered record")
        gate = evaluate_boundary_critique_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_category_entry_key(self):
        record = _valid_record()
        record["categories"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, record, "record with unknown category key")

    def test_schema_rejects_unknown_item_key(self):
        record = _valid_record()
        record["categories"][0]["items"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BOUNDARY_CRITIQUE_SCHEMA, record, "record with unknown item key")


class CategoryShapeTests(unittest.TestCase):
    def test_categories_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=_mixed_categories()[:4])

    def test_categories_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=_mixed_categories() + [_populated("DECISION_MAKER")])

    def test_categories_wrong_order_is_refused(self):
        cats = _mixed_categories()
        cats[0], cats[1] = cats[1], cats[0]
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=cats)

    def test_categories_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories="not-a-list")

    def test_category_entry_missing_required_key_is_refused(self):
        cats = _mixed_categories()
        del cats[0]["items"]
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=cats)

    def test_category_entry_unknown_extra_key_is_refused(self):
        cats = _mixed_categories()
        cats[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=cats)

    def test_category_entry_wrong_category_name_is_refused(self):
        cats = _mixed_categories()
        cats[0]["category"] = "SOMETHING_ELSE"
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=cats)

    def test_invalid_status_value_is_refused(self):
        cats = _mixed_categories()
        cats[0]["status"] = "MAYBE"
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_STATUS"):
            _valid_record(categories=cats)

    def test_malformed_item_entry_is_refused(self):
        cats = _mixed_categories()
        cats[0]["items"][0] = {"name": "no provenance key"}
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_INVALID_CATEGORY_SET"):
            _valid_record(categories=cats)


class PopulatedDeclaredEmptyCoherenceTests(unittest.TestCase):
    """The core invariant this method exists for: an empty category is a first-class, JUSTIFIED state,
    never a silent gap."""

    def test_populated_with_zero_items_is_refused(self):
        cats = _mixed_categories()
        cats[0] = category_entry("DECISION_MAKER", "POPULATED", [])  # zero items
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_POPULATED_MISSING_ITEMS"):
            _valid_record(categories=cats)

    def test_populated_with_empty_justification_is_refused(self):
        """A POPULATED category carrying empty_justification is internally incoherent -- that field is
        DECLARED_EMPTY-only."""
        cats = _mixed_categories()
        cats[0]["empty_justification"] = "should not be here"
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_POPULATED_HAS_EMPTY_JUSTIFICATION"):
            _valid_record(categories=cats)

    def test_declared_empty_carrying_an_item_is_refused(self):
        """THE core invariant: a DECLARED_EMPTY category must not carry any item, even a well-formed one --
        that would be internally incoherent (declaring empty while smuggling in content)."""
        cats = _mixed_categories()
        cats[2] = category_entry("EXCLUDED", "DECLARED_EMPTY", [boundary_item("smuggled in", make_provenance("EVIDENCE", "HUMAN_APPROVED"))])
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_DECLARED_EMPTY_HAS_ITEMS"):
            _valid_record(categories=cats)

    def test_declared_empty_with_no_justification_at_all_is_refused(self):
        cats = _mixed_categories()
        cats[2] = category_entry("EXCLUDED", "DECLARED_EMPTY", [])  # no empty_justification key at all
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_DECLARED_EMPTY_MISSING_JUSTIFICATION"):
            _valid_record(categories=cats)

    def test_declared_empty_with_blank_justification_is_also_refused(self):
        """Even a WHITESPACE-only justification must be refused -- genuine non-empty content is required,
        not merely key presence."""
        cats = _mixed_categories()
        cats[2]["empty_justification"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "BOUNDARYCRITIQUE_DECLARED_EMPTY_MISSING_JUSTIFICATION"):
            _valid_record(categories=cats)

    def test_declared_empty_with_real_justification_is_legal(self):
        record = _valid_record()  # _mixed_categories() already carries a real EXCLUDED justification
        self.assertEqual(record["categories"][2]["status"], "DECLARED_EMPTY")
        self.assertEqual(record["categories"][2]["items"], [])
        self.assertTrue(record["categories"][2]["empty_justification"])


class EmptyCategoriesComputeTests(unittest.TestCase):
    """GENUINE_COMPUTE: empty_categories is derived, never caller-supplied, verified re-derivable."""

    def test_mixed_record_empty_categories_is_exactly_excluded(self):
        record = _valid_record()
        self.assertEqual(record["empty_categories"], ["EXCLUDED"])

    def test_generate_boundary_critique_record_accepts_no_empty_categories_parameter(self):
        """The builder signature itself has no empty_categories parameter -- there is no code path for a
        caller to inject a mismatched value at construction time."""
        import inspect

        sig = inspect.signature(generate_boundary_critique_record)
        self.assertNotIn("empty_categories", sig.parameters)

    def test_zero_empty_categories_when_all_populated(self):
        record = _valid_record(categories=_all_populated_categories())
        self.assertEqual(record["empty_categories"], [])

    def test_all_five_empty_categories_when_all_declared_empty(self):
        record = _valid_record(categories=[_declared_empty(c) for c in CATEGORY_ORDER])
        self.assertEqual(record["empty_categories"], list(CATEGORY_ORDER))

    def test_single_empty_category_in_the_middle_of_the_order(self):
        cats = _all_populated_categories()
        cats[2] = _declared_empty("EXCLUDED")
        record = _valid_record(categories=cats)
        self.assertEqual(record["empty_categories"], ["EXCLUDED"])

    def test_derive_empty_categories_is_pure_and_matches_builder_output(self):
        cats = _mixed_categories()
        self.assertEqual(derive_empty_categories(cats), ["EXCLUDED"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_categories_claiming_fewer_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["empty_categories"] = []  # lies -- EXCLUDED is still DECLARED_EMPTY in categories
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "BOUNDARYCRITIQUE_EMPTY_CATEGORIES_MISMATCH")

    def test_gate_catches_hand_tampered_empty_categories_claiming_more_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["empty_categories"] = list(CATEGORY_ORDER)  # lies -- 4 are POPULATED
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "BOUNDARYCRITIQUE_EMPTY_CATEGORIES_MISMATCH")

    def test_gate_catches_hand_tampered_declared_empty_with_smuggled_item(self):
        record = copy.deepcopy(_valid_record())
        record["categories"][2]["items"] = [{"name": "smuggled", "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED")}]
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_category_order(self):
        record = copy.deepcopy(_valid_record())
        record["categories"][0], record["categories"][1] = record["categories"][1], record["categories"][0]
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_boundary_critique_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_decision_context(self):
        record = copy.deepcopy(_valid_record())
        record["decision_context"] = ""
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_category_count(self):
        record = copy.deepcopy(_valid_record())
        record["categories"] = record["categories"][:4]
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_blank_problem_statement_ref(self):
        record = copy.deepcopy(_valid_record())
        record["problem_statement_ref"] = "   "
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_wrong_prefix_problem_statement_ref(self):
        record = copy.deepcopy(_valid_record())
        record["problem_statement_ref"] = "WRONG-001"
        gate = evaluate_boundary_critique_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_an_item_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["categories"][0]["items"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_items_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_item_cites_no_refs(self):
        cats = _mixed_categories()
        cats[0] = category_entry("DECISION_MAKER", "POPULATED", [boundary_item("x", make_provenance("EVIDENCE", "HUMAN_APPROVED"))])  # no refs
        record = _valid_record(categories=cats)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_ignores_declared_empty_categories_regardless_of_label(self):
        """A DECLARED_EMPTY category has no items to label evidence for -- must not be penalized."""
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        problems = gate["evidence"][0]["problems"]
        self.assertFalse(any(p["category"] == "EXCLUDED" for p in problems))

    def test_evidence_labeling_gate_passes_for_hypothesis_labeled_item_without_refs(self):
        cats = _mixed_categories()
        cats[0] = category_entry("DECISION_MAKER", "POPULATED", [boundary_item("x", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))])  # no refs, not EVIDENCE
        record = _valid_record(categories=cats)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_boundary_item_helper_omits_description_and_refs_when_not_given(self):
        item = boundary_item("x", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("description", item)
        self.assertNotIn("supporting_evidence_refs", item)

    def test_boundary_item_helper_includes_description_when_given(self):
        item = boundary_item("x", make_provenance("EVIDENCE", "HUMAN_APPROVED"), description="a description")
        self.assertEqual(item["description"], "a description")

    def test_category_entry_helper_omits_empty_justification_when_not_given(self):
        entry = category_entry("VALUES", "POPULATED", [boundary_item("x", make_provenance("EVIDENCE", "HUMAN_APPROVED"))])
        self.assertNotIn("empty_justification", entry)

    def test_category_entry_helper_includes_empty_justification_when_given(self):
        entry = category_entry("VALUES", "DECLARED_EMPTY", [], empty_justification="reason")
        self.assertEqual(entry["empty_justification"], "reason")

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_boundary_critique_gates_returns_three_gates_in_order(self):
        results = evaluate_boundary_critique_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "boundary_critique_integrity"])

    def test_evaluate_boundary_critique_gates_all_pass_on_a_valid_record(self):
        results = evaluate_boundary_critique_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_category_order_constant_matches_atlas_citation_order(self):
        self.assertEqual(CATEGORY_ORDER, ("DECISION_MAKER", "AFFECTED", "EXCLUDED", "RESOURCES", "VALUES"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BCRIT-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) -- verify the constant itself actually
        conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "framing.boundary_critique")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()

"""Mutation-style tests for ``framing.success_criteria`` (F01 framing family, Atlas F01 table row L338).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_success_criteria_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (the 4 ``evaluate_*_gate`` functions catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/success-criteria-record.schema.yaml``), including
the ``additionalProperties: false`` top-level check this session's critic already found missing on 2 sibling
schemas -- present here from the start.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.success_criteria import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    REVERSAL_CRITERIA_REF_PREFIX,
    all_gates_pass,
    evaluate_criterion_id_uniqueness_gate,
    evaluate_must_category_coverage_gate,
    evaluate_provenance_required_gate,
    evaluate_record_integrity_gate,
    evaluate_success_criteria_gates,
    generate_success_criteria_record,
    success_criterion,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SUCCESS_CRITERIA_SCHEMA = "ai-lego://specs/cognitive/typed-objects/success-criteria-record.schema.yaml"
PROVENANCE = make_provenance("EVIDENCE", "HUMAN_APPROVED")


def _criterion(suffix: str, statement: str = "some checkable statement") -> dict:
    return success_criterion(f"SC-T-{suffix}", statement, PROVENANCE)


def _valid_record(
    *,
    record_id: str = "SC-T-001",
    decision_ref: str = "DEC-T-001: some high-risk decision",
    must=None,
    should=None,
    guardrail=None,
    stop=None,
    reversal_criteria_ref=None,
):
    return generate_success_criteria_record(
        record_id,
        decision_ref,
        must if must is not None else [_criterion("M1", "at least one non-negotiable outcome")],
        should if should is not None else [_criterion("S1", "a nice-to-have outcome")],
        guardrail if guardrail is not None else [_criterion("G1", "a boundary that must not be crossed")],
        stop if stop is not None else [_criterion("T1", "an explicit halt condition")],
        PROVENANCE,
        reversal_criteria_ref=reversal_criteria_ref,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(SUCCESS_CRITERIA_SCHEMA, _valid_record(), "success criteria record")

    def test_valid_record_with_only_must_populated_validates(self):
        record = _valid_record(should=[], guardrail=[], stop=[])
        self.contracts.validate(SUCCESS_CRITERIA_SCHEMA, record, "success criteria record with only must populated")

    def test_valid_record_with_reversal_criteria_ref_validates(self):
        record = _valid_record(reversal_criteria_ref="RCS-2026-09-04-001")
        self.contracts.validate(SUCCESS_CRITERIA_SCHEMA, record, "success criteria record with reversal_criteria_ref")
        self.assertEqual(record["reversal_criteria_ref"], "RCS-2026-09-04-001")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_success_criteria_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_RECORD_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_RECORD_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_VERSION"):
            generate_success_criteria_record(
                "SC-T-002", "d", [_criterion("M2")], [], [], [], PROVENANCE, version=1
            )

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["must"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SUCCESS_CRITERIA_SCHEMA, tampered, "tampered record")
        gate = evaluate_must_category_coverage_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        """Same critic-precedent regression test framing.goal_statement's own test suite already added
        (2026-09-08 finding, 2 sibling schemas were missing additionalProperties:false) -- this schema has
        it from the start; this proves it."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SUCCESS_CRITERIA_SCHEMA, record, "record with a smuggled top-level authority-style key")

    def test_schema_rejects_an_unknown_key_inside_a_criterion(self):
        record = _valid_record()
        record["must"][0]["owner"] = "someone"  # not part of the {id, statement, provenance} shape
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SUCCESS_CRITERIA_SCHEMA, record, "record with a smuggled key inside a criterion")


class RecordFieldCompletenessTests(unittest.TestCase):
    def test_empty_decision_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_DECISION_REF"):
            _valid_record(decision_ref="")

    def test_whitespace_only_decision_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_DECISION_REF"):
            _valid_record(decision_ref="   ")


class MustCategoryInvariantTests(unittest.TestCase):
    def test_empty_must_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_MUST"):
            _valid_record(must=[])

    def test_must_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_MUST"):
            _valid_record(must="not-a-list")

    def test_must_with_a_malformed_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_MUST"):
            _valid_record(must=[{"id": "SC-T-BAD", "statement": ""}])  # missing provenance key entirely

    def test_should_guardrail_stop_may_all_be_empty(self):
        record = _valid_record(should=[], guardrail=[], stop=[])
        self.assertEqual(record["should"], [])
        self.assertEqual(record["guardrail"], [])
        self.assertEqual(record["stop"], [])

    def test_malformed_should_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_SHOULD"):
            _valid_record(should="not-a-list")

    def test_malformed_guardrail_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_GUARDRAIL"):
            _valid_record(guardrail=[{"id": "x"}])  # missing statement/provenance

    def test_malformed_stop_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_STOP"):
            _valid_record(stop="not-a-list")


class CriterionBuilderTests(unittest.TestCase):
    def test_empty_criterion_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_CRITERION_ID"):
            success_criterion("", "a statement", PROVENANCE)

    def test_empty_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_STATEMENT"):
            success_criterion("SC-T-X1", "", PROVENANCE)

    def test_whitespace_only_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_EMPTY_STATEMENT"):
            success_criterion("SC-T-X2", "   ", PROVENANCE)

    def test_valid_criterion_has_exactly_three_keys(self):
        criterion = success_criterion("SC-T-X3", "a statement", PROVENANCE)
        self.assertEqual(set(criterion.keys()), {"id", "statement", "provenance"})


class CriterionIdUniquenessTests(unittest.TestCase):
    def test_duplicate_id_within_same_category_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_DUPLICATE_CRITERION_ID"):
            _valid_record(must=[_criterion("DUP1"), _criterion("DUP1")])

    def test_duplicate_id_across_different_categories_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_DUPLICATE_CRITERION_ID"):
            _valid_record(must=[_criterion("DUP2")], should=[_criterion("DUP2")])

    def test_distinct_ids_across_all_four_categories_are_accepted(self):
        record = _valid_record(
            must=[_criterion("U1")],
            should=[_criterion("U2")],
            guardrail=[_criterion("U3")],
            stop=[_criterion("U4")],
        )
        all_ids = [c["id"] for name in ("must", "should", "guardrail", "stop") for c in record[name]]
        self.assertEqual(len(all_ids), len(set(all_ids)))


class ReversalCriteriaRefTests(unittest.TestCase):
    def test_absent_is_legal(self):
        record = _valid_record()
        self.assertNotIn("reversal_criteria_ref", record)

    def test_none_is_legal(self):
        record = _valid_record(reversal_criteria_ref=None)
        self.assertNotIn("reversal_criteria_ref", record)

    def test_correctly_prefixed_ref_is_accepted(self):
        record = _valid_record(reversal_criteria_ref="RCS-2026-09-04-001")
        self.assertEqual(record["reversal_criteria_ref"], "RCS-2026-09-04-001")

    def test_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_REVERSAL_CRITERIA_REF"):
            _valid_record(reversal_criteria_ref="")

    def test_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_REVERSAL_CRITERIA_REF"):
            _valid_record(reversal_criteria_ref="KCS-2026-09-04-001")  # a real prefix, just the WRONG family's

    def test_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SUCCESSCRITERIA_INVALID_REVERSAL_CRITERIA_REF"):
            _valid_record(reversal_criteria_ref=123)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_all_gates_pass_a_genuinely_valid_hand_built_record(self):
        gates = evaluate_success_criteria_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(gates))

    def test_must_category_coverage_gate_catches_hand_tampered_empty_must(self):
        record = copy.deepcopy(_valid_record())
        record["must"] = []
        gate = evaluate_must_category_coverage_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_must_category_coverage_gate_catches_hand_tampered_malformed_must_entry(self):
        record = copy.deepcopy(_valid_record())
        record["must"][0]["statement"] = ""
        gate = evaluate_must_category_coverage_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_criterion_id_uniqueness_gate_catches_hand_tampered_duplicate(self):
        record = copy.deepcopy(_valid_record())
        record["should"][0]["id"] = record["must"][0]["id"]
        gate = evaluate_criterion_id_uniqueness_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_criterion_id_uniqueness_gate_passes_distinct_ids(self):
        gate = evaluate_criterion_id_uniqueness_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_record_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_record_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_record_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_record_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_record_integrity_gate_catches_empty_decision_ref(self):
        record = copy.deepcopy(_valid_record())
        record["decision_ref"] = ""
        gate = evaluate_record_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_record_integrity_gate_catches_tampered_reversal_criteria_ref(self):
        record = copy.deepcopy(_valid_record(reversal_criteria_ref="RCS-2026-09-04-001"))
        record["reversal_criteria_ref"] = "WRONG-001"
        gate = evaluate_record_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_catches_hand_tampered_invalid_criterion_provenance(self):
        record = copy.deepcopy(_valid_record())
        record["guardrail"][0]["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_catches_hand_tampered_invalid_overall_provenance(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_all_gates_catch_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gates = evaluate_success_criteria_gates(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertFalse(all_gates_pass(gates))
                for gate in gates:
                    self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_list_category_without_crashing(self):
        record = copy.deepcopy(_valid_record())
        record["stop"] = "not-a-list"
        gates = evaluate_success_criteria_gates(record, "test", "2026-09-10T00:00:00Z")
        self.assertFalse(all_gates_pass(gates))


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_success_criteria_gates_returns_four_gates_in_order(self):
        results = evaluate_success_criteria_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(
            [r["gate_id"] for r in results],
            ["provenance_required", "record_integrity", "must_category_coverage", "criterion_id_uniqueness"],
        )

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SC-")

    def test_reversal_criteria_ref_prefix_constant(self):
        self.assertEqual(REVERSAL_CRITERIA_REF_PREFIX, "RCS-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.success_criteria")

    def test_builder_copies_category_lists_not_aliases_caller_lists(self):
        must = [_criterion("ALIAS1")]
        record = _valid_record(must=must)
        must.append(_criterion("ALIAS2"))
        self.assertEqual(len(record["must"]), 1)

    def test_builder_copies_criterion_dicts_not_aliases_caller_dicts(self):
        criterion = _criterion("ALIAS3")
        record = _valid_record(must=[criterion])
        criterion["statement"] = "mutated after construction"
        self.assertNotEqual(record["must"][0]["statement"], "mutated after construction")


if __name__ == "__main__":
    unittest.main()

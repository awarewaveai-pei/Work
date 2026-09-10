"""Mutation-style tests for ``framing.goal_statement`` (F01 framing family, Atlas F01 table row L334).

Two real invariants, each exercised at BOTH layers: construction-time refusal (``generate_goal_statement``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_goal_statement_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/goal-statement-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.goal_statement import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_goal_statement_gates,
    evaluate_goal_statement_integrity_gate,
    evaluate_provenance_required_gate,
    generate_goal_statement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

GOAL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/goal-statement-record.schema.yaml"


def _valid_record(
    *,
    goal_id: str = "GOAL-T-001",
    goal: str = "ship the F01 framing family",
    beneficiaries=None,
    timeframe: str = "this sprint",
    success_condition: str = "all gates pass and tests are green",
    constraints=None,
    success_criteria_ref=None,
):
    return generate_goal_statement(
        goal_id,
        goal,
        beneficiaries if beneficiaries is not None else ["downstream consumers", "the operator"],
        timeframe,
        success_condition,
        constraints if constraints is not None else ["do not touch shared registries"],
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        success_criteria_ref=success_criteria_ref,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(GOAL_SCHEMA, _valid_record(), "goal statement record")

    def test_valid_record_with_success_criteria_ref_validates(self):
        record = _valid_record(success_criteria_ref="SC-FUTURE-001")
        self.contracts.validate(GOAL_SCHEMA, record, "goal statement record with success_criteria_ref")
        self.assertEqual(record["success_criteria_ref"], "SC-FUTURE-001")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_goal_statement_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_INVALID_ID"):
            _valid_record(goal_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_INVALID_ID"):
            _valid_record(goal_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_INVALID_VERSION"):
            generate_goal_statement("GOAL-T-002", "g", ["b"], "t", "s", ["c"], make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["goal"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GOAL_SCHEMA, tampered, "tampered record")
        gate = evaluate_goal_statement_integrity_gate(tampered, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        """critic finding, 2026-09-08: additionalProperties:false was missing at the top level -- a
        hand-crafted `approved: true` key silently passed validation. Fixed; this proves it now doesn't."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GOAL_SCHEMA, record, "record with a smuggled top-level authority-style key")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_goal_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_GOAL"):
            _valid_record(goal="")

    def test_whitespace_only_goal_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_GOAL"):
            _valid_record(goal="   ")

    def test_empty_beneficiaries_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_BENEFICIARIES"):
            _valid_record(beneficiaries=[])

    def test_beneficiaries_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_BENEFICIARIES"):
            _valid_record(beneficiaries="not-a-list")

    def test_beneficiaries_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_BENEFICIARIES"):
            _valid_record(beneficiaries=["real one", "   "])

    def test_empty_timeframe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_TIMEFRAME"):
            _valid_record(timeframe="")

    def test_empty_success_condition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_SUCCESS_CONDITION"):
            _valid_record(success_condition="")

    def test_empty_constraints_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_CONSTRAINTS"):
            _valid_record(constraints=[])

    def test_constraints_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_CONSTRAINTS"):
            _valid_record(constraints="not-a-list")

    def test_constraints_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_EMPTY_CONSTRAINTS"):
            _valid_record(constraints=["real one", ""])


class SuccessEchoesGoalTests(unittest.TestCase):
    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_SUCCESS_ECHOES_GOAL"):
            _valid_record(goal="ship it", success_condition="ship it")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_SUCCESS_ECHOES_GOAL"):
            _valid_record(goal="Ship It", success_condition="ship it")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_SUCCESS_ECHOES_GOAL"):
            _valid_record(goal="ship it", success_condition="  ship   it  ")

    def test_genuinely_different_condition_is_accepted(self):
        record = _valid_record(goal="ship it", success_condition="all tests green and reviewed")
        self.assertNotEqual(record["goal"], record["success_condition"])


class SuccessCriteriaRefTests(unittest.TestCase):
    def test_absent_is_legal(self):
        record = _valid_record()
        self.assertNotIn("success_criteria_ref", record)

    def test_none_is_legal(self):
        record = _valid_record(success_criteria_ref=None)
        self.assertNotIn("success_criteria_ref", record)

    def test_non_empty_string_is_accepted(self):
        record = _valid_record(success_criteria_ref="SC-FUTURE-001")
        self.assertEqual(record["success_criteria_ref"], "SC-FUTURE-001")

    def test_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_INVALID_SUCCESS_CRITERIA_REF"):
            _valid_record(success_criteria_ref="")

    def test_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GOALSTATEMENT_INVALID_SUCCESS_CRITERIA_REF"):
            _valid_record(success_criteria_ref=123)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_goal_statement_integrity_gate(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_goal(self):
        record = copy.deepcopy(_valid_record())
        record["goal"] = ""
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_beneficiaries(self):
        record = copy.deepcopy(_valid_record())
        record["beneficiaries"] = []
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_blank_beneficiary_entry(self):
        record = copy.deepcopy(_valid_record())
        record["beneficiaries"] = ["real", "  "]
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_timeframe(self):
        record = copy.deepcopy(_valid_record())
        record["timeframe"] = ""
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_success_condition(self):
        record = copy.deepcopy(_valid_record())
        record["success_condition"] = ""
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_constraints(self):
        record = copy.deepcopy(_valid_record())
        record["constraints"] = []
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_success_echoes_goal(self):
        record = copy.deepcopy(_valid_record())
        record["success_condition"] = record["goal"]
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_success_criteria_ref(self):
        record = copy.deepcopy(_valid_record())
        record["success_criteria_ref"] = ""
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_goal_statement_integrity_gate(bad_record, "test", "2026-09-08T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_goal_statement_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_goal_statement_gates_returns_two_gates_in_order(self):
        results = evaluate_goal_statement_gates(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "goal_statement_integrity"])

    def test_evaluate_goal_statement_gates_all_pass_on_a_valid_record(self):
        results = evaluate_goal_statement_gates(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "GOAL-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.goal_statement")

    def test_builder_copies_beneficiaries_and_constraints_not_aliases_caller_lists(self):
        beneficiaries = ["a"]
        constraints = ["b"]
        record = _valid_record(beneficiaries=beneficiaries, constraints=constraints)
        beneficiaries.append("mutated")
        constraints.append("mutated")
        self.assertEqual(record["beneficiaries"], ["a"])
        self.assertEqual(record["constraints"], ["b"])


if __name__ == "__main__":
    unittest.main()

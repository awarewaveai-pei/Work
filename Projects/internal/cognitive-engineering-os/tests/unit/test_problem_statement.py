"""Mutation-style tests for ``framing.problem_statement`` (F01 framing family, Atlas F01 table row L341).

Two real invariants, each exercised at BOTH layers: construction-time refusal (``generate_problem_statement``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_problem_statement_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real, pre-existing
spec-root schema this method's outputs reuse (``typed-objects/problem-statement.schema.yaml``) -- this contract
did NOT mint a new schema; also asserts the two gaps found and fixed in that pre-existing schema alongside this
build (additionalProperties:false, minLength on the 3 required content strings) actually hold.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.problem_statement import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    STATUS_ENUM,
    all_gates_pass,
    evaluate_problem_statement_gates,
    evaluate_problem_statement_integrity_gate,
    evaluate_provenance_required_gate,
    generate_problem_statement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PROBLEM_STATEMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml"


def _valid_record(
    *,
    problem_id: str = "PROB-T-001",
    current_state: str = "cancellation rate at 8%",
    expected_state: str = "cancellation rate at 2% baseline",
    gap: str = "6 point anomalous rise",
    provenance=None,
    version: str = "1.0.0",
    status: str = "draft",
    affected_stakeholders=None,
    impact=None,
    evidence=None,
    constraints=None,
    scope_non_goals=None,
    origin_method=None,
):
    return generate_problem_statement(
        problem_id,
        current_state,
        expected_state,
        gap,
        provenance if provenance is not None else make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        version=version,
        status=status,
        affected_stakeholders=affected_stakeholders,
        impact=impact,
        evidence=evidence,
        constraints=constraints,
        scope_non_goals=scope_non_goals,
        origin_method=origin_method,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, _valid_record(), "problem statement record")

    def test_valid_record_with_all_optional_fields_validates(self):
        record = _valid_record(
            status="validated",
            affected_stakeholders=["Customer Success", "Fulfillment"],
            impact="12萬美元月損失",
            evidence=["order_cancellation_report.csv"],
            constraints=["不可暫停出貨流程"],
            scope_non_goals="只涵蓋 B2C",
            origin_method="framing.problem_statement",
        )
        self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, record, "problem statement record with all optional fields")
        self.assertEqual(record["content"]["affected_stakeholders"], ["Customer Success", "Fulfillment"])
        self.assertEqual(record["origin_method"], "framing.problem_statement")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_problem_statement_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_ID"):
            _valid_record(problem_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_ID"):
            _valid_record(problem_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_VERSION"):
            generate_problem_statement("PROB-T-002", "c", "e", "g", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_invalid_status_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_STATUS"):
            _valid_record(status="approved")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers -- this is the schema-gap fix's own regression test:
        before this build, an empty current_state was schema-LEGAL (no minLength existed)."""
        tampered = copy.deepcopy(_valid_record())
        tampered["content"]["current_state"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, tampered, "tampered record")
        gate = evaluate_problem_statement_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        """Regression test for the additionalProperties:false gap fixed alongside this build (same class
        critic review already found and fixed in 2 sibling schemas) -- a hand-crafted `approved: true` key
        must NOT silently pass validation."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, record, "record with a smuggled top-level authority-style key")

    def test_schema_rejects_an_unknown_content_key(self):
        """Same additionalProperties:false fix, applied inside `content` too."""
        record = _valid_record()
        record["content"]["smuggled"] = "nope"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, record, "record with a smuggled content key")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_current_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EMPTY_CURRENT_STATE"):
            _valid_record(current_state="")

    def test_whitespace_only_current_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EMPTY_CURRENT_STATE"):
            _valid_record(current_state="   ")

    def test_empty_expected_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EMPTY_EXPECTED_STATE"):
            _valid_record(expected_state="")

    def test_empty_gap_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EMPTY_GAP"):
            _valid_record(gap="")


class ExpectedEchoesCurrentTests(unittest.TestCase):
    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EXPECTED_ECHOES_CURRENT"):
            _valid_record(current_state="cancellation rate 8%", expected_state="cancellation rate 8%")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EXPECTED_ECHOES_CURRENT"):
            _valid_record(current_state="Ship It", expected_state="ship it")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_EXPECTED_ECHOES_CURRENT"):
            _valid_record(current_state="ship it", expected_state="  ship   it  ")

    def test_genuinely_different_state_is_accepted(self):
        record = _valid_record(current_state="8% cancellation", expected_state="2% cancellation")
        self.assertNotEqual(record["content"]["current_state"], record["content"]["expected_state"])


class OptionalFieldValidationTests(unittest.TestCase):
    def test_affected_stakeholders_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_AFFECTED_STAKEHOLDERS"):
            _valid_record(affected_stakeholders="not-a-list")

    def test_affected_stakeholders_with_non_string_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_AFFECTED_STAKEHOLDERS"):
            _valid_record(affected_stakeholders=["ok", 123])

    def test_affected_stakeholders_empty_list_is_legal(self):
        """Matches the schema's own permissive shape -- no minItems on this optional field, disclosed as a
        deliberate non-over-constraint in the method contract's own compilation_decisions."""
        record = _valid_record(affected_stakeholders=[])
        self.assertEqual(record["content"]["affected_stakeholders"], [])

    def test_impact_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_IMPACT"):
            _valid_record(impact=123)

    def test_evidence_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_EVIDENCE"):
            _valid_record(evidence="not-a-list")

    def test_constraints_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_CONSTRAINTS"):
            _valid_record(constraints="not-a-list")

    def test_scope_non_goals_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_SCOPE_NON_GOALS"):
            _valid_record(scope_non_goals=123)

    def test_origin_method_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBLEMSTATEMENT_INVALID_ORIGIN_METHOD"):
            _valid_record(origin_method="")

    def test_all_optional_fields_absent_by_default(self):
        record = _valid_record()
        for field_name in ("affected_stakeholders", "impact", "evidence", "constraints", "scope_non_goals"):
            self.assertNotIn(field_name, record["content"])
        self.assertNotIn("origin_method", record)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_problem_statement_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_current_state(self):
        record = copy.deepcopy(_valid_record())
        record["content"]["current_state"] = ""
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_gap(self):
        record = copy.deepcopy(_valid_record())
        record["content"]["gap"] = ""
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_expected_echoes_current(self):
        record = copy.deepcopy(_valid_record())
        record["content"]["expected_state"] = record["content"]["current_state"]
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_status(self):
        record = copy.deepcopy(_valid_record())
        record["status"] = "approved"
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_smuggled_content_key(self):
        record = copy.deepcopy(_valid_record())
        record["content"]["affected_stakeholders"] = "not-a-list"
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_content(self):
        record = copy.deepcopy(_valid_record())
        record["content"] = "not-a-dict"
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_problem_statement_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_invalid_origin_method(self):
        record = copy.deepcopy(_valid_record())
        record["origin_method"] = ""
        gate = evaluate_problem_statement_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_problem_statement_gates_returns_two_gates_in_order(self):
        results = evaluate_problem_statement_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "problem_statement_integrity"])

    def test_evaluate_problem_statement_gates_all_pass_on_a_valid_record(self):
        results = evaluate_problem_statement_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PROB-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.problem_statement")

    def test_status_enum_constant_matches_schema(self):
        self.assertEqual(STATUS_ENUM, ("draft", "under_review", "validated", "rejected", "superseded"))

    def test_builder_copies_optional_lists_not_aliases_caller_lists(self):
        stakeholders = ["a"]
        constraints = ["b"]
        record = _valid_record(affected_stakeholders=stakeholders, constraints=constraints)
        stakeholders.append("mutated")
        constraints.append("mutated")
        self.assertEqual(record["content"]["affected_stakeholders"], ["a"])
        self.assertEqual(record["content"]["constraints"], ["b"])


if __name__ == "__main__":
    unittest.main()

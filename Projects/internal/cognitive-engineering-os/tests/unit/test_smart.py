"""Mutation-style tests for ``framing.smart`` (F01 framing family, Atlas F01 table row L335 + §12.4
L2584-2589).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_smart_goal_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_smart_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/smart-goal-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.smart import (
    CRITERION_ORDER,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    criterion_entry,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    evaluate_smart_gates,
    evaluate_smart_integrity_gate,
    generate_smart_goal_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SMART_SCHEMA = "ai-lego://specs/cognitive/typed-objects/smart-goal-record.schema.yaml"


def _crit(criterion: str, justification: str = "default justification", target_date: str | None = None, refs: list[str] | None = ("E-1",)) -> dict:
    return criterion_entry(criterion, justification, make_provenance("EVIDENCE", "HUMAN_APPROVED"), target_date=target_date, supporting_evidence_refs=list(refs) if refs else None)


def _valid_criteria() -> list[dict]:
    return [
        _crit("SPECIFIC", "specific justification"),
        _crit("MEASURABLE", "measurable justification"),
        _crit("ACHIEVABLE", "achievable justification"),
        _crit("RELEVANT", "relevant justification"),
        _crit("TIME_BOUND", "time-bound justification", target_date="2026-12-31"),
    ]


def _valid_record(*, criteria=None, goal_statement: str = "goal", record_id: str = "SMART-T-001", refines_goal_statement_ref: str | None = None):
    return generate_smart_goal_record(
        record_id,
        goal_statement,
        criteria if criteria is not None else _valid_criteria(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        refines_goal_statement_ref=refines_goal_statement_ref,
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(SMART_SCHEMA, _valid_record(), "smart goal record")

    def test_valid_record_with_refines_goal_statement_ref_validates(self):
        record = _valid_record(refines_goal_statement_ref="GOAL-SOMETHING-001")
        self.contracts.validate(SMART_SCHEMA, record, "smart goal record with refines_goal_statement_ref")
        self.assertEqual(record["refines_goal_statement_ref"], "GOAL-SOMETHING-001")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_smart_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_VERSION"):
            generate_smart_goal_record("SMART-T-002", "goal", _valid_criteria(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_empty_goal_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_EMPTY_GOAL_STATEMENT"):
            _valid_record(goal_statement="")

    def test_whitespace_only_goal_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_EMPTY_GOAL_STATEMENT"):
            _valid_record(goal_statement="   ")

    def test_empty_refines_goal_statement_ref_when_present_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_REFINES_GOAL_STATEMENT_REF"):
            _valid_record(refines_goal_statement_ref="   ")

    def test_refines_goal_statement_ref_absent_is_legal(self):
        record = _valid_record()
        self.assertNotIn("refines_goal_statement_ref", record)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["criteria"][0]["justification"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SMART_SCHEMA, tampered, "tampered record")
        gate = evaluate_smart_integrity_gate(tampered, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        """critic finding, 2026-09-08: additionalProperties:false was missing at the top level -- a
        hand-crafted `approved: true` key silently passed validation. Fixed; this proves it now doesn't."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SMART_SCHEMA, record, "record with a smuggled top-level authority-style key")


class CriteriaShapeTests(unittest.TestCase):
    def test_criteria_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=_valid_criteria()[:3])

    def test_criteria_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=_valid_criteria() + [_crit("SPECIFIC", "extra")])

    def test_criteria_wrong_order_is_refused(self):
        crit = _valid_criteria()
        crit[0], crit[1] = crit[1], crit[0]
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=crit)

    def test_criteria_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria="not-a-list")

    def test_criterion_entry_missing_required_key_is_refused(self):
        crit = _valid_criteria()
        del crit[0]["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=crit)

    def test_criterion_entry_unknown_extra_key_is_refused(self):
        crit = _valid_criteria()
        crit[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=crit)

    def test_criterion_entry_wrong_criterion_name_is_refused(self):
        crit = _valid_criteria()
        crit[0]["criterion"] = "IDENTITY"
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=crit)

    def test_non_time_bound_criterion_carrying_target_date_is_refused(self):
        """target_date is TIME_BOUND-only -- the schema's own $defs allows it structurally on any
        entry; this is the runtime-layer tightening."""
        crit = _valid_criteria()
        crit[0]["target_date"] = "2026-01-01"
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_CRITERIA_SET"):
            _valid_record(criteria=crit)


class EmptyJustificationPerCriterionTests(unittest.TestCase):
    """Every one of the 5 criteria must independently enforce the non-empty-justification invariant."""

    def _assert_empty_justification_refused(self, position: int):
        crit = _valid_criteria()
        crit[position]["justification"] = ""
        with self.assertRaisesRegex(InvariantViolation, "SMART_EMPTY_JUSTIFICATION"):
            _valid_record(criteria=crit)

    def test_empty_justification_on_specific_is_refused(self):
        self._assert_empty_justification_refused(0)

    def test_empty_justification_on_measurable_is_refused(self):
        self._assert_empty_justification_refused(1)

    def test_empty_justification_on_achievable_is_refused(self):
        self._assert_empty_justification_refused(2)

    def test_empty_justification_on_relevant_is_refused(self):
        self._assert_empty_justification_refused(3)

    def test_empty_justification_on_time_bound_is_refused(self):
        self._assert_empty_justification_refused(4)

    def test_whitespace_only_justification_is_treated_as_empty_and_refused(self):
        crit = _valid_criteria()
        crit[1]["justification"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "SMART_EMPTY_JUSTIFICATION"):
            _valid_record(criteria=crit)


class TargetDateInvariantTests(unittest.TestCase):
    def test_target_date_missing_on_time_bound_is_refused(self):
        crit = _valid_criteria()
        del crit[4]["target_date"]
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_TARGET_DATE"):
            _valid_record(criteria=crit)

    def test_target_date_malformed_string_is_refused(self):
        crit = _valid_criteria()
        crit[4]["target_date"] = "not-a-date"
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_TARGET_DATE"):
            _valid_record(criteria=crit)

    def test_target_date_calendrically_impossible_is_refused(self):
        """2026-02-30 matches a naive YYYY-MM-DD regex but is not a real calendar date -- proves the
        check is genuine parsing, not just pattern matching."""
        crit = _valid_criteria()
        crit[4]["target_date"] = "2026-02-30"
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_TARGET_DATE"):
            _valid_record(criteria=crit)

    def test_target_date_non_string_is_refused(self):
        crit = _valid_criteria()
        crit[4]["target_date"] = 20261231
        with self.assertRaisesRegex(InvariantViolation, "SMART_INVALID_TARGET_DATE"):  # _valid_iso_date rejects non-str before attempting to parse
            _valid_record(criteria=crit)

    def test_target_date_valid_leap_day_is_accepted(self):
        crit = _valid_criteria()
        crit[4]["target_date"] = "2028-02-29"  # 2028 is a real leap year
        record = _valid_record(criteria=crit)
        self.assertEqual(record["criteria"][4]["target_date"], "2028-02-29")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_justification(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"][2]["justification"] = ""
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_target_date(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"][4]["target_date"] = "2026-13-01"
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_criteria_order(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"][0], record["criteria"][1] = record["criteria"][1], record["criteria"][0]
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_target_date_smuggled_onto_specific(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"][0]["target_date"] = "2026-01-01"
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_smart_integrity_gate(bad_record, "test", "2026-09-08T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_goal_statement(self):
        record = copy.deepcopy(_valid_record())
        del record["goal_statement"]
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_wrong_criteria_count(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"] = record["criteria"][:2]
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_blank_refines_goal_statement_ref(self):
        record = copy.deepcopy(_valid_record())
        record["refines_goal_statement_ref"] = "   "
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_a_valid_record_carrying_refines_goal_statement_ref(self):
        record = _valid_record(refines_goal_statement_ref="GOAL-SOMETHING-001")
        gate = evaluate_smart_integrity_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_criterion_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_criteria_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_criterion_cites_no_refs(self):
        crit = _valid_criteria()
        crit[0] = criterion_entry("SPECIFIC", crit[0]["justification"], make_provenance("EVIDENCE", "HUMAN_APPROVED"))  # no refs
        record = _valid_record(criteria=crit)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_fails_when_no_epistemic_type_label(self):
        record = copy.deepcopy(_valid_record())
        record["criteria"][0]["provenance"] = {}
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_for_hypothesis_labeled_criterion_without_refs(self):
        crit = _valid_criteria()
        crit[3] = criterion_entry("RELEVANT", crit[3]["justification"], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))  # no refs, not EVIDENCE
        record = _valid_record(criteria=crit)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-08T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_criterion_entry_helper_omits_target_date_when_none(self):
        entry = criterion_entry("SPECIFIC", "x", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertNotIn("target_date", entry)

    def test_criterion_entry_helper_includes_target_date_when_given(self):
        entry = criterion_entry("TIME_BOUND", "x", make_provenance("EVIDENCE", "HUMAN_APPROVED"), target_date="2026-12-31")
        self.assertEqual(entry["target_date"], "2026-12-31")

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_smart_gates_returns_three_gates_in_order(self):
        results = evaluate_smart_gates(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "smart_integrity"])

    def test_evaluate_smart_gates_all_pass_on_a_valid_record(self):
        results = evaluate_smart_gates(_valid_record(), "test", "2026-09-08T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_criterion_order_constant_matches_atlas_citation_order(self):
        self.assertEqual(CRITERION_ORDER, ("SPECIFIC", "MEASURABLE", "ACHIEVABLE", "RELEVANT", "TIME_BOUND"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SMART-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.smart")


if __name__ == "__main__":
    unittest.main()

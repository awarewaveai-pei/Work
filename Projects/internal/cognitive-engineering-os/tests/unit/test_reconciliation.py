"""Mutation-style tests for ``database_data.reconciliation`` (twenty-ninth Method Atlas slice, third from the
`database_data` family). Atlas's own benefit column (F21 L908: "migration 後可證明完整性" -- a migration can be
proven complete) is proven at BOTH independent layers -- construction-time and gate re-derivation, the gate
RECOMPUTING ``compute_check_result`` fresh rather than trusting stored ``matches``/``diff`` -- same discipline
`database_data.data_lineage`'s own gate already established for this session's own class of "gate must
recompute, not just re-read" lesson.

The compute layer (``ai_lego/compute/reconciliation/compare.py``) is tested for real comparison correctness
against both branches Atlas's own three-way vocabulary requires: numeric subtraction for COUNT (including
float-noise rounding and non-numeric/non-finite refusal) and exact string equality for CHECKSUM/
BUSINESS_INVARIANT (which do not share COUNT's numeric-diff semantics)."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.reconciliation.compare import compute_check_result
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.reconciliation import (
    METHOD_ID,
    all_gates_pass,
    check,
    evaluate_genuine_compute_gate,
    evaluate_provenance_required_gate,
    evaluate_reconciliation_gates,
    evaluate_reconciliation_integrity_gate,
    generate_reconciliation_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECONCILIATION_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/reconciliation-record.schema.yaml"


def _matching_checks():
    return [
        check("RECON-T-001-C1", "row count", "COUNT", "100", "100"),
        check("RECON-T-001-C2", "checksum", "CHECKSUM", "abc123", "abc123"),
    ]


def _valid_record(overall_status: str = "reconciled"):
    return generate_reconciliation_record(
        "RECON-T-001", "source-db", "target-db", _matching_checks(), overall_status, make_provenance("CALCULATED_RESULT", "AI_GENERATED")
    )


class ComputeTests(unittest.TestCase):
    """Real comparison correctness, not just 'does it run'."""

    def test_count_matching_values_match_with_zero_diff(self):
        self.assertEqual(compute_check_result("COUNT", "100", "100"), {"matches": True, "diff": 0})

    def test_count_mismatched_values_computes_real_signed_diff(self):
        self.assertEqual(compute_check_result("COUNT", "100", "88"), {"matches": False, "diff": -12})

    def test_count_diff_is_target_minus_source_not_source_minus_target(self):
        self.assertEqual(compute_check_result("COUNT", "10", "15")["diff"], 5)

    def test_count_applies_no_tolerance_to_float_repr_noise(self):
        """DELIBERATE, post-critic-review design choice: unlike ai_lego/compute/error_budget/budget.py's own
        rounding (which absorbs float ARITHMETIC noise within its own [0,1]-bounded domain), this module
        applies NO tolerance of any kind -- a target_value string carrying float-repr noise (e.g.
        "0.30000000000000004", the classic 0.1+0.2 artifact) is a real, if tiny, mismatch that must be
        surfaced, not silently rounded away. A caller who knows this specific discrepancy is expected records
        it via the check's own resolution field instead."""
        result = compute_check_result("COUNT", "0.3", "0.30000000000000004")
        self.assertFalse(result["matches"])
        self.assertNotEqual(result["diff"], 0)

    def test_count_non_numeric_value_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_COUNT_NOT_NUMERIC"):
            compute_check_result("COUNT", "not-a-number", "100")

    def test_count_non_finite_value_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_COUNT_NOT_FINITE"):
            compute_check_result("COUNT", "inf", "100")

    def test_checksum_matching_values_match_with_null_diff(self):
        self.assertEqual(compute_check_result("CHECKSUM", "abc123", "abc123"), {"matches": True, "diff": None})

    def test_checksum_mismatched_values_do_not_match_and_diff_is_null(self):
        self.assertEqual(compute_check_result("CHECKSUM", "abc123", "abc999"), {"matches": False, "diff": None})

    def test_checksum_is_exact_equality_not_numeric_even_if_values_look_numeric(self):
        """A checksum that happens to look like a number is NOT run through numeric comparison -- '007' != '7'
        as opaque strings even though they would be numerically equal."""
        self.assertEqual(compute_check_result("CHECKSUM", "007", "7"), {"matches": False, "diff": None})

    def test_business_invariant_uses_the_same_exact_equality_semantics_as_checksum(self):
        self.assertEqual(compute_check_result("BUSINESS_INVARIANT", "true", "true"), {"matches": True, "diff": None})
        self.assertEqual(compute_check_result("BUSINESS_INVARIANT", "true", "false"), {"matches": False, "diff": None})

    def test_unknown_check_type_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_UNKNOWN_CHECK_TYPE"):
            compute_check_result("NOT_A_TYPE", "1", "1")

    def test_unhashable_check_type_raises_not_crashes(self):
        """Regression for a critic-caught Minor: an unhashable check_type (e.g. a list, from a rehydrated
        malformed record) must fail closed via InvariantViolation, not escape as a raw TypeError from the
        `in VALID_CHECK_TYPES` frozenset check."""
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_UNKNOWN_CHECK_TYPE"):
            compute_check_result(["COUNT"], "1", "1")

    def test_count_precision_above_two_to_the_53_is_exact_not_float_truncated(self):
        """Regression for the critic-caught Critical: float() silently loses integer precision above 2^53,
        making two genuinely different row counts compare equal with zero tampering. Decimal is exact."""
        result = compute_check_result("COUNT", "9007199254740993", "9007199254740992")
        self.assertFalse(result["matches"])
        self.assertEqual(result["diff"], -1.0)

    def test_count_precision_at_money_scale_above_1e14_is_exact(self):
        """Regression for the critic-caught Critical: float() also loses fractional precision at ~1e14
        magnitude (money sums), silently erasing a real one-cent difference."""
        result = compute_check_result("COUNT", "100000000000000.37", "100000000000000.38")
        self.assertFalse(result["matches"])
        self.assertAlmostEqual(result["diff"], 0.01, places=6)

    def test_count_relative_tiny_values_do_not_falsely_match(self):
        """A companion edge of the same float-precision bug: two values differing by 100% at tiny magnitude
        must not be silently treated as equal either."""
        result = compute_check_result("COUNT", "0.00000000001", "0.00000000002")
        self.assertFalse(result["matches"])


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_reconciled_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECONCILIATION_RECORD_SCHEMA, _valid_record(), "reconciliation record")

    def test_open_record_with_resolved_mismatch_validates(self):
        checks = [
            check(
                "RECON-T-002-C1", "row count", "COUNT", "100", "88",
                resolution={"resolved_as_expected": True, "note": "expected -- 12 test rows purged before migration, documented in the runbook"},
            )
        ]
        record = generate_reconciliation_record("RECON-T-002", "source-db", "target-db", checks, "reconciled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.contracts.validate(RECONCILIATION_RECORD_SCHEMA, record, "reconciled-via-resolution record")

    def test_open_record_with_a_real_unresolved_problem_validates_as_open(self):
        checks = [
            check(
                "RECON-T-003-C1", "row count", "COUNT", "100", "88",
                resolution={"resolved_as_expected": False, "note": "12 rows confirmed lost -- real incident"},
            )
        ]
        record = generate_reconciliation_record("RECON-T-003", "source-db", "target-db", checks, "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.contracts.validate(RECONCILIATION_RECORD_SCHEMA, record, "open record")

    def test_zero_checks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_NO_CHECKS"):
            generate_reconciliation_record("RECON-T-004", "s", "t", [], "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_empty_check_id_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_EMPTY_CHECK_ID"):
            check("", "row count", "COUNT", "1", "1")

    def test_empty_check_name_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_EMPTY_CHECK_NAME"):
            check("RECON-T-005-C1", "", "COUNT", "1", "1")

    def test_resolution_without_a_note_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_INVALID_RESOLUTION"):
            check("RECON-T-006-C1", "row count", "COUNT", "1", "2", resolution={"resolved_as_expected": True, "note": ""})

    def test_duplicate_check_id_is_refused_at_construction(self):
        checks = [
            check("RECON-T-007-C1", "row count", "COUNT", "100", "100"),
            check("RECON-T-007-C1", "checksum", "CHECKSUM", "abc", "abc"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_DUPLICATE_CHECK_ID"):
            generate_reconciliation_record("RECON-T-007", "s", "t", checks, "reconciled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_invalid_overall_status_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_INVALID_STATUS"):
            generate_reconciliation_record("RECON-T-008", "s", "t", _matching_checks(), "done", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_reconciled_with_an_unresolved_mismatch_is_refused(self):
        """The core invariant: overall_status:reconciled cannot coexist with a real, unaddressed diff."""
        checks = [check("RECON-T-009-C1", "row count", "COUNT", "100", "88")]
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_NOT_ACTUALLY_RECONCILED"):
            generate_reconciliation_record("RECON-T-009", "s", "t", checks, "reconciled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_reconciled_with_a_confirmed_real_problem_is_refused(self):
        """resolved_as_expected:false means a real problem was found -- NOT a green light for 'reconciled'."""
        checks = [check("RECON-T-010-C1", "row count", "COUNT", "100", "88", resolution={"resolved_as_expected": False, "note": "real data loss"})]
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_NOT_ACTUALLY_RECONCILED"):
            generate_reconciliation_record("RECON-T-010", "s", "t", checks, "reconciled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_open_is_legal_even_when_every_check_matches(self):
        """DELIBERATELY ONE-DIRECTIONAL, same class as database_data.backup_restore_drill's own status field:
        a caller may conservatively declare 'open' even when nothing is actually wrong."""
        record = generate_reconciliation_record("RECON-T-011", "s", "t", _matching_checks(), "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.assertEqual(record["overall_status"], "open")

    def test_non_dict_check_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_INVALID_CHECK_SHAPE"):
            generate_reconciliation_record("RECON-T-012", "s", "t", ["not-a-dict"], "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_EMPTY_RECORD_FIELD"):
            generate_reconciliation_record("", "s", "t", _matching_checks(), "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_empty_source_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_EMPTY_RECORD_FIELD"):
            generate_reconciliation_record("RECON-T-015", "", "t", _matching_checks(), "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_hand_built_check_with_invalid_check_type_is_refused_at_construction(self):
        """Regression for a critic-caught Minor: generate_reconciliation_record itself did not validate
        check_type for hand-built checks, despite the contract's own precondition naming it."""
        hand_built = {"id": "RECON-T-016-C1", "name": "x", "check_type": "NOT_A_TYPE", "source_value": "1", "target_value": "1"}
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_INVALID_CHECK_TYPE"):
            generate_reconciliation_record("RECON-T-016", "s", "t", [hand_built], "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_hand_built_check_with_a_lying_matches_is_refused_at_construction(self):
        """Regression for the critic-caught Critical: generate_reconciliation_record never recomputed
        matches/diff for hand-built checks, so a caller bypassing check() could freely assert a false
        'matches: true' over a real mismatch and have it certified overall_status:reconciled with no error."""
        liar = {"id": "RECON-T-017-C1", "name": "row count", "check_type": "COUNT", "source_value": "48213", "target_value": "40000", "matches": True, "diff": 0}
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_STORED_VERDICT_DISAGREES"):
            generate_reconciliation_record("RECON-T-017", "s", "t", [liar], "reconciled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_hand_built_check_omitting_matches_diff_is_still_computed_correctly(self):
        """A hand-built check that supplies only check_type/source_value/target_value (no matches/diff at
        all) is a legitimate input shape -- the record's own checks[] end up carrying the REAL computed
        verdict, not an absent one."""
        hand_built = {"id": "RECON-T-018-C1", "name": "row count", "check_type": "COUNT", "source_value": "100", "target_value": "88"}
        record = generate_reconciliation_record("RECON-T-018", "s", "t", [hand_built], "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.assertEqual(record["checks"][0]["matches"], False)
        self.assertEqual(record["checks"][0]["diff"], -12.0)

    def test_resolution_with_non_boolean_resolved_as_expected_is_refused_at_construction(self):
        """Regression for a critic-caught Minor: a string 'true' must be refused, not silently accepted and
        then fail schema validation downstream while also being treated as non-satisfying."""
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_INVALID_RESOLUTION"):
            check("RECON-T-019-C1", "row count", "COUNT", "1", "2", resolution={"resolved_as_expected": "true", "note": "n"})

    def test_matching_check_with_a_documented_real_problem_does_not_satisfy_reconciled(self):
        """Regression for the critic-caught Major: a resolution's own resolved_as_expected:false must
        override matches:true, not be ignored by it -- e.g. two checksums matching on independently-
        corrupted data is a REAL problem a human has documented, not a green light."""
        checks = [
            check(
                "RECON-T-020-C1", "checksum", "CHECKSUM", "deadbeef", "deadbeef",
                resolution={"resolved_as_expected": False, "note": "both sides truncated identically -- checksum agrees on WRONG data, confirmed real corruption"},
            )
        ]
        with self.assertRaisesRegex(InvariantViolation, "RECONCILIATION_NOT_ACTUALLY_RECONCILED"):
            generate_reconciliation_record("RECON-T-020", "s", "t", checks, "reconciled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_reconciliation_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_reconciled_record_passes_all_three_gates(self):
        results = evaluate_reconciliation_gates(_valid_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "reconciliation_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_open_record_passes_all_three_gates(self):
        checks = [check("RECON-T-013-C1", "row count", "COUNT", "100", "88", resolution={"resolved_as_expected": False, "note": "real issue, unresolved"})]
        record = generate_reconciliation_record("RECON-T-013", "s", "t", checks, "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        results = evaluate_reconciliation_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_target_value_fails_the_gate_via_recomputation(self):
        """The critical regression this slice was built to avoid from the start: the gate RECOMPUTES
        compute_check_result from the raw check_type/source_value/target_value, so injecting a new
        divergence (while leaving the check's own stored matches:true/diff:0 untouched) is still caught -- a
        gate that only re-read the stored flag would NOT catch this."""
        record = _valid_record()
        record["checks"][0]["target_value"] = "99999999"
        self.assertTrue(record["checks"][0]["matches"])  # stored flag deliberately left stale/true
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["checks"][0]["id"], gate["evidence"][0].get("mismatched_check_ids", []))

    def test_hand_tampered_stored_diff_disagreeing_with_recomputation_fails_the_gate(self):
        record = _valid_record()
        record["checks"][0]["diff"] = -999  # matches:true is untouched, but the stored diff itself is now a lie
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0].get("reason"), "stored matches/diff disagrees with recomputation")
        self.assertIn(record["checks"][0]["id"], gate["evidence"][0].get("mismatched_check_ids", []))

    def test_hand_tampered_overall_status_to_reconciled_over_a_real_mismatch_fails_the_gate(self):
        """Same class of tamper as data_lineage's own gate test: mutate a stored record to a claim the
        underlying data no longer supports, and confirm the gate's own independent re-derivation (not the
        builder, which never runs again on this already-built dict) is what catches it."""
        checks = [check("RECON-T-014-C1", "row count", "COUNT", "100", "88", resolution={"resolved_as_expected": False, "note": "real issue"})]
        record = generate_reconciliation_record("RECON-T-014", "s", "t", checks, "open", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        record["overall_status"] = "reconciled"  # hand-tampered past the builder's own enforcement
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(checks[0]["id"], gate["evidence"][0].get("unsatisfied_check_ids", []))

    def test_hand_tampered_resolution_marking_a_match_as_a_real_problem_fails_the_gate(self):
        """Gate-layer companion to the builder's own M1 regression: even if a record somehow reaches the
        gate with overall_status:reconciled and a MATCHING check whose resolution documents
        resolved_as_expected:false, the gate's own independent re-derivation of _check_is_satisfied must
        still flag it -- resolution overrides matches in the gate too, not just at construction."""
        record = _valid_record()
        record["checks"][0]["resolution"] = {"resolved_as_expected": False, "note": "matches, but confirmed both sides are corrupted identically"}
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["checks"][0]["id"], gate["evidence"][0].get("unsatisfied_check_ids", []))

    def test_hand_tampered_duplicate_check_id_fails_the_gate(self):
        record = _valid_record()
        record["checks"][-1] = dict(record["checks"][-1], id=record["checks"][0]["id"])
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["checks"][0]["id"], gate["evidence"][0].get("duplicate_ids", []))

    def test_hand_tampered_emptied_checks_fails_the_gate(self):
        record = _valid_record()
        record["checks"] = []
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0].get("reason"), "checks missing, not a list, or empty")

    def test_hand_tampered_invalid_overall_status_fails_the_gate(self):
        record = _valid_record()
        record["overall_status"] = "done"
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0].get("overall_status"), "done")

    def test_non_dict_check_fails_the_integrity_gate_not_a_crash(self):
        record = _valid_record()
        record["checks"] = ["not-a-dict"]
        gate = evaluate_reconciliation_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0].get("reason"), "one or more checks is not a well-shaped dict with a real id and name")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_null_provenance_fails_closed_through_the_full_gate_list_not_a_crash(self):
        """Regression for a critic-caught Minor shared-file bug (ai_lego/modules/research/gates.py's own
        evaluate_statistical_gate): `.get("provenance", {})` only substitutes the default when the key is
        ABSENT, so an explicit `provenance: null` (present, value None) crashed with AttributeError instead
        of failing closed. Fixed in gates.py; this proves the fix through the REAL orchestrator, not just the
        one gate whose own direct test happened to avoid the crashing path."""
        record = _valid_record()
        record["provenance"] = None
        results = evaluate_reconciliation_gates(record, "test", "2026-09-05T00:00:00Z")  # must not raise
        self.assertFalse(all_gates_pass(results))

    def test_genuine_compute_gate_is_the_real_evaluate_statistical_gate_function_reused_unchanged(self):
        """Proves the reuse is real function identity -- sixth reuse this session, after root_cause.pareto/
        decision.ahp/decision.mcda/devops_sre.error_budget/database_data.data_lineage."""
        from ai_lego.modules.database_data import reconciliation as reconciliation_module

        self.assertIs(reconciliation_module.evaluate_statistical_gate, evaluate_statistical_gate)

    def test_hand_tampered_wrong_epistemic_type_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["provenance"] = make_provenance("AI_INFERENCE", "AI_GENERATED")
        gate = evaluate_genuine_compute_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()

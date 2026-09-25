"""Mutation-style tests for ``database_data.backup_restore_drill`` (twenty-fifth Method Atlas slice, FIRST from
the `database_data` family). Atlas's own purpose line (restorable within RTO/RPO) is proven at BOTH independent
layers -- construction-time and gate re-derivation -- same discipline every prior forbidden-state guard this
session built already established.

Includes regressions for two critic-caught bugs in this slice's first draft (this file's own first review
pass):

1. The gate re-derived the pass/fail verdict but not the RPO-pairing precondition itself -- deleting exactly
   one of ``rpo_target_seconds``/``observed_data_age_seconds`` from a real RPO-failing record let the gate
   accept ``status: passed``. Fixed by folding the pairing check into the same shared predicate the gate
   calls (``_rpo_pairing_is_valid``); regression-tested here by mutating a record's dict directly, not just by
   calling the builder (the builder itself never produces this shape -- the whole point is proving the gate
   catches a shape that bypassed construction).
2. The gate enforced BIDIRECTIONAL status/verdict equivalence (a passing-criteria record hand-labelled
   ``status: failed`` was wrongly rejected), stricter than the contract's own one-directional precondition
   text and the builder's own one-directional check. Fixed to match; regression-tested by confirming the
   builder itself accepts a conservative ``status: failed`` record whose numbers technically pass, and that
   the gate accepts it too.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.backup_restore_drill import (
    METHOD_ID,
    all_gates_pass,
    evaluate_backup_restore_drill_gates,
    evaluate_pass_invariant_gate,
    generate_backup_restore_drill_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BACKUP_DRILL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/backup-restore-drill-record.schema.yaml"


def _passed_record():
    return generate_backup_restore_drill_record(
        "DRILL-T-001", "BACKUP-nightly", "isolated-restore-staging", True, 3600.0, 2415.0, "passed",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


def _failed_record():
    return generate_backup_restore_drill_record(
        "DRILL-T-002", "BACKUP-nightly", "isolated-restore-staging", True, 3600.0, 5100.0, "failed",
        make_provenance("AI_INFERENCE", "AI_GENERATED"), issues_recorded=["restore job queued 20 minutes late"],
    )


def _rpo_tracked_passed_record():
    return generate_backup_restore_drill_record(
        "DRILL-T-RPO-001", "BACKUP-nightly", "isolated-restore-staging", True, 3600.0, 2000.0, "passed",
        make_provenance("AI_INFERENCE", "AI_GENERATED"), rpo_target_seconds=900.0, observed_data_age_seconds=600.0,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_passed_record_validates_against_the_real_schema(self):
        self.contracts.validate(BACKUP_DRILL_SCHEMA, _passed_record(), "backup restore drill record")

    def test_failed_record_validates_against_the_real_schema(self):
        self.contracts.validate(BACKUP_DRILL_SCHEMA, _failed_record(), "failed backup restore drill record")

    def test_recovery_exactly_at_rto_boundary_is_legal_when_passed(self):
        """actual_recovery_duration_seconds == rto_target_seconds is inclusive (<=), not exclusive."""
        record = generate_backup_restore_drill_record(
            "DRILL-T-003", "x", "x", True, 3600.0, 3600.0, "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        self.contracts.validate(BACKUP_DRILL_SCHEMA, record, "boundary-exact record")

    def test_data_age_exactly_at_rpo_boundary_is_legal_when_passed(self):
        """observed_data_age_seconds == rpo_target_seconds is inclusive (<=), not exclusive -- symmetric to the
        RTO boundary test above. A critic-caught mutation-coverage gap (>= vs >) was found unguarded here."""
        record = generate_backup_restore_drill_record(
            "DRILL-T-003B", "x", "x", True, 3600.0, 2000.0, "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
            rpo_target_seconds=900.0, observed_data_age_seconds=900.0,
        )
        self.contracts.validate(BACKUP_DRILL_SCHEMA, record, "RPO-boundary-exact record")

    def test_rpo_tracked_and_within_target_is_legal_when_passed(self):
        record = _rpo_tracked_passed_record()
        self.contracts.validate(BACKUP_DRILL_SCHEMA, record, "RPO-tracked passed record")

    def test_rpo_exceeded_forbids_passed_even_when_rto_and_integrity_are_fine(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_FAILED_CRITERIA_CANNOT_PASS"):
            generate_backup_restore_drill_record(
                "DRILL-T-005", "x", "x", True, 3600.0, 2000.0, "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                rpo_target_seconds=900.0, observed_data_age_seconds=1200.0,
            )

    def test_conservative_failed_status_despite_passing_numbers_is_legal(self):
        """ONE-DIRECTIONAL semantics (post-critic-review): the contract only forbids status:passed when
        criteria fail -- it never forbids status:failed when criteria technically pass. A real operational
        judgment call (e.g. the runbook itself had to be manually patched mid-drill) must be recordable even
        when the raw timing numbers look fine."""
        record = generate_backup_restore_drill_record(
            "DRILL-T-005B", "x", "x", True, 3600.0, 2415.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
            issues_recorded=["restore succeeded within RTO, but required manual runbook intervention -- calling this a fail on principle"],
        )
        self.assertEqual(record["status"], "failed")
        self.contracts.validate(BACKUP_DRILL_SCHEMA, record, "conservative-failed record")

    def test_empty_backup_id_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_EMPTY_BACKUP_ID"):
            generate_backup_restore_drill_record("DRILL-T-006", "", "x", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_restore_environment_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_EMPTY_RESTORE_ENVIRONMENT"):
            generate_backup_restore_drill_record("DRILL-T-006B", "x", "", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_boolean_integrity_flag_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_INTEGRITY_FLAG"):
            generate_backup_restore_drill_record("DRILL-T-006C", "x", "x", "yes", 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_zero_rto_target_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_RTO_TARGET"):
            generate_backup_restore_drill_record("DRILL-T-007", "x", "x", True, 0.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_infinite_rto_target_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_RTO_TARGET"):
            generate_backup_restore_drill_record("DRILL-T-007B", "x", "x", True, float("inf"), 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_nan_duration_is_refused_at_construction(self):
        """A realistic output of a malformed timing pipeline, not a contrived input -- must not silently read
        as 'within RTO' (nan > x is always False)."""
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_DURATION"):
            generate_backup_restore_drill_record("DRILL-T-007C", "x", "x", True, 3600.0, float("nan"), "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_negative_duration_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_DURATION"):
            generate_backup_restore_drill_record("DRILL-T-007D", "x", "x", True, 3600.0, -1.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_status_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_STATUS"):
            generate_backup_restore_drill_record("DRILL-T-008", "x", "x", True, 3600.0, 100.0, "partial", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_rpo_target_without_observed_age_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_RPO_WITHOUT_OBSERVED_AGE"):
            generate_backup_restore_drill_record(
                "DRILL-T-009", "x", "x", True, 3600.0, 100.0, "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                rpo_target_seconds=900.0,
            )

    def test_observed_age_without_rpo_target_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_OBSERVED_AGE_WITHOUT_RPO"):
            generate_backup_restore_drill_record(
                "DRILL-T-009B", "x", "x", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                observed_data_age_seconds=600.0,
            )

    def test_zero_rpo_target_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_RPO_TARGET"):
            generate_backup_restore_drill_record(
                "DRILL-T-009C", "x", "x", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                rpo_target_seconds=0.0, observed_data_age_seconds=10.0,
            )

    def test_negative_observed_data_age_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_DATA_AGE"):
            generate_backup_restore_drill_record(
                "DRILL-T-009D", "x", "x", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                rpo_target_seconds=900.0, observed_data_age_seconds=-1.0,
            )

    def test_issues_recorded_as_bare_string_is_refused_at_construction(self):
        """A bare string is iterable character-by-character in Python -- passing one here would silently
        shred Atlas's own step 5 ('記錄問題') content into single-character 'issues'."""
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_ISSUES_RECORDED"):
            generate_backup_restore_drill_record(
                "DRILL-T-009E", "x", "x", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                issues_recorded="restore was late",
            )

    def test_issues_recorded_with_empty_string_item_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_INVALID_ISSUES_RECORDED"):
            generate_backup_restore_drill_record(
                "DRILL-T-009F", "x", "x", True, 3600.0, 100.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
                issues_recorded=["real issue", ""],
            )

    def test_failed_integrity_forbids_passed_even_when_within_rto(self):
        """Atlas's own step 3 (integrity checks) is independently required, not subsumed by timing alone."""
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_FAILED_CRITERIA_CANNOT_PASS"):
            generate_backup_restore_drill_record("DRILL-T-010", "x", "x", False, 3600.0, 100.0, "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_over_rto_duration_forbids_passed(self):
        """Atlas's own purpose line (§12.40 L3090): restorable within RTO/RPO."""
        with self.assertRaisesRegex(InvariantViolation, "BACKUPDRILL_FAILED_CRITERIA_CANNOT_PASS"):
            generate_backup_restore_drill_record("DRILL-T-011", "x", "x", True, 3600.0, 5100.0, "passed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_backup_drill_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_passed_record_passes_both_gates(self):
        results = evaluate_backup_restore_drill_gates(_passed_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "pass_invariant"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_failed_record_passes_both_gates(self):
        results = evaluate_backup_restore_drill_gates(_failed_record(), "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_conservative_failed_record_with_passing_numbers_passes_the_gate(self):
        """Regression for the critic-caught bidirectional-gate bug: the gate must accept status:failed even
        when the recomputed verdict is True -- it is NOT the gate's job to force status to always equal the
        computed verdict, only to forbid status:passed when the verdict is False."""
        record = generate_backup_restore_drill_record(
            "DRILL-T-GATE-001", "x", "x", True, 3600.0, 2415.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
        gate = evaluate_pass_invariant_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_hand_tampered_failed_record_relabelled_passed_fails_the_gate(self):
        """The direction that matters: a record built and validated as failed, then hand-tampered to claim
        passed WITHOUT changing the raw fields that made it fail -- the gate re-derives from those raw fields
        and must not be fooled by the relabelled status alone."""
        record = _failed_record()
        record["status"] = "passed"
        gate = evaluate_pass_invariant_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_rpo_target_deleted_alone_still_fails_the_gate(self):
        """Regression for the critic-caught Critical: a real RPO-tracked record whose criteria FAIL (data age
        exceeds its RPO target) has ONLY rpo_target_seconds deleted, leaving observed_data_age_seconds behind
        as an orphaned value -- and status relabelled passed. The first-draft gate treated the missing
        rpo_target_seconds as 'RPO not tracked' and accepted this. The fixed gate's shared
        _rpo_pairing_is_valid predicate catches the orphaned field and fails closed."""
        record = generate_backup_restore_drill_record(
            "DRILL-T-GATE-002", "x", "x", True, 3600.0, 2000.0, "failed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
            rpo_target_seconds=900.0, observed_data_age_seconds=1200.0,
        )
        del record["rpo_target_seconds"]
        record["status"] = "passed"
        gate = evaluate_pass_invariant_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        all_results = evaluate_backup_restore_drill_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertFalse(all_gates_pass(all_results))

    def test_hand_tampered_observed_age_deleted_alone_still_fails_the_gate(self):
        """The mirror direction of the regression above: deleting observed_data_age_seconds alone, leaving
        rpo_target_seconds as an orphaned value."""
        record = _rpo_tracked_passed_record()
        del record["observed_data_age_seconds"]
        gate = evaluate_pass_invariant_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_raw_fields_fail_closed_rather_than_pass(self):
        record = _passed_record()
        del record["actual_recovery_duration_seconds"]
        gate = evaluate_pass_invariant_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_non_boolean_integrity_flag_fails_the_gate(self):
        """The predicate's own isinstance(bool) check must not be fooled by a truthy non-bool value (e.g. a
        non-empty string) after Python's own truthiness coercion."""
        record = _passed_record()
        record["integrity_checks_passed"] = "no"
        gate = evaluate_pass_invariant_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_wrong_provenance_fails_the_provenance_gate(self):
        record = _passed_record()
        record["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "AI_GENERATED", "locked": None}
        results = evaluate_backup_restore_drill_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertFalse(all_gates_pass(results))


if __name__ == "__main__":
    unittest.main()

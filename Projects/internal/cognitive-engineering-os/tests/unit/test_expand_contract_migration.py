"""Mutation-style tests for ``database_data.expand_contract_migration`` (thirtieth Method Atlas slice,
fourth from the `database_data` family). Execution Contract §28's own linear 15-stage sequence is proven at
BOTH independent layers -- construction-time and gate re-derivation, the gate RECOMPUTING both the
contiguous-prefix check AND the completed_at temporal-order check fresh rather than trusting any prior
validation.

Includes regressions for a critic review of this slice's own first draft, which found: (1) a Critical --
presence-only prefix checking proved nothing about REAL temporal order, so a record with every stage_id
present but an EARLIER-canonical stage's completed_at AFTER a LATER-canonical stage's could still be built;
(2) hand-built stage dicts were stored verbatim (aliased, not rebuilt), letting extra/wrong fields survive
into a certified record; (3) an unhashable stage_id escaped as a raw TypeError instead of failing closed
(the exact bug class the immediately-prior `database_data.reconciliation` slice had already fixed and
regression-tested); (4) three gate tests asserted only `status == "FAIL"` with no evidence pinning, and a
real mutation experiment proved they could not distinguish which guard fired."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.expand_contract_migration import (
    METHOD_ID,
    STAGE_SEQUENCE,
    all_gates_pass,
    evaluate_expand_contract_migration_gates,
    evaluate_provenance_required_gate,
    evaluate_stage_order_integrity_gate,
    generate_expand_contract_migration_record,
    stage,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/expand-contract-migration-record.schema.yaml"


def _first_three_stages():
    return [
        stage("schema_baseline", "2026-08-01T09:00:00Z"),
        stage("data_contract", "2026-08-01T10:00:00Z"),
        stage("compatibility_analysis", "2026-08-01T14:00:00Z"),
    ]


def _all_fifteen_stages():
    return [stage(stage_id, f"2026-08-{i + 1:02d}T09:00:00Z") for i, stage_id in enumerate(STAGE_SEQUENCE)]


def _valid_record(stages=None):
    return generate_expand_contract_migration_record(
        "ECMIG-T-001", "test migration", stages or _first_three_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED")
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_stage_sequence_has_all_fifteen_canonical_stages_in_order(self):
        self.assertEqual(
            STAGE_SEQUENCE,
            (
                "schema_baseline",
                "data_contract",
                "compatibility_analysis",
                "backup_restore_validation",
                "expand",
                "deploy_compatible_code",
                "enable_dual_write",
                "backfill",
                "reconciliation",
                "dual_read_verification",
                "canary",
                "traffic_migration_switch",
                "observe",
                "contract_old_schema",
                "close_rollback_window",
            ),
        )

    def test_in_flight_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "in-flight migration record")

    def test_fully_completed_record_validates(self):
        record = generate_expand_contract_migration_record("ECMIG-T-002", "full migration", _all_fifteen_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RECORD_SCHEMA, record, "fully completed migration record")

    def test_single_stage_record_validates(self):
        record = generate_expand_contract_migration_record("ECMIG-T-003", "just started", [stage("schema_baseline", "2026-08-01T09:00:00Z")], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RECORD_SCHEMA, record, "single-stage record")

    def test_evidence_ref_is_accepted_and_preserved(self):
        record = generate_expand_contract_migration_record(
            "ECMIG-T-004", "with evidence", [stage("schema_baseline", "2026-08-01T09:00:00Z", evidence_ref="SOME-OTHER-RECORD-001")], make_provenance("AI_INFERENCE", "AI_GENERATED")
        )
        self.assertEqual(record["stages"][0]["evidence_ref"], "SOME-OTHER-RECORD-001")
        self.contracts.validate(RECORD_SCHEMA, record, "record with evidence_ref")

    def test_zero_stages_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_NO_STAGES"):
            generate_expand_contract_migration_record("ECMIG-T-005", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_unknown_stage_id_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_UNKNOWN_STAGE"):
            stage("not_a_real_stage", "2026-08-01T09:00:00Z")

    def test_unhashable_stage_id_raises_not_crashes(self):
        """Regression for a critic-caught Major: an unhashable stage_id (e.g. a list, from a rehydrated
        malformed record) must fail closed via InvariantViolation, not escape as a raw TypeError from the
        `in _STAGE_INDEX` check -- the exact bug class database_data.reconciliation's own critic round
        already fixed one directory over."""
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_UNKNOWN_STAGE"):
            stage(["schema_baseline"], "2026-08-01T09:00:00Z")

    def test_hand_built_stage_with_unhashable_stage_id_is_refused_at_construction(self):
        hand_built = {"stage_id": {"not": "a string"}, "completed_at": "2026-08-01T09:00:00Z"}
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_UNKNOWN_STAGE"):
            generate_expand_contract_migration_record("ECMIG-T-005B", "x", [hand_built], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_completed_at_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_EMPTY_COMPLETED_AT"):
            stage("schema_baseline", "")

    def test_non_iso8601_completed_at_is_refused_at_construction(self):
        """completed_at must be a REAL, parseable timestamp -- this is what makes the temporal-order
        invariant checkable at all. A critic review found the first draft's 'free-form, no structured
        format' design was exactly what let the temporal-order hole (C1) exist."""
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_INVALID_COMPLETED_AT"):
            stage("schema_baseline", "sometime last week")

    def test_empty_evidence_ref_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_EMPTY_EVIDENCE_REF"):
            stage("schema_baseline", "2026-08-01T09:00:00Z", evidence_ref="")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_EMPTY_RECORD_FIELD"):
            generate_expand_contract_migration_record("", "x", _first_three_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_migration_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_EMPTY_RECORD_FIELD"):
            generate_expand_contract_migration_record("ECMIG-T-006", "", _first_three_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_stage_is_refused_at_construction(self):
        stages = _first_three_stages() + [stage("schema_baseline", "2026-08-02T09:00:00Z")]
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_DUPLICATE_STAGE"):
            generate_expand_contract_migration_record("ECMIG-T-007", "x", stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_skipping_a_stage_ahead_is_refused_at_construction(self):
        """The core invariant: a stage cannot be recorded while an earlier one in the canonical sequence has
        not also been recorded -- here, backfill (stage 8) is recorded with none of stages 1-7 present."""
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_STAGE_SKIPPED_AHEAD"):
            generate_expand_contract_migration_record("ECMIG-T-008", "x", [stage("backfill", "2026-08-01T09:00:00Z")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_skipping_one_stage_in_the_middle_is_refused(self):
        """A near-complete but not-quite-contiguous set: every stage except compatibility_analysis (index 2)
        is present -- must still be refused, not just the all-early-missing case."""
        stages = [stage(stage_id, "2026-08-01T09:00:00Z") for stage_id in STAGE_SEQUENCE if stage_id != "compatibility_analysis"]
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_STAGE_SKIPPED_AHEAD"):
            generate_expand_contract_migration_record("ECMIG-T-009", "x", stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_stages_supplied_out_of_order_but_contiguous_is_accepted(self):
        """The invariant is about the SET of recorded stages forming a contiguous prefix, not about the
        caller supplying them in canonical order -- a record built from an out-of-order but complete prefix
        must be accepted, same as an in-order one."""
        stages = [
            stage("compatibility_analysis", "2026-08-01T14:00:00Z"),
            stage("schema_baseline", "2026-08-01T09:00:00Z"),
            stage("data_contract", "2026-08-01T10:00:00Z"),
        ]
        record = generate_expand_contract_migration_record("ECMIG-T-010", "x", stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(len(record["stages"]), 3)

    def test_reconciliation_completed_after_contract_old_schema_is_refused(self):
        """Regression for the critic-caught Critical (C1): every canonical stage_id present (the prefix
        check alone would PASS) but reconciliation's own completed_at is AFTER a later stage's -- the exact
        'destroyed the rollback path before reconciliation ran' scenario this method exists to forbid."""
        stages = _all_fifteen_stages()
        for item in stages:
            if item["stage_id"] == "reconciliation":
                item["completed_at"] = "2026-09-30T09:00:00Z"  # after every later stage's own timestamp
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_COMPLETION_OUT_OF_ORDER"):
            generate_expand_contract_migration_record("ECMIG-T-010B", "x", stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_equal_completed_at_timestamps_are_accepted(self):
        """Non-decreasing, not strictly increasing -- two stages completed at the exact same recorded moment
        is legal (e.g. a batch of automated steps logged with the same timestamp)."""
        stages = [
            stage("schema_baseline", "2026-08-01T09:00:00Z"),
            stage("data_contract", "2026-08-01T09:00:00Z"),
        ]
        record = generate_expand_contract_migration_record("ECMIG-T-010C", "x", stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(len(record["stages"]), 2)

    def test_non_dict_stage_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_INVALID_STAGE_SHAPE"):
            generate_expand_contract_migration_record("ECMIG-T-011", "x", ["not-a-dict"], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_stage_with_unknown_stage_id_is_refused_not_crashed(self):
        hand_built = {"stage_id": "not_a_real_stage", "completed_at": "2026-08-01T09:00:00Z"}
        with self.assertRaisesRegex(InvariantViolation, "EXPANDCONTRACT_UNKNOWN_STAGE"):
            generate_expand_contract_migration_record("ECMIG-T-012", "x", [hand_built], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_stage_with_extra_field_is_stripped_not_stored(self):
        """Regression for the critic-caught Major: a hand-built stage dict with an attacker-controlled extra
        field (e.g. a self-declared 'status: pending' marker meant to signal incompleteness to some other
        consumer) must NOT survive into the constructed record -- the builder rebuilds each stage from known
        fields only, it does not store the caller's own dict verbatim."""
        hand_built = {"stage_id": "schema_baseline", "completed_at": "2026-08-01T09:00:00Z", "status": "pending", "attacker_field": "x"}
        record = generate_expand_contract_migration_record("ECMIG-T-012B", "x", [hand_built], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(record["stages"][0], {"stage_id": "schema_baseline", "completed_at": "2026-08-01T09:00:00Z"})

    def test_mutating_the_callers_own_list_after_construction_does_not_affect_the_stored_record(self):
        """Regression for the critic-caught Major (aliasing half of M4): the record's own stages[] must be
        independent of the caller's own input list/dicts, not a shared reference to them."""
        caller_stages = _first_three_stages()
        record = generate_expand_contract_migration_record("ECMIG-T-012C", "x", caller_stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        caller_stages[0]["stage_id"] = "contract_old_schema"
        caller_stages.append({"stage_id": "backfill", "completed_at": "2026-08-01T09:00:00Z"})
        self.assertEqual(record["stages"][0]["stage_id"], "schema_baseline")
        self.assertEqual(len(record["stages"]), 3)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_expand_contract_migration_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_in_flight_record_passes_both_gates(self):
        results = evaluate_expand_contract_migration_gates(_valid_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "stage_order_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_fully_completed_record_passes_both_gates(self):
        record = generate_expand_contract_migration_record("ECMIG-T-013", "x", _all_fifteen_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        results = evaluate_expand_contract_migration_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_out_of_order_but_contiguous_record_passes_the_gate(self):
        """Gate-layer companion to the builder's own acceptance test -- the gate is the layer a rehydrated
        JSON record actually hits, and it must also accept a contiguous prefix regardless of the stored
        list's own iteration order."""
        stages = [
            stage("compatibility_analysis", "2026-08-01T14:00:00Z"),
            stage("schema_baseline", "2026-08-01T09:00:00Z"),
            stage("data_contract", "2026-08-01T10:00:00Z"),
        ]
        record = generate_expand_contract_migration_record("ECMIG-T-013B", "x", stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")
        self.assertEqual(gate["evidence"][0]["latest_stage_id"], "compatibility_analysis")

    def test_hand_tampered_removed_middle_stage_fails_the_gate_via_recomputation(self):
        """The critical regression this slice was built to avoid from the start: removing a middle stage
        (leaving later stages present, a real gap) is caught by the gate's own independent recomputation of
        the contiguous-prefix check over the raw stages[] -- not by trusting any prior validation."""
        record = generate_expand_contract_migration_record("ECMIG-T-014", "x", _all_fifteen_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        record["stages"] = [item for item in record["stages"] if item["stage_id"] != "reconciliation"]
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("reconciliation", gate["evidence"][0].get("missing_earlier_stage_ids", []))

    def test_hand_tampered_reconciliation_completed_after_contract_old_schema_fails_the_gate(self):
        """Gate-layer companion to the builder's own C1 regression: the gate independently recomputes the
        temporal-order check from the raw stages[], pinned to the specific offending pair."""
        record = generate_expand_contract_migration_record("ECMIG-T-014B", "x", _all_fifteen_stages(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        for item in record["stages"]:
            if item["stage_id"] == "reconciliation":
                item["completed_at"] = "2026-09-30T09:00:00Z"
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "completed_at order contradicts canonical stage order")
        self.assertIn(["reconciliation", "dual_read_verification"], gate["evidence"][0]["out_of_order_pairs"])

    def test_hand_tampered_unparseable_completed_at_fails_the_gate(self):
        record = _valid_record()
        record["stages"][0]["completed_at"] = "not a timestamp"
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "completed_at is not a parseable ISO-8601 timestamp")
        self.assertIn(record["stages"][0]["stage_id"], gate["evidence"][0]["unparseable_stage_ids"])

    def test_hand_tampered_duplicate_stage_fails_the_gate(self):
        record = _valid_record()
        record["stages"].append(dict(record["stages"][0]))
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["stages"][0]["stage_id"], gate["evidence"][0].get("duplicate_stage_ids", []))

    def test_hand_tampered_unhashable_stage_id_fails_the_gate_not_a_crash(self):
        """Regression for a critic-caught Major: the gate must ALSO fail closed (not crash with TypeError)
        on an unhashable stage_id, mirroring the builder's own fix."""
        record = _valid_record()
        record["stages"][0]["stage_id"] = ["not", "a", "string"]
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "unknown stage_id")

    def test_hand_tampered_unknown_stage_id_fails_the_gate(self):
        """Pinned to the specific reason and the specific offending id -- a critic review's real mutation
        experiment proved the un-pinned version of this test could not distinguish this guard from the
        gap-detection guard (deleting the unknown-stage-id check left the test green, tripping the gap
        branch instead for an unrelated reason)."""
        record = _valid_record()
        record["stages"][0]["stage_id"] = "not_a_real_stage"
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "unknown stage_id")
        self.assertIn("not_a_real_stage", gate["evidence"][0]["unknown_stage_ids"])

    def test_hand_tampered_emptied_stages_fails_the_gate(self):
        record = _valid_record()
        record["stages"] = []
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stages missing, not a list, or empty")

    def test_non_dict_stage_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["stages"] = ["not-a-dict"]
        gate = evaluate_stage_order_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more stages is not a well-shaped dict with a real completed_at")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()

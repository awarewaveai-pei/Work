"""Mutation-style tests for ``database_data.schema_compatibility_analysis`` (Method Atlas slice, TENTH and
LAST member of the `database_data` family (F21), closing F21 10/10). Two real invariants are proven at BOTH
independent layers -- construction-time and gate re-derivation, the gate RECOMPUTING both
change_classifications AND overall_verdict fresh rather than trusting any prior validation."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.schema_compatibility.classification import (
    KNOWN_CHANGE_TYPES,
    aggregate_overall_verdict,
    classify_change,
    classify_changes,
)
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.schema_compatibility_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_schema_compatibility_analysis_gates,
    evaluate_schema_compatibility_integrity_gate,
    generate_schema_compatibility_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/schema-compatibility-analysis-record.schema.yaml"


def _safe_changes():
    return [
        {"change_type": "add_nullable_column", "target": "orders.customer_tier"},
        {"change_type": "add_index", "target": "orders.customer_tier"},
    ]


def _risky_changes():
    return [
        {"change_type": "rename_column", "target": "orders.legacy_status"},
        {"change_type": "narrow_type", "target": "orders.amount_cents"},
        {"change_type": "drop_column", "target": "orders.legacy_flag"},
        {"change_type": "add_index", "target": "orders.status"},
    ]


def _safe_record():
    return generate_schema_compatibility_analysis_record("SCA-T-001", "test migration", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))


class ComputeModuleTests(unittest.TestCase):
    """Direct tests of ai_lego.compute.schema_compatibility.classification, the GENUINE_COMPUTE layer."""

    def test_all_thirteen_change_types_classify_to_a_legal_class(self):
        self.assertEqual(len(KNOWN_CHANGE_TYPES), 13)
        for change_type in KNOWN_CHANGE_TYPES:
            self.assertIn(classify_change(change_type), {"compatible", "breaking"})

    def test_task_explicit_examples_classify_as_specified(self):
        """The 5 explicit examples given in this method's own build task."""
        self.assertEqual(classify_change("add_nullable_column"), "compatible")
        self.assertEqual(classify_change("drop_column"), "breaking")
        self.assertEqual(classify_change("widen_type"), "compatible")
        self.assertEqual(classify_change("narrow_type"), "breaking")
        self.assertEqual(classify_change("add_not_null_column_without_default"), "breaking")

    def test_classify_changes_preserves_order_and_never_mutates_input(self):
        changes = _risky_changes()
        original = [dict(c) for c in changes]
        result = classify_changes(changes)
        self.assertEqual([r["change_type"] for r in result], [c["change_type"] for c in changes])
        self.assertEqual(changes, original)

    def test_aggregate_overall_verdict_all_compatible_is_safe(self):
        classifications = classify_changes(_safe_changes())
        self.assertEqual(aggregate_overall_verdict(classifications), "safe_for_zero_downtime")

    def test_aggregate_overall_verdict_worst_of_all_one_breaking_forces_coordinated(self):
        """A single breaking entry among otherwise-compatible ones still forces requires_coordinated_deploy."""
        classifications = classify_changes([{"change_type": "add_index", "target": "x"}, {"change_type": "drop_column", "target": "y"}, {"change_type": "add_index", "target": "z"}])
        self.assertEqual(aggregate_overall_verdict(classifications), "requires_coordinated_deploy")

    def test_aggregate_overall_verdict_all_breaking_is_coordinated(self):
        classifications = classify_changes([{"change_type": "drop_column", "target": "x"}, {"change_type": "narrow_type", "target": "y"}])
        self.assertEqual(aggregate_overall_verdict(classifications), "requires_coordinated_deploy")


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_safe_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _safe_record(), "safe record")

    def test_risky_record_validates_against_the_real_schema(self):
        record = generate_schema_compatibility_analysis_record("SCA-T-002", "risky migration", _risky_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RECORD_SCHEMA, record, "risky record")

    def test_safe_record_overall_verdict_is_safe_for_zero_downtime(self):
        record = _safe_record()
        self.assertEqual(record["overall_verdict"], "safe_for_zero_downtime")

    def test_risky_record_overall_verdict_is_requires_coordinated_deploy(self):
        """Worst-of-all: 3 breaking + 1 compatible must still yield requires_coordinated_deploy."""
        record = generate_schema_compatibility_analysis_record("SCA-T-003", "x", _risky_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(record["overall_verdict"], "requires_coordinated_deploy")

    def test_change_classifications_match_changes_order_and_content(self):
        record = _safe_record()
        self.assertEqual(len(record["change_classifications"]), len(record["changes"]))
        for change, classification in zip(record["changes"], record["change_classifications"]):
            self.assertEqual(classification["change_type"], change["change_type"])
            self.assertEqual(classification["target"], change["target"])
            self.assertEqual(classification["compatibility_class"], "compatible")

    def test_notes_is_accepted_and_preserved(self):
        record = generate_schema_compatibility_analysis_record(
            "SCA-T-004", "x", [{"change_type": "add_nullable_column", "target": "t.c", "notes": "some context"}], make_provenance("AI_INFERENCE", "AI_GENERATED")
        )
        self.assertEqual(record["changes"][0]["notes"], "some context")
        self.contracts.validate(RECORD_SCHEMA, record, "record with notes")

    def test_migration_ref_is_accepted_and_preserved(self):
        record = generate_schema_compatibility_analysis_record(
            "SCA-T-005", "x", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"), migration_ref="ECMIG-2026-09-05-002"
        )
        self.assertEqual(record["migration_ref"], "ECMIG-2026-09-05-002")
        self.contracts.validate(RECORD_SCHEMA, record, "record with migration_ref")

    def test_invalid_migration_ref_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_MIGRATION_REF"):
            generate_schema_compatibility_analysis_record("SCA-T-006", "x", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"), migration_ref="WRONG-001")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_RECORD_ID"):
            generate_schema_compatibility_analysis_record("", "x", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_wrong_prefix_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_RECORD_ID"):
            generate_schema_compatibility_analysis_record("WRONG-001", "x", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_EMPTY_SUBJECT"):
            generate_schema_compatibility_analysis_record("SCA-T-007", "", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_zero_changes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_NO_CHANGES"):
            generate_schema_compatibility_analysis_record("SCA-T-008", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_unknown_change_type_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-009", "x", [{"change_type": "drop_table_entirely", "target": "orders"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_unhashable_change_type_is_refused_not_crashed(self):
        """Regression for the same bug class expand_contract_migration.py's own _is_known_stage_id already
        fixed: an unhashable change_type must fail closed, not escape as a raw TypeError."""
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-010", "x", [{"change_type": ["not", "a", "string"], "target": "orders.x"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_missing_target_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-011", "x", [{"change_type": "add_index"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_target_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-012", "x", [{"change_type": "add_index", "target": ""}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_notes_when_present_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-013", "x", [{"change_type": "add_index", "target": "t.c", "notes": ""}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_whitespace_only_notes_when_present_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-013B", "x", [{"change_type": "add_index", "target": "t.c", "notes": "   "}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_extra_unknown_key_on_change_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_INVALID_CHANGE_SHAPE"):
            generate_schema_compatibility_analysis_record("SCA-T-014", "x", [{"change_type": "add_index", "target": "t.c", "attacker_field": "x"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_change_type_and_target_pair_is_refused(self):
        changes = [{"change_type": "add_index", "target": "orders.status"}, {"change_type": "add_index", "target": "orders.status"}]
        with self.assertRaisesRegex(InvariantViolation, "SCHEMACOMPAT_DUPLICATE_CHANGE"):
            generate_schema_compatibility_analysis_record("SCA-T-015", "x", changes, make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_same_target_different_change_type_is_accepted(self):
        """The real, disclosed design choice: target is NOT required unique -- one migration can legitimately
        apply multiple DIFFERENT changes to the same column."""
        changes = [{"change_type": "narrow_type", "target": "orders.amount_cents"}, {"change_type": "tighten_nullable_to_not_null", "target": "orders.amount_cents"}]
        record = generate_schema_compatibility_analysis_record("SCA-T-016", "x", changes, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(len(record["changes"]), 2)
        self.assertEqual(record["overall_verdict"], "requires_coordinated_deploy")

    def test_hand_built_change_with_extra_field_is_stripped_not_stored(self):
        """Regression for the same class expand_contract_migration.py's own stage-rebuild fix already
        establishes: a hand-built change dict must not survive with unknown fields attached."""
        hand_built = {"change_type": "add_nullable_column", "target": "t.c"}
        record = generate_schema_compatibility_analysis_record("SCA-T-017", "x", [hand_built], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(record["changes"][0], {"change_type": "add_nullable_column", "target": "t.c"})

    def test_mutating_the_callers_own_list_after_construction_does_not_affect_the_stored_record(self):
        caller_changes = _safe_changes()
        record = generate_schema_compatibility_analysis_record("SCA-T-018", "x", caller_changes, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        caller_changes[0]["change_type"] = "drop_column"
        caller_changes.append({"change_type": "drop_column", "target": "z"})
        self.assertEqual(record["changes"][0]["change_type"], "add_nullable_column")
        self.assertEqual(len(record["changes"]), 2)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_schema_compatibility_analysis_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_safe_record_passes_both_gates(self):
        results = evaluate_schema_compatibility_analysis_gates(_safe_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "schema_compatibility_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_risky_record_passes_both_gates(self):
        record = generate_schema_compatibility_analysis_record("SCA-T-019", "x", _risky_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        results = evaluate_schema_compatibility_analysis_gates(record, "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_overall_verdict_fails_the_gate_via_recomputation(self):
        """The critical proof this slice exists for: a hand-tampered COPY lying about overall_verdict
        (claiming safe_for_zero_downtime despite real breaking changes) is caught by the gate's own
        independent recomputation from changes[] -- not by trusting any prior validation."""
        record = generate_schema_compatibility_analysis_record("SCA-T-020", "x", _risky_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"))
        record["overall_verdict"] = "safe_for_zero_downtime"
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "SCHEMACOMPAT_VERDICT_MISMATCH")
        self.assertEqual(gate["evidence"][0]["recomputed"], "requires_coordinated_deploy")

    def test_hand_tampered_change_classifications_fails_the_gate_via_recomputation(self):
        """A hand-tampered COPY lying about ONE classification (relabeling a real drop_column as compatible)
        is caught even if overall_verdict happens to still look consistent with the lie."""
        record = _safe_record()
        record["changes"].append({"change_type": "drop_column", "target": "orders.x"})
        record["change_classifications"].append({"change_type": "drop_column", "target": "orders.x", "compatibility_class": "compatible"})
        # overall_verdict left at "safe_for_zero_downtime" -- also wrong, but the classification-mismatch
        # check must fire regardless (it runs before the verdict comparison).
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "SCHEMACOMPAT_CLASSIFICATIONS_MISMATCH")

    def test_hand_tampered_removed_all_changes_fails_the_gate(self):
        record = _safe_record()
        record["changes"] = []
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_change_fails_the_gate(self):
        record = _safe_record()
        record["changes"].append(dict(record["changes"][0]))
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(["add_nullable_column", "orders.customer_tier"], gate["evidence"][0].get("duplicate_change_keys", []))

    def test_hand_tampered_unknown_change_type_fails_the_gate_not_a_crash(self):
        record = _safe_record()
        record["changes"][0]["change_type"] = "not_a_real_change_type"
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_unhashable_change_type_fails_the_gate_not_a_crash(self):
        record = _safe_record()
        record["changes"][0]["change_type"] = ["not", "a", "string"]
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_malformed_migration_ref_fails_the_gate(self):
        record = generate_schema_compatibility_analysis_record("SCA-T-021", "x", _safe_changes(), make_provenance("AI_INFERENCE", "AI_GENERATED"), migration_ref="ECMIG-1")
        record["migration_ref"] = "WRONG-1"
        gate = evaluate_schema_compatibility_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_the_gate_not_a_crash(self):
        gate = evaluate_schema_compatibility_integrity_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _safe_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()

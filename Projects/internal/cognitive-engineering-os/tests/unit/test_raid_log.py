"""Mutation-style tests for ``delivery.raid_log`` (F22 PM/Delivery/Governance family, Atlas L918, §11.51).

Section 11.51's own "formalize scattered knowledge" benefit is proven at BOTH independent layers: the
construction-time builder refuses a CLOSED/RESOLVED item with no evidence, a malformed type, or a blank
required field, and the independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.raid_log import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_closure_evidence_gate,
    evaluate_item_shape_integrity_gate,
    evaluate_provenance_required_gate,
    evaluate_raid_log_gates,
    generate_raid_log,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RAID_LOG_SCHEMA = "ai-lego://specs/cognitive/typed-objects/raid-log-record.schema.yaml"
PROVENANCE = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        items=[
            {
                "item_id": "R1",
                "type": "RISK",
                "statement": "供應商可能延遲交貨",
                "owner": "採購",
                "impact": "上線延後 2 週",
                "status": "OPEN",
                "next_action": "每週跟催",
                "due_review_date": "2026-09-19",
                "evidence": "",
            },
            {
                "item_id": "I1",
                "type": "ISSUE",
                "statement": "API 回應逾時",
                "owner": "後端",
                "impact": "結帳失敗率上升",
                "status": "CLOSED",
                "next_action": "已修復並上線",
                "due_review_date": "2026-09-05",
                "evidence": "commit d00d3b99c + production error rate back to baseline",
            },
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_log(*, record_id: str = "RAID-T-001", **overrides: object):
    return generate_raid_log(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_log_validates_against_the_real_schema(self):
        self.contracts.validate(RAID_LOG_SCHEMA, _valid_log(), "raid log")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, log = live.invoke(METHOD_ID, generate_raid_log, "RAID-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.raid_log.contract.yaml")
        self.assertEqual(log["id"], "RAID-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        log = _valid_log()
        log["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RAID_LOG_SCHEMA, log, "log with a smuggled top-level key")

    def test_schema_rejects_an_invalid_type_value(self):
        log = _valid_log()
        log["items"][0]["type"] = "NOT_A_REAL_TYPE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RAID_LOG_SCHEMA, log, "log with an invalid type value")

    def test_schema_rejects_closed_status_with_empty_evidence(self):
        log = _valid_log()
        log["items"][0]["status"] = "CLOSED"  # R1's evidence is "" in the base fixture
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RAID_LOG_SCHEMA, log, "log with CLOSED status but empty evidence")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.raid_log.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.raid_log contract")


class TypeClosedSetTests(unittest.TestCase):
    def test_invalid_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["items"][0]["type"] = "OPPORTUNITY"
        with self.assertRaisesRegex(InvariantViolation, "RAID_INVALID_ITEM"):
            generate_raid_log("RAID-T-002", **kwargs)

    def test_all_four_raid_types_are_legal(self):
        for raid_type in ("RISK", "ASSUMPTION", "ISSUE", "DEPENDENCY"):
            with self.subTest(raid_type=raid_type):
                kwargs = _kwargs()
                kwargs["items"][0]["type"] = raid_type
                log = generate_raid_log("RAID-T-003", **kwargs)
                self.assertEqual(log["items"][0]["type"], raid_type)


class RequiredFieldTests(unittest.TestCase):
    def test_blank_statement_is_refused(self):
        kwargs = _kwargs()
        kwargs["items"][0]["statement"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "RAID_INVALID_ITEM"):
            generate_raid_log("RAID-T-004", **kwargs)

    def test_missing_owner_is_refused(self):
        kwargs = _kwargs()
        del kwargs["items"][0]["owner"]
        with self.assertRaisesRegex(InvariantViolation, "RAID_INVALID_ITEM"):
            generate_raid_log("RAID-T-005", **kwargs)

    def test_unknown_key_in_raw_builder_input_is_silently_dropped(self):
        """The builder extracts only the 9 known fields via .get() (same style
        ``foresight.cross_impact_analysis.event()`` already establishes) -- an extra key on the caller's
        raw input dict never reaches the constructed item. The independent ``item_shape_integrity`` gate
        (below) is what actually refuses an unknown key on an already-STORED record."""
        kwargs = _kwargs()
        kwargs["items"][0]["priority"] = "HIGH"
        log = generate_raid_log("RAID-T-006", **kwargs)
        self.assertNotIn("priority", log["items"][0])

    def test_unknown_key_on_a_stored_record_is_refused_by_the_shape_gate(self):
        record = copy.deepcopy(_valid_log())
        record["items"][0]["priority"] = "HIGH"
        gate = evaluate_item_shape_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_empty_items_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RAID_EMPTY_ITEMS"):
            generate_raid_log("RAID-T-007", items=[], provenance=PROVENANCE)

    def test_duplicate_item_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["items"].append(dict(kwargs["items"][0]))
        with self.assertRaisesRegex(InvariantViolation, "RAID_DUPLICATE_ITEM_ID"):
            generate_raid_log("RAID-T-008", **kwargs)


class ClosureEvidenceTests(unittest.TestCase):
    """THE real invariant -- a CLOSED or RESOLVED item must carry non-empty evidence."""

    def test_closed_with_no_evidence_is_refused(self):
        kwargs = _kwargs()
        kwargs["items"][0]["status"] = "CLOSED"  # R1's evidence is "" in the base fixture
        with self.assertRaisesRegex(InvariantViolation, "RAID_CLOSED_WITHOUT_EVIDENCE"):
            generate_raid_log("RAID-T-009", **kwargs)

    def test_resolved_with_no_evidence_is_refused(self):
        kwargs = _kwargs()
        kwargs["items"][0]["status"] = "RESOLVED"
        with self.assertRaisesRegex(InvariantViolation, "RAID_CLOSED_WITHOUT_EVIDENCE"):
            generate_raid_log("RAID-T-010", **kwargs)

    def test_closed_with_whitespace_only_evidence_is_refused(self):
        kwargs = _kwargs()
        kwargs["items"][0]["status"] = "CLOSED"
        kwargs["items"][0]["evidence"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "RAID_CLOSED_WITHOUT_EVIDENCE"):
            generate_raid_log("RAID-T-011", **kwargs)

    def test_closed_with_real_evidence_is_accepted(self):
        log = _valid_log()
        self.assertEqual(log["items"][1]["status"], "CLOSED")
        self.assertTrue(log["items"][1]["evidence"])

    def test_open_with_no_evidence_is_accepted(self):
        log = _valid_log()
        self.assertEqual(log["items"][0]["status"], "OPEN")
        self.assertEqual(log["items"][0]["evidence"], "")

    def test_monitoring_status_with_no_evidence_is_accepted(self):
        kwargs = _kwargs()
        kwargs["items"][0]["status"] = "MONITORING"
        log = generate_raid_log("RAID-T-012", **kwargs)
        self.assertEqual(log["items"][0]["status"], "MONITORING")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        log = generate_raid_log("RAID-T-013", **kwargs)
        kwargs["items"][0]["statement"] = "MUTATED AFTER RETURN"
        self.assertNotEqual(log["items"][0]["statement"], "MUTATED AFTER RETURN")
        self.assertIsNot(log["items"], kwargs["items"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_log(self):
        results = evaluate_raid_log_gates(_valid_log(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_item_shape_integrity_gate_catches_hand_tampered_invalid_type(self):
        record = copy.deepcopy(_valid_log())
        record["items"][0]["type"] = "NOT_REAL"
        gate = evaluate_item_shape_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_item_shape_integrity_gate_catches_hand_tampered_blank_field(self):
        record = copy.deepcopy(_valid_log())
        record["items"][0]["owner"] = ""
        gate = evaluate_item_shape_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_closure_evidence_gate_catches_hand_tampered_blanked_evidence_after_close(self):
        record = copy.deepcopy(_valid_log())
        record["items"][1]["evidence"] = ""  # I1 was CLOSED with real evidence
        gate = evaluate_closure_evidence_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_closure_evidence_gate_passes_a_genuinely_valid_log(self):
        gate = evaluate_closure_evidence_gate(_valid_log(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_raid_log_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_log(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_log())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RAID-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RAID_INVALID_ID"):
            _valid_log(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RAID_INVALID_VERSION"):
            generate_raid_log("RAID-T-014", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RAID_INVALID_PROVENANCE"):
            _valid_log(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.raid_log")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_raid_log_gates(_valid_log(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "item_shape_integrity", "closure_evidence"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        log = _valid_log()
        self.assertEqual(set(log.keys()), {"id", "version", "generated_by_method", "items", "provenance"})


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class the F13/F15 batches' own critic passes found (11 of 14 / builders returning the
    caller's provenance dict BY REFERENCE) -- guarded here from the start via copy.deepcopy at return."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_log()
        provenance = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        record = generate_raid_log(base["id"], base["items"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "HUMAN_OPINION")


if __name__ == "__main__":
    unittest.main()

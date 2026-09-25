"""Mutation-style tests for ``delivery.decision_log`` (F22 PM/Delivery/Governance Pack, Atlas L924).

Atlas's own "避免重複爭論" pipeline is proven at BOTH independent layers: the
construction-time builder refuses an empty decision, empty evidence, or an
ambiguous revisit disposition, and the independent gates re-derive the same
rules directly from a raw (possibly hand-tampered) dict, never trusting that
the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.decision_log import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_decision_evidence_gate,
    evaluate_decision_log_gates,
    evaluate_provenance_required_gate,
    evaluate_revisit_disambiguation_gate,
    generate_decision_log_entry,
    revisit_none_planned,
    revisit_scheduled,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DECISION_LOG_SCHEMA = "ai-lego://specs/cognitive/typed-objects/decision-log-record.schema.yaml"
PROVENANCE = make_provenance("DECISION", "HUMAN_APPROVED", "LOCKED_DECISION")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        context="選擇下一季內容引擎的 SEO 策略方向",
        decision="採用 AI-first 內容引擎，不採購付費 SEO API",
        evidence=["付費 API 月費超過目前客戶預算上限", "AI-first 原型已驗證可產出可用內容"],
        owner="content-engine-lead",
        revisit={"mode": "SCHEDULED", "trigger": "2027-Q1 或客戶數超過 20 時重新評估"},
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_entry(*, record_id: str = "DLOG-T-001", **overrides: object):
    return generate_decision_log_entry(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_entry_validates_against_the_real_schema(self):
        self.contracts.validate(DECISION_LOG_SCHEMA, _valid_entry(), "decision log entry")

    def test_no_revisit_planned_entry_validates(self):
        entry = generate_decision_log_entry("DLOG-T-002", **_kwargs(revisit=revisit_none_planned()))
        self.contracts.validate(DECISION_LOG_SCHEMA, entry, "no-revisit-planned entry")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, entry = live.invoke(METHOD_ID, generate_decision_log_entry, "DLOG-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.decision_log.contract.yaml")
        self.assertEqual(entry["id"], "DLOG-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        entry = _valid_entry()
        entry["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DECISION_LOG_SCHEMA, entry, "entry with a smuggled top-level key")

    def test_schema_rejects_empty_evidence_list(self):
        entry = _valid_entry()
        entry["evidence"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DECISION_LOG_SCHEMA, entry, "entry with an empty evidence list")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.decision_log.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.decision_log contract")


class DecisionEvidenceInvariantTests(unittest.TestCase):
    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_EMPTY_CONTEXT"):
            generate_decision_log_entry("DLOG-T-003", **_kwargs(context=""))

    def test_whitespace_only_decision_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_EMPTY_DECISION"):
            generate_decision_log_entry("DLOG-T-004", **_kwargs(decision="   "))

    def test_empty_evidence_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_EVIDENCE"):
            generate_decision_log_entry("DLOG-T-005", **_kwargs(evidence=[]))

    def test_evidence_list_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_EVIDENCE"):
            generate_decision_log_entry("DLOG-T-006", **_kwargs(evidence=["real evidence", "   "]))

    def test_empty_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_EMPTY_OWNER"):
            generate_decision_log_entry("DLOG-T-007", **_kwargs(owner=""))

    def test_well_formed_entry_is_accepted(self):
        entry = _valid_entry()
        self.assertEqual(entry["decision"], "採用 AI-first 內容引擎，不採購付費 SEO API")
        self.assertEqual(len(entry["evidence"]), 2)


class RevisitDisambiguationTests(unittest.TestCase):
    """The 'silence on revisit is ambiguous' invariant this method's own revisit field exists to remove."""

    def test_scheduled_with_empty_trigger_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            generate_decision_log_entry("DLOG-T-008", **_kwargs(revisit={"mode": "SCHEDULED", "trigger": ""}))

    def test_scheduled_with_null_trigger_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            generate_decision_log_entry("DLOG-T-009", **_kwargs(revisit={"mode": "SCHEDULED", "trigger": None}))

    def test_no_revisit_planned_with_a_non_null_trigger_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            generate_decision_log_entry("DLOG-T-010", **_kwargs(revisit={"mode": "NO_REVISIT_PLANNED", "trigger": "still says something"}))

    def test_unknown_revisit_mode_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            generate_decision_log_entry("DLOG-T-011", **_kwargs(revisit={"mode": "MAYBE_LATER", "trigger": None}))

    def test_revisit_missing_trigger_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            generate_decision_log_entry("DLOG-T-012", **_kwargs(revisit={"mode": "SCHEDULED"}))

    def test_revisit_unknown_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            generate_decision_log_entry("DLOG-T-013", **_kwargs(revisit={"mode": "SCHEDULED", "trigger": "2027", "note": "extra"}))

    def test_revisit_scheduled_constructor_round_trips(self):
        self.assertEqual(revisit_scheduled("2027-Q1"), {"mode": "SCHEDULED", "trigger": "2027-Q1"})

    def test_revisit_scheduled_constructor_refuses_empty_trigger(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_REVISIT"):
            revisit_scheduled("")

    def test_revisit_none_planned_constructor(self):
        self.assertEqual(revisit_none_planned(), {"mode": "NO_REVISIT_PLANNED", "trigger": None})


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        entry = generate_decision_log_entry("DLOG-T-014", **kwargs)
        kwargs["evidence"].append("added after construction")
        self.assertEqual(len(entry["evidence"]), 2)
        self.assertIsNot(entry["evidence"], kwargs["evidence"])
        self.assertIsNot(entry["revisit"], kwargs["revisit"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_entry(self):
        results = evaluate_decision_log_gates(_valid_entry(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_decision_evidence_gate_catches_hand_tampered_empty_evidence(self):
        record = copy.deepcopy(_valid_entry())
        record["evidence"] = []
        gate = evaluate_decision_evidence_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_evidence_gate_catches_hand_tampered_empty_decision(self):
        record = copy.deepcopy(_valid_entry())
        record["decision"] = ""
        gate = evaluate_decision_evidence_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_revisit_disambiguation_gate_catches_hand_tampered_stale_trigger(self):
        record = copy.deepcopy(_valid_entry())
        record["revisit"] = {"mode": "NO_REVISIT_PLANNED", "trigger": "still says 2027-Q1"}
        gate = evaluate_revisit_disambiguation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_revisit_disambiguation_gate_passes_a_genuinely_unambiguous_entry(self):
        gate = evaluate_revisit_disambiguation_gate(_valid_entry(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_decision_log_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_entry(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_entry())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DLOG-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_ID"):
            _valid_entry(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_VERSION"):
            generate_decision_log_entry("DLOG-T-015", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DLOG_INVALID_PROVENANCE"):
            _valid_entry(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.decision_log")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_decision_log_gates(_valid_entry(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "decision_evidence_required", "revisit_disambiguation"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        entry = _valid_entry()
        self.assertEqual(
            set(entry.keys()),
            {"id", "version", "generated_by_method", "context", "decision", "evidence", "owner", "revisit", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same regression class the F13 batch's own critic pass found (11 of 14 builders aliased provenance by
    reference) -- guards this new module against the identical defect from the start."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_entry()
        provenance = make_provenance("DECISION", "HUMAN_APPROVED", "LOCKED_DECISION")
        record = generate_decision_log_entry(base["id"], base["context"], base["decision"], base["evidence"], base["owner"], base["revisit"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "DECISION")


if __name__ == "__main__":
    unittest.main()

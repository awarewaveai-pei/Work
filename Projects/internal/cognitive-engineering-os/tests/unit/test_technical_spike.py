"""Mutation-style tests for ``experiment.technical_spike`` (F15 experiment & validation family, Atlas L741).

Atlas's own "timebox->question->experiment/docs->decision note" pipeline is proven at BOTH independent
layers: the construction-time builder refuses an unbounded timebox, a closure past the declared deadline,
too few findings, and a decision recorded outside the spike's own actual window; the independent gates
re-derive the same rules directly from a raw (possibly hand-tampered) dict, never trusting that the
builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.technical_spike import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_decision_grounded_gate,
    evaluate_provenance_required_gate,
    evaluate_technical_spike_gates,
    evaluate_timebox_integrity_gate,
    generate_technical_spike_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

TECHNICAL_SPIKE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/technical-spike-record.schema.yaml"
PROVENANCE = make_provenance("CALCULATED_RESULT", "HUMAN_APPROVED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        question="Can library X sustain 10k req/s with our data shape?",
        timebox={
            "started_at": "2026-09-08T09:00:00Z",
            "deadline": "2026-09-11T09:00:00Z",
            "closed_at": "2026-09-11T08:30:00Z",
        },
        findings=[
            {"source_type": "EXPERIMENT", "summary": "Benchmarked 12k req/s sustained over 1h"},
            {"source_type": "DOCS", "summary": "Vendor docs confirm a horizontal-sharding path"},
        ],
        decision_note={
            "decision": "GO -- adopt library X",
            "rationale": "Benchmark exceeds target with headroom",
            "decided_at": "2026-09-11T08:30:00Z",
        },
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "SPIKE-T-001", **overrides: object):
    return generate_technical_spike_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(TECHNICAL_SPIKE_SCHEMA, _valid_record(), "technical spike record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_technical_spike_record, "SPIKE-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.technical_spike.contract.yaml")
        self.assertEqual(record["id"], "SPIKE-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TECHNICAL_SPIKE_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_finding_source_type(self):
        record = _valid_record()
        record["findings"][0]["source_type"] = "HEARSAY"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TECHNICAL_SPIKE_SCHEMA, record, "record with an illegal finding source_type")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.technical_spike.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.technical_spike contract")


class TimeboxBoundTests(unittest.TestCase):
    def test_deadline_equal_to_started_at_is_refused(self):
        kwargs = _kwargs()
        kwargs["timebox"]["deadline"] = kwargs["timebox"]["started_at"]
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_TIMEBOX_NOT_BOUNDED"):
            generate_technical_spike_record("SPIKE-T-002", **kwargs)

    def test_deadline_before_started_at_is_refused(self):
        kwargs = _kwargs()
        kwargs["timebox"]["deadline"] = "2026-09-01T00:00:00Z"
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_TIMEBOX_NOT_BOUNDED"):
            generate_technical_spike_record("SPIKE-T-003", **kwargs)


class TimeboxClosureTests(unittest.TestCase):
    """The real invariant this method exists to enforce: the ACTUAL closure stays within the declared box."""

    def test_closed_after_deadline_is_refused(self):
        kwargs = _kwargs()
        kwargs["timebox"]["closed_at"] = "2026-09-11T09:30:00Z"
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_TIMEBOX_EXCEEDED"):
            generate_technical_spike_record("SPIKE-T-004", **kwargs)

    def test_closed_before_started_at_is_refused(self):
        kwargs = _kwargs()
        kwargs["timebox"]["closed_at"] = "2026-09-01T00:00:00Z"
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_TIMEBOX_EXCEEDED"):
            generate_technical_spike_record("SPIKE-T-005", **kwargs)

    def test_closed_exactly_on_deadline_is_legal_boundary(self):
        kwargs = _kwargs()
        kwargs["timebox"]["closed_at"] = kwargs["timebox"]["deadline"]
        kwargs["decision_note"]["decided_at"] = kwargs["timebox"]["deadline"]
        record = generate_technical_spike_record("SPIKE-T-006", **kwargs)
        self.assertEqual(record["timebox"]["closed_at"], record["timebox"]["deadline"])

    def test_closed_exactly_on_started_at_is_legal_boundary(self):
        kwargs = _kwargs()
        kwargs["timebox"]["closed_at"] = kwargs["timebox"]["started_at"]
        kwargs["decision_note"]["decided_at"] = kwargs["timebox"]["started_at"]
        record = generate_technical_spike_record("SPIKE-T-007", **kwargs)
        self.assertEqual(record["timebox"]["closed_at"], record["timebox"]["started_at"])


class FindingsTests(unittest.TestCase):
    def test_zero_findings_is_refused(self):
        kwargs = _kwargs()
        kwargs["findings"] = []
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_TOO_FEW_FINDINGS"):
            generate_technical_spike_record("SPIKE-T-008", **kwargs)

    def test_finding_with_empty_summary_is_refused(self):
        kwargs = _kwargs()
        kwargs["findings"][0]["summary"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_INVALID_FINDING"):
            generate_technical_spike_record("SPIKE-T-009", **kwargs)

    def test_finding_with_illegal_source_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["findings"][0]["source_type"] = "HEARSAY"
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_INVALID_FINDING"):
            generate_technical_spike_record("SPIKE-T-010", **kwargs)


class DecisionGroundingTests(unittest.TestCase):
    """The real invariant Atlas's own pipeline names last: the decision falls within the spike's own window."""

    def test_decided_before_started_at_is_refused(self):
        kwargs = _kwargs()
        kwargs["decision_note"]["decided_at"] = "2026-09-01T00:00:00Z"
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_DECISION_OUTSIDE_WINDOW"):
            generate_technical_spike_record("SPIKE-T-011", **kwargs)

    def test_decided_after_closed_at_is_refused(self):
        kwargs = _kwargs()
        kwargs["decision_note"]["decided_at"] = "2026-09-12T00:00:00Z"
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_DECISION_OUTSIDE_WINDOW"):
            generate_technical_spike_record("SPIKE-T-012", **kwargs)

    def test_decision_note_with_empty_decision_is_refused(self):
        kwargs = _kwargs()
        kwargs["decision_note"]["decision"] = ""
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_INVALID_DECISION_NOTE"):
            generate_technical_spike_record("SPIKE-T-013", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_technical_spike_record("SPIKE-T-014", **kwargs)
        kwargs["findings"][0]["summary"] = "MUTATED AFTER RETURN"
        self.assertNotEqual(record["findings"][0]["summary"], "MUTATED AFTER RETURN")

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("CALCULATED_RESULT", "HUMAN_APPROVED")
        record = generate_technical_spike_record("SPIKE-T-015", **_kwargs(provenance=provenance))
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "CALCULATED_RESULT")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_technical_spike_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_timebox_integrity_gate_catches_hand_tampered_exceeded_closure(self):
        record = copy.deepcopy(_valid_record())
        record["timebox"]["closed_at"] = "2026-09-11T09:30:00Z"
        gate = evaluate_timebox_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_timebox_integrity_gate_catches_hand_tampered_unbounded_deadline(self):
        record = copy.deepcopy(_valid_record())
        record["timebox"]["deadline"] = record["timebox"]["started_at"]
        gate = evaluate_timebox_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_grounded_gate_catches_hand_tampered_backdated_decision(self):
        record = copy.deepcopy(_valid_record())
        record["decision_note"]["decided_at"] = "2026-09-01T00:00:00Z"
        gate = evaluate_decision_grounded_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_decision_grounded_gate_catches_hand_tampered_emptied_findings(self):
        record = copy.deepcopy(_valid_record())
        record["findings"] = []
        gate = evaluate_decision_grounded_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_technical_spike_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SPIKE-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_INVALID_VERSION"):
            generate_technical_spike_record("SPIKE-T-016", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SPIKE_EMPTY_QUESTION"):
            _valid_record(question="   ")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.technical_spike")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_technical_spike_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "timebox_integrity", "decision_grounded"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "question", "timebox", "findings", "decision_note", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()

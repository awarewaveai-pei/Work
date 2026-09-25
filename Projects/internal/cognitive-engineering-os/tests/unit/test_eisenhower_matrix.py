"""``decision.eisenhower_matrix`` -- real construction + gate re-derivation, mirroring
decision.impact_effort's own test shape for the same 2-axis-4-quadrant method class."""

from __future__ import annotations

import datetime
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.eisenhower_matrix import (
    RECORD_ID_PREFIX,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_eisenhower_matrix_gates,
    generate_eisenhower_matrix_classification,
)
from tests.unit.method_testkit import shared_method_catalog

_NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
_METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"


def _provenance(epistemic_type="AI_INFERENCE", authorship_state="AI_GENERATED"):
    # Deliberately the SAME default main.py's real /methods/{id}/invoke uses when the caller
    # supplies none (main.py:784) -- proves the builder's own internal normalization (not a
    # test-only convenience) is what makes genuine_compute pass, matching real dashboard behavior.
    return make_provenance(epistemic_type, authorship_state)


def _tasks():
    return [
        {"id": "T1", "label": "Fix prod outage", "urgency": 9, "importance": 9},
        {"id": "T2", "label": "Plan roadmap", "urgency": 2, "importance": 8},
        {"id": "T3", "label": "Answer routine email", "urgency": 8, "importance": 2},
        {"id": "T4", "label": "Reorganize old files", "urgency": 1, "importance": 1},
    ]


def _build(**overrides):
    kwargs = dict(
        record_id=f"{RECORD_ID_PREFIX}TEST0001",
        subject="Q4 task list",
        tasks=_tasks(),
        urgency_scale={"min": 0, "max": 10},
        importance_scale={"min": 0, "max": 10},
        urgency_threshold=5,
        importance_threshold=5,
        provenance=_provenance(),
    )
    kwargs.update(overrides)
    return generate_eisenhower_matrix_classification(**kwargs)


class BuilderTests(unittest.TestCase):
    def test_builds_a_real_record_with_all_four_quadrants_correctly_classified(self):
        record = _build()
        self.assertTrue(record["id"].startswith(RECORD_ID_PREFIX))
        quadrants = {t["id"]: t["quadrant"] for t in record["tasks"]}
        self.assertEqual(quadrants, {"T1": "do_first", "T2": "schedule", "T3": "delegate", "T4": "eliminate"})

    def test_normalizes_epistemic_type_to_calculated_result_regardless_of_caller_input(self):
        """The exact bug reproduced against the sibling decision.impact_effort (2026-09-18): the
        server's own default provenance for an un-supplied caller value is AI_INFERENCE, which
        evaluate_genuine_compute_gate always rejects unless the builder normalizes it itself."""
        record = _build(provenance=_provenance(epistemic_type="AI_INFERENCE"))
        self.assertEqual(record["provenance"]["epistemic_type"], "CALCULATED_RESULT")
        gates = evaluate_eisenhower_matrix_gates(record, "test", _NOW)
        self.assertTrue(all_gates_pass(gates), gates)

    def test_rejects_invalid_record_id_prefix(self):
        with self.assertRaises(InvariantViolation):
            _build(record_id="WRONG-0001")

    def test_rejects_empty_tasks(self):
        with self.assertRaises(InvariantViolation):
            _build(tasks=[])

    def test_rejects_duplicate_task_id(self):
        tasks = _tasks()
        tasks[1]["id"] = "T1"
        with self.assertRaises(InvariantViolation):
            _build(tasks=tasks)

    def test_rejects_task_urgency_outside_declared_scale(self):
        tasks = [{"id": "T1", "label": "x", "urgency": 99, "importance": 5}]
        with self.assertRaises(InvariantViolation):
            _build(tasks=tasks)

    def test_rejects_threshold_outside_declared_scale(self):
        with self.assertRaises(InvariantViolation):
            _build(urgency_threshold=99)

    def test_rejects_mismatched_scale_dict_shape(self):
        with self.assertRaises(InvariantViolation):
            _build(urgency_scale={"minimum": 0, "maximum": 10})

    def test_rejects_extra_key_on_a_task_entry(self):
        tasks = [{"id": "T1", "label": "x", "urgency": 5, "importance": 5, "quadrant": "do_first"}]
        with self.assertRaises(InvariantViolation):
            _build(tasks=tasks)

    def test_rejects_boolean_as_urgency(self):
        tasks = [{"id": "T1", "label": "x", "urgency": True, "importance": 5}]
        with self.assertRaises(InvariantViolation):
            _build(tasks=tasks)

    def test_forbids_automatic_authority_claim_key(self):
        record = _build()
        record["approved"] = True
        with self.assertRaises(InvariantViolation):
            assert_no_automatic_authority_claim(record)


class GateTests(unittest.TestCase):
    def test_all_gates_pass_for_a_genuine_record(self):
        record = _build()
        gates = evaluate_eisenhower_matrix_gates(record, "test", _NOW)
        self.assertTrue(all_gates_pass(gates), gates)

    def test_quadrant_integrity_gate_catches_a_hand_tampered_quadrant(self):
        """Never trusts a stored label -- re-derives from the record's own raw urgency/importance/
        thresholds and compares. A hand-tampered record (not produced via the builder) must still
        be caught, same discipline every sibling gate in this codebase already establishes."""
        record = _build()
        record["tasks"][0]["quadrant"] = "eliminate"  # was do_first (urgency=9, importance=9)
        gates = evaluate_eisenhower_matrix_gates(record, "test", _NOW)
        integrity = next(g for g in gates if g["gate_id"] == "quadrant_integrity")
        self.assertEqual(integrity["status"], "FAIL")
        self.assertFalse(all_gates_pass(gates))

    def test_quadrant_integrity_gate_fails_closed_on_malformed_input(self):
        gates = evaluate_eisenhower_matrix_gates("not a dict", "test", _NOW)
        self.assertFalse(all_gates_pass(gates))

    def test_no_automatic_authority_gate_fails_on_a_hand_tampered_record(self):
        record = _build()
        record["final_decision"] = "do T1 only"
        gates = evaluate_eisenhower_matrix_gates(record, "test", _NOW)
        authority_gate = next(g for g in gates if g["gate_id"] == "no_automatic_authority_claim")
        self.assertEqual(authority_gate["status"], "FAIL")


class SpecConformanceTests(unittest.TestCase):
    def test_method_contract_yaml_validates_against_method_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        contract_path = spec_root / "methods" / "contracts" / "decision.eisenhower_matrix.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        contracts.validate(_METHOD_SCHEMA, instance, "decision.eisenhower_matrix contract")

    def test_real_catalog_resolves_and_dispatches_the_method_end_to_end(self):
        """Wiring test: catches drift between the contract's own `id`/`status` and this module's
        actual dispatch-by-naming-convention resolution (ai_lego.apps.api.dispatch._module_for)."""
        from ai_lego.apps.api.dispatch import invoke_builder, record_id_prefix, resolve_builder, resolve_gate_runner

        catalog = shared_method_catalog(resolve_spec_root())
        self.assertTrue(catalog.is_resolvable("decision.eisenhower_matrix"))

        builder = resolve_builder("decision.eisenhower_matrix")
        gate_runner = resolve_gate_runner("decision.eisenhower_matrix")
        record_id = record_id_prefix("decision.eisenhower_matrix", required=True) + "E2E0001"
        # the exact default main.py's real /methods/{id}/invoke uses for an un-supplied provenance
        record = invoke_builder(builder, record_id, make_provenance("AI_INFERENCE", "AI_GENERATED"), {
            "subject": "wiring smoke test",
            "urgency_scale": {"min": 0, "max": 10},
            "importance_scale": {"min": 0, "max": 10},
            "urgency_threshold": 5,
            "importance_threshold": 5,
            "tasks": [{"id": "T1", "label": "x", "urgency": 9, "importance": 9}],
        })
        gates = gate_runner(record, "test", _NOW)
        self.assertTrue(all_gates_pass(gates), gates)

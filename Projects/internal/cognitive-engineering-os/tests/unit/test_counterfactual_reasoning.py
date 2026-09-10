"""Mutation-style tests for ``causal.counterfactual_reasoning`` (F11 causal family, Atlas F11 table row L617).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_counterfactual_reasoning_record`` raising a specific ``InvariantViolation`` code) and independent
gate re-derivation (``evaluate_counterfactual_reasoning_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against
``typed-objects/counterfactual-reasoning-record.schema.yaml``.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.counterfactual_reasoning import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_counterfactual_reasoning_gates,
    evaluate_counterfactual_reasoning_integrity_gate,
    evaluate_provenance_required_gate,
    generate_counterfactual_reasoning_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

COUNTERFACTUAL_REASONING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/counterfactual-reasoning-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "CFR-T-001",
    intervention: str = "raised subscription price 17%",
    actual_outcome: str = "retention fell to 87%",
    counterfactual_outcome: str = "retention would have held at 92% baseline",
    assumptions=None,
    provenance=None,
    version: str = "1.0.0",
):
    return generate_counterfactual_reasoning_record(
        record_id,
        intervention,
        actual_outcome,
        counterfactual_outcome,
        assumptions if assumptions is not None else ["no other confounding change occurred in the same window"],
        provenance if provenance is not None else make_provenance("HYPOTHESIS", "HUMAN_APPROVED"),
        version=version,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(COUNTERFACTUAL_REASONING_SCHEMA, _valid_record(), "counterfactual reasoning record")

    def test_valid_record_with_multiple_assumptions_validates(self):
        record = _valid_record(assumptions=["assumption one", "assumption two", "assumption three"])
        self.contracts.validate(COUNTERFACTUAL_REASONING_SCHEMA, record, "counterfactual reasoning record with multiple assumptions")
        self.assertEqual(len(record["assumptions"]), 3)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_counterfactual_reasoning_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_INVALID_VERSION"):
            generate_counterfactual_reasoning_record("CFR-T-002", "i", "a", "c", ["x"], make_provenance("HYPOTHESIS", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["assumptions"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COUNTERFACTUAL_REASONING_SCHEMA, tampered, "tampered record")
        gate = evaluate_counterfactual_reasoning_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COUNTERFACTUAL_REASONING_SCHEMA, record, "record with a smuggled top-level key")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_intervention_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_EMPTY_INTERVENTION"):
            _valid_record(intervention="")

    def test_whitespace_only_intervention_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_EMPTY_INTERVENTION"):
            _valid_record(intervention="   ")

    def test_empty_actual_outcome_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_EMPTY_ACTUAL_OUTCOME"):
            _valid_record(actual_outcome="")

    def test_empty_counterfactual_outcome_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_EMPTY_COUNTERFACTUAL_OUTCOME"):
            _valid_record(counterfactual_outcome="")


class DistinctnessInvariantTests(unittest.TestCase):
    """The core 'not an echo' invariant, 3-way pairwise."""

    def test_counterfactual_echoing_actual_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_ACTUAL"):
            _valid_record(actual_outcome="retention fell to 87%", counterfactual_outcome="retention fell to 87%")

    def test_counterfactual_echoing_actual_is_case_insensitive(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_ACTUAL"):
            _valid_record(actual_outcome="Retention Fell", counterfactual_outcome="retention fell")

    def test_counterfactual_echoing_actual_is_whitespace_insensitive(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_ACTUAL"):
            _valid_record(actual_outcome="retention fell", counterfactual_outcome="  retention   fell  ")

    def test_actual_echoing_intervention_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_ACTUAL_ECHOES_INTERVENTION"):
            _valid_record(intervention="raised price 17%", actual_outcome="raised price 17%")

    def test_counterfactual_echoing_intervention_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_INTERVENTION"):
            _valid_record(intervention="raised price 17%", counterfactual_outcome="raised price 17%", actual_outcome="retention fell to 87%")

    def test_genuinely_distinct_fields_are_accepted(self):
        record = _valid_record(intervention="raised price 17%", actual_outcome="retention fell 5pp", counterfactual_outcome="retention would have held")
        values = {record["intervention"], record["actual_outcome"], record["counterfactual_outcome"]}
        self.assertEqual(len(values), 3)


class AssumptionsValidationTests(unittest.TestCase):
    def test_empty_assumptions_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_EMPTY_ASSUMPTIONS"):
            _valid_record(assumptions=[])

    def test_non_list_assumptions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_EMPTY_ASSUMPTIONS"):
            _valid_record(assumptions="not-a-list")

    def test_assumptions_with_non_string_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_INVALID_ASSUMPTIONS"):
            _valid_record(assumptions=["ok", 123])

    def test_assumptions_with_empty_string_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COUNTERFACTUAL_INVALID_ASSUMPTIONS"):
            _valid_record(assumptions=["ok", "  "])

    def test_single_assumption_is_legal(self):
        record = _valid_record(assumptions=["one real assumption"])
        self.assertEqual(record["assumptions"], ["one real assumption"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_counterfactual_reasoning_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_assumptions(self):
        record = copy.deepcopy(_valid_record())
        record["assumptions"] = []
        gate = evaluate_counterfactual_reasoning_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_counterfactual_echoes_actual(self):
        record = copy.deepcopy(_valid_record())
        record["counterfactual_outcome"] = record["actual_outcome"]
        gate = evaluate_counterfactual_reasoning_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_intervention(self):
        record = copy.deepcopy(_valid_record())
        record["intervention"] = ""
        gate = evaluate_counterfactual_reasoning_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_counterfactual_reasoning_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_counterfactual_reasoning_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_counterfactual_reasoning_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_counterfactual_reasoning_gates_returns_two_gates_in_order(self):
        results = evaluate_counterfactual_reasoning_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "counterfactual_reasoning_integrity"])

    def test_evaluate_counterfactual_reasoning_gates_all_pass_on_a_valid_record(self):
        results = evaluate_counterfactual_reasoning_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CFR-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.counterfactual_reasoning")

    def test_builder_copies_assumptions_list_not_aliases_caller_list(self):
        assumptions = ["one"]
        record = _valid_record(assumptions=assumptions)
        assumptions.append("mutated")
        self.assertEqual(record["assumptions"], ["one"])


if __name__ == "__main__":
    unittest.main()

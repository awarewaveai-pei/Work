"""Mutation-style tests for ``framing.north_star_metric`` (F01 framing family, Atlas F01 table row L337).

One real invariant beyond per-field completeness, exercised at BOTH layers: construction-time refusal
(``generate_north_star_metric`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_north_star_metric_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/north-star-metric-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.north_star_metric import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_north_star_metric_gates,
    evaluate_north_star_metric_integrity_gate,
    evaluate_provenance_required_gate,
    generate_north_star_metric,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

NSM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/north-star-metric-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "NSM-T-001",
    core_value_proposition: str = "users experience recurring, durable value from the product",
    proxy_metric: str = "weekly active teams completing at least 3 collaborative actions",
    anti_gaming_validation: str = "raw login count cannot inflate this metric; only genuine multi-user collaborative actions count",
):
    return generate_north_star_metric(
        record_id,
        core_value_proposition,
        proxy_metric,
        anti_gaming_validation,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(NSM_SCHEMA, _valid_record(), "north star metric record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_north_star_metric_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_INVALID_VERSION"):
            generate_north_star_metric("NSM-T-002", "v", "p", "a", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["core_value_proposition"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NSM_SCHEMA, tampered, "tampered record")
        gate = evaluate_north_star_metric_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        """Same discipline as framing.goal_statement's own test, added from the start (not retrofitted
        after a critic finding): additionalProperties:false must reject a smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(NSM_SCHEMA, record, "record with a smuggled top-level authority-style key")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_core_value_proposition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_CORE_VALUE_PROPOSITION"):
            _valid_record(core_value_proposition="")

    def test_whitespace_only_core_value_proposition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_CORE_VALUE_PROPOSITION"):
            _valid_record(core_value_proposition="   ")

    def test_non_string_core_value_proposition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_CORE_VALUE_PROPOSITION"):
            _valid_record(core_value_proposition=123)

    def test_empty_proxy_metric_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_PROXY_METRIC"):
            _valid_record(proxy_metric="")

    def test_whitespace_only_proxy_metric_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_PROXY_METRIC"):
            _valid_record(proxy_metric="   ")

    def test_empty_anti_gaming_validation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_ANTI_GAMING_VALIDATION"):
            _valid_record(anti_gaming_validation="")

    def test_missing_anti_gaming_validation_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_ANTI_GAMING_VALIDATION"):
            _valid_record(anti_gaming_validation=None)

    def test_whitespace_only_anti_gaming_validation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_EMPTY_ANTI_GAMING_VALIDATION"):
            _valid_record(anti_gaming_validation="   ")


class ProxyEchoesCoreValueTests(unittest.TestCase):
    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_PROXY_ECHOES_CORE_VALUE"):
            _valid_record(core_value_proposition="user delight", proxy_metric="user delight")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_PROXY_ECHOES_CORE_VALUE"):
            _valid_record(core_value_proposition="User Delight", proxy_metric="user delight")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NORTHSTARMETRIC_PROXY_ECHOES_CORE_VALUE"):
            _valid_record(core_value_proposition="user delight", proxy_metric="  user   delight  ")

    def test_genuinely_different_proxy_metric_is_accepted(self):
        record = _valid_record(core_value_proposition="user delight", proxy_metric="weekly NPS >= 9 responders")
        self.assertNotEqual(record["core_value_proposition"], record["proxy_metric"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_north_star_metric_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_core_value_proposition(self):
        record = copy.deepcopy(_valid_record())
        record["core_value_proposition"] = ""
        gate = evaluate_north_star_metric_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_proxy_metric(self):
        record = copy.deepcopy(_valid_record())
        record["proxy_metric"] = ""
        gate = evaluate_north_star_metric_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_anti_gaming_validation(self):
        record = copy.deepcopy(_valid_record())
        record["anti_gaming_validation"] = ""
        gate = evaluate_north_star_metric_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_proxy_echoes_core_value(self):
        record = copy.deepcopy(_valid_record())
        record["proxy_metric"] = record["core_value_proposition"]
        gate = evaluate_north_star_metric_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_north_star_metric_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_north_star_metric_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_north_star_metric_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_north_star_metric_gates_returns_two_gates_in_order(self):
        results = evaluate_north_star_metric_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "north_star_metric_integrity"])

    def test_evaluate_north_star_metric_gates_all_pass_on_a_valid_record(self):
        results = evaluate_north_star_metric_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "NSM-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.north_star_metric")

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "core_value_proposition", "proxy_metric", "anti_gaming_validation", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()

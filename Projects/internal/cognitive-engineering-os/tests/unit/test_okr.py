"""Mutation-style tests for ``framing.okr`` (F01 framing family, Atlas F01 table row L336).

Two real invariants, each exercised at BOTH layers: construction-time refusal (``generate_okr_record``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_okr_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder entirely, never
calling the builder itself). Schema conformance is checked against the real spec-root schema this same slice
added (``typed-objects/okr-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.okr import (
    MAX_KEY_RESULTS,
    METHOD_ID,
    MIN_KEY_RESULTS,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_okr_gates,
    evaluate_okr_integrity_gate,
    evaluate_provenance_required_gate,
    generate_okr_record,
    key_result_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

OKR_SCHEMA = "ai-lego://specs/cognitive/typed-objects/okr-record.schema.yaml"
PROVENANCE = make_provenance("EVIDENCE", "HUMAN_APPROVED")


def _kr(entry_id: str = "KR-1", description: str = "increase signup conversion", target: str = "2% -> 5%", owner: str = "growth-team", provenance=None) -> dict:
    return key_result_entry(entry_id, description, target, owner, provenance if provenance is not None else PROVENANCE)


def _default_key_results() -> list[dict]:
    return [
        _kr("KR-1", "increase signup conversion", "2% -> 5%", "growth-team"),
        _kr("KR-2", "reduce churn", "8% -> 4%", "retention-team"),
    ]


def _valid_record(
    *,
    record_id: str = "OKR-T-001",
    objective: str = "grow the product to product-market fit",
    key_results=None,
    review_cadence: str = "quarterly",
    provenance=None,
):
    return generate_okr_record(
        record_id,
        objective,
        key_results if key_results is not None else _default_key_results(),
        review_cadence,
        provenance if provenance is not None else PROVENANCE,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(OKR_SCHEMA, _valid_record(), "okr record")

    def test_valid_record_with_five_key_results_validates(self):
        krs = [_kr(f"KR-{i}", f"result {i}", f"target {i}", f"owner-{i}") for i in range(1, 6)]
        record = _valid_record(key_results=krs)
        self.contracts.validate(OKR_SCHEMA, record, "okr record with 5 key results")
        self.assertEqual(len(record["key_results"]), 5)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_okr_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_VERSION"):
            generate_okr_record("OKR-T-002", "g", _default_key_results(), "quarterly", PROVENANCE, version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["objective"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OKR_SCHEMA, tampered, "tampered record")
        gate = evaluate_okr_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OKR_SCHEMA, record, "record with a smuggled top-level authority-style key")

    def test_schema_rejects_an_unknown_key_result_entry_key(self):
        record = _valid_record()
        record["key_results"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OKR_SCHEMA, record, "record with a smuggled key_result entry key")

    def test_schema_rejects_one_key_result_below_the_atlas_bound(self):
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(
                OKR_SCHEMA,
                {
                    "id": "OKR-T-003",
                    "version": "1.0.0",
                    "objective": "x",
                    "key_results": [_kr()],
                    "review_cadence": "quarterly",
                    "provenance": PROVENANCE,
                },
                "record with 1 key result",
            )

    def test_schema_rejects_six_key_results_above_the_atlas_bound(self):
        krs = [_kr(f"KR-{i}", f"r{i}", f"t{i}", f"o{i}") for i in range(1, 7)]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(
                OKR_SCHEMA,
                {
                    "id": "OKR-T-004",
                    "version": "1.0.0",
                    "objective": "x",
                    "key_results": krs,
                    "review_cadence": "quarterly",
                    "provenance": PROVENANCE,
                },
                "record with 6 key results",
            )


class KeyResultCountBoundTests(unittest.TestCase):
    def test_min_max_constants_match_atlas_citation(self):
        self.assertEqual(MIN_KEY_RESULTS, 2)
        self.assertEqual(MAX_KEY_RESULTS, 5)

    def test_one_key_result_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_KR_COUNT"):
            _valid_record(key_results=[_kr()])

    def test_zero_key_results_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_KR_COUNT"):
            _valid_record(key_results=[])

    def test_six_key_results_is_refused(self):
        krs = [_kr(f"KR-{i}", f"r{i}", f"t{i}", f"o{i}") for i in range(1, 7)]
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_KR_COUNT"):
            _valid_record(key_results=krs)

    def test_two_key_results_is_accepted(self):
        record = _valid_record(key_results=[_kr("KR-1"), _kr("KR-2", "r2", "t2", "o2")])
        self.assertEqual(len(record["key_results"]), 2)

    def test_five_key_results_is_accepted(self):
        krs = [_kr(f"KR-{i}", f"r{i}", f"t{i}", f"o{i}") for i in range(1, 6)]
        record = _valid_record(key_results=krs)
        self.assertEqual(len(record["key_results"]), 5)

    def test_key_results_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_KEY_RESULTS"):
            _valid_record(key_results="not-a-list")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_objective_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_EMPTY_OBJECTIVE"):
            _valid_record(objective="")

    def test_whitespace_only_objective_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_EMPTY_OBJECTIVE"):
            _valid_record(objective="   ")

    def test_empty_review_cadence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_EMPTY_REVIEW_CADENCE"):
            _valid_record(review_cadence="")

    def test_whitespace_only_review_cadence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_EMPTY_REVIEW_CADENCE"):
            _valid_record(review_cadence="   ")

    def test_key_result_with_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_EMPTY_KR_DESCRIPTION"):
            _valid_record(key_results=[_kr("KR-1", "", "t", "o"), _kr("KR-2")])

    def test_key_result_with_empty_target_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_EMPTY_KR_TARGET"):
            _valid_record(key_results=[_kr("KR-1", "d", "", "o"), _kr("KR-2")])

    def test_key_result_with_empty_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_UNOWNED_KEY_RESULT"):
            _valid_record(key_results=[_kr("KR-1", "d", "t", ""), _kr("KR-2")])

    def test_key_result_with_whitespace_only_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_UNOWNED_KEY_RESULT"):
            _valid_record(key_results=[_kr("KR-1", "d", "t", "   "), _kr("KR-2")])

    def test_key_result_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_KEY_RESULTS"):
            _valid_record(key_results=["not-a-dict", _kr("KR-2")])

    def test_key_result_with_unknown_key_is_refused(self):
        bad = _kr("KR-1")
        bad["confidence"] = 0.9
        with self.assertRaisesRegex(InvariantViolation, "OKR_INVALID_KEY_RESULTS"):
            _valid_record(key_results=[bad, _kr("KR-2")])


class DuplicateKeyResultIdTests(unittest.TestCase):
    def test_duplicate_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OKR_DUPLICATE_KEY_RESULT_ID"):
            _valid_record(key_results=[_kr("KR-1"), _kr("KR-1", "d2", "t2", "o2")])

    def test_distinct_ids_are_accepted(self):
        record = _valid_record(key_results=[_kr("KR-1"), _kr("KR-2", "d2", "t2", "o2")])
        self.assertEqual([kr["id"] for kr in record["key_results"]], ["KR-1", "KR-2"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_okr_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_objective(self):
        record = copy.deepcopy(_valid_record())
        record["objective"] = ""
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_kr_count_below_bound(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"] = record["key_results"][:1]
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_kr_count_above_bound(self):
        record = copy.deepcopy(_valid_record())
        extra = [_kr(f"KR-EXTRA-{i}", f"r{i}", f"t{i}", f"o{i}") for i in range(4)]
        record["key_results"] = record["key_results"] + extra
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_key_result_description(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"][0]["description"] = ""
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_key_result_target(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"][0]["target"] = ""
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_key_result_owner(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"][0]["owner"] = ""
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_key_result_id(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"][1]["id"] = record["key_results"][0]["id"]
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_review_cadence(self):
        record = copy.deepcopy(_valid_record())
        record["review_cadence"] = ""
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_okr_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_key_results_not_a_list(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"] = "not-a-list"
        gate = evaluate_okr_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_provenance_required_gate_fails_when_a_key_result_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["key_results"][0]["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
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

    def test_evaluate_okr_gates_returns_two_gates_in_order(self):
        results = evaluate_okr_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "okr_integrity"])

    def test_evaluate_okr_gates_all_pass_on_a_valid_record(self):
        results = evaluate_okr_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "OKR-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "framing.okr")

    def test_builder_copies_key_results_not_aliases_caller_list(self):
        key_results = _default_key_results()
        record = _valid_record(key_results=key_results)
        key_results.append(_kr("KR-MUTATED", "d", "t", "o"))
        self.assertEqual(len(record["key_results"]), 2)

    def test_builder_copies_each_key_result_dict_not_aliases_caller_entries(self):
        key_results = _default_key_results()
        record = _valid_record(key_results=key_results)
        key_results[0]["description"] = "mutated after construction"
        self.assertEqual(record["key_results"][0]["description"], "increase signup conversion")


if __name__ == "__main__":
    unittest.main()

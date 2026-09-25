"""Mutation-style tests for ``foresight.horizon_scanning`` (F13 foresight family, Atlas L672 + §12.22 L2811-2818).

Atlas §12.22's own six-field mandate (L2817) is proven at BOTH independent
layers: the construction-time builder refuses a signal missing any of the
six fields (or a dangling domain/source reference), and the independent
gates re-derive the same rules directly from a raw (possibly hand-tampered)
dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.horizon_scanning import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_horizon_scanning_gates,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    evaluate_signal_fields_gate,
    generate_horizon_scan_record,
    signal,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

HORIZON_SCAN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/horizon-scan-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _domains() -> list[dict]:
    return [{"domain_id": "D-REGULATION", "name": "AI 監管"}]


def _sources() -> list[dict]:
    return [{"source_id": "S-EUAIACT", "name": "EU AI Act 官方公報"}]


def _signal(**overrides: object) -> dict:
    base = {
        "id": "SIG-1",
        "domain": "D-REGULATION",
        "source": "S-EUAIACT",
        "description": "高風險 AI 系統的合規期限提前",
        "date": "2026-09-01",
        "geography": "EU",
        "status": "CONFIRMING",
        "impact": "客戶合規產品線需提前 6 個月交付",
        "confidence": "MEDIUM",
    }
    base.update(overrides)
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(domains=_domains(), sources=_sources(), signals=[_signal()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "HSCAN-T-001", **overrides: object):
    return generate_horizon_scan_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(HORIZON_SCAN_SCHEMA, _valid_record(), "horizon scan record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_horizon_scan_record, "HSCAN-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.horizon_scanning.contract.yaml")
        self.assertEqual(record["id"], "HSCAN-T-INVOKE")

    def test_empty_catalog_blocks_horizon_scanning_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HORIZON_SCAN_SCHEMA, record, "horizon scan record with a smuggled top-level key")

    def test_schema_rejects_zero_domains(self):
        record = _valid_record()
        record["domains"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HORIZON_SCAN_SCHEMA, record, "horizon scan record with zero domains")

    def test_schema_rejects_a_signal_missing_a_mandatory_field(self):
        record = _valid_record()
        del record["signals"][0]["confidence"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HORIZON_SCAN_SCHEMA, record, "horizon scan record with a signal missing confidence")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.horizon_scanning.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.horizon_scanning contract")


class SixFieldMandateTests(unittest.TestCase):
    """Atlas §12.22 L2817: every signal must have source, date, geography, status, impact, confidence."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["signals"]), 1)

    def test_signal_missing_each_mandatory_field_in_turn_is_refused(self):
        for field in ("source", "date", "geography", "status", "impact", "confidence"):
            with self.subTest(field=field):
                bad_signal = _signal()
                del bad_signal[field]
                with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_SIGNAL"):
                    _valid_record(signals=[bad_signal])

    def test_signal_with_a_blank_mandatory_field_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_SIGNAL"):
            _valid_record(signals=[_signal(impact="   ")])

    def test_signal_helper_constructs_a_well_formed_signal(self):
        built = signal("SIG-1", "D-REGULATION", "S-EUAIACT", "desc", "2026-09-01", "EU", "CONFIRMING", "impact", "MEDIUM")
        self.assertEqual(built["confidence"], "MEDIUM")

    def test_signal_helper_refuses_a_blank_field(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_SIGNAL"):
            signal("SIG-1", "D-REGULATION", "S-EUAIACT", "desc", "2026-09-01", "", "CONFIRMING", "impact", "MEDIUM")


class ReferentialIntegrityTests(unittest.TestCase):
    def test_zero_domains_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_NO_DOMAINS"):
            _valid_record(domains=[])

    def test_zero_sources_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_NO_SOURCES"):
            _valid_record(sources=[])

    def test_zero_signals_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_NO_SIGNALS"):
            _valid_record(signals=[])

    def test_dangling_domain_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_DANGLING_DOMAIN_REF"):
            _valid_record(signals=[_signal(domain="D-UNKNOWN")])

    def test_dangling_source_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_DANGLING_SOURCE_REF"):
            _valid_record(signals=[_signal(source="S-UNKNOWN")])

    def test_invalid_domain_declaration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_DOMAIN"):
            _valid_record(domains=[{"domain_id": "D-1"}])

    def test_invalid_source_declaration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_SOURCE"):
            _valid_record(sources=[{"source_id": "S-1"}])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "HSCAN-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_VERSION"):
            generate_horizon_scan_record("HSCAN-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HSCAN_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.horizon_scanning")

    def test_evaluate_horizon_scanning_gates_returns_three_gates_in_order(self):
        results = evaluate_horizon_scanning_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "signal_six_fields_required", "referential_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "domains", "sources", "signals", "provenance"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. Proves the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_horizon_scanning_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_signal_fields_gate_catches_hand_tampered_missing_field(self):
        record = copy.deepcopy(_valid_record())
        del record["signals"][0]["status"]
        gate = evaluate_signal_fields_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_signal_fields_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_signal_fields_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_signal_fields_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_signal_fields_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_dangling_domain_ref(self):
        record = copy.deepcopy(_valid_record())
        record["signals"][0]["domain"] = "D-UNKNOWN"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_dangling_source_ref(self):
        record = copy.deepcopy(_valid_record())
        record["signals"][0]["source"] = "S-UNKNOWN"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_referential_integrity_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_referential_integrity_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_referential_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_horizon_scanning_gates(bad, "test", "2026-09-12T00:00:00Z")
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

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ContainerAliasingTests(unittest.TestCase):
    """Every domains[]/sources[]/signals[] entry is deep-copied (copy.deepcopy), not shallow-copied -- mutating
    the caller's own original list/dict after the call must not affect the returned record."""

    def test_mutating_the_callers_domains_list_after_the_call_does_not_affect_the_returned_record(self):
        caller_domains = _domains()
        record = _valid_record(domains=caller_domains)
        caller_domains.append({"domain_id": "D-EXTRA", "name": "額外"})
        self.assertEqual(len(record["domains"]), 1, "returned record must not alias the caller's own mutable domains list")

    def test_mutating_the_returned_domain_dict_does_not_affect_the_caller(self):
        caller_domain = _domains()[0]
        record = _valid_record(domains=[caller_domain])
        record["domains"][0]["name"] = "MUTATED"
        self.assertEqual(caller_domain["name"], "AI 監管", "mutating the returned record's domain must not affect the caller's own original dict")



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_record()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_horizon_scan_record(base["id"], base["domains"], base["sources"], base["signals"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()

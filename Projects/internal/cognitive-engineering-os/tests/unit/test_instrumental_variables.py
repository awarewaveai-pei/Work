"""Mutation-style tests for ``causal.instrumental_variables`` (9th F11 `causal` family member).

Two real invariants beyond per-field completeness (5-field presence,
instrument/endogenous_variable distinctness), exercised at BOTH layers:
construction-time refusal (``generate_instrumental_variables_record``
raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_instrumental_variables_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the
builder itself). Schema conformance is checked against the real spec-root
schema this same slice added
(``typed-objects/instrumental-variables-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.instrumental_variables import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    _normalize,
    all_gates_pass,
    evaluate_instrumental_variables_gates,
    evaluate_instrumental_variables_integrity_gate,
    evaluate_provenance_required_gate,
    generate_instrumental_variables_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

IV_SCHEMA = "ai-lego://specs/cognitive/typed-objects/instrumental-variables-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "IV-T-001",
    instrument: str = "quarter-of-birth compulsory schooling instrument",
    endogenous_variable: str = "years of completed schooling",
    relevance_justification: str = "first-stage F-statistic > 10, quarter-of-birth correlates with schooling",
    exclusion_justification: str = "quarter-of-birth affects earnings only through schooling, birth-year/region fixed effects controlled",
    analysis_summary: str = "2SLS estimate: each additional year of schooling raises earnings by ~7.5% (se 1.2%)",
):
    return generate_instrumental_variables_record(
        record_id,
        instrument,
        endogenous_variable,
        relevance_justification,
        exclusion_justification,
        analysis_summary,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(IV_SCHEMA, _valid_record(), "instrumental variables record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_iv_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INVALID_VERSION"):
            generate_instrumental_variables_record("IV-T-002", "i", "e", "r", "x", "a", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["exclusion_justification"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IV_SCHEMA, tampered, "tampered record")
        gate = evaluate_instrumental_variables_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as rct-record.schema.yaml's own test: additionalProperties:false must reject a
        smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IV_SCHEMA, record, "record with a smuggled top-level key")

    def test_id_is_distinct_from_causal_rct_machine_id(self):
        self.assertNotEqual(METHOD_ID, "causal.rct")
        self.assertEqual(METHOD_ID, "causal.instrumental_variables")

    def test_iv_and_causal_rct_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "causal.rct"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        causal.rct.contract.yaml's own test suite already establishes -- not just a one-time manual claim in
        prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "causal.instrumental_variables.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "causal.instrumental_variables contract")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_instrument_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_INSTRUMENT"):
            _valid_record(instrument="")

    def test_whitespace_only_instrument_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_INSTRUMENT"):
            _valid_record(instrument="   ")

    def test_non_string_instrument_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_INSTRUMENT"):
            _valid_record(instrument=123)

    def test_empty_endogenous_variable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_ENDOGENOUS_VARIABLE"):
            _valid_record(endogenous_variable="")

    def test_empty_relevance_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_RELEVANCE_JUSTIFICATION"):
            _valid_record(relevance_justification="")

    def test_missing_relevance_justification_none_is_refused(self):
        """A core operator-flagged design decision: relevance_justification is REQUIRED, not optional -- a
        design disclosing no relevance argument must say so explicitly, it cannot omit the field."""
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_RELEVANCE_JUSTIFICATION"):
            _valid_record(relevance_justification=None)

    def test_whitespace_only_relevance_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_RELEVANCE_JUSTIFICATION"):
            _valid_record(relevance_justification="   ")

    def test_empty_exclusion_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_EXCLUSION_JUSTIFICATION"):
            _valid_record(exclusion_justification="")

    def test_missing_exclusion_justification_none_is_refused(self):
        """The other core operator-flagged design decision: exclusion_justification is REQUIRED independently of
        relevance_justification -- disclosing one condition does not excuse omitting the other."""
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_EXCLUSION_JUSTIFICATION"):
            _valid_record(exclusion_justification=None)

    def test_whitespace_only_exclusion_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_EXCLUSION_JUSTIFICATION"):
            _valid_record(exclusion_justification="   ")

    def test_empty_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary="")

    def test_non_string_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_EMPTY_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary=999)


class InstrumentEchoesEndogenousVariableTests(unittest.TestCase):
    """The core 'not a valid IV design' invariant: an instrument identical to the endogenous variable it targets
    must be refused."""

    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE"):
            _valid_record(instrument="years of schooling", endogenous_variable="years of schooling")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE"):
            _valid_record(instrument="Years Of Schooling", endogenous_variable="years of schooling")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE"):
            _valid_record(instrument="years of schooling", endogenous_variable="  years   of   schooling  ")

    def test_fullwidth_vs_halfwidth_punctuation_variant_is_still_caught_as_an_echo(self):
        with self.assertRaisesRegex(InvariantViolation, "IV_INSTRUMENT_ECHOES_ENDOGENOUS_VARIABLE"):
            _valid_record(instrument="schooling level?", endogenous_variable="schooling level？")

    def test_genuinely_different_endogenous_variable_is_accepted(self):
        record = _valid_record(instrument="quarter of birth", endogenous_variable="years of schooling")
        self.assertNotEqual(record["instrument"], record["endogenous_variable"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_instrumental_variables_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_instrument(self):
        record = copy.deepcopy(_valid_record())
        record["instrument"] = ""
        gate = evaluate_instrumental_variables_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_relevance_justification(self):
        record = copy.deepcopy(_valid_record())
        record["relevance_justification"] = ""
        gate = evaluate_instrumental_variables_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_exclusion_justification(self):
        record = copy.deepcopy(_valid_record())
        record["exclusion_justification"] = ""
        gate = evaluate_instrumental_variables_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_instrument_echoing_endogenous_variable(self):
        record = copy.deepcopy(_valid_record())
        record["instrument"] = record["endogenous_variable"]
        gate = evaluate_instrumental_variables_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_instrumental_variables_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_instrumental_variables_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_instrumental_variables_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_instrumental_variables_gates_returns_two_gates_in_order(self):
        results = evaluate_instrumental_variables_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "instrumental_variables_integrity"])

    def test_evaluate_instrumental_variables_gates_all_pass_on_a_valid_record(self):
        results = evaluate_instrumental_variables_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "IV-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.instrumental_variables")

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "instrument", "endogenous_variable", "relevance_justification", "exclusion_justification", "analysis_summary", "provenance"},
        )

    def test_normalize_folds_full_width_punctuation_to_half_width(self):
        self.assertEqual(_normalize("schooling level?"), _normalize("schooling level？"))


if __name__ == "__main__":
    unittest.main()

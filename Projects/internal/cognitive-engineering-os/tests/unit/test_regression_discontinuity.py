"""Mutation-style tests for ``causal.regression_discontinuity`` (8th F11 `causal` family member).

Two real invariants beyond per-field completeness (4-field presence, numeric cutoff_value,
non-empty checks list), exercised at BOTH layers: construction-time refusal
(``generate_regression_discontinuity_record`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_regression_discontinuity_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself).
Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/regression-discontinuity-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.regression_discontinuity import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    _normalize,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_regression_discontinuity_gates,
    evaluate_regression_discontinuity_integrity_gate,
    generate_regression_discontinuity_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/regression-discontinuity-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "RD-T-001",
    running_variable: str = "standardized exam score, 0-100 scale, administered at grade 6",
    cutoff_value: float = 60,
    bandwidth: str = "+-8 points around the cutoff, rule-of-thumb estimate, not cross-validated",
    checks: list[str] | None = None,
    analysis_summary: str | None = None,
):
    if checks is None:
        checks = [
            "McCrary density test: no evidence of manipulation at the cutoff (p=0.38)",
            "Placebo cutoff at the sample median showed no discontinuity",
        ]
    return generate_regression_discontinuity_record(
        record_id,
        running_variable,
        cutoff_value,
        bandwidth,
        checks,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        analysis_summary=analysis_summary,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RD_SCHEMA, _valid_record(), "regression discontinuity record")

    def test_valid_record_with_analysis_summary_validates(self):
        record = _valid_record(analysis_summary="estimated jump of ~12pp at the cutoff (p=0.03)")
        self.contracts.validate(RD_SCHEMA, record, "regression discontinuity record with analysis_summary")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_rd_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_VERSION"):
            generate_regression_discontinuity_record(
                "RD-T-002", "score", 60, "bandwidth", ["check one"], make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1
            )

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the
        same malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["bandwidth"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RD_SCHEMA, tampered, "tampered record")
        gate = evaluate_regression_discontinuity_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as rct-record.schema.yaml's own test: additionalProperties:false must
        reject a smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RD_SCHEMA, record, "record with a smuggled top-level key")

    def test_id_is_distinct_from_causal_rct_machine_id(self):
        self.assertNotEqual(METHOD_ID, "causal.rct")
        self.assertEqual(METHOD_ID, "causal.regression_discontinuity")

    def test_rd_and_causal_rct_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "causal.rct"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated
        against specs/cognitive/method.schema.yaml') true going forward, same live check
        causal.rct.contract.yaml's own test suite already establishes -- not just a one-time
        manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "causal.regression_discontinuity.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "causal.regression_discontinuity contract")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_running_variable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_RUNNING_VARIABLE"):
            _valid_record(running_variable="")

    def test_whitespace_only_running_variable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_RUNNING_VARIABLE"):
            _valid_record(running_variable="   ")

    def test_non_string_running_variable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_RUNNING_VARIABLE"):
            _valid_record(running_variable=123)

    def test_nan_cutoff_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_CUTOFF_VALUE"):
            _valid_record(cutoff_value=float("nan"))

    def test_infinite_cutoff_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_CUTOFF_VALUE"):
            _valid_record(cutoff_value=float("inf"))

    def test_none_cutoff_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_CUTOFF_VALUE"):
            _valid_record(cutoff_value=None)

    def test_string_cutoff_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_CUTOFF_VALUE"):
            _valid_record(cutoff_value="60")

    def test_boolean_cutoff_value_is_refused(self):
        """bool is a subclass of int in Python -- must be explicitly rejected, not silently
        accepted as 0/1."""
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_CUTOFF_VALUE"):
            _valid_record(cutoff_value=True)

    def test_zero_cutoff_value_is_accepted(self):
        """0 is a genuinely valid cutoff (e.g. a running variable centered at 0) -- must not be
        treated as falsy/empty."""
        record = _valid_record(cutoff_value=0)
        self.assertEqual(record["cutoff_value"], 0)

    def test_negative_cutoff_value_is_accepted(self):
        record = _valid_record(cutoff_value=-3.5)
        self.assertEqual(record["cutoff_value"], -3.5)

    def test_empty_bandwidth_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_BANDWIDTH"):
            _valid_record(bandwidth="")

    def test_empty_checks_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_CHECKS_LIST"):
            _valid_record(checks=[])

    def test_non_list_checks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_CHECKS_LIST"):
            _valid_record(checks="a single string, not a list")

    def test_checks_with_an_empty_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_CHECKS_ENTRY"):
            _valid_record(checks=["a real check", ""])

    def test_checks_with_a_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_EMPTY_CHECKS_ENTRY"):
            _valid_record(checks=["a real check", 42])

    def test_invalid_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_INVALID_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary="   ")

    def test_omitted_analysis_summary_is_accepted(self):
        """analysis_summary is OPTIONAL (see contract compilation_decisions) -- omitting it must
        not raise, and the built record must not carry the key at all."""
        record = _valid_record()
        self.assertNotIn("analysis_summary", record)


class ChecksContainDuplicateTests(unittest.TestCase):
    """The core 'not actually disclosing multiple checks' invariant: a padded/duplicated checks
    list must be refused."""

    def test_exact_duplicate_pair_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_CHECKS_CONTAIN_DUPLICATE"):
            _valid_record(checks=["density test passed", "density test passed"])

    def test_case_insensitive_duplicate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_CHECKS_CONTAIN_DUPLICATE"):
            _valid_record(checks=["Density Test Passed", "density test passed"])

    def test_whitespace_insensitive_duplicate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_CHECKS_CONTAIN_DUPLICATE"):
            _valid_record(checks=["density test passed", "  density   test   passed  "])

    def test_fullwidth_vs_halfwidth_punctuation_variant_is_still_caught_as_a_duplicate(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_CHECKS_CONTAIN_DUPLICATE"):
            _valid_record(checks=["placebo cutoff test?", "placebo cutoff test？"])

    def test_duplicate_among_three_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RD_CHECKS_CONTAIN_DUPLICATE"):
            _valid_record(checks=["density test", "covariate balance check", "density test"])

    def test_single_check_is_accepted(self):
        record = _valid_record(checks=["density test passed"])
        self.assertEqual(record["checks"], ["density test passed"])

    def test_genuinely_distinct_checks_are_accepted(self):
        record = _valid_record(checks=["density test", "placebo cutoff test", "covariate balance check"])
        self.assertEqual(len(record["checks"]), 3)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again),
    then call the gate. These prove the gate re-derives from raw fields rather than trusting the
    builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_regression_discontinuity_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_running_variable(self):
        record = copy.deepcopy(_valid_record())
        record["running_variable"] = ""
        gate = evaluate_regression_discontinuity_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_nan_cutoff_value(self):
        record = copy.deepcopy(_valid_record())
        record["cutoff_value"] = float("nan")
        gate = evaluate_regression_discontinuity_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_checks(self):
        record = copy.deepcopy(_valid_record())
        record["checks"] = [record["checks"][0], record["checks"][0]]
        gate = evaluate_regression_discontinuity_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_analysis_summary(self):
        record = copy.deepcopy(_valid_record())
        record["analysis_summary"] = "   "
        gate = evaluate_regression_discontinuity_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_regression_discontinuity_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_regression_discontinuity_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_regression_discontinuity_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_regression_discontinuity_gates_returns_two_gates_in_order(self):
        results = evaluate_regression_discontinuity_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "regression_discontinuity_integrity"])

    def test_evaluate_regression_discontinuity_gates_all_pass_on_a_valid_record(self):
        results = evaluate_regression_discontinuity_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RD-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.regression_discontinuity")

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "running_variable", "cutoff_value", "bandwidth", "checks", "provenance"},
        )

    def test_builder_includes_analysis_summary_when_provided(self):
        record = _valid_record(analysis_summary="a reported finding")
        self.assertEqual(record["analysis_summary"], "a reported finding")

    def test_normalize_folds_full_width_punctuation_to_half_width(self):
        self.assertEqual(_normalize("placebo cutoff test?"), _normalize("placebo cutoff test？"))


if __name__ == "__main__":
    unittest.main()

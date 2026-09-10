"""Mutation-style tests for ``causal.rct`` (2nd F11 `causal` family member, after ``causal.dag``).

Two real invariants beyond per-field completeness (5-field presence,
treatment/control distinctness), exercised at BOTH layers: construction-time
refusal (``generate_rct_record`` raising a specific ``InvariantViolation``
code) and independent gate re-derivation (``evaluate_rct_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never
calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added
(``typed-objects/rct-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.rct import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    _normalize,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_rct_gates,
    evaluate_rct_integrity_gate,
    generate_rct_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RCT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/rct-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "RCT-T-001",
    randomization: str = "individual-level randomization via the signup system's random allocator, no crossover",
    power_analysis: str = "alpha=0.05, power=0.8, n=1600 per arm to detect a 5pp difference off a 35% baseline",
    treatment_group: str = "new signups receive a 3-email onboarding sequence on day 0/2/5",
    control_group: str = "new signups receive no onboarding emails, only the existing in-product flow",
    analysis_summary: str = "two-tailed t-test, treatment 41.2% vs control 35.6% 7-day retention, p=0.021",
):
    return generate_rct_record(
        record_id,
        randomization,
        power_analysis,
        treatment_group,
        control_group,
        analysis_summary,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RCT_SCHEMA, _valid_record(), "rct record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_rct_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_INVALID_VERSION"):
            generate_rct_record("RCT-T-002", "r", "p", "t", "c", "a", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["power_analysis"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RCT_SCHEMA, tampered, "tampered record")
        gate = evaluate_rct_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as how-might-we-record.schema.yaml's own test: additionalProperties:false must
        reject a smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RCT_SCHEMA, record, "record with a smuggled top-level key")

    def test_id_is_distinct_from_causal_dag_machine_id(self):
        self.assertNotEqual(METHOD_ID, "causal.dag")
        self.assertEqual(METHOD_ID, "causal.rct")

    def test_rct_and_causal_dag_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "causal.dag"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        decision.weighted_decision_matrix.contract.yaml's own test suite already establishes -- not just a
        one-time manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "causal.rct.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "causal.rct contract")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_randomization_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_RANDOMIZATION"):
            _valid_record(randomization="")

    def test_whitespace_only_randomization_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_RANDOMIZATION"):
            _valid_record(randomization="   ")

    def test_non_string_randomization_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_RANDOMIZATION"):
            _valid_record(randomization=123)

    def test_empty_power_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_POWER_ANALYSIS"):
            _valid_record(power_analysis="")

    def test_missing_power_analysis_none_is_refused(self):
        """The core operator-flagged design decision: power_analysis is REQUIRED, not optional -- a study
        disclosing no power justification must say so explicitly, it cannot omit the field."""
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_POWER_ANALYSIS"):
            _valid_record(power_analysis=None)

    def test_whitespace_only_power_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_POWER_ANALYSIS"):
            _valid_record(power_analysis="   ")

    def test_empty_treatment_group_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_TREATMENT_GROUP"):
            _valid_record(treatment_group="")

    def test_empty_control_group_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_CONTROL_GROUP"):
            _valid_record(control_group="")

    def test_empty_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary="")

    def test_non_string_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_EMPTY_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary=999)


class ControlGroupEchoesTreatmentGroupTests(unittest.TestCase):
    """The core 'not a randomized CONTROLLED trial' invariant: a single-arm record must be refused."""

    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP"):
            _valid_record(treatment_group="receives the new drug", control_group="receives the new drug")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP"):
            _valid_record(treatment_group="Receives The New Drug", control_group="receives the new drug")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP"):
            _valid_record(treatment_group="receives the new drug", control_group="  receives   the   new   drug  ")

    def test_fullwidth_vs_halfwidth_punctuation_variant_is_still_caught_as_an_echo(self):
        with self.assertRaisesRegex(InvariantViolation, "RCT_CONTROL_GROUP_ECHOES_TREATMENT_GROUP"):
            _valid_record(treatment_group="onboarding email?", control_group="onboarding email？")

    def test_genuinely_different_control_group_is_accepted(self):
        record = _valid_record(treatment_group="receives the new drug", control_group="receives a placebo")
        self.assertNotEqual(record["treatment_group"], record["control_group"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_rct_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_randomization(self):
        record = copy.deepcopy(_valid_record())
        record["randomization"] = ""
        gate = evaluate_rct_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_power_analysis(self):
        record = copy.deepcopy(_valid_record())
        record["power_analysis"] = ""
        gate = evaluate_rct_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_control_group_echoing_treatment_group(self):
        record = copy.deepcopy(_valid_record())
        record["control_group"] = record["treatment_group"]
        gate = evaluate_rct_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_rct_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_rct_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_rct_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_rct_gates_returns_two_gates_in_order(self):
        results = evaluate_rct_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "rct_integrity"])

    def test_evaluate_rct_gates_all_pass_on_a_valid_record(self):
        results = evaluate_rct_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RCT-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.rct")

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "randomization", "power_analysis", "treatment_group", "control_group", "analysis_summary", "provenance"},
        )

    def test_normalize_folds_full_width_punctuation_to_half_width(self):
        self.assertEqual(_normalize("onboarding email?"), _normalize("onboarding email？"))


if __name__ == "__main__":
    unittest.main()

"""Mutation-style tests for ``causal.difference_in_differences`` (7th F11 `causal` family member,
after ``causal.dag``/``causal.counterfactual_reasoning``/``causal.theory_of_change``/
``causal.logic_model``/``causal.process_tracing``/``causal.rct``).

Three real invariants beyond per-field completeness (6-field presence, treated/control
distinctness, pre/post distinctness), exercised at BOTH layers: construction-time refusal
(``generate_difference_in_differences_record`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_difference_in_differences_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself).
Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/difference-in-differences-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.difference_in_differences import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    _normalize,
    all_gates_pass,
    evaluate_difference_in_differences_gates,
    evaluate_difference_in_differences_integrity_gate,
    evaluate_provenance_required_gate,
    generate_difference_in_differences_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DID_SCHEMA = "ai-lego://specs/cognitive/typed-objects/difference-in-differences-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "DID-T-001",
    treated_group: str = "city A fast-food employers, subject to the 2025 Q3 minimum-wage increase",
    control_group: str = "city B fast-food employers, no minimum-wage change over the same window",
    pre_period: str = "2025 Q1-Q2 (2 quarters before the increase)",
    post_period: str = "2025 Q4-2026 Q1 (2 quarters after the increase)",
    parallel_trends_justification: str = "pre-period employment trend comparison across A/B shows quarterly growth-rate gaps under 1pp with no significant difference, supporting parallel trends",
    analysis_summary: str = "DiD estimate: treated employment change -2.1pp relative to control (se 0.9pp), as reported by the research team, not re-run by this record",
):
    return generate_difference_in_differences_record(
        record_id,
        treated_group,
        control_group,
        pre_period,
        post_period,
        parallel_trends_justification,
        analysis_summary,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(DID_SCHEMA, _valid_record(), "difference-in-differences record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_did_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_INVALID_VERSION"):
            generate_difference_in_differences_record(
                "DID-T-002", "t", "c", "pre", "post", "j", "a", make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1
            )

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["parallel_trends_justification"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DID_SCHEMA, tampered, "tampered record")
        gate = evaluate_difference_in_differences_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as rct-record.schema.yaml's own test: additionalProperties:false must reject a
        smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DID_SCHEMA, record, "record with a smuggled top-level key")

    def test_id_is_distinct_from_causal_rct_machine_id(self):
        self.assertNotEqual(METHOD_ID, "causal.rct")
        self.assertEqual(METHOD_ID, "causal.difference_in_differences")

    def test_did_and_causal_rct_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "causal.rct"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        causal.rct.contract.yaml's own test suite already establishes -- not just a one-time manual claim in
        prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "causal.difference_in_differences.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "causal.difference_in_differences contract")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_treated_group_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_TREATED_GROUP"):
            _valid_record(treated_group="")

    def test_whitespace_only_treated_group_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_TREATED_GROUP"):
            _valid_record(treated_group="   ")

    def test_non_string_treated_group_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_TREATED_GROUP"):
            _valid_record(treated_group=123)

    def test_empty_control_group_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_CONTROL_GROUP"):
            _valid_record(control_group="")

    def test_empty_pre_period_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_PRE_PERIOD"):
            _valid_record(pre_period="")

    def test_empty_post_period_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_POST_PERIOD"):
            _valid_record(post_period="")

    def test_empty_parallel_trends_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_PARALLEL_TRENDS_JUSTIFICATION"):
            _valid_record(parallel_trends_justification="")

    def test_missing_parallel_trends_justification_none_is_refused(self):
        """The core operator-flagged design decision: parallel_trends_justification is REQUIRED, not optional --
        a study disclosing no basis for the parallel-trends assumption must say so explicitly, it cannot omit
        the field."""
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_PARALLEL_TRENDS_JUSTIFICATION"):
            _valid_record(parallel_trends_justification=None)

    def test_whitespace_only_parallel_trends_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_PARALLEL_TRENDS_JUSTIFICATION"):
            _valid_record(parallel_trends_justification="   ")

    def test_empty_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary="")

    def test_non_string_analysis_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_EMPTY_ANALYSIS_SUMMARY"):
            _valid_record(analysis_summary=999)


class ControlGroupEchoesTreatedGroupTests(unittest.TestCase):
    """The core 'has not identified 2 groups to compare' invariant: a single-arm record must be refused."""

    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_CONTROL_GROUP_ECHOES_TREATED_GROUP"):
            _valid_record(treated_group="receives the policy", control_group="receives the policy")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_CONTROL_GROUP_ECHOES_TREATED_GROUP"):
            _valid_record(treated_group="Receives The Policy", control_group="receives the policy")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_CONTROL_GROUP_ECHOES_TREATED_GROUP"):
            _valid_record(treated_group="receives the policy", control_group="  receives   the   policy  ")

    def test_fullwidth_vs_halfwidth_punctuation_variant_is_still_caught_as_an_echo(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_CONTROL_GROUP_ECHOES_TREATED_GROUP"):
            _valid_record(treated_group="city A employers?", control_group="city A employers？")

    def test_genuinely_different_control_group_is_accepted(self):
        record = _valid_record(treated_group="city A employers", control_group="city B employers")
        self.assertNotEqual(record["treated_group"], record["control_group"])


class PostPeriodEchoesPrePeriodTests(unittest.TestCase):
    """The core 'cannot express a before/after difference' invariant: an identical period twice must be
    refused."""

    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_POST_PERIOD_ECHOES_PRE_PERIOD"):
            _valid_record(pre_period="2025 Q3", post_period="2025 Q3")

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_POST_PERIOD_ECHOES_PRE_PERIOD"):
            _valid_record(pre_period="2025 Q3", post_period="2025 q3")

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_POST_PERIOD_ECHOES_PRE_PERIOD"):
            _valid_record(pre_period="2025 Q3", post_period="  2025   Q3  ")

    def test_fullwidth_vs_halfwidth_punctuation_variant_is_still_caught_as_an_echo(self):
        with self.assertRaisesRegex(InvariantViolation, "DID_POST_PERIOD_ECHOES_PRE_PERIOD"):
            _valid_record(pre_period="2025 Q3?", post_period="2025 Q3？")

    def test_genuinely_different_post_period_is_accepted(self):
        record = _valid_record(pre_period="2025 Q1-Q2", post_period="2025 Q4-2026 Q1")
        self.assertNotEqual(record["pre_period"], record["post_period"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_difference_in_differences_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_treated_group(self):
        record = copy.deepcopy(_valid_record())
        record["treated_group"] = ""
        gate = evaluate_difference_in_differences_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_parallel_trends_justification(self):
        record = copy.deepcopy(_valid_record())
        record["parallel_trends_justification"] = ""
        gate = evaluate_difference_in_differences_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_control_group_echoing_treated_group(self):
        record = copy.deepcopy(_valid_record())
        record["control_group"] = record["treated_group"]
        gate = evaluate_difference_in_differences_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_post_period_echoing_pre_period(self):
        record = copy.deepcopy(_valid_record())
        record["post_period"] = record["pre_period"]
        gate = evaluate_difference_in_differences_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_difference_in_differences_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_difference_in_differences_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_difference_in_differences_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_difference_in_differences_gates_returns_two_gates_in_order(self):
        results = evaluate_difference_in_differences_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "difference_in_differences_integrity"])

    def test_evaluate_difference_in_differences_gates_all_pass_on_a_valid_record(self):
        results = evaluate_difference_in_differences_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DID-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.difference_in_differences")

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {
                "id", "version", "generated_by_method", "treated_group", "control_group",
                "pre_period", "post_period", "parallel_trends_justification", "analysis_summary", "provenance",
            },
        )

    def test_normalize_folds_full_width_punctuation_to_half_width(self):
        self.assertEqual(_normalize("city A employers?"), _normalize("city A employers？"))


if __name__ == "__main__":
    unittest.main()

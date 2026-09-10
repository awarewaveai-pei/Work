"""Mutation-style tests for ``causal.synthetic_control`` (10th and FINAL F11 `causal` family member).

Four real invariants beyond per-field completeness (6-field/list presence, donor_pool
size floor, treated_unit/donor_pool distinctness, weights[].donor referential
integrity against donor_pool), exercised at BOTH layers: construction-time refusal
(``generate_synthetic_control_record`` raising a specific ``InvariantViolation`` code)
and independent gate re-derivation (``evaluate_synthetic_control_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling
the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/synthetic-control-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.synthetic_control import (
    METHOD_ID,
    MIN_DONOR_POOL_SIZE,
    RECORD_ID_PREFIX,
    _normalize,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_synthetic_control_gates,
    evaluate_synthetic_control_integrity_gate,
    generate_synthetic_control_record,
    synthetic_control_weight,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SYNTHETIC_CONTROL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/synthetic-control-record.schema.yaml"


def _valid_record(
    *,
    record_id: str = "SYNTH-T-001",
    treated_unit: str = "state A (minimum-wage policy treated state)",
    donor_pool: list[str] | None = None,
    fit_quality: str = "pre-treatment employment trends closely tracked the treated unit for 5 years prior",
    weights: list[dict] | None = None,
    post_treatment_gap: str = "post-treatment employment rate 1.4pp below the synthetic control, gap widens after year 2",
    placebo_tests: list[str] | None = None,
):
    donor_pool = donor_pool if donor_pool is not None else ["state B", "state C", "state D"]
    weights = weights if weights is not None else [synthetic_control_weight("state B", 0.5), synthetic_control_weight("state C", 0.3), synthetic_control_weight("state D", 0.2)]
    placebo_tests = placebo_tests if placebo_tests is not None else ["in-space placebo: ran the same procedure on each untreated donor, treated unit's own gap in the 92nd percentile"]
    return generate_synthetic_control_record(
        record_id,
        treated_unit,
        donor_pool,
        fit_quality,
        weights,
        post_treatment_gap,
        placebo_tests,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(SYNTHETIC_CONTROL_SCHEMA, _valid_record(), "synthetic control record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_synthetic_control_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_INVALID_VERSION"):
            generate_synthetic_control_record(
                "SYNTH-T-002", "t", ["d1", "d2"], "f", [synthetic_control_weight("d1", 0.5), synthetic_control_weight("d2", 0.5)], "g", ["p"],
                make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1,
            )

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["fit_quality"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNTHETIC_CONTROL_SCHEMA, tampered, "tampered record")
        gate = evaluate_synthetic_control_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as rct-record.schema.yaml's own test: additionalProperties:false must reject a
        smuggled top-level key."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNTHETIC_CONTROL_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_weights_item(self):
        """additionalProperties:false is enforced at the NESTED weights[] item level too, not only top-level."""
        record = _valid_record()
        record["weights"][0]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNTHETIC_CONTROL_SCHEMA, record, "record with a smuggled weights[] key")

    def test_id_is_distinct_from_causal_rct_machine_id(self):
        self.assertNotEqual(METHOD_ID, "causal.rct")
        self.assertEqual(METHOD_ID, "causal.synthetic_control")

    def test_synthetic_control_and_causal_dag_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "causal.dag"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        causal.rct.contract.yaml's own test suite already establishes -- not just a one-time manual claim in
        prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "causal.synthetic_control.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "causal.synthetic_control contract")


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_treated_unit_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_TREATED_UNIT"):
            _valid_record(treated_unit="")

    def test_whitespace_only_treated_unit_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_TREATED_UNIT"):
            _valid_record(treated_unit="   ")

    def test_non_string_treated_unit_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_TREATED_UNIT"):
            _valid_record(treated_unit=123)

    def test_empty_donor_pool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_DONOR_POOL"):
            _valid_record(donor_pool=[], weights=[])

    def test_non_list_donor_pool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_DONOR_POOL"):
            _valid_record(donor_pool="state B", weights=[])

    def test_donor_pool_entry_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_DONOR_POOL_ENTRY_EMPTY"):
            _valid_record(donor_pool=["state B", ""])

    def test_empty_fit_quality_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_FIT_QUALITY"):
            _valid_record(fit_quality="")

    def test_empty_weights_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_WEIGHTS_MALFORMED"):
            _valid_record(weights=[])

    def test_weight_entry_missing_donor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_WEIGHTS_MALFORMED"):
            _valid_record(weights=[{"weight": 0.5}])

    def test_weight_entry_non_numeric_weight_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_WEIGHTS_MALFORMED"):
            _valid_record(weights=[{"donor": "state B", "weight": "high"}])

    def test_weight_entry_boolean_weight_is_refused(self):
        """bool is a subclass of int in Python -- must be explicitly excluded, not silently accepted as 0/1."""
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_WEIGHTS_MALFORMED"):
            _valid_record(weights=[{"donor": "state B", "weight": True}])

    def test_empty_post_treatment_gap_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_POST_TREATMENT_GAP"):
            _valid_record(post_treatment_gap="")

    def test_empty_placebo_tests_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_PLACEBO_TESTS"):
            _valid_record(placebo_tests=[])

    def test_non_list_placebo_tests_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_EMPTY_PLACEBO_TESTS"):
            _valid_record(placebo_tests="in-space placebo")

    def test_placebo_test_entry_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_PLACEBO_TEST_ENTRY_EMPTY"):
            _valid_record(placebo_tests=["in-space placebo", ""])


class DonorPoolTooSmallTests(unittest.TestCase):
    """Atlas L625's own '建立加權反事實' (construct a WEIGHTED counterfactual) -- a pool of 0/1 donor cannot
    produce a weighted combination."""

    def test_single_donor_pool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_DONOR_POOL_TOO_SMALL"):
            _valid_record(donor_pool=["state B"], weights=[synthetic_control_weight("state B", 1.0)])

    def test_min_donor_pool_size_constant_is_2(self):
        self.assertEqual(MIN_DONOR_POOL_SIZE, 2)

    def test_exactly_two_donors_is_accepted(self):
        record = _valid_record(donor_pool=["state B", "state C"], weights=[synthetic_control_weight("state B", 0.6), synthetic_control_weight("state C", 0.4)])
        self.assertEqual(len(record["donor_pool"]), 2)


class TreatedUnitInDonorPoolTests(unittest.TestCase):
    """The core 'the treated unit is not its own donor' invariant."""

    def test_exact_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_TREATED_UNIT_IN_DONOR_POOL"):
            _valid_record(treated_unit="state B", donor_pool=["state B", "state C"], weights=[synthetic_control_weight("state B", 0.5), synthetic_control_weight("state C", 0.5)])

    def test_case_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_TREATED_UNIT_IN_DONOR_POOL"):
            _valid_record(treated_unit="State B", donor_pool=["state b", "state C"], weights=[synthetic_control_weight("state b", 0.5), synthetic_control_weight("state C", 0.5)])

    def test_whitespace_insensitive_match_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_TREATED_UNIT_IN_DONOR_POOL"):
            _valid_record(
                treated_unit="state   B", donor_pool=["  state B  ", "state C"], weights=[synthetic_control_weight("  state B  ", 0.5), synthetic_control_weight("state C", 0.5)]
            )

    def test_fullwidth_vs_halfwidth_punctuation_variant_is_still_caught_as_an_echo(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_TREATED_UNIT_IN_DONOR_POOL"):
            _valid_record(
                treated_unit="state A?", donor_pool=["state A？", "state C"], weights=[synthetic_control_weight("state A？", 0.5), synthetic_control_weight("state C", 0.5)]
            )

    def test_genuinely_different_treated_unit_is_accepted(self):
        record = _valid_record(treated_unit="state A", donor_pool=["state B", "state C"], weights=[synthetic_control_weight("state B", 0.5), synthetic_control_weight("state C", 0.5)])
        self.assertNotIn(record["treated_unit"], record["donor_pool"])


class WeightReferencesUnknownDonorTests(unittest.TestCase):
    """The core 'weights are an allocation OVER the donor pool' referential-integrity invariant. Weight VALUES
    are deliberately never checked here -- only WHICH donor a weight names."""

    def test_weight_naming_a_donor_outside_the_pool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_WEIGHT_REFERENCES_UNKNOWN_DONOR"):
            _valid_record(donor_pool=["state B", "state C"], weights=[synthetic_control_weight("state B", 0.5), synthetic_control_weight("state Z", 0.5)])

    def test_all_weight_donors_missing_from_pool_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNTH_WEIGHT_REFERENCES_UNKNOWN_DONOR"):
            _valid_record(donor_pool=["state B", "state C"], weights=[synthetic_control_weight("state X", 0.5), synthetic_control_weight("state Y", 0.5)])

    def test_case_insensitive_donor_match_is_accepted(self):
        record = _valid_record(donor_pool=["State B", "State C"], weights=[synthetic_control_weight("state b", 0.5), synthetic_control_weight("state c", 0.5)])
        self.assertEqual(len(record["weights"]), 2)

    def test_weights_may_be_a_strict_subset_of_donor_pool(self):
        """Not every donor needs a disclosed weight -- e.g. a 0-weight donor may simply be omitted."""
        record = _valid_record(donor_pool=["state B", "state C", "state D"], weights=[synthetic_control_weight("state B", 1.0)])
        self.assertEqual(len(record["weights"]), 1)

    def test_arbitrary_weight_value_is_not_validated(self):
        """Scope boundary: weight magnitude/sign/sum is never checked -- disclosure-only, not solved for."""
        record = _valid_record(donor_pool=["state B", "state C"], weights=[synthetic_control_weight("state B", 999.0), synthetic_control_weight("state C", -50.0)])
        self.assertEqual(record["weights"][0]["weight"], 999.0)
        self.assertEqual(record["weights"][1]["weight"], -50.0)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_synthetic_control_integrity_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_treated_unit(self):
        record = copy.deepcopy(_valid_record())
        record["treated_unit"] = ""
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_undersized_donor_pool(self):
        record = copy.deepcopy(_valid_record())
        record["donor_pool"] = [record["donor_pool"][0]]
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_treated_unit_echoing_a_donor(self):
        record = copy.deepcopy(_valid_record())
        record["treated_unit"] = record["donor_pool"][0]
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_weight_referencing_unknown_donor(self):
        record = copy.deepcopy(_valid_record())
        record["weights"][0]["donor"] = "state ZZ-not-in-pool"
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_placebo_tests(self):
        record = copy.deepcopy(_valid_record())
        record["placebo_tests"] = []
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_synthetic_control_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_synthetic_control_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
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

    def test_evaluate_synthetic_control_gates_returns_two_gates_in_order(self):
        results = evaluate_synthetic_control_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "synthetic_control_integrity"])

    def test_evaluate_synthetic_control_gates_all_pass_on_a_valid_record(self):
        results = evaluate_synthetic_control_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SYNTH-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "causal.synthetic_control")

    def test_synthetic_control_weight_builds_a_donor_weight_pair(self):
        self.assertEqual(synthetic_control_weight("state B", 0.5), {"donor": "state B", "weight": 0.5})

    def test_builder_does_not_leak_extra_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "treated_unit", "donor_pool", "fit_quality", "weights", "post_treatment_gap", "placebo_tests", "provenance"},
        )

    def test_normalize_folds_full_width_punctuation_to_half_width(self):
        self.assertEqual(_normalize("state A?"), _normalize("state A？"))


if __name__ == "__main__":
    unittest.main()

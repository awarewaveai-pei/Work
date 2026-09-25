"""Mutation-style tests for ``epistemic.bayesian_updating`` (F10 epistemic quality family, quantitative pair
member 1/2 built this batch).

THE real invariant (Bayes' rule, ``posterior`` GENUINE_COMPUTE, the zero-denominator undefined-posterior trap)
plus the structural invariants supporting it (real finite [0,1] probabilities excluding bool, non-empty
hypothesis/evidence_ref, id/version/provenance shape), exercised at BOTH layers: construction-time refusal
(``generate_bayesian_update`` raising a specific ``InvariantViolation`` code, or a plain ``TypeError`` for the
GENUINE_COMPUTE smuggling attempt) and independent gate re-derivation
(``evaluate_bayesian_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same batch added (``typed-objects/bayesian-update.schema.yaml``). Includes a hand-computed worked example
(prior=0.3, likelihood_given_true=0.8, likelihood_given_false=0.2 -> posterior=12/19~=0.63157895) and boundary
cases (prior=0, prior=1).
"""

from __future__ import annotations

import copy
import inspect
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.bayesian_updating import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_posterior,
    evaluate_bayesian_content_integrity_gate,
    evaluate_bayesian_gates,
    evaluate_provenance_required_gate,
    generate_bayesian_update,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BAYESIAN_UPDATE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/bayesian-update.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        hypothesis="生產環境延遲上升的根本原因是資料庫連線池耗盡",
        prior=0.3,
        likelihood_given_true=0.8,
        likelihood_given_false=0.2,
        evidence_ref="新觀測：連線池使用率在延遲升高的同一分鐘內衝到 98%",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_update(*, record_id: str = "BAYES-T-001", **overrides: object):
    return generate_bayesian_update(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_update_validates_against_the_real_schema(self):
        self.contracts.validate(BAYESIAN_UPDATE_SCHEMA, _valid_update(), "bayesian update")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, update = live.invoke(METHOD_ID, generate_bayesian_update, "BAYES-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.bayesian_updating.contract.yaml")
        self.assertEqual(update["id"], "BAYES-T-INVOKE")

    def test_empty_catalog_blocks_bayesian_updating_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_update())
        tampered["posterior"] = 1.5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BAYESIAN_UPDATE_SCHEMA, tampered, "tampered update")
        gate = evaluate_bayesian_content_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        update = _valid_update()
        update["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BAYESIAN_UPDATE_SCHEMA, update, "update with a smuggled top-level key")

    def test_schema_rejects_missing_hypothesis(self):
        update = _valid_update()
        del update["hypothesis"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BAYESIAN_UPDATE_SCHEMA, update, "update with hypothesis removed")

    def test_schema_rejects_out_of_range_prior(self):
        update = _valid_update()
        update["prior"] = 1.5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BAYESIAN_UPDATE_SCHEMA, update, "update with out-of-range prior")

    def test_id_is_distinct_from_a_sibling_f10_machine_id(self):
        self.assertEqual(METHOD_ID, "epistemic.bayesian_updating")
        self.assertNotEqual(METHOD_ID, "epistemic.confidence_calibration")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.bayesian_updating.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.bayesian_updating contract")


class GenuineComputeTests(unittest.TestCase):
    """posterior is GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_posterior_parameter(self):
        params = inspect.signature(generate_bayesian_update).parameters
        self.assertNotIn("posterior", params)

    def test_caller_supplied_posterior_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_bayesian_update("BAYES-T-002", **_kwargs(), posterior=0.99)  # type: ignore[call-arg]

    def test_generated_posterior_matches_the_pure_function(self):
        update = _valid_update()
        self.assertEqual(update["posterior"], compute_posterior(0.3, 0.8, 0.2))


class HandComputedWorkedExampleTests(unittest.TestCase):
    """Bayes' rule applied by hand: (likelihood_given_true*prior) / (likelihood_given_true*prior +
    likelihood_given_false*(1-prior))."""

    def test_posterior_matches_the_hand_computed_fraction(self):
        # (0.8*0.3) / (0.8*0.3 + 0.2*0.7) = 0.24 / 0.38 = 12/19 = 0.631578947368... -> round(., 8) = 0.63157895
        self.assertEqual(compute_posterior(0.3, 0.8, 0.2), round(12 / 19, 8))
        self.assertEqual(compute_posterior(0.3, 0.8, 0.2), 0.63157895)

    def test_built_update_carries_the_hand_computed_posterior(self):
        update = _valid_update()
        self.assertEqual(update["posterior"], 0.63157895)


class BoundaryTests(unittest.TestCase):
    def test_prior_zero_forces_posterior_zero_regardless_of_likelihood_given_true(self):
        """prior=0 (hypothesis impossible): denominator = likelihood_given_true*0 + likelihood_given_false*1 =
        likelihood_given_false. As long as likelihood_given_false > 0, posterior = 0/likelihood_given_false = 0,
        no matter how large likelihood_given_true is."""
        self.assertEqual(compute_posterior(0.0, 0.99, 0.5), 0.0)
        self.assertEqual(compute_posterior(0.0, 0.01, 0.5), 0.0)

    def test_prior_one_forces_posterior_one_regardless_of_likelihood_given_false(self):
        """prior=1 (hypothesis certain): denominator = likelihood_given_true*1 + likelihood_given_false*0 =
        likelihood_given_true. As long as likelihood_given_true > 0, posterior = likelihood_given_true/likelihood_given_true = 1."""
        self.assertEqual(compute_posterior(1.0, 0.5, 0.99), 1.0)
        self.assertEqual(compute_posterior(1.0, 0.01, 0.99), 1.0)

    def test_zero_denominator_at_prior_zero_with_zero_likelihood_given_false(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_UNDEFINED_POSTERIOR"):
            compute_posterior(0.0, 0.9, 0.0)

    def test_zero_denominator_at_prior_one_with_zero_likelihood_given_true(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_UNDEFINED_POSTERIOR"):
            compute_posterior(1.0, 0.0, 0.9)

    def test_zero_denominator_with_both_likelihoods_zero_at_an_interior_prior(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_UNDEFINED_POSTERIOR"):
            compute_posterior(0.5, 0.0, 0.0)

    def test_builder_refuses_a_zero_denominator_update(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_UNDEFINED_POSTERIOR"):
            _valid_update(prior=0.0, likelihood_given_true=0.9, likelihood_given_false=0.0)

    def test_zero_denominator_does_not_crash_with_zero_division_error(self):
        try:
            compute_posterior(0.0, 0.9, 0.0)
        except ZeroDivisionError:
            self.fail("compute_posterior raised ZeroDivisionError instead of a fail-closed InvariantViolation")
        except InvariantViolation:
            pass


class ProbabilityValidationTests(unittest.TestCase):
    """prior/likelihood_given_true/likelihood_given_false must each be a genuine finite [0,1] number, bool
    excluded (Python's bool is an int subclass -- isinstance(True, int) is True, the same documented trap
    stakeholders.game_theory's own _is_number_excluding_bool guards against)."""

    def test_prior_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(prior=1.1)

    def test_likelihood_given_true_below_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(likelihood_given_true=-0.1)

    def test_boolean_prior_true_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, int) would silently accept True/False
        as probabilities 1/0. Must be explicitly refused."""
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(prior=True)

    def test_boolean_likelihood_given_false_false_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(likelihood_given_false=False)

    def test_string_prior_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(prior="0.3")

    def test_nan_likelihood_given_true_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(likelihood_given_true=float("nan"))

    def test_infinite_likelihood_given_false_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROBABILITY"):
            _valid_update(likelihood_given_false=float("inf"))

    def test_integer_probabilities_zero_and_one_are_accepted(self):
        update = _valid_update(prior=1, likelihood_given_true=1, likelihood_given_false=0)
        self.assertEqual(update["posterior"], 1.0)

    def test_empty_hypothesis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_HYPOTHESIS"):
            _valid_update(hypothesis="   ")

    def test_empty_evidence_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_EVIDENCE_REF"):
            _valid_update(evidence_ref="")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BAYES-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_ID"):
            _valid_update(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_ID"):
            _valid_update(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_VERSION"):
            generate_bayesian_update("BAYES-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BAYES_INVALID_PROVENANCE"):
            _valid_update(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID update's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_update(self):
        results = evaluate_bayesian_gates(_valid_update(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_wrong_posterior(self):
        record = copy.deepcopy(_valid_update())
        record["posterior"] = 0.5  # true posterior for (0.3, 0.8, 0.2) is 0.63157895
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_a_hand_tampered_record_whose_stored_inputs_denominator_to_zero(self):
        """A hand-tampered record could carry a stored posterior alongside prior/likelihoods that, if recomputed,
        are actually undefined (denominator zero) -- the gate must FAIL, not crash."""
        record = copy.deepcopy(_valid_update())
        record["prior"], record["likelihood_given_true"], record["likelihood_given_false"] = 0.0, 0.9, 0.0
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_prior(self):
        record = copy.deepcopy(_valid_update())
        record["prior"] = True
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_update())
        record["extra_field"] = "smuggled"
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_update())
        del record["evidence_ref"]
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_bayesian_content_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_update())
        record["id"] = "WRONG-001"
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_update())
        record["version"] = 1
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_tolerates_float_noise_within_tolerance(self):
        record = copy.deepcopy(_valid_update())
        record["posterior"] = 0.63157895 + 1e-10  # well within the 1e-9 tolerance
        gate = evaluate_bayesian_content_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_update(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_update())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_bayesian_gates_returns_two_gates_in_order(self):
        results = evaluate_bayesian_gates(_valid_update(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "bayesian_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.bayesian_updating")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        update = _valid_update()
        self.assertEqual(
            set(update.keys()),
            {"id", "version", "generated_by_method", "hypothesis", "prior", "likelihood_given_true", "likelihood_given_false", "posterior", "evidence_ref", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()

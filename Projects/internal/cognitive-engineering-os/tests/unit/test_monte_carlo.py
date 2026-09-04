"""Mutation-style tests for ``computation.monte_carlo`` (eleventh Method Atlas slice, first from the `computation`
family -- the first family this session opened outside Atlas's own F01-F24 numbering).

The compute layer (``ai_lego/compute/montecarlo/simulation.py``) is
checked against known statistical facts: fixed-seed reproducibility,
different-seed divergence, large-N normal-distribution convergence to its
true mean/std_dev, and a success-probability sanity check against a known
50% split. Atlas §22.3's own no-guaranteed-outcome rule (L4153) is proven
at BOTH independent layers, the same discipline
``test_red_team.py``/``test_mcda.py`` already established for their own
table-cited sibling rules.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.montecarlo.simulation import run_simulation
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.computation.monte_carlo import (
    METHOD_ID,
    all_gates_pass,
    assert_no_certainty_claim,
    evaluate_genuine_compute_gate,
    evaluate_monte_carlo_gates,
    evaluate_no_certainty_claim_gate,
    evaluate_sensitivity_disclosed_gate,
    generate_monte_carlo_simulation,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

MONTE_CARLO_SCHEMA = "ai-lego://specs/cognitive/typed-objects/monte-carlo-simulation.schema.yaml"


def _distributions():
    return [
        {"id": "D1", "label": "material", "distribution_type": "normal", "params": {"mean": 50000, "std_dev": 8000}},
        {"id": "D2", "label": "labor", "distribution_type": "triangular", "params": {"min": 20000, "mode": 30000, "max": 45000}},
    ]


def _valid_simulation():
    return generate_monte_carlo_simulation(
        "MC-T-001", _distributions(), 42, 5000, "manually checked -- D1 std_dev dominates the tail", make_provenance("SIMULATED_RESULT", "AI_GENERATED"),
        success_threshold=90000, success_direction="at_most",
    )


class ComputeLayerTests(unittest.TestCase):
    """Real statistical facts, not just 'does it run'."""

    def test_same_seed_reproduces_identical_result(self):
        r1 = run_simulation([{"id": "D1", "label": "x", "distribution_type": "normal", "params": {"mean": 100, "std_dev": 10}}], "sum", 42, 2000)
        r2 = run_simulation([{"id": "D1", "label": "x", "distribution_type": "normal", "params": {"mean": 100, "std_dev": 10}}], "sum", 42, 2000)
        self.assertEqual(r1, r2)

    def test_different_seed_diverges(self):
        r1 = run_simulation([{"id": "D1", "label": "x", "distribution_type": "normal", "params": {"mean": 100, "std_dev": 10}}], "sum", 42, 2000)
        r2 = run_simulation([{"id": "D1", "label": "x", "distribution_type": "normal", "params": {"mean": 100, "std_dev": 10}}], "sum", 99, 2000)
        self.assertNotEqual(r1, r2)

    def test_large_n_normal_distribution_converges_to_true_mean_and_std(self):
        result = run_simulation([{"id": "D1", "label": "x", "distribution_type": "normal", "params": {"mean": 100, "std_dev": 10}}], "sum", 1, 200000)
        self.assertAlmostEqual(result["outcome_distribution"]["mean"], 100, delta=1.0)
        self.assertAlmostEqual(result["outcome_distribution"]["std_dev"], 10, delta=1.0)

    def test_success_probability_matches_known_fifty_fifty_split(self):
        """uniform(0,10), threshold 5 at_most is exactly the median -- probability should be close to 0.5."""
        result = run_simulation([{"id": "D1", "label": "x", "distribution_type": "uniform", "params": {"min": 0, "max": 10}}], "sum", 8, 100000, success_threshold=5.0, success_direction="at_most")
        self.assertAlmostEqual(result["success_probability"], 0.5, delta=0.02)

    def test_success_probability_is_none_when_no_criterion_supplied(self):
        result = run_simulation([{"id": "D1", "label": "x", "distribution_type": "uniform", "params": {"min": 0, "max": 1}}], "sum", 1, 100)
        self.assertIsNone(result["success_probability"])

    def test_percentiles_are_p5_p50_p95_in_order(self):
        result = run_simulation([{"id": "D1", "label": "x", "distribution_type": "uniform", "params": {"min": 0, "max": 1}}], "sum", 1, 5000)
        ps = [entry["p"] for entry in result["outcome_distribution"]["percentiles"]]
        self.assertEqual(ps, [5, 50, 95])
        values = [entry["value"] for entry in result["outcome_distribution"]["percentiles"]]
        self.assertLess(values[0], values[1])
        self.assertLess(values[1], values[2])

    def test_unsupported_combine_mode_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_UNSUPPORTED_COMBINE_MODE"):
            run_simulation([{"id": "D1", "label": "x", "distribution_type": "uniform", "params": {"min": 0, "max": 1}}], "product", 1, 100)

    def test_no_input_distributions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_NO_INPUT_DISTRIBUTIONS"):
            run_simulation([], "sum", 1, 100)

    def test_too_few_runs_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_TOO_FEW_RUNS"):
            run_simulation([{"id": "D1", "label": "x", "distribution_type": "uniform", "params": {"min": 0, "max": 1}}], "sum", 1, 1)

    def test_incomplete_success_criterion_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_SUCCESS_CRITERION_INCOMPLETE"):
            run_simulation([{"id": "D1", "label": "x", "distribution_type": "uniform", "params": {"min": 0, "max": 1}}], "sum", 1, 100, success_threshold=5.0)

    def test_unknown_distribution_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_UNKNOWN_DISTRIBUTION_TYPE"):
            run_simulation([{"id": "D1", "label": "x", "distribution_type": "poisson", "params": {}}], "sum", 1, 100)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_monte_carlo_simulation_validates_against_the_real_schema(self):
        self.contracts.validate(MONTE_CARLO_SCHEMA, _valid_simulation(), "monte carlo simulation")

    def test_no_success_criterion_run_is_still_a_valid_record(self):
        simulation = generate_monte_carlo_simulation("MC-T-002", _distributions(), 7, 5000, "single-input sanity check", make_provenance("SIMULATED_RESULT", "AI_GENERATED"))
        self.assertIsNone(simulation["success_probability"])
        self.contracts.validate(MONTE_CARLO_SCHEMA, simulation, "monte carlo simulation, no success criterion")

    def test_empty_sensitivity_notes_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_SENSITIVITY_NOTES_EMPTY"):
            generate_monte_carlo_simulation("MC-T-003", _distributions(), 1, 100, "   ", make_provenance("SIMULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_monte_carlo_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class NoCertaintyClaimTests(unittest.TestCase):
    """Atlas §22.3 L4153: 'Monte Carlo may not directly output Guaranteed Outcome.' Proven at both independent
    layers, same discipline test_red_team.py/test_mcda.py's own equivalent test classes already established."""

    def test_top_level_certainty_key_is_refused_at_construction(self):
        simulation = _valid_simulation()
        simulation["guaranteed"] = True
        with self.assertRaisesRegex(InvariantViolation, "MONTECARLO_CERTAINTY_CLAIM_FORBIDDEN"):
            assert_no_certainty_claim(simulation)

    def test_clean_record_passes_the_certainty_check(self):
        assert_no_certainty_claim(_valid_simulation())  # must not raise

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_simulation()
        tampered["certain"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(MONTE_CARLO_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_reuses_assert_no_certainty_claim_and_fails_on_a_tampered_record(self):
        simulation = _valid_simulation()
        simulation["outcome_is_certain"] = True
        gate = evaluate_no_certainty_claim_gate(simulation, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GateMutationTests(unittest.TestCase):
    def test_valid_simulation_passes_all_four_gates(self):
        results = evaluate_monte_carlo_gates(_valid_simulation(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "sensitivity_disclosed", "no_certainty_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_genuine_compute_gate_fails_when_epistemic_type_is_calculated_result_not_simulated_result(self):
        """Mutation-style: a record mislabeled with the wrong genuine-compute epistemic_type must be caught --
        this is the real reason this gate is NOT a reuse of evaluate_statistical_gate (which hardcodes
        CALCULATED_RESULT and would wrongly PASS this same mutation for the wrong reason)."""
        simulation = _valid_simulation()
        simulation["provenance"] = make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        gate = evaluate_genuine_compute_gate(simulation, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_blank_sensitivity_notes_fails_the_disclosure_gate(self):
        simulation = _valid_simulation()
        simulation["sensitivity_notes"] = "   "
        gate = evaluate_sensitivity_disclosed_gate(simulation, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()

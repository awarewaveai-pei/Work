import unittest

from ai_lego.compute.statistics.reliability import bootstrap_kappa_ci, cohens_kappa, interrater_reliability_result, landis_koch_band
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.synthetic_fixtures import expanded_synthetic_coder_judgments


class ReliabilityTests(unittest.TestCase):
    def test_perfect_and_opposite_agreement_extremes(self):
        self.assertAlmostEqual(cohens_kappa(["a", "a", "b", "b"], ["a", "a", "b", "b"]), 1.0)
        self.assertAlmostEqual(cohens_kappa(["a", "a", "b", "b"], ["b", "b", "a", "a"]), -1.0)

    def test_invalid_inputs_are_rejected(self):
        with self.assertRaisesRegex(InvariantViolation, "KAPPA_INPUT_INVALID"):
            cohens_kappa(["a"], ["a", "b"])
        with self.assertRaisesRegex(InvariantViolation, "KAPPA_INPUT_INVALID"):
            cohens_kappa([], [])
        with self.assertRaisesRegex(InvariantViolation, "KAPPA_UNDEFINED"):
            cohens_kappa(["a", "a"], ["a", "a"])

    def test_bootstrap_is_deterministic_for_a_seed(self):
        coder_a, coder_b = expanded_synthetic_coder_judgments()
        self.assertEqual(bootstrap_kappa_ci(coder_a, coder_b, seed=7), bootstrap_kappa_ci(coder_a, coder_b, seed=7))

    def test_expanded_fixture_kappa_and_interval(self):
        coder_a, coder_b = expanded_synthetic_coder_judgments()
        self.assertAlmostEqual(cohens_kappa(coder_a, coder_b), 0.75)
        low, high = bootstrap_kappa_ci(coder_a, coder_b)
        self.assertLess(low, 0.75)
        self.assertGreater(high, 0.75)
        self.assertLess(high - low, 0.5)

    def test_landis_koch_bands(self):
        self.assertEqual(landis_koch_band(-0.1), "poor")
        self.assertEqual(landis_koch_band(0.0), "slight")
        self.assertEqual(landis_koch_band(0.75), "substantial")
        self.assertEqual(landis_koch_band(1.0), "almost_perfect")

    def test_result_record_is_a_calculated_result_with_pending_threshold(self):
        coder_a, coder_b = expanded_synthetic_coder_judgments()
        result = interrater_reliability_result(coder_a, coder_b)
        self.assertEqual(result["provenance"]["epistemic_type"], "CALCULATED_RESULT")
        self.assertEqual(result["engine"], "local_python_deterministic_compute")
        self.assertTrue(result["computation_provenance_ref"].startswith("ai_lego.compute."))
        self.assertEqual(result["operator_threshold_status"], "OPERATOR_SET_PENDING")
        self.assertEqual(result["coding_unit_count"], 48)
        self.assertEqual(result["coding_labels"], ["boundary", "fatigue"])


if __name__ == "__main__":
    unittest.main()

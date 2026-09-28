"""pricing.py: the longest prefix wins, the env can extend or break the table, NT$ is rounded, an unknown model has no figure."""

import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gateway.pricing import DEFAULT_USD_TWD, cost_twd, cost_usd, usd_twd


class PricingTests(unittest.TestCase):
    def test_the_longest_prefix_wins_and_an_unknown_model_has_no_figure(self):
        self.assertEqual(cost_usd("claude-sonnet-5-20261001", 1_000_000, 0, {}), 2.0)
        self.assertEqual(cost_usd("claude-sonnet-4-6-20260301", 0, 1_000_000, {}), 15.0)    # not the claude-sonnet-4 row
        self.assertEqual(cost_usd("claude-opus-4-1-20250805", 1_000_000, 0, {}), 15.0)      # Opus 4.1, not the 4.5+ row
        self.assertEqual(cost_usd("claude-opus-4-20250514", 1_000_000, 0, {}), 15.0)
        self.assertEqual(cost_usd("claude-opus-4-5-20251101", 1_000_000, 0, {}), 5.0)
        self.assertEqual(cost_usd("claude-opus-5-5", 0, 1_000_000, {}), 20.0)            # Opus 5.5 is not the Opus 5 row
        self.assertEqual(cost_usd("claude-opus-5", 0, 1_000_000, {}), 25.0)
        self.assertEqual(cost_usd("claude-fable-5-1", 1_000_000, 0, {}), 10.0)
        self.assertIsNone(cost_usd("test-interpret-model", 10, 10, {}))

    def test_the_env_extends_the_table_and_a_bad_env_is_refused_not_guessed(self):
        self.assertEqual(cost_usd("my-model", 1_000_000, 1_000_000, {"COGNITIVE_OS_AI_PRICES_JSON": '{"my-model": [1, 2]}'}), 3.0)
        with self.assertRaises(InvariantViolation): cost_usd("x", 1, 1, {"COGNITIVE_OS_AI_PRICES_JSON": "{bad"})
        with self.assertRaises(InvariantViolation): cost_usd("x", 1, 1, {"COGNITIVE_OS_AI_PRICES_JSON": '{"m": [1]}'})
        with self.assertRaises(InvariantViolation): usd_twd({"COGNITIVE_OS_USD_TWD": "abc"})
        with self.assertRaises(InvariantViolation): usd_twd({"COGNITIVE_OS_USD_TWD": "-1"})

    def test_twd_uses_the_rate_and_rounds_to_cents(self):
        self.assertEqual(usd_twd({}), DEFAULT_USD_TWD)
        self.assertEqual(cost_twd("claude-sonnet-5", 10_000, 5_000, {}), round((0.02 + 0.05) * 32, 2))
        self.assertEqual(cost_twd("claude-sonnet-5", 10_000, 5_000, {"COGNITIVE_OS_USD_TWD": "30"}), 2.1)
        self.assertIsNone(cost_twd("unknown", 1, 1, {}))
        self.assertEqual(cost_usd("claude-sonnet-5", -5, -5, {}), 0.0)   # never negative


if __name__ == "__main__":
    unittest.main()

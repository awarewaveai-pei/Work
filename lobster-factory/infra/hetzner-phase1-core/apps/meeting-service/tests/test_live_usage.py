"""Port of the `costs` test in OwnVoice Meet catalog.rs, plus the per-day tally of usage.rs."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from lib.live.usage import Tally, Usage, cost_usd  # noqa: E402


class UsageTests(unittest.TestCase):
    def test_costs(self):
        self.assertAlmostEqual(cost_usd("gemini-live", 3600.0, 0, 0, 0), 0.54, delta=1e-9)
        # 180k input + 30k output = $0.033, the estimate shown to the user
        self.assertAlmostEqual(cost_usd("claude-haiku-5-5", 0.0, 180_000, 0, 30_000), 0.033, delta=1e-9)
        self.assertEqual(cost_usd("local-whisper", 3600.0, 0, 0, 0), 0.0)
        self.assertAlmostEqual(cost_usd("gemini-3.5-flash-lite", 0.0, 1_000_000, 1_000_000, 1_000_000), 2.83, delta=1e-9)
        self.assertEqual(cost_usd("not-a-model", 60.0, 1, 1, 1), 0.0)

    def test_today_totals_in_twd_and_survive_a_restart(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "usage.json")
            u = Usage(path, today_fn=lambda: "2026-11-24")
            u.add_audio("gemini-live", 3600.0)
            u.add_tokens("claude-haiku-5-5", Tally(early=1, input=180_000, output=30_000))
            u.add_tokens("claude-haiku-5-5", Tally(cache_write=0))
            u.flush()
            for usage in (u, Usage(path, today_fn=lambda: "2026-11-24")):
                t = usage.today()
                self.assertEqual([m["id"] for m in t["models"]], ["gemini-live", "claude-haiku-5-5"])
                haiku = t["models"][1]
                self.assertEqual((haiku["requests"], haiku["early"], haiku["input"]), (2, 1, 180_000))
                self.assertEqual((t["models"][0]["twd"], haiku["twd"]), (17.3, 1.1))
                # total from the unrounded USD (0.573 * 32), not the sum of the rounded rows
                self.assertEqual(t["total_twd"], 18.3)
            self.assertEqual(Usage(path, today_fn=lambda: "2026-11-25").today()["models"], [])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ai_lego.apps.cli.run_life_decision_slice import run_life_decision


class LifeDecisionSliceTests(unittest.TestCase):
    def test_three_method_chain_is_gated_and_journaled(self):
        with tempfile.TemporaryDirectory() as directory:
            report = run_life_decision(runtime_dir=Path(directory))
        self.assertEqual(report["status"], "PASS")
        self.assertEqual([step["ref"] for step in report["workflow"]["steps"]], [
            "framing.problem_statement", "strategy.swot", "decision.weighted_decision_matrix"
        ])
        self.assertTrue(all(gate["status"] == "PASS" for gates in report["gates"].values() for gate in gates))
        self.assertEqual(report["workflow"]["status"], "SUCCEEDED")


if __name__ == "__main__":
    unittest.main()

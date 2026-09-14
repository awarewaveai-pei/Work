from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ai_lego.apps.cli.run_recipe import run_recipe
from tests.unit.test_api_main import business_planning_strategy_source


class GenericRecipeCliTests(unittest.TestCase):
    def test_runs_a_method_recipe_from_caller_owned_json_source(self):
        with tempfile.TemporaryDirectory() as directory:
            report = run_recipe("business-planning-strategy-v1", business_planning_strategy_source(), Path(directory))

        self.assertEqual(report["status"], "PASS")
        self.assertEqual(len(report["workflow"]["steps"]), 7)
        self.assertEqual(report["workflow"]["steps"][0]["ref"], "framing.problem_statement")
        self.assertEqual(report["workflow"]["workflow_gates"][0]["gate_id"], "workflow_execution_integrity")

    def test_refuses_capability_recipe_instead_of_silently_dropping_the_node(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "CLI_RECIPE_CAPABILITY_UNSUPPORTED"):
                run_recipe("edd-literature-search-v1", {"research_question": "q"}, Path(directory))

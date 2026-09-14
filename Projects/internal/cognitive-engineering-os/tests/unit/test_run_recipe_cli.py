from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ai_lego.apps.cli.run_recipe import run_recipe
from tests.unit.test_api_main import business_planning_strategy_source


class GenericRecipeCliTests(unittest.TestCase):
    def test_runs_registered_offline_capability_recipe_from_caller_owned_json(self):
        with tempfile.TemporaryDirectory() as directory:
            report = run_recipe(
                "edd-literature-search-v1",
                {"research_question": "How do people describe work boundaries?"},
                Path(directory),
            )

        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["capability_resolution"]["blocked"], None)
        step = report["workflow"]["steps"][0]
        self.assertEqual(step["node_kind"], "capability")
        self.assertEqual(step["ref"], "literature_search")
        self.assertEqual(step["output"]["literature"]["retrieval"]["status_code"], "OFFLINE_SOURCE_STALE")

    def test_runs_edd_evidence_recipe_through_the_same_generic_runtime(self):
        source = {
            "assumptions": {
                "record_id": "AMAP-CLI-001",
                "mapped_assumptions": [{"assumption_id": "ASM-1", "impact": "HIGH", "uncertainty": "HIGH"}],
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
            },
            "evidence_matrix": {
                "record_id": "EVIDMATRIX-CLI-001",
                "claims": [{"claim_id": "C-1", "statement": "The intervention may improve reflective practice", "provenance": {"epistemic_type": "HUMAN_OPINION", "authorship_state": "HUMAN_ORIGINAL", "locked": None}}],
                "evidence_items": [{"evidence_id": "E-1", "content": "Interview observation", "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "SOURCE_QUOTATION", "locked": None}}],
                "links": [{"claim_id": "C-1", "evidence_id": "E-1", "relation": "SUPPORTS"}],
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
            },
            "argument": {
                "record_id": "TOULMIN-CLI-001",
                "claim": "The intervention is worth further study",
                "grounds": ["Interview observation suggests improved reflection"],
                "warrant": "Observed improvement is a reason to conduct a structured follow-up",
                "backing": ["The evidence matrix links the observation to the claim"],
                "qualifier": "provisionally",
                "rebuttal": "A larger sample may not reproduce the observation",
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            report = run_recipe("edd-research-evidence-v1", source, Path(directory))

        self.assertEqual(report["status"], "PASS")
        self.assertEqual(
            [step["ref"] for step in report["workflow"]["steps"]],
            ["epistemic.assumption_mapping", "epistemic.evidence_matrix", "epistemic.toulmin_model"],
        )
        self.assertEqual(report["workflow"]["workflow_gates"][0]["gate_id"], "workflow_execution_integrity")

    def test_runs_a_method_recipe_from_caller_owned_json_source(self):
        with tempfile.TemporaryDirectory() as directory:
            report = run_recipe("business-planning-strategy-v1", business_planning_strategy_source(), Path(directory))

        self.assertEqual(report["status"], "PASS")
        self.assertEqual(len(report["workflow"]["steps"]), 7)
        self.assertEqual(report["workflow"]["steps"][0]["ref"], "framing.problem_statement")
        self.assertEqual(report["workflow"]["workflow_gates"][0]["gate_id"], "workflow_execution_integrity")

    def test_refuses_unresolved_required_capability_instead_of_silently_dropping_the_node(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "CLI_CAPABILITY_PLAN_NOT_EXECUTABLE"):
                run_recipe("db-migration-expand-contract", {}, Path(directory))

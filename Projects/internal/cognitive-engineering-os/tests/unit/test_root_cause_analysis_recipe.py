"""``root-cause-analysis-v1`` -- problem statement -> fishbone -> 5 Whys + Pareto, run end to end through the API.

The fishbone's own CauseHypothesisSet is what the 5 Whys and Pareto steps receive (outputs.fishbone), so a cause id
the fishbone never listed is refused by those builders, not silently accepted."""

from __future__ import annotations

import unittest

from ai_lego.core.domain.provenance import make_provenance
from tests.unit.test_api_main import ApiTestCase

EVIDENCE = make_provenance("EVIDENCE", "HUMAN_APPROVED")
HYPOTHESIS = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def rca_source() -> dict:
    return {
        "problem": {"problem_id": "PROB-RCA-001", "current_state": "工作坊參與者第 4 次之後主動分享的人數掉到 2 人", "expected_state": "每次至少 6 人主動分享",
                    "gap": "從第 4 次開始少了 4 人，三期都一樣", "status": "validated", "provenance": EVIDENCE},
        "fishbone": {"chs_id": "CHS-RCA-001", "hypotheses": [
            {"id": "CHS-RCA-001-H1", "statement": "帶領者先解讀作品，參與者等標準答案", "category": "Process", "provenance": EVIDENCE, "supporting_evidence_refs": ["E-601"]},
            {"id": "CHS-RCA-001-H2", "statement": "分享時間被說明壓縮到剩 10 分鐘", "category": "Process", "provenance": HYPOTHESIS},
            {"id": "CHS-RCA-001-H3", "statement": "場地座位排成教室型", "category": "Environment", "provenance": HYPOTHESIS},
        ]},
        "five_whys": {"validation_id": "FWV-RCA-001", "target_hypothesis_id": "CHS-RCA-001-H1", "provenance": EVIDENCE,
                      "why_chain": [
                          {"step": 1, "question": "為何參與者不主動分享？", "answer": "他們說怕講錯，等帶領者說作品是什麼意思", "provenance": EVIDENCE, "supporting_evidence_refs": ["E-601"]},
                          {"step": 2, "question": "為何會等帶領者的意思？", "answer": "前三次都是帶領者先講解作品", "provenance": EVIDENCE, "supporting_evidence_refs": ["E-602"]},
                          {"step": 3, "question": "為何帶領者先講解？", "answer": "流程表把「作品解讀」排在分享之前", "provenance": EVIDENCE, "supporting_evidence_refs": ["E-602"]},
                      ],
                      "stop_conditions_met": ["CONTROLLABLE_BY_ORGANIZATION", "CLEAR_EVIDENCE_TO_VERIFY", "FOUND_SYSTEM_PROCESS_MECHANISM"]},
        "pareto": {"analysis_id": "PA-RCA-001", "metric_name": "沉默場次數", "vital_few_threshold_percent": 80.0, "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
                   "dataset": [{"hypothesis_id": "CHS-RCA-001-H1", "metric_value": 9}, {"hypothesis_id": "CHS-RCA-001-H2", "metric_value": 3}, {"hypothesis_id": "CHS-RCA-001-H3", "metric_value": 1}]},
    }


class RootCauseAnalysisRecipeTests(ApiTestCase):
    def _run(self, source: dict, run_id: str) -> dict:
        self._login()
        response = self.client.post("/recipes/root-cause-analysis-v1/run", json={"source": source, "run_id": run_id})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_recipe_runs_all_four_steps_on_one_hypothesis_set(self):
        payload = self._run(rca_source(), "api-rca-test")
        self.assertEqual(payload["status"], "PASS", payload)
        self.assertEqual([s["ref"] for s in payload["workflow"]["steps"]], ["framing.problem_statement", "root_cause.fishbone", "root_cause.five_whys", "root_cause.pareto"])
        outputs = payload["workflow"]["context"]["outputs"]
        self.assertEqual(outputs["fishbone"]["problem_statement_ref"], "PROB-RCA-001")
        self.assertEqual(outputs["pareto"]["ranking"][0]["hypothesis_id"], "CHS-RCA-001-H1")
        self.assertTrue(all(g["status"] == "PASS" for g in payload["workflow_gates"]), payload["workflow_gates"])

    def test_a_draft_problem_statement_stops_the_chain_at_the_fishbone(self):
        source = rca_source()
        source["problem"]["status"] = "draft"
        payload = self._run(source, "api-rca-draft")
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("FISHBONE_PRECONDITION_FAILED", payload["workflow"]["steps"][1]["error"])

    def test_a_cause_the_fishbone_never_listed_is_refused_by_pareto(self):
        source = rca_source()
        source["pareto"]["dataset"][2]["hypothesis_id"] = "CHS-RCA-001-H9"
        payload = self._run(source, "api-rca-unknown-cause")
        self.assertEqual(payload["status"], "FAILED")
        self.assertIn("CHS-RCA-001-H9", payload["workflow"]["steps"][3]["error"])


if __name__ == "__main__":
    unittest.main()

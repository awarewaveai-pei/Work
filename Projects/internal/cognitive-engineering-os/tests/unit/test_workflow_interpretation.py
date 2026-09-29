import json
import unittest

from ai_lego.modules.research.workflow_interpretation import run_workflow_interpretation


class _Provider:
    model = "fake"

    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []

    def complete(self, system, user, *, max_tokens):
        self.calls.append(user)
        payload = self.payloads.pop(0)
        return type("Completion", (), {"text": json.dumps(payload), "model": self.model, "input_tokens": 3, "output_tokens": 4})()


class _Contracts:
    def __init__(self):
        self.validated = []

    def validate(self, reference, instance, label):
        self.validated.append((reference, instance, label))


def _stations():
    return [
        {"station_index": 0, "method_id": "systems.iceberg_model", "interpretation": {"interpretation_id": "INTERP-1", "findings": [{"confidence": {"level": "high"}, "citations": ["r/visible"]}], "summary": "一站"}, "manifest": [{"id": "r/visible"}], "judgment": {"stance": "agree", "text": "我同意"}},
        {"station_index": 1, "method_id": "decision.eisenhower_matrix", "interpretation": {"interpretation_id": "INTERP-2", "findings": [{"confidence": {"level": "low"}, "citations": ["r/urgent"]}], "summary": "二站"}, "manifest": [{"id": "r/urgent"}], "judgment": None},
    ]


def _answer(**overrides):
    answer = {"summary": "跨站摘要", "final_recommendation": {"text": "先處理急件", "citations": ["r/urgent"]}, "revision_conditions": [{"text": "出現新證據", "would_change": "改排優先序"}], "stations": [{"station_index": 0, "one_liner": "站一"}, {"station_index": 1, "one_liner": "站二"}]}
    answer.update(overrides)
    return answer


class WorkflowInterpretationTests(unittest.TestCase):
    def test_three_stations_success_and_cross_station_citations(self):
        stations = _stations()
        stations.append({"station_index": 2, "method_id": "research.search", "interpretation": {"interpretation_id": "INTERP-3", "findings": [{"confidence": {"level": "mid"}, "citations": ["r/context"]}]}, "manifest": [{"id": "r/context"}], "judgment": None})
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=stations, provider=_Provider([_answer()]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["citations_all"], ["r/visible", "r/urgent", "r/context"])
        self.assertEqual(result["interpretation"]["gates"]["citation_integrity"]["status"], "PASS")

    def test_model_judgment_is_overwritten_by_human_record(self):
        answer = _answer(stations=[{"station_index": 0, "one_liner": "站一", "judgment": {"stance": "disagree", "text": "模型說的"}}, {"station_index": 1, "one_liner": "站二", "judgment": {"stance": "agree", "text": "模型說的"}}])
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([answer]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["stations"][0]["judgment"], _stations()[0]["judgment"])
        self.assertIsNone(result["interpretation"]["stations"][1]["judgment"])

    def test_cross_station_manifest_is_not_last_station_only(self):
        answer = _answer(final_recommendation={"text": "摘要", "citations": ["r/visible"]})
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([answer]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["gates"]["citation_integrity"]["status"], "PASS")

    def test_missing_station_fails_gate(self):
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([_answer(stations=[{"station_index": 0, "one_liner": "站一"}])]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["gates"]["stations_complete"]["status"], "FAIL")

    def test_zero_revision_conditions_fails_gate(self):
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([_answer(revision_conditions=[])]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["gates"]["no_preset_conclusion"]["status"], "FAIL")

    def test_preset_conclusion_key_fails_gate(self):
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([_answer(conclusion="the answer")]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["gates"]["no_preset_conclusion"]["status"], "FAIL")

    def test_cross_station_bad_citation_is_repaired_then_fails(self):
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([_answer(final_recommendation={"text": "摘要", "citations": ["r/not-there"]})]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["gates"]["citation_integrity"]["status"], "FAIL")

    def test_token_usage_accumulates_across_repair(self):
        provider = _Provider([_answer(final_recommendation={"text": "摘要", "citations": []}), _answer()])
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=provider, schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(result["interpretation"]["usage_total"], {"input_tokens": 6, "output_tokens": 8})
        self.assertEqual(len(provider.calls), 2)

    def test_solution_is_null(self):
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([_answer()]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertIsNone(result["interpretation"]["solution"])

    def test_confidence_is_lowest_station_confidence(self):
        result = run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=_stations(), provider=_Provider([_answer()]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual([station["confidence"] for station in result["interpretation"]["stations"]], ["high", "low"])

    def test_input_stations_are_not_mutated(self):
        stations = _stations()
        before = json.dumps(stations, sort_keys=True)
        run_workflow_interpretation(workflow_id="WF-1", run_or_chain_id="RUN-1", stations=stations, provider=_Provider([_answer()]), schema_contracts=_Contracts(), interpretation_id="WFI-1")
        self.assertEqual(json.dumps(stations, sort_keys=True), before)


if __name__ == "__main__":
    unittest.main()

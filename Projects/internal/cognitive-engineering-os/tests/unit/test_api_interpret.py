"""HTTP contract tests for the project-bound MethodInterpretation lifecycle."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain.project import project_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego import resolve_spec_root
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.ai_gateway.provider import AiCompletion
from tests.unit.test_api_main import ApiTestCase


class FakeInterpretProvider:
    model = "test-interpret-model"

    def __init__(self) -> None:
        self.calls = 0

    def complete(self, system: str, user: str, *, max_tokens: int) -> AiCompletion:
        self.calls += 1
        if "METHOD: decision.eisenhower_matrix" in user:
            text = '{"visual":{"bindings":{"items":"r/tasks","x":"r/tasks/0/urgency","y":"r/tasks/0/importance","x_threshold":"r/urgency_threshold","y_threshold":"r/importance_threshold"}},"findings":[{"id":"F1","title":"Priority task","text":"One task is urgent and important.","citations":["r/tasks/0/urgency"],"confidence":{"level":"mid","reason":"one classified task"}}],"next_methods":[]}'
        else:
            text = '{"visual":{"bindings":{"levels":[{"label":"r/events/0","path":"r/events/0"}]}},"findings":[{"id":"F1","title":"Recurring event","text":"Release incidents recur.","citations":["r/events/0"],"confidence":{"level":"mid","reason":"one observed event"}}],"next_methods":["systems.leverage_point_analysis"]}'
        return AiCompletion(
            text=text,
            model=self.model,
            input_tokens=11,
            output_tokens=23,
        )


class InterpretApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._project_tmpdir = tempfile.TemporaryDirectory()
        self.repo = ProjectSourceRepository(Path(self._project_tmpdir.name) / "projects.sqlite3")
        self.artifacts = JsonArtifactStore(TenantScopedCas(Path(self._project_tmpdir.name) / "artifact-cas"))
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        api_main.app.dependency_overrides[api_main.get_artifact_store] = lambda: self.artifacts
        self.provider = FakeInterpretProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.project_id = str(uuid.uuid4())
        self.workspace_id = self.tenant["tenant_id"]
        store = api_main.app.dependency_overrides[api_main.get_store]()
        workspaces = store.list_workspaces(self.tenant["tenant_id"])
        self.workspace_id = workspaces[0]["workspace_id"]
        self.repo.create_project(project_record(
            self.project_id,
            self.tenant["tenant_id"],
            self.workspace_id,
            "Interpretation test project",
            "Exercise the method interpretation API.",
            "Confidential",
            self.identity["identity_id"],
            "2026-09-25T00:00:00Z",
        ))

    def tearDown(self):
        self._project_tmpdir.cleanup()
        super().tearDown()

    def test_interpret_get_judge_and_audit(self):
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch:
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["release incidents"],
                "patterns": ["weekly spike"],
                "structures": [],
                "mental_models": [],
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["status"], "PENDING")
        interpretation_id = response.json()["interpretation_id"]
        self.assertEqual(self.client.get(f"/interpretations/{interpretation_id}").json()["status"], "PENDING")
        api_main._run_interpretation(**launch.call_args.kwargs)
        fetched = self.client.get(f"/interpretations/{interpretation_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["status"], "DONE")
        self.assertIn("r/events/0", {item["id"] for item in fetched.json()["manifest"]})
        self.assertEqual(fetched.json()["result"]["visual"]["kind"], "layered")
        SchemaContracts(resolve_spec_root()).validate(
            "ai-lego://specs/cognitive/typed-objects/method-interpretation.schema.yaml",
            fetched.json()["result"],
            "MethodInterpretation API result",
        )
        judged = self.client.post(f"/interpretations/{interpretation_id}/judgment", json={"stance": "agree", "text": "verified"})
        self.assertEqual(judged.status_code, 200, judged.text)
        self.assertEqual(self.client.get(f"/interpretations/{interpretation_id}").json()["judgment"], {"stance": "agree", "text": "verified"})
        rejected = self.client.post(f"/interpretations/{interpretation_id}/judgment", json={"stance": "accept", "text": "old vocabulary"})
        self.assertEqual(rejected.status_code, 400, rejected.text)
        events = self.repo.list_events(self.tenant["tenant_id"], f"project:{self.project_id}")
        self.assertEqual([event["event_type"] for event in events][-1], "InterpretationJudged")
        self.assertEqual(api_main.app.dependency_overrides[api_main.get_store]().ai_usage_totals(self.tenant["tenant_id"])["output_tokens"], 23)

    def test_result_page_sections_survive_the_endpoint_numbers_from_the_record_pass(self):
        """The sections of schema 1.1.0 go through the real endpoint and worker; numbers the record states are accepted."""
        import json as _json
        answer = {
            "findings": [{"id": "F1", "title": "流程", "text": "先講讓分享變少。", "citations": ["r/structures/0"], "confidence": {"level": "mid", "reason": "一句紀錄"}}],
            "visual": {"kind": "layered", "bindings": {"levels": [{"label": "事件", "path": "r/events"}]}}, "next_methods": [], "next_steps": [],
            "summary": "從第 1 次 6 位到第 6 次 2 位。",
            "loop": {"kind": "reinforcing", "name": "等答案", "reading": "90 分鐘裡說明佔 35 分鐘，越轉越安靜。",
                     "nodes": [{"id": "a", "text": "說明佔 35 分鐘", "citations": ["r/structures/0"]}, {"id": "b", "text": "只剩 2 位分享", "citations": ["r/events/0"]}],
                     "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]},
            "trend": {"reading": "6 位降到 2 位", "series": [{"name": "主動分享", "unit": "位", "points": [{"label": "第 1 次", "value": 6, "citation": "r/events/0"}, {"label": "第 6 次", "value": 2, "citation": "r/events/0"}]}]},
        }

        class Detailed:
            model = "test-detail-model"
            def complete(self, system, user, *, max_tokens):
                return AiCompletion(text=_json.dumps(answer, ensure_ascii=False), model=self.model, input_tokens=5, output_tokens=7)

        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: Detailed()
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch:
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["第 6 次 session，8 位只有 2 位主動分享；第 1 次是 6 位"],
                "patterns": ["每期第 4 次起下降"],
                "structures": ["帶領者先講，90 分鐘裡說明佔 35 分鐘"],
                "mental_models": ["參與者需要專家"],
            })
        self.assertEqual(response.status_code, 202, response.text)
        api_main._run_interpretation(**launch.call_args.kwargs)
        fetched = self.client.get(f"/interpretations/{response.json()['interpretation_id']}").json()
        self.assertEqual(fetched["status"], "DONE", fetched)
        detail = [gate for gate in fetched["gate_results"] if gate["gate_id"] == "detail_integrity"][0]
        self.assertEqual(detail["status"], "PASS")
        self.assertEqual(detail["evidence"]["dropped"], {})
        for key in ("summary", "loop", "trend"):
            self.assertIn(key, fetched["result"])

    def test_a_project_lists_its_analyses_and_each_one_opens(self):
        """GET /projects says what each Project holds; GET /projects/{id}/analyses lists its analyses newest first with the
        tool, status, times and judgment; GET /interpretations/{id} names the tool and when it finished."""
        runs = []
        for event in ("release incidents", "deploy freezes", "on-call burnout"):
            with patch("ai_lego.apps.api.main._launch_interpretation") as launch:
                response = self.client.post("/methods/systems.iceberg_model/interpret", json={"project_id": self.project_id, "events": [event], "patterns": [], "structures": [], "mental_models": []})
            self.assertEqual(response.status_code, 202, response.text)
            runs.append((response.json()["interpretation_id"], launch.call_args.kwargs))
        api_main._run_interpretation(**runs[0][1])
        with patch.object(self.provider, "complete", return_value=AiCompletion(text="bad JSON", model=self.provider.model, input_tokens=1, output_tokens=1)):
            api_main._run_interpretation(**runs[1][1])
        self.assertEqual(self.client.post(f"/interpretations/{runs[0][0]}/judgment", json={"stance": "partial", "text": ""}).status_code, 200)
        listed = self.client.get(f"/projects/{self.project_id}/analyses")
        self.assertEqual(listed.status_code, 200, listed.text)
        analyses = listed.json()
        self.assertEqual([(item["interpretation_id"], item["status"], item["method_id"]) for item in analyses],
                         [(runs[2][0], "PENDING", "systems.iceberg_model"), (runs[1][0], "FAILED", "systems.iceberg_model"), (runs[0][0], "DONE", "systems.iceberg_model")])
        self.assertEqual((analyses[2]["judgment"], analyses[2]["error"], analyses[0]["finished_at"]), ("partial", None, None))
        self.assertIn("NOT_JSON", analyses[1]["error"])
        self.assertLessEqual(analyses[2]["requested_at"], analyses[2]["finished_at"])
        for item in analyses:   # the list and the single read agree
            self.assertEqual(self.client.get(f"/interpretations/{item['interpretation_id']}").json()["status"], item["status"])
        project = [item for item in self.client.get("/projects").json() if item["project_id"] == self.project_id][0]
        self.assertEqual((project["analysis_count"], project["methods"], project["latest_analysis"]), (3, ["systems.iceberg_model"], analyses[0]))
        self.assertGreaterEqual(project["updated_at"], analyses[2]["finished_at"])
        self.assertEqual(self.client.get(f"/projects/{self.project_id}").json(), project)   # one project reads as it does in the list
        done = self.client.get(f"/interpretations/{runs[0][0]}").json()
        self.assertEqual((done["method_id"], done["created_at"]), ("systems.iceberg_model", analyses[2]["finished_at"]))
        self.assertEqual(self.client.get(f"/interpretations/{runs[2][0]}").json()["method_id"], "systems.iceberg_model")

    def test_a_project_without_analyses_and_an_unknown_one(self):
        empty = self.repo.create_project(project_record(str(uuid.uuid4()), self.tenant["tenant_id"], self.workspace_id, "Empty", "Nothing yet.", "Confidential", self.identity["identity_id"], "2026-09-26T01:02:03Z"))
        self.assertEqual(self.client.get(f"/projects/{empty['project_id']}/analyses").json(), [])
        listed = [item for item in self.client.get("/projects").json() if item["project_id"] == empty["project_id"]][0]
        self.assertEqual((listed["analysis_count"], listed["methods"], listed["latest_analysis"]), (0, [], None))
        created_event = self.client.get(f"/projects/{empty['project_id']}/history").json()[0]
        self.assertEqual((created_event["event_type"], listed["updated_at"]), ("ProjectCreated", created_event["occurred_at"]))   # nothing since: the creation
        self.assertEqual(self.client.get(f"/projects/{uuid.uuid4()}/analyses").status_code, 404)
        self.client.cookies.clear()
        self.assertEqual(self.client.get(f"/projects/{self.project_id}/analyses").status_code, 401)

    def test_interpret_requires_a_session(self):
        self.client.cookies.clear()
        response = self.client.post("/methods/systems.iceberg_model/interpret", json={"project_id": self.project_id})
        self.assertEqual(response.status_code, 401, response.text)

    def test_builder_gate_refusal_returns_422_without_calling_provider(self):
        response = self.client.post("/methods/systems.iceberg_model/interpret", json={
            "project_id": self.project_id,
            "events": [],
            "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.provider.calls, 0)
        self.assertEqual(api_main.app.dependency_overrides[api_main.get_store]().ai_usage_totals(self.tenant["tenant_id"])["calls"], 0)

    def test_gate_fail_returns_422_without_provider_call(self):
        with patch("ai_lego.apps.api.main.run_gate_runner", return_value=[{"gate_id": "forced", "status": "FAIL"}]):
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["release incidents"],
                "patterns": ["weekly spike"],
                "structures": [],
                "mental_models": [],
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.provider.calls, 0)

    def test_not_applicable_gate_is_accepted(self):
        with patch("ai_lego.apps.api.main.run_gate_runner", return_value=[{"gate_id": "optional", "status": "NOT_APPLICABLE"}]), patch("ai_lego.apps.api.main._launch_interpretation"):
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id, "events": ["release incidents"], "patterns": ["weekly spike"],
                "structures": [], "mental_models": [], "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["status"], "PENDING")

    def test_unconfigured_provider_returns_503(self):
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: None
        response = self.client.post("/methods/systems.iceberg_model/interpret", json={
            "project_id": self.project_id,
            "events": ["release incidents"],
            "patterns": ["weekly spike"],
            "structures": [],
            "mental_models": [],
            "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        })
        self.assertEqual(response.status_code, 503, response.text)

    def test_eisenhower_uses_quadrant_visual_kind(self):
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch:
            response = self.client.post("/methods/decision.eisenhower_matrix/interpret", json={
                "project_id": self.project_id,
                "subject": "This week's tasks",
                "tasks": [{"id": "T1", "label": "Reply to customer", "urgency": 9, "importance": 8}],
                "urgency_scale": {"min": 0, "max": 10},
                "importance_scale": {"min": 0, "max": 10},
                "urgency_threshold": 5,
                "importance_threshold": 5,
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["status"], "PENDING")
        interpretation_id = response.json()["interpretation_id"]
        self.assertEqual(self.client.get(f"/interpretations/{interpretation_id}").json()["status"], "PENDING")
        api_main._run_interpretation(**launch.call_args.kwargs)
        fetched = self.client.get(f"/interpretations/{interpretation_id}").json()
        self.assertEqual(fetched["status"], "DONE")
        result = fetched["result"]
        self.assertEqual(result["visual"]["kind"], "quadrant")

    def test_failed_interpretation_records_usage(self):
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch, patch.object(
            self.provider, "complete", return_value=AiCompletion(text="bad JSON", model=self.provider.model, input_tokens=11, output_tokens=23),
        ) as complete:
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["release incidents"],
                "patterns": ["weekly spike"],
                "structures": [],
                "mental_models": [],
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
            self.assertEqual(response.status_code, 202, response.text)
            self.assertEqual(response.json()["status"], "PENDING")
            interpretation_id = response.json()["interpretation_id"]
            self.assertEqual(self.client.get(f"/interpretations/{interpretation_id}").json()["status"], "PENDING")
            api_main._run_interpretation(**launch.call_args.kwargs)
        self.assertEqual(complete.call_count, 2)
        fetched = self.client.get(f"/interpretations/{interpretation_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["status"], "FAILED")
        self.assertIn("NOT_JSON", fetched.json()["error"])
        usage = api_main.app.dependency_overrides[api_main.get_store]().ai_usage_totals(self.tenant["tenant_id"])
        self.assertEqual((usage["input_tokens"], usage["output_tokens"]), (22, 46))

    def test_usage_write_failure_finishes_as_failed_not_pending(self):
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch:
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["release incidents"],
                "patterns": ["weekly spike"],
                "structures": [],
                "mental_models": [],
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
        self.assertEqual(response.status_code, 202, response.text)
        interpretation_id = response.json()["interpretation_id"]
        store = launch.call_args.kwargs["store"]
        with patch.object(store, "record_ai_usage", side_effect=RuntimeError("disk unavailable")):
            api_main._run_interpretation(**launch.call_args.kwargs)
        fetched = self.client.get(f"/interpretations/{interpretation_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["status"], "FAILED")
        self.assertIn("AI_USAGE_RECORD_FAILED", fetched.json()["error"])
        failure = [event for event in self.repo.list_events(self.tenant["tenant_id"], f"project:{self.project_id}") if event["event_type"] == "InterpretationFailed"][-1]
        self.assertEqual((failure["payload"]["input_tokens"], failure["payload"]["output_tokens"]), (11, 23))

    def test_interpret_failure_survives_usage_write_failure(self):
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch, patch.object(
            self.provider, "complete", return_value=AiCompletion(text="bad JSON", model=self.provider.model, input_tokens=11, output_tokens=23),
        ) as complete:
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["release incidents"],
                "patterns": ["weekly spike"],
                "structures": [],
                "mental_models": [],
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
            self.assertEqual(response.status_code, 202, response.text)
            interpretation_id = response.json()["interpretation_id"]
            store = launch.call_args.kwargs["store"]
            with patch.object(store, "record_ai_usage", side_effect=RuntimeError("disk unavailable")):
                api_main._run_interpretation(**launch.call_args.kwargs)
        self.assertEqual(complete.call_count, 2)
        fetched = self.client.get(f"/interpretations/{interpretation_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["status"], "FAILED")
        self.assertIn("NOT_JSON", fetched.json()["error"])
        self.assertIn("AI_USAGE_RECORD_FAILED", fetched.json()["error"])
        failure = [event for event in self.repo.list_events(self.tenant["tenant_id"], f"project:{self.project_id}") if event["event_type"] == "InterpretationFailed"][-1]
        self.assertIn("NOT_JSON", failure["payload"]["error"])
        self.assertIn("AI_USAGE_RECORD_FAILED", failure["payload"]["error"])
        self.assertEqual((failure["payload"]["input_tokens"], failure["payload"]["output_tokens"]), (22, 46))

    def test_interpret_is_pending_until_run(self):
        with patch("ai_lego.apps.api.main._launch_interpretation") as launch:
            response = self.client.post("/methods/systems.iceberg_model/interpret", json={
                "project_id": self.project_id,
                "events": ["release incidents"],
                "patterns": ["weekly spike"],
                "structures": [],
                "mental_models": [],
                "provenance": make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            })
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["status"], "PENDING")
        interpretation_id = response.json()["interpretation_id"]
        self.assertEqual(self.client.get(f"/interpretations/{interpretation_id}").json()["status"], "PENDING")
        api_main._run_interpretation(**launch.call_args.kwargs)
        fetched = self.client.get(f"/interpretations/{interpretation_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["status"], "DONE")

    def test_unknown_method_is_404(self):
        response = self.client.post("/methods/unknown.nope/interpret", json={"project_id": self.project_id})
        self.assertEqual(response.status_code, 404, response.text)

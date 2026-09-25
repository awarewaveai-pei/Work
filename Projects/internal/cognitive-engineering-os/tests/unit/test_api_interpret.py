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

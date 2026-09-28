"""POST/GET /projects/{id}/synthesis (RESEARCH_LINES_MASTER_PLAN §12.8 WC-P2-06): everything refusable is refused before
a paid call; the background run is metered success or failure; events carry ids/hashes/counts/codes only (K8); the
artifact passes the P-c contract and goes with the Project on erase."""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

from ai_lego import resolve_spec_root
from ai_lego.apps.api import main as api_main
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog
from ai_lego.platform.ai_gateway.provider import DAILY_TOKEN_BUDGET_ENV, AiCompletion
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))
import run as eval_run  # noqa: E402  (P-c artifact contract, same import as test_synthesis)

SUBJECT_NAME = "Mira Okonkwo-Hale"
DOSSIER = {"kind": "dossier_brief", "subject": {"name": SUBJECT_NAME, "kind": "person", "anchors": ["Lisbon"]}}
NOTE = {"title": "Interview notes", "media_type": "text/plain", "data_classification": "Confidential", "content": f"{SUBJECT_NAME} runs a studio in Lisbon."}
EVENT_KEYS = {"synthesis_id", "kind", "source_count", "artifact_reference", "error", "input_tokens", "output_tokens"}


def _dossier_answer() -> str:
    return json.dumps({
        "summary": {"text": "工作室負責人。", "citations": [1]},
        "sections": [{"heading": "身分與現況", "claims": [{"claim_id": "C1", "text": "在里斯本經營工作室。", "citations": [1]}]}],
        "related_entities": [], "gaps": [{"text": "無財務資料", "needed_evidence": "公司登記"}], "conflicts": [],
    }, ensure_ascii=False)


def _decision_answer() -> str:
    return json.dumps({
        "summary": {"text": "摘要", "citations": [1]},
        "sections": [{"heading": "比較", "claims": [{"claim_id": "C1", "text": "A 較好", "citations": [1]}]}],
        "gaps": [], "conflicts": [],
        "options": [{"option_id": "OPT1", "name": "A", "citations": [1]}],
        "criteria": [{"criterion_id": "CRIT1", "name": "成本", "citations": [1]}],
        "evidence": [{"text": "證據", "option_ids": ["OPT1"], "criterion_ids": ["CRIT1"], "stance": "supports", "citations": [1]}],
    }, ensure_ascii=False)


class ScriptedProvider:
    model = "test-synthesis-model"

    def __init__(self, *answers: str) -> None:
        self.answers = list(answers)
        self.calls = 0

    def complete(self, system: str, user: str, *, max_tokens: int) -> AiCompletion:
        self.calls += 1
        return AiCompletion(text=self.answers.pop(0), model=self.model, input_tokens=11, output_tokens=23)


class SynthesisApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = ScriptedProvider(_dossier_answer())
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.tid = self.tenant["tenant_id"]
        self.source = self.client.post(f"/projects/{self.pid}/sources", json=NOTE).json()

    def _post(self, body=None, project_id=None):
        with patch("ai_lego.apps.api.main._launch_synthesis") as launch:
            response = self.client.post(f"/projects/{project_id or self.pid}/synthesis", json=DOSSIER if body is None else body)
        return response, launch

    def _get(self, synthesis_id, project_id=None):
        return self.client.get(f"/projects/{project_id or self.pid}/synthesis/{synthesis_id}")

    def _usage(self) -> list[tuple]:
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute("SELECT purpose, input_tokens, output_tokens FROM ai_usage WHERE tenant_id=?", (self.tid,)).fetchall()

    def _events(self) -> list[dict]:
        return [event for event in self._repo.list_events(self.tid, f"project:{self.pid}") if event["event_type"].startswith("Synthesis")]

    def _assert_events_hold_no_text(self):
        for event in self._events():
            self.assertLessEqual(set(event["payload"]), EVENT_KEYS, event)
            dumped = json.dumps(event["payload"], ensure_ascii=False)
            for text in (SUBJECT_NAME, "Lisbon", "里斯本", "工作室"):
                self.assertNotIn(text, dumped, event["event_type"])

    def test_a_dossier_runs_in_the_background_and_reads_back_done(self):
        response, launch = self._post()
        self.assertEqual(response.status_code, 202, response.text)
        synthesis_id = response.json()["synthesis_id"]
        self.assertTrue(synthesis_id.startswith("SYN-"))
        self.assertEqual(self._get(synthesis_id).json()["status"], "PENDING")
        self.assertEqual(launch.call_args.kwargs["subject"], {"name": SUBJECT_NAME, "kind": "person", "anchors": ["Lisbon"]})
        api_main._run_synthesis(**launch.call_args.kwargs)
        done = self._get(synthesis_id).json()
        self.assertEqual(done["status"], "DONE", done)
        self.assertEqual((done["kind"], done["result"]["subject"]["name"], done["gate_results"][0]["status"]), ("dossier_brief", SUBJECT_NAME, "PASS"))
        artifact = {key: done[key] for key in ("gate_results", "manifest", "prompt_version", "latency_ms")} | {"synthesis": done["result"]}
        self.assertEqual(eval_run.artifact_contract_errors(artifact, contracts=SchemaContracts(resolve_spec_root()), spec_root=resolve_spec_root()), [])
        self.assertEqual([entry["source_id"] for entry in done["manifest"]["entries"]], [self.source["source_id"]])
        self.assertEqual(self._usage(), [("synthesis:dossier_brief", 11, 23)])
        self.assertEqual([event["event_type"] for event in self._events()], ["SynthesisRequested", "SynthesisCreated"])
        self.assertEqual(self._events()[1]["payload"]["artifact_reference"]["artifact_type"], "DossierBrief")
        self._assert_events_hold_no_text()

    def test_a_failed_run_is_metered_and_keeps_error_codes_only(self):
        self.provider.answers = [f"not json about {SUBJECT_NAME}", f"still not json about {SUBJECT_NAME}"]
        response, launch = self._post()
        api_main._run_synthesis(**launch.call_args.kwargs)
        failed = self._get(response.json()["synthesis_id"]).json()
        self.assertEqual(failed["status"], "FAILED")
        self.assertEqual(failed["error"], "SYNTHESIS_REJECTED_AFTER_REPAIR: AI_DRAFT_NOT_JSON")
        self.assertEqual(self._usage(), [("synthesis:dossier_brief", 11, 23)] * 2)   # one row per paid call
        payload = self._events()[-1]["payload"]
        self.assertEqual((payload["input_tokens"], payload["output_tokens"]), (22, 46))
        self._assert_events_hold_no_text()

    def test_a_usage_write_failure_finishes_failed_not_done(self):
        response, launch = self._post()
        with patch.object(launch.call_args.kwargs["store"], "settle_ai_usage", side_effect=RuntimeError("disk")):
            api_main._run_synthesis(**launch.call_args.kwargs)
        failed = self._get(response.json()["synthesis_id"]).json()
        self.assertEqual((failed["status"], failed["error"]), ("FAILED", "AI_USAGE_RECORD_FAILED"))

    def test_another_tenant_cannot_read_or_start_one(self):
        response, launch = self._post()
        api_main._run_synthesis(**launch.call_args.kwargs)
        synthesis_id = response.json()["synthesis_id"]
        self._login_as_a_different_tenant()
        self.assertEqual(self._get(synthesis_id).status_code, 404)
        self.assertEqual(self._post()[0].status_code, 404)
        self._login()
        self.assertEqual(self._get(synthesis_id).json()["status"], "DONE")
        self.assertEqual(self._get("SYN-NOPE").status_code, 404)

    def test_zero_active_sources_is_400_and_no_model_call(self):
        empty = self._create_project(name="Empty")["project_id"]
        response, launch = self._post(project_id=empty)
        self.assertEqual(response.status_code, 400, response.text)
        self.assertTrue(response.json()["detail"].startswith("SYNTHESIS_NO_SOURCES"))
        launch.assert_not_called()
        self.assertEqual((self.provider.calls, self._usage()), (0, []))
        self.assertEqual([event["event_type"] for event in self._repo.list_events(self.tid, f"project:{empty}") if event["event_type"].startswith("Synthesis")], [])

    def test_a_bad_request_is_400_before_anything_is_written(self):
        for body in ({"kind": "dossier_brief", "subject": {"name": "", "kind": "person"}}, {"kind": "decision_evidence", "subject": {"topic": "x"}},
                     {"kind": "swot", "subject": {"question": "x"}}, {**DOSSIER, "language": "en"}, {"subject": DOSSIER["subject"]},
                     {"kind": "dossier_brief", "subject": {"name": SUBJECT_NAME, "kind": "person", "anchor": ["Lisbon"]}}):
            response, launch = self._post(body)
            self.assertEqual(response.status_code, 400, (body, response.text))
            launch.assert_not_called()
            self.assertNotIn(SUBJECT_NAME, response.text)
        self.assertEqual(self._events(), [])

    def test_a_draft_contract_is_refused(self):
        live = CapabilityCatalog.from_spec_root(resolve_spec_root())
        contracts = {ref: dict(entry) for ref, entry in live.contracts.items()}
        contracts["synthesis.dossier_brief"]["status"] = "DRAFT"
        with patch.object(api_main.CapabilityCatalog, "from_spec_root", classmethod(lambda cls, spec_root: CapabilityCatalog(label="test:draft", contracts=contracts))):
            response, launch = self._post()
        self.assertEqual(response.status_code, 404, response.text)
        self.assertIn("CAPABILITY_RESOLUTION_BLOCKED", response.text)
        launch.assert_not_called()

    def test_the_three_contracts_are_active(self):
        live = CapabilityCatalog.from_spec_root(resolve_spec_root())
        for kind in ("dossier_brief", "decision_evidence", "literature_matrix"):
            self.assertTrue(live.is_resolvable(f"synthesis.{kind}"), kind)

    def test_an_unconfigured_provider_is_503(self):
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: None
        response, launch = self._post()
        self.assertEqual(response.status_code, 503, response.text)
        launch.assert_not_called()
        self.assertEqual(self._events(), [])

    def test_a_decision_brief_is_stored_under_its_contract_type(self):
        self.provider.answers = [_decision_answer()]
        response, launch = self._post({"kind": "decision_evidence", "subject": {"question": "選哪個方案", "options": ["A"]}})
        self.assertEqual(response.status_code, 202, response.text)
        api_main._run_synthesis(**launch.call_args.kwargs)
        done = self._get(response.json()["synthesis_id"]).json()
        self.assertEqual((done["status"], done["kind"]), ("DONE", "decision_evidence"), done)
        self.assertEqual(self._events()[-1]["payload"]["artifact_reference"]["artifact_type"], "DecisionEvidenceBrief")
        self.assertEqual(self._usage(), [("synthesis:decision_evidence", 11, 23)])

    def test_erasing_the_project_takes_the_synthesis_artifact(self):
        response, launch = self._post()
        api_main._run_synthesis(**launch.call_args.kwargs)
        reference = self._events()[-1]["payload"]["artifact_reference"]
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        self.assertEqual(artifacts.read(self.tid, reference)["synthesis"]["subject"]["name"], SUBJECT_NAME)
        erased = self.client.delete(f"/projects/{self.pid}")
        self.assertEqual(erased.status_code, 200, erased.text)
        self.assertEqual(erased.json()["erased"]["artifacts_deleted"], 1)
        with self.assertRaises(InvariantViolation):
            artifacts.read(self.tid, reference)
        with closing(sqlite3.connect(self._repo.db_path)) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM project_syntheses").fetchone()[0], 0)

    def test_a_runner_crash_after_a_paid_call_is_still_metered(self):
        """The runner raises (RecursionError from a deeply nested answer) after the provider was paid: the call is
        already in ai_usage and the Failed event names the exception class, not the answer."""
        self.provider.answers = ['{"summary":{"text":"x","citations":[1]},"sections":' + "[" * 1100 + "]" * 1100 + "}"]
        response, launch = self._post()
        api_main._run_synthesis(**launch.call_args.kwargs)
        failed = self._get(response.json()["synthesis_id"]).json()
        self.assertEqual((failed["status"], failed["error"]), ("FAILED", "SYNTHESIS_FAILED: RecursionError"))
        self.assertEqual(self._usage(), [("synthesis:dossier_brief", 11, 23)])
        self.assertEqual((self._events()[-1]["payload"]["input_tokens"], self._events()[-1]["payload"]["output_tokens"]), (11, 23))

    def test_the_budget_is_checked_before_every_call_of_a_run(self):
        self.provider.answers = ["not json", _dossier_answer()]
        from ai_lego.modules.research.synthesis import MAX_OUTPUT_TOKENS
        worst = 1_000_000 + MAX_OUTPUT_TOKENS   # every call's reservation (a call starts only if its worst case fits)
        with patch.object(api_main, "PROMPT_RESERVE_TOKENS", 1_000_000), patch.dict("os.environ", {DAILY_TOKEN_BUDGET_ENV: str(worst + 33)}):   # the first call spends 34
            response, launch = self._post()
            api_main._run_synthesis(**launch.call_args.kwargs)
        failed = self._get(response.json()["synthesis_id"]).json()
        self.assertEqual((failed["status"], failed["error"]), ("FAILED", "AI_DAILY_TOKEN_BUDGET_EXCEEDED"))
        self.assertEqual((self.provider.calls, self._usage()), (1, [("synthesis:dossier_brief", 11, 23)]))

    def test_one_synthesis_per_project_at_a_time(self):
        first, launch = self._post()
        self.assertEqual(first.status_code, 202, first.text)
        second, second_launch = self._post()
        self.assertEqual(second.status_code, 409, second.text)
        second_launch.assert_not_called()
        api_main._run_synthesis(**launch.call_args.kwargs)
        self.provider.answers = [_dossier_answer()]
        third, third_launch = self._post()
        self.assertEqual(third.status_code, 202)
        third_launch.call_args.kwargs["lock"].release()

    def test_only_what_a_manifest_can_span_is_kept_for_the_run(self):
        long_note = {**NOTE, "title": "Long", "content": "x" * 9000}
        self.client.post(f"/projects/{self.pid}/sources", json=long_note)
        response, launch = self._post()
        self.assertEqual(sorted(len(item["text"]) for item in launch.call_args.kwargs["sources"]), [len(NOTE["content"]), 6000])
        launch.call_args.kwargs["lock"].release()

    def test_a_synthesis_whose_worker_died_reads_lost_not_pending_forever(self):
        response, launch = self._post()
        synthesis_id = response.json()["synthesis_id"]
        self.assertEqual(self._get(synthesis_id).json()["status"], "PENDING", "lock held by its (not yet started) worker")
        launch.call_args.kwargs["lock"].release()  # the worker process died: the kernel releases, no event is written
        self.assertEqual(self._get(synthesis_id).json()["status"], "LOST")
        self.provider.answers = [_dossier_answer()]
        again, again_launch = self._post()
        self.assertEqual(again.status_code, 202, "a lost synthesis does not block the project")
        api_main._run_synthesis(**again_launch.call_args.kwargs)
        self.assertEqual(self._get(synthesis_id).json()["status"], "LOST", "the old id stays LOST, the new one is not it")
        self.assertEqual(self._get(again.json()["synthesis_id"]).json()["status"], "DONE")

    def test_failure_codes_carry_no_message_text(self):
        self.assertEqual(api_main._error_code("AI_PROVIDER_UNAVAILABLE: URLError reaching host"), "AI_PROVIDER_UNAVAILABLE")
        self.assertEqual(api_main._error_code("SYNTHESIS_REJECTED_AFTER_REPAIR: SYNTHESIS_GATE_FAILED: {}"), "SYNTHESIS_REJECTED_AFTER_REPAIR: SYNTHESIS_GATE_FAILED")
        self.assertEqual(api_main._error_code("UNIQUE constraint failed"), "SYNTHESIS_FAILED")
        http = urllib.error.HTTPError("https://api.example/v1", 429, f"about {SUBJECT_NAME}", {}, None)
        self.assertEqual(api_main._failure_code(http), "SYNTHESIS_FAILED: HTTPError 429")
        self.assertEqual(api_main._failure_code(InvariantViolation(f"SYNTHESIS_SUBJECT_INVALID: {SUBJECT_NAME}")), "SYNTHESIS_SUBJECT_INVALID")

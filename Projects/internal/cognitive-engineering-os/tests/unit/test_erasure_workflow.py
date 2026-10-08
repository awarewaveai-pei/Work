"""Erasure across the database and the files (ai_lego/platform/erasure.py; docs/platform/STORAGE_SWITCH.md "Erasure across
the database and the files"). The invariant: nothing irreversible happens before the decision it depends on is durable,
and a durable decision to erase can always be finished.

Every fault below is injected into the real path on a real PostgreSQL and real files; each test reads BOTH the rows and
the files afterwards. The gate at the end fails when an irreversible call becomes reachable from an erasure entry point
anywhere but the cleanup step.
"""

from __future__ import annotations

import ast
import json
import pathlib
import threading
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.data.db import Databases
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories import erasure_outbox
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import erasure
from ai_lego.platform.identity.store import IdentityStore
from tests.unit.test_api_collections import CollectionApiTestCase
from tests.unit.test_api_ingest import c1
from tests.unit.test_block_govern import GovernApiTestCase

NOTE = {"title": "Interview notes", "media_type": "text/plain", "data_classification": "Confidential", "content": "Jane Doe said the gallery paid late."}
INJECTED = "INJECTED-FAULT"


def _after(real, fail_when=lambda *args, **kwargs: True):
    """``real`` runs, then the fault: what it did must be rolled back, not merely not done."""
    def wrapper(*args, **kwargs):
        result = real(*args, **kwargs)
        if fail_when(*args, **kwargs):
            raise RuntimeError(INJECTED)
        return result
    return wrapper


class _ErasureCase(CollectionApiTestCase):
    """A case holding one of every kind of thing an erasure must remove: a typed-in Source (its blob), a collected Source
    with an open collect grant, an AI artifact row, and a recipe run on the case with the artifact it stored."""

    FRESH_TABLES = True

    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(api_main, "PRODUCT_ROOT", Path(self._proj_tmpdir.name))   # run files go to this test's folder
        patcher.start()
        self.addCleanup(patcher.stop)
        self.tid, self.pid, self.me = self.tenant["tenant_id"], self.project["project_id"], self.identity["identity_id"]
        self.note = self.client.post(f"/projects/{self.pid}/sources", json=NOTE).json()
        self._collector()
        self.run_id = self._confirm().json()["run_id"]
        self.token = self._exchange(self.service.calls[0]["grant_ref"]).json()["grant_token"]
        ingested = self.client.post(f"/projects/{self.pid}/sources/ingest", json={"run_id": self.run_id, "sources": [c1("https://acme.example/a", "alpha")]},
                                    headers={"Authorization": f"Grant {self.token}"})
        self.assertEqual(ingested.status_code, 200, ingested.text)
        self.artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        self.artifact_ref = self.artifacts.put(self.tid, "method_interpretation", {"record": {"who": "Jane Doe"}})
        self._repo.save_interpretation(self.tid, self.pid, "INTERP-ERASE1", self.artifact_ref, "2026-09-26T00:00:00Z", block="MAP")
        self.note_cas = self._repo.get_source_content_reference(self.tid, self.pid, self.note["source_id"])
        self.run_ref = self.artifacts.put(self.tid, "ProposalDraft", {"content": "RUN ON THE CASE"})
        self.journal = api_main.workflow_journal_path(self.tid, "run-on-case", self.me)
        self.journal.parent.mkdir(parents=True, exist_ok=True)
        self.journal.write_text(json.dumps({"status": "SUCCEEDED"}), encoding="utf-8")
        api_main._run_case_path(self.journal).write_text(json.dumps({"project_id": self.pid, "artifacts": [self.run_ref]}), encoding="utf-8")
        self.blobs = list(self._source_cas.list_objects(self.tid))
        self.assertEqual(len(self.blobs), 2)

    # -- what is there --------------------------------------------------------------------------------------------------

    def _rows(self) -> dict[str, int]:
        one = lambda query: self._sql(query, self.tid)[0][0]   # noqa: E731
        return {"projects": one("SELECT COUNT(*) FROM platform_projects WHERE tenant_id=%s"), "sources": one("SELECT COUNT(*) FROM prov_sources WHERE tenant_id=%s"),
                "case_events": one("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='case'"),
                "open_grants": one("SELECT COUNT(*) FROM collect_grant WHERE tenant_id=%s AND closed_at IS NULL"),
                "jobs": one("SELECT COUNT(*) FROM erasure_jobs WHERE tenant_id=%s"),
                "pending": one("SELECT COUNT(*) FROM erasure_items WHERE tenant_id=%s AND state='pending'"),
                "tombstones": one("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND event_type='ProjectErased'")}

    def _files(self) -> dict[str, bool]:
        return {"blobs": [self._source_cas.exists(self.tid, {"path": path, "tenant_segment": self.tid}) for path in self.blobs],
                "artifact": self.artifacts.cas.exists(self.tid, self.artifact_ref["cas_path"]), "run_artifact": self.artifacts.cas.exists(self.tid, self.run_ref["cas_path"]),
                "journal": self.journal.exists(), "sidecar": api_main._run_case_path(self.journal).exists()}

    ALL_THERE = {"blobs": [True, True], "artifact": True, "run_artifact": True, "journal": True, "sidecar": True}
    ALL_GONE = {"blobs": [False, False], "artifact": False, "run_artifact": False, "journal": False, "sidecar": False}

    def assert_untouched(self):
        self.assertEqual(self.client.get(f"/projects/{self.pid}").status_code, 200)
        self.assertEqual(len(self._repo.list_sources(self.tid, self.pid)), 2)
        self.assertEqual({key: value for key, value in self._rows().items() if key in ("projects", "sources", "open_grants", "jobs", "tombstones")},
                         {"projects": 1, "sources": 2, "open_grants": 1, "jobs": 0, "tombstones": 0})
        self.assertEqual(self._files(), self.ALL_THERE)

    def assert_decided_not_finished(self):
        """The case is unreadable and its grant closed; the files are not all gone; nothing claims completion."""
        self.assertEqual(self.client.get(f"/projects/{self.pid}").status_code, 404)
        rows = self._rows()
        self.assertEqual({key: rows[key] for key in ("projects", "sources", "case_events", "open_grants", "jobs", "tombstones")},
                         {"projects": 0, "sources": 0, "case_events": 0, "open_grants": 0, "jobs": 1, "tombstones": 0})
        self.assertGreater(rows["pending"], 0)
        self.assertEqual(self.client.get("/projects/erased").json(), [])

    def assert_finished(self, tombstones: int = 1):
        rows = self._rows()
        self.assertEqual({key: rows[key] for key in ("projects", "sources", "jobs", "pending", "tombstones")},
                         {"projects": 0, "sources": 0, "jobs": 0, "pending": 0, "tombstones": tombstones})
        self.assertEqual(self._files(), self.ALL_GONE)
        self.assertEqual([item["project_id"] for item in self.client.get("/projects/erased").json()], [self.pid])

    def erase(self, client: TestClient | None = None):
        return (client or self.client).delete(f"/projects/{self.pid}")

    def resume(self, repo: ProjectSourceRepository | None = None):
        return api_main.resume_pending_erasures(repo or self._repo, self._source_cas, self.artifacts)


class DecisionTests(_ErasureCase):
    def test_the_happy_path_removes_every_kind_and_writes_one_tombstone(self):
        response = self.erase()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["physical_cleanup"], "done")
        erased = response.json()["erased"]
        self.assertEqual((erased["sources"], erased["blobs_unlinked"], erased["artifacts_deleted"]), (2, 2, 2))
        self.assertGreater(erased["events_deleted"], 0)
        self.assert_finished()

    def test_a_failure_anywhere_before_the_decision_commits_changes_nothing(self):
        """(a) Each step of the decision transaction does its real work, then fails: rows, grant and every file are as before."""
        steps = {
            "case rows": (ProjectSourceRepository, "erase_case_rows"),
            "blob list": (ProjectSourceRepository, "unreferenced_blobs"),
            "grants": (IdentityStore, "close_collect_grants_on"),
            "outbox": (erasure_outbox, "write_job"),
        }
        for name, (owner, attribute) in steps.items():
            with self.subTest(step=name):
                real = getattr(owner, attribute)
                fake = staticmethod(_after(real)) if isinstance(owner, type) else _after(real)
                with mock.patch.object(owner, attribute, fake), self.assertRaisesRegex(RuntimeError, INJECTED):
                    self.erase()
                self.assert_untouched()
        self.assertEqual(self.erase().status_code, 200)   # and then it simply works
        self.assert_finished()

    def test_a_failure_after_the_decision_before_any_file_goes_is_finished_by_the_resume(self):
        """(b) The decision committed, the cleanup never started: the case is gone for every reader, the API says pending."""
        with mock.patch.object(erasure_outbox, "pending_items", side_effect=RuntimeError(INJECTED)):
            response = self.erase()
        self.assertEqual((response.status_code, response.json()["physical_cleanup"]), (202, "pending"), response.text)
        self.assert_decided_not_finished()
        self.assertEqual(self._files(), self.ALL_THERE)
        self.assertEqual([job["physical_cleanup"] for job in self.resume()], ["done"])
        self.assert_finished()


    def test_a_claim_the_database_cannot_hold_is_reported_and_does_not_block_the_erasure(self):
        """A run's sidecar is a file: a reference in it may carry a NUL or a lone surrogate, which jsonb refuses. Stored as it
        is, the decision would fail every time; it is settled as unremovable instead and named in ``failed``."""
        odd = [{**self.run_ref, "artifact_type": "Odd" + chr(0xD800)}, {**self.run_ref, "artifact_type": "Nul" + chr(0)}]
        api_main._run_case_path(self.journal).write_text(json.dumps({"project_id": self.pid, "artifacts": [self.run_ref, *odd]}), encoding="utf-8")
        response = self.erase()
        self.assertEqual((response.status_code, response.json()["physical_cleanup"]), (200, "done"), response.text)
        self.assertEqual([item["error"] for item in response.json()["failed"]], ["ARTIFACT_REFERENCE_MALFORMED"] * 2)
        self.assert_finished()


class EachKindOfFileTests(_ErasureCase):
    """(c) A filesystem error at one kind of file leaves exactly that for later; the rest go now; a repeated DELETE by the
    same person finishes it (and only then is there a tombstone)."""

    def _fail(self, kind: str):
        source_root, artifact_root = self._source_cas.root, self.artifacts.cas.root
        real_cas_unlink, real_path_unlink = TenantScopedCas.unlink, pathlib.Path.unlink

        def cas_unlink(cas, tenant_id, cas_path):
            if (kind == "source" and cas.root == source_root) or (kind == "artifact" and cas.root == artifact_root):
                raise PermissionError(INJECTED)
            return real_cas_unlink(cas, tenant_id, cas_path)

        def path_unlink(path, *args, **kwargs):
            if kind == "run" and path.name.endswith(".journal.json"):
                raise PermissionError(INJECTED)
            return real_path_unlink(path, *args, **kwargs)

        with mock.patch.object(TenantScopedCas, "unlink", cas_unlink), mock.patch.object(pathlib.Path, "unlink", path_unlink):
            response = self.erase()
        self.assertEqual((response.status_code, response.json()["physical_cleanup"]), (202, "pending"), response.text)
        self.assert_decided_not_finished()
        left = self._files()
        expected = {**self.ALL_GONE, **{"source": {"blobs": [True, True]}, "artifact": {"artifact": True, "run_artifact": True}, "run": {"journal": True, "sidecar": True}}[kind]}
        self.assertEqual(left, expected)
        self.assertEqual(self._rows()["pending"], {"source": 2, "artifact": 2, "run": 1}[kind])
        again = self.erase()
        self.assertEqual((again.status_code, again.json()["physical_cleanup"]), (200, "done"), again.text)
        self.assert_finished()
        self.assertEqual(self.erase().status_code, 404)   # finished: nothing is left to ask for

    def test_a_source_blob_that_cannot_go_yet(self):
        self._fail("source")

    def test_an_ai_artifact_that_cannot_go_yet(self):
        self._fail("artifact")

    def test_a_run_journal_that_cannot_go_yet(self):
        self._fail("run")

    def test_only_the_person_who_erased_it_can_ask_again(self):
        with mock.patch.object(erasure_outbox, "pending_items", side_effect=RuntimeError(INJECTED)):
            self.assertEqual(self.erase().status_code, 202)
        self._login_as_a_different_tenant()
        self.assertEqual(self.erase().status_code, 404)
        self.assertEqual(self._rows()["jobs"], 1)


class ResumeTests(_ErasureCase):
    def test_a_failure_during_the_resume_leaves_it_for_the_next_one(self):
        """(d)"""
        with mock.patch.object(erasure_outbox, "pending_items", side_effect=RuntimeError(INJECTED)):
            self.erase()
        real = TenantScopedCas.unlink

        def cas_unlink(cas, *args):
            if cas.root == self._source_cas.root:
                raise PermissionError(INJECTED)
            return real(cas, *args)

        with mock.patch.object(TenantScopedCas, "unlink", cas_unlink):
            self.assertEqual([job["physical_cleanup"] for job in self.resume()], ["pending"])
        self.assert_decided_not_finished()
        self.assertEqual(self._files()["blobs"], [True, True])
        self.assertEqual(self.resume()[0]["physical_cleanup"], "done")
        self.assert_finished()

    def test_a_fresh_process_finds_the_job_at_start(self):
        """(f) A crash after the decision: a new Databases, a new repository, and the API's own start (lifespan) finish it."""
        with mock.patch.object(erasure_outbox, "pending_items", side_effect=RuntimeError(INJECTED)):
            self.erase()
        fresh = Databases({self.REGION: self.url})
        self.addCleanup(fresh.close)
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: ProjectSourceRepository(fresh)
        with TestClient(api_main.app, base_url="https://testserver"):
            pass   # the start ran
        self.assert_finished()

    def test_a_shared_blob_stays_even_when_the_sharing_source_arrives_after_the_decision(self):
        """(e) A blob another case's Source names is kept: checked again under the blob lock when the item is worked, not
        only when the erasure was decided."""
        with mock.patch.object(erasure_outbox, "pending_items", side_effect=RuntimeError(INJECTED)):
            self.erase()
        other = self._create_project(name="Other project")["project_id"]
        self.assertEqual(self.client.post(f"/projects/{other}/sources", json=NOTE).status_code, 200)
        self.resume()
        reference = self._repo.get_source_content_reference(self.tid, other, self._repo.list_sources(self.tid, other)[0]["source_id"])
        self.assertEqual(self._source_cas.read(self.tid, reference).decode("utf-8"), NOTE["content"])
        tombstone = self.client.get("/projects/erased").json()[0]
        self.assertEqual(tombstone["blobs_unlinked"], 1)   # the collected one; the note's blob was kept
        self.assertEqual(self._rows()["jobs"], 0)

    def test_a_blob_shared_at_the_decision_is_never_listed(self):
        other = self._create_project(name="Other project")["project_id"]
        self.client.post(f"/projects/{other}/sources", json=NOTE)
        self.assertEqual(self.erase().json()["erased"]["blobs_unlinked"], 1)
        reference = self._repo.get_source_content_reference(self.tid, other, self._repo.list_sources(self.tid, other)[0]["source_id"])
        self.assertEqual(self._source_cas.read(self.tid, reference).decode("utf-8"), NOTE["content"])


class ConcurrentDeleteTests(_ErasureCase):
    def test_a_second_delete_while_the_first_works_never_waits_for_it_or_removes_twice(self):
        """(g) The first DELETE is held inside its first item; the second answers at once (pending), works only what is not
        held, and the job completes once."""
        holding, release, removed, real, answers = threading.Event(), threading.Event(), [], erasure.Erasure._remove, {}

        def remove(this, connection, tenant_id, kind, target):
            if not holding.is_set():   # the very first item worked: the first DELETE's (the second starts only after this)
                holding.set()
                release.wait(20)
            outcome = real(this, connection, tenant_id, kind, target)
            removed.append((kind, json.dumps(target, sort_keys=True), outcome[0]))
            return outcome

        def delete_first():
            answers["first"] = self.erase()

        second_client = TestClient(api_main.app, base_url="https://testserver")
        second_client.cookies = self.client.cookies
        with mock.patch.object(erasure.Erasure, "_remove", remove):
            thread = threading.Thread(target=delete_first)
            thread.start()
            self.assertTrue(holding.wait(20))
            answers["second"] = self.erase(second_client)
            self.assertFalse(release.is_set())
            release.set()
            thread.join(30)
        self.assertEqual((answers["second"].status_code, answers["second"].json()["physical_cleanup"]), (202, "pending"), answers["second"].text)
        self.assertEqual((answers["first"].status_code, answers["first"].json()["physical_cleanup"]), (200, "done"), answers["first"].text)
        targets = [target for _, target, _ in removed]
        self.assertEqual(len(targets), len(set(targets)), "an item was worked twice")
        self.assert_finished()


class AccountTests(GovernApiTestCase):
    """(h) The account deletion: each case through the same workflow, then the person's own part as one decision."""

    PHRASE = "刪除我的帳號"
    FRESH_TABLES = True

    def setUp(self):
        super().setUp()
        self.me, self.tid = self.identity["identity_id"], self.tenant["tenant_id"]
        self._card("PRIVATE-CARD")
        self._workflow(self.me, "PRIVATE-FLOW")
        self.case_journal, self.case_artifact = self._run(self.me, "run-on-case", self.pid)
        self.loose_journal, self.loose_artifact = self._run(self.me, "run-on-nothing")
        self.store = api_main.app.dependency_overrides[api_main.get_store]()
        self.artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()

    def _erase_account(self):
        return self.client.post("/govern/account/erase", json={"confirm": self.PHRASE})

    def _jobs(self):
        with self.databases.for_tenant(self.tid) as connection:
            return [tuple(row[1:3]) for row in erasure_outbox.jobs(connection, self.tid)]

    def test_a_failure_before_the_persons_decision_commits_leaves_the_person_able_to_retry(self):
        person = lambda connection, tenant_id, kind, *rest: kind == erasure.PERSON   # noqa: E731
        with mock.patch.object(erasure_outbox, "write_job", _after(erasure_outbox.write_job, person)), self.assertRaisesRegex(RuntimeError, INJECTED):
            self._erase_account()
        self.assertEqual(self.store.get_identity(self.me)["status"], "active")
        self.assertEqual([item["title"] for item in self.workflows.list(self.tid, self.me)], ["PRIVATE-FLOW"])
        self.assertTrue(self.loose_journal.exists())
        self.assertEqual(self.artifacts.read(self.tid, self.loose_artifact), {"content": "RUN-OUTPUT run-on-nothing"})
        self.assertFalse(self.case_journal.exists())   # the case was its own decision, made and finished first
        self.assertEqual(self._jobs(), [])
        response = self._erase_account()
        self.assertEqual((response.status_code, response.json()["physical_cleanup"]), (200, "done"), response.text)
        self.assertEqual(self.store.get_identity(self.me)["status"], "deleted")
        self.assertFalse(self.loose_journal.exists() or self.loose_journal.parent.exists())

    def test_a_file_that_cannot_go_yet_is_said_and_finished_at_the_next_start(self):
        real = pathlib.Path.unlink

        def path_unlink(path, *args, **kwargs):
            if path.name == "run-on-nothing.journal.json":
                raise PermissionError(INJECTED)
            return real(path, *args, **kwargs)

        with mock.patch.object(pathlib.Path, "unlink", path_unlink):
            response = self._erase_account()
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual((response.json()["physical_cleanup"], response.json()["tombstone"], response.json()["runs"]), ("pending", False, 1))
        self.assertEqual(self.store.get_identity(self.me)["status"], "deleted")   # the decision stands
        self.assertEqual(self._jobs(), [(erasure.PERSON, self.me)])
        self.assertTrue(self.loose_journal.exists())
        with self.assertRaises(InvariantViolation):
            self.artifacts.read(self.tid, self.loose_artifact)   # its other items went
        with TestClient(api_main.app, base_url="https://testserver"):
            pass
        self.assertEqual(self._jobs(), [])
        self.assertFalse(self.loose_journal.exists() or self.loose_journal.parent.exists())

    def test_a_case_erased_earlier_with_files_left_is_finished_by_the_account_deletion(self):
        with mock.patch.object(erasure_outbox, "pending_items", side_effect=RuntimeError(INJECTED)):
            self.assertEqual(self.client.delete(f"/projects/{self.pid}").status_code, 202)
        self.assertTrue(self.case_journal.exists())
        response = self._erase_account()
        self.assertEqual((response.status_code, response.json()["physical_cleanup"], response.json()["cases"]), (200, "done", 0), response.text)
        self.assertFalse(self.case_journal.exists())
        with self.assertRaises(InvariantViolation):
            self.artifacts.read(self.tid, self.case_artifact)
        with self.databases.for_tenant(self.tid) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND event_type='ProjectErased'", (self.tid,)).fetchone()[0], 1)


# -- the gate: no irreversible call before the decision ---------------------------------------------------------------

ENGINE = Path(PRODUCT_ROOT)
MODULES = {
    "main": ENGINE / "ai_lego/apps/api/main.py",
    "govern": ENGINE / "ai_lego/apps/api/blocks/govern.py",
    "erasure": ENGINE / "ai_lego/platform/erasure.py",
    "outbox": ENGINE / "ai_lego/data/repositories/erasure_outbox.py",
    "repo": ENGINE / "ai_lego/data/repositories/project_source_repository.py",
    "store": ENGINE / "ai_lego/platform/identity/store.py",
    "workflows": ENGINE / "ai_lego/data/repositories/custom_workflow_repository.py",
}
# Where an erasure starts: the routes, the case erasure the account deletion also calls, and the two decisions.
ROOTS = ("erase_project", "erase_case", "erase_account", "decide_case", "decide_person")
# The cleanup step: it acts only on items a committed decision wrote. The only place an irreversible call may be reached.
CLEANUP = frozenset({"finish", "resume"})
# Removes a file, or commits a change of its own that belongs inside a decision (the split-transaction versions).
IRREVERSIBLE = frozenset({"unlink", "rmdir", "remove", "removedirs", "rmtree", "delete_if_present", "delete_artifacts",
                          "close_collect_grant", "close_collect_grants_for_project", "delete_identity", "delete_person", "collect_unreferenced_blobs"})


def _functions(sources: dict[str, str]) -> dict[str, list[ast.AST]]:
    found: dict[str, list[ast.AST]] = {}
    for text in sources.values():
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                found.setdefault(node.name, []).append(node)
    return found


def _called(node: ast.AST) -> list[str]:
    names = []
    for call in ast.walk(node):
        if isinstance(call, ast.Call):
            target = call.func
            names.append(target.attr if isinstance(target, ast.Attribute) else target.id if isinstance(target, ast.Name) else "")
    return names


def irreversible_before_decision(sources: dict[str, str]) -> list[str]:
    """Every path from an erasure entry point to an irreversible call that does not pass through the cleanup step."""
    functions = _functions(sources)
    problems, seen, stack = [], set(), [(root, (root,)) for root in ROOTS if root in functions]
    while stack:
        name, path = stack.pop()
        if name in seen:
            continue
        seen.add(name)
        for node in functions.get(name, []):
            for called in _called(node):
                if called in IRREVERSIBLE:
                    problems.append(" -> ".join((*path, called)))
                elif called in functions and called not in CLEANUP and called not in seen:
                    stack.append((called, (*path, called)))
    return sorted(set(problems))


class IrreversibleGateTests(unittest.TestCase):
    def _sources(self) -> dict[str, str]:
        return {name: path.read_text(encoding="utf-8") for name, path in MODULES.items()}

    def test_no_irreversible_call_is_reachable_before_the_erasure_decision_commits(self):
        sources = self._sources()
        self.assertTrue(set(ROOTS) <= set(_functions(sources)), "an erasure entry point was renamed: the gate would check nothing")
        self.assertEqual(irreversible_before_decision(sources), [])

    def test_the_gate_sees_an_unlink_put_before_the_decision(self):
        """The gate is not blind: one file removal added to the account deletion before its decision is found by name."""
        sources = self._sources()
        planted = sources["govern"].replace("    counts = erasure.decide_person(", "    Path('x').unlink()\n    counts = erasure.decide_person(", 1)
        self.assertNotEqual(planted, sources["govern"])
        self.assertEqual(irreversible_before_decision({**sources, "govern": planted}), ["erase_account -> unlink"])
        moved = sources["erasure"].replace("            grants = IdentityStore.close_collect_grants_on(", "            self._source_cas.unlink(tenant_id, {})\n            grants = IdentityStore.close_collect_grants_on(", 1)
        self.assertIn("decide_case -> unlink", irreversible_before_decision({**sources, "erasure": moved}))

"""Erasure across the database and the files (docs/platform/STORAGE_SWITCH.md "Erasure across the database and the
files"): one durable, idempotent workflow for a case (DELETE /projects/{id}, and each case of an account deletion) and
for a person's own part of an account deletion.

The invariant: nothing irreversible happens before the decision it depends on is durable, and a durable decision to
erase can always be finished.

1. Decide (one transaction): the rows go -- for a case its every record, Sources, AI artifact rows, runs and the
   Project row, its collect grants closed; for a person the workflows, the person's records and the identity -- and the
   outbox (ai_lego/data/repositories/erasure_outbox.py) names what is left on disk: unreferenced Source blobs, AI
   artifacts, run journals. References only, never content. Nothing on disk is touched before this commits; if it
   fails, everything is as it was.
2. Clean up (``finish``), after that commit: each item in its own short transaction, held by one worker (SKIP LOCKED),
   removed idempotently (an item already gone is ``absent``). A Source blob is removed only if, under the blob lock,
   no committed row names it any more (another case's Source sharing the content keeps it). A filesystem error leaves
   the item pending for the next try.
3. Complete: when no item is pending, the case's ProjectErased tombstone is appended and the job row goes, in one
   transaction. Until then the API says the cleanup is pending and no tombstone exists.

An unfinished job is found again by a repeated DELETE of the case by the person who erased it, by an account
deletion of that person (``resume`` narrowed to them), and by ``resume`` at every API start. Nothing here waits for a
case's hooks (the erase takes the case lock, never the hooks lock).

Every irreversible call of the erase paths lives in ``Erasure._remove`` and ``Erasure._after_cleanup``;
tests/unit/test_erasure_workflow.py fails if one is reachable from an erasure entry point any other way.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping

import psycopg

from ai_lego.data.events import record_log
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories import erasure_outbox as outbox
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.workflow.run_lock import lock_path_for

_log = logging.getLogger(__name__)

CASE, PERSON = "case", "person"
JOURNAL_SUFFIX = ".journal.json"
# A filesystem refusal the next try may get past; any other InvariantViolation of a store is a reference a retry cannot mend.
_RETRYABLE = ("CAS_OBJECT_UNLINK_FAILED",)

JournalPath = Callable[..., Path]   # (tenant_id, run_id, identity_id) -> the run's journal path (main.workflow_journal_path)

_CAS_PATH = re.compile(r"/objects/[A-Za-z0-9_-]{1,128}/sha256/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}")


def artifact_reference_ok(reference: Any) -> bool:
    """A reference as ``JsonArtifactStore.put`` makes it. A reference read out of a file is a claim: only one of this shape is
    handed to the store (a path with a null byte or a drive letter never reaches the filesystem)."""
    return (isinstance(reference, dict) and isinstance(reference.get("cas_path"), dict) and isinstance(reference["cas_path"].get("path"), str)
            and _CAS_PATH.fullmatch(reference["cas_path"]["path"]) is not None
            and isinstance(reference.get("content_sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", reference["content_sha256"]) is not None)


def sidecar_of(journal: Path) -> Path:
    """The file the server writes beside every run: which case it ran on and every artifact it stored."""
    return journal.with_name(journal.name.replace(JOURNAL_SUFFIX, ".case.json"))


def physical_retention_hook(tenant_id: str, subject_kind: str, subject_id: str) -> None:
    """The one place a step after a finished erasure would reach the database's own files -- a VACUUM of the touched
    tables, say. Deliberately empty: what happens to a deleted row's bytes (VACUUM, WAL, dump expiry) is the operator's
    decision (STORAGE_SWITCH.md "Physical retention decision"), not this module's."""


def _unstorable(value: Any) -> bool:
    """Text jsonb refuses: a NUL, or a lone surrogate (json.loads makes one from an escaped half pair). A claim read from
    a run's file may hold either; stored as it is, it would fail the decision and block the erasure for good."""
    if isinstance(value, str):
        return any(character == "\x00" or 0xD800 <= ord(character) <= 0xDFFF for character in value)
    if isinstance(value, Mapping):
        return any(_unstorable(key) or _unstorable(item) for key, item in value.items())
    if isinstance(value, (list, tuple)):
        return any(_unstorable(item) for item in value)
    return False


def _label(reference: Any) -> str:
    text = str(reference.get("artifact_type"))[:80] if isinstance(reference, Mapping) else "?"
    return "".join("\ufffd" if _unstorable(character) else character for character in text)


def _artifact_items(references: Iterable[Any]) -> list[tuple[str, dict[str, Any], str, str | None]]:
    """One item per distinct artifact. A malformed reference (or one jsonb cannot hold) is settled at once as unremovable:
    it names no file a retry could reach, and the person is told in ``failed``."""
    items, seen = [], set()
    for reference in references:
        if not artifact_reference_ok(reference) or _unstorable(reference):
            items.append(("artifact", {"artifact_type": _label(reference)}, "unremovable", "ARTIFACT_REFERENCE_MALFORMED"))
            continue
        if reference["cas_path"]["path"] in seen:
            continue
        seen.add(reference["cas_path"]["path"])
        items.append(("artifact", {"artifact_type": _label(reference), "reference": dict(reference)}, "pending", None))
    return items


def _run_items(runs: Iterable[Mapping[str, Any]]) -> list[tuple[str, dict[str, Any], str, str | None]]:
    return [("run_files", {"run_id": run["run_id"], "identity_id": run["identity_id"]}, "pending", None) for run in runs]


class Erasure:
    """``journal_path``: where a run's journal lives (main.workflow_journal_path); runs are named to it by
    (run_id, identity_id), so the outbox never holds a host path."""

    def __init__(self, repo: ProjectSourceRepository, source_cas: TenantScopedCas, artifact_store: JsonArtifactStore, journal_path: JournalPath) -> None:
        self._repo = repo
        self._source_cas = source_cas
        self._artifacts = artifact_store
        self._journal_path = journal_path

    # -- 1. the decisions --------------------------------------------------------------------------------------------

    def decide_case(self, tenant_id: str, project_id: str, identity_id: str, runs: list[Mapping[str, Any]]) -> None:
        """``runs``: the person's recipe runs on this case ({run_id, identity_id, artifacts}), none of them running."""
        with self._repo.transaction(tenant_id) as connection:
            erased = ProjectSourceRepository.erase_case_rows(connection, tenant_id, project_id)
            items = [("source_blob", {"path": path}, "pending", None) for path in ProjectSourceRepository.unreferenced_blobs(connection, tenant_id, self._source_cas)]
            items += _artifact_items([*erased["artifact_references"], *(reference for run in runs for reference in run["artifacts"])])
            items += _run_items(runs)
            grants = IdentityStore.close_collect_grants_on(connection, tenant_id, project_id)
            outbox.write_job(connection, tenant_id, CASE, project_id, identity_id, {"sources": erased["sources"], "events_deleted": erased["events_deleted"], "grants_closed": grants}, items)

    def decide_person(self, tenant_id: str, identity_id: str, runs: list[Mapping[str, Any]]) -> dict[str, int]:
        """The person's own part, after their cases: the workflows and their records, the person's other records and the
        identity (a marker stays: IdentityStore.delete_identity) in one transaction, with the runs on no case as the outbox."""
        with self._repo.transaction(tenant_id) as connection:
            workflows = CustomWorkflowRepository.delete_person_on(connection, tenant_id, identity_id)   # first: one events table holds both
            records = record_log.delete_owned(connection, tenant_id, record_log.person(identity_id))
            IdentityStore.delete_identity_on(connection, tenant_id, identity_id)
            items = _artifact_items(reference for run in runs for reference in run["artifacts"]) + _run_items(runs)
            counts = {"records": records, "workflows": workflows, "runs": len(runs)}
            outbox.write_job(connection, tenant_id, PERSON, identity_id, identity_id, counts, items)
        return counts

    # -- the entry points --------------------------------------------------------------------------------------------

    def erase_case(self, tenant_id: str, project_id: str, identity_id: str, runs: list[Mapping[str, Any]]) -> dict[str, Any]:
        """Decide, then clean up. A second DELETE that lost the race to the first finds no case: it finishes the first's job
        instead (same person) -- never a second decision."""
        try:
            self.decide_case(tenant_id, project_id, identity_id, runs)
        except InvariantViolation as error:
            if not str(error).startswith("PROJECT_NOT_FOUND") or not self.pending_for(tenant_id, CASE, project_id, identity_id):
                raise
        return self.finish(tenant_id, CASE, project_id)

    def pending_for(self, tenant_id: str, subject_kind: str, subject_id: str, identity_id: str) -> bool:
        """Whether this person has an unfinished erasure of this subject."""
        with self._repo.transaction(tenant_id) as connection:
            job = outbox.job(connection, tenant_id, subject_kind, subject_id)
        return job is not None and job["erased_by_identity_id"] == identity_id

    def resume(self, *, tenant_id: str | None = None, erased_by_identity_id: str | None = None) -> list[dict[str, Any]]:
        """Finish every unfinished job in every region (at API start), or only a tenant's / a person's."""
        databases = self._repo.databases
        found = []
        for region in databases.regions():
            with databases.transaction(region) as connection:
                found += outbox.jobs(connection, tenant_id, erased_by_identity_id)
        return [{"tenant_id": job["tenant_id"], "subject_kind": job["subject_kind"], "subject_id": job["subject_id"], **self.finish(job["tenant_id"], job["subject_kind"], job["subject_id"])}
                for job in found]

    # -- 2. the cleanup, after the decision committed -----------------------------------------------------------------

    def finish(self, tenant_id: str, subject_kind: str, subject_id: str) -> dict[str, Any]:
        """Work the job's pending items, then complete it if none is left. Never raises once the decision is committed: a
        failure is logged and the answer says the cleanup is pending (the job is still there for the next try)."""
        try:
            with self._repo.transaction(tenant_id) as connection:
                numbers = outbox.pending_items(connection, tenant_id, subject_kind, subject_id)
            for number in numbers:
                self._work(tenant_id, subject_kind, subject_id, number)
            return self._complete(tenant_id, subject_kind, subject_id)
        except Exception:   # the decision stands; a 500 would tell the person nothing was erased
            _log.exception("erasure cleanup interrupted: tenant %s %s %s (the job stays; a later DELETE or the next start finishes it)", tenant_id, subject_kind, subject_id)
            return {"physical_cleanup": "pending", "failed": []}

    def _work(self, tenant_id: str, subject_kind: str, subject_id: str, number: int) -> None:
        with self._repo.transaction(tenant_id) as connection:
            item = outbox.claim(connection, tenant_id, subject_kind, subject_id, number)
            if item is None:   # settled meanwhile, or another worker holds it
                return
            try:
                state, error = self._remove(connection, tenant_id, item["kind"], item["target_json"])
            except OSError as failure:
                _log.warning("erasure item not removed yet (%s %s #%s): %s", subject_kind, subject_id, number, type(failure).__name__)
                outbox.note_attempt(connection, tenant_id, subject_kind, subject_id, number, f"{type(failure).__name__}: {getattr(failure, 'errno', '')}"[:80])
                return
            outbox.settle(connection, tenant_id, subject_kind, subject_id, number, state, error)

    def _remove(self, connection: psycopg.Connection, tenant_id: str, kind: str, target: Mapping[str, Any]) -> tuple[str, str | None]:
        """One item; idempotent. Returns (state, error). OSError: try again later."""
        try:
            if kind == "source_blob":
                path = target["path"]
                if ProjectSourceRepository.blob_referenced(connection, tenant_id, path.rsplit("/", 1)[-1]):
                    return "kept", None
                try:
                    self._source_cas.unlink(tenant_id, {"path": path, "tenant_segment": tenant_id})
                except InvariantViolation as error:
                    if str(error).startswith("CAS_OBJECT_NOT_FOUND"):
                        return "absent", None
                    raise
                return "removed", None
            if kind == "artifact":
                reference = target["reference"]
                if ProjectSourceRepository.artifact_referenced(connection, tenant_id, reference["cas_path"]["path"]):
                    return "kept", None
                return ("removed" if self._artifacts.delete_if_present(tenant_id, reference) else "absent"), None
            if kind == "run_files":
                folder = self._journal_path(tenant_id, "x", target["identity_id"]).parent
                run_id = target["run_id"]
                if not isinstance(run_id, str) or not run_id or "/" in run_id or "\\" in run_id or run_id in (".", ".."):
                    raise InvariantViolation("RUN_REFERENCE_INVALID")
                journal = folder / f"{run_id}{JOURNAL_SUFFIX}"
                present = [path for path in (journal, lock_path_for(journal), sidecar_of(journal)) if path.exists()]
                for path in present:
                    path.unlink(missing_ok=True)
                return ("removed" if present else "absent"), None
            raise InvariantViolation(f"ERASURE_ITEM_KIND_UNKNOWN: {kind!r}")
        except InvariantViolation as error:
            if str(error).startswith(_RETRYABLE):
                raise OSError(str(error)) from error
            return "unremovable", str(error)[:80]

    def _complete(self, tenant_id: str, subject_kind: str, subject_id: str) -> dict[str, Any]:
        with self._repo.transaction(tenant_id) as connection:
            job = outbox.job(connection, tenant_id, subject_kind, subject_id, for_update=True)
            if job is None:   # another worker completed it after this one's items
                return self._completed_elsewhere(tenant_id, subject_kind, subject_id)
            tally = outbox.tally(connection, tenant_id, subject_kind, subject_id)
            failed = outbox.unremovable(connection, tenant_id, subject_kind, subject_id)
            pending = sum(count for (_, state), count in tally.items() if state == "pending")
            summary = self._summary(subject_kind, job["counts_json"], tally)
            if pending:
                return {**summary, "physical_cleanup": "pending", "pending_items": pending, "failed": failed}
            if subject_kind == CASE:
                ProjectSourceRepository.append_tombstone(connection, tenant_id, subject_id, job["erased_by_identity_id"], summary["erased"])
            outbox.delete_job(connection, tenant_id, subject_kind, subject_id)
        self._after_cleanup(tenant_id, subject_kind, subject_id)
        return {**summary, "physical_cleanup": "done", "failed": failed}

    @staticmethod
    def _summary(subject_kind: str, decided: Mapping[str, int], tally: Mapping[tuple[str, str], int]) -> dict[str, Any]:
        if subject_kind == CASE:   # the tombstone's counts: what was removed, not what was meant to be
            return {"erased": {"sources": decided["sources"], "blobs_unlinked": tally.get(("source_blob", "removed"), 0),
                               "artifacts_deleted": tally.get(("artifact", "removed"), 0), "events_deleted": decided["events_deleted"]}}
        return {"records": decided["records"], "workflows": decided["workflows"], "runs": decided["runs"]}

    def _completed_elsewhere(self, tenant_id: str, subject_kind: str, subject_id: str) -> dict[str, Any]:
        if subject_kind == CASE:
            tombstones = [event["payload"] for event in self._repo.list_events(tenant_id, f"project:{subject_id}") if event["event_type"] == "ProjectErased"]
            erased = {key: tombstones[-1][key] for key in ("sources", "blobs_unlinked", "artifacts_deleted", "events_deleted")} if tombstones else None
            return {"erased": erased, "physical_cleanup": "done" if tombstones else "pending", "failed": []}
        return {"physical_cleanup": "done", "failed": []}

    def _after_cleanup(self, tenant_id: str, subject_kind: str, subject_id: str) -> None:
        """After the completing commit: a person's run folder goes when nothing is left in it; then the retention hook."""
        if subject_kind == PERSON:
            folder = self._journal_path(tenant_id, "x", subject_id).parent
            try:
                if folder.is_dir() and not any(folder.iterdir()):
                    folder.rmdir()
            except OSError:
                _log.warning("an emptied run folder stays (tenant %s): it holds nothing", tenant_id)
        physical_retention_hook(tenant_id, subject_kind, subject_id)

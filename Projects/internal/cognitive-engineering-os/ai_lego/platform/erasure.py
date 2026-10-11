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
   The runs are read inside the decision, under the lock their admission takes (``admit_run``): a run admitted
   before the decision is named in the outbox (or, still running, refuses the erase); one admitted after finds no
   case, or no identity, and writes nothing.
2. Clean up (``finish``), after that commit: each item in its own short transaction, held by one worker (SKIP LOCKED),
   removed idempotently (an item already gone is ``absent``). A Source blob is removed only if, under the blob lock,
   no committed row names it any more (another case's Source sharing the content keeps it); an AI artifact only if no
   committed artifact row names it (a run's artifact is never shared: recipe_runtime.persist_artifact_output gives each
   write its own bytes). A well-formed path of this tenant is removed even when its bytes no longer match the
   reference's hash: erasing removes the person's file, it does not vouch for it. A filesystem error leaves the item
   pending for the next try; one that keeps failing is logged as an error and listed by ``needs_attention``.
3. Complete: when every item is settled and none is ``unresolvable`` (a reference that names no file of this tenant:
   nothing a retry can reach, so "done" cannot be claimed), the case's ProjectErased tombstone is appended and the job
   row goes, in one transaction. Until then the API says ``pending`` (a retry will do it) or ``blocked`` (an operator
   must look: ``needs_attention``), and no tombstone exists.

An unfinished job is found again by a repeated DELETE of the case by the person who erased it, by an account
deletion of that person (``resume`` narrowed to them), and by ``resume`` at every API start. Nothing here waits for a
case's hooks (the erase takes the case lock, never the hooks lock).

Every irreversible call of the erase paths lives in ``Erasure._remove`` and ``Erasure._after_cleanup``;
tests/unit/test_erasure_workflow.py fails if one is reachable from an erasure entry point any other way. After each
erasure transaction commits (a decision, the groups part, the completion), ``physical_retention_hook`` VACUUMs the tables
it deleted or updated rows of, in the background (STORAGE_SWITCH.md "Physical retention decision").
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping

import psycopg

from ai_lego.data import db
from ai_lego.data.db import Databases
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
ATTENTION_ATTEMPTS = 5   # a pending item that failed this often is logged as an error and listed by needs_attention

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


def admit_run(connection: psycopg.Connection, tenant_id: str, identity_id: str, project_id: str | None) -> None:
    """The lock a recipe run's admission holds while it takes its run lock and writes its sidecar (main.run_recipe): the
    case lock (shared) and the case still there, then the person lock (shared) and the identity still active. Each
    decision takes its own one exclusive and reads the runs after it, so no run slips between that read and the commit."""
    if project_id is not None:
        ProjectSourceRepository.require_case(connection, tenant_id, project_id)
    record_log.require_person(connection, tenant_id, identity_id)


# One worker: the VACUUMs of every erasure in this process run one after another, never beside the API's request.
_VACUUMS = ThreadPoolExecutor(max_workers=1, thread_name_prefix="erasure-vacuum")


def touched_tables(connection: psycopg.Connection) -> tuple[str, ...]:
    """The tables this transaction left dead rows in (deleted or updated), read just before it commits. A superset: counts
    of earlier transactions on the same connection not yet flushed to the server's statistics are included too."""
    return tuple(row[0] for row in connection.execute(
        "SELECT relname FROM pg_stat_xact_user_tables WHERE schemaname = current_schema() AND n_tup_del + n_tup_upd > 0 ORDER BY relname"))


def physical_retention_hook(databases: Databases, tenant_id: str, tables: Iterable[str]) -> Future[None] | None:
    """The one place an erasure reaches the database's own files (decided 2026-10-10, STORAGE_SWITCH.md "Physical retention
    decision"): after its transaction committed, VACUUM each table it touched, so the dead rows are pruned from the data
    files. In the background (the answer never waits) and never fatal (a failure is logged; autovacuum prunes later). Not
    the WAL, not the nightly dumps (kept 7 days), and the freed space is not zeroed."""
    tables = tuple(tables)
    if not tables:
        return None
    try:   # the region now, while the tenant's directory line is certainly there; the erasure stands whatever fails here
        region = databases.region_of(tenant_id)
        if region is None:
            raise InvariantViolation("TENANT_REGION_UNKNOWN")
        return _VACUUMS.submit(_vacuum, databases, tenant_id, region, tables)
    except Exception as error:   # no region, or the worker is shut down (interpreter exit): autovacuum prunes later
        _log.warning("erasure VACUUM not queued (tenant %s): %s", tenant_id, type(error).__name__)
        return None


def _vacuum(databases: Databases, tenant_id: str, region: str, tables: tuple[str, ...]) -> None:
    for table in tables:
        try:
            databases.vacuum(region, table)
        except Exception as error:
            _log.warning("erasure VACUUM of %s failed (tenant %s, region %s): %s: %s; autovacuum prunes it later", table, tenant_id, region, type(error).__name__, error)


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
    """One item per distinct artifact. A malformed reference (or one jsonb cannot hold) is settled at once as unresolvable:
    it names no file a retry could reach; the person is told in ``failed`` and the job stays open for an operator."""
    items, seen = [], set()
    for reference in references:
        if not artifact_reference_ok(reference) or _unstorable(reference):
            items.append(("artifact", {"artifact_type": _label(reference)}, "unresolvable", "ARTIFACT_REFERENCE_MALFORMED"))
            continue
        if reference["cas_path"]["path"] in seen:
            continue
        seen.add(reference["cas_path"]["path"])
        items.append(("artifact", {"artifact_type": _label(reference), "reference": dict(reference)}, "pending", None))
    return items


def _run_items(runs: Iterable[Mapping[str, Any]]) -> list[tuple[str, dict[str, Any], str, str | None]]:
    return [("run_files", {"run_id": run["run_id"], "identity_id": run["identity_id"]}, "pending", None) for run in runs]


def _no_record(connection: psycopg.Connection, tenant_id: str, project_id: str) -> bool:
    """Whether the case's intake (its latest version) chose 不留紀錄 -- read on the erasure's own connection, under its lock."""
    row = connection.execute(
        "SELECT payload_json->'content'->>'no_record' AS no_record FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s "
        "AND event_type='DocSaved' AND payload_json->>'kind' = 'assembler.intake' ORDER BY write_order DESC LIMIT 1", (tenant_id, project_id)).fetchone()
    return row is not None and row["no_record"] == "true"


def _holds_intake(connection: Any, tenant_id: str, project_id: str) -> bool:
    """開案資料 was saved (assembler.intake is not deletable, so one DocSaved is enough): the project is a case."""
    return connection.execute(
        "SELECT 1 FROM events WHERE tenant_id=%s AND owner_kind='case' AND owner_id=%s AND event_type='DocSaved' "
        "AND payload_json->>'kind' = 'assembler.intake' LIMIT 1", (tenant_id, project_id)).fetchone() is not None


class Erasure:
    """``journal_path``: where a run's journal lives (main.workflow_journal_path); runs are named to it by
    (run_id, identity_id), so the outbox never holds a host path."""

    def __init__(self, repo: ProjectSourceRepository, source_cas: TenantScopedCas, artifact_store: JsonArtifactStore, journal_path: JournalPath) -> None:
        self._repo = repo
        self._source_cas = source_cas
        self._artifacts = artifact_store
        self._journal_path = journal_path

    # -- 1. the decisions --------------------------------------------------------------------------------------------

    def decide_case(self, tenant_id: str, project_id: str, identity_id: str, runs: Callable[[], list[Mapping[str, Any]]], *, only_if_no_record: bool = False,
                    only_if_not_case: bool = False) -> None:
        """``runs()``: the person's recipe runs on this case ({run_id, identity_id, artifacts}); read under the case lock,
        after every admission in flight (admit_run); raises (and nothing is decided) while one still runs. A case whose
        intake says 不留紀錄 (card 32) gets no tombstone, read under the same lock; ``only_if_no_record`` (closing it)
        refuses a case that keeps its records (CASE_KEEPS_RECORDS). ``only_if_not_case`` (deleting from 我的分析)
        refuses a project whose 開案資料 is saved (PROJECT_IS_A_CASE): read under the exclusive lock every doc writer
        takes shared, so an intake saved while the delete waited is seen (Codex review 2026-10-11 round 3)."""
        with self._repo.transaction(tenant_id) as connection:
            ProjectSourceRepository.lock_case(connection, tenant_id, project_id, exclusive=True)
            no_record = _no_record(connection, tenant_id, project_id)
            if only_if_no_record and not no_record:
                raise InvariantViolation("CASE_KEEPS_RECORDS: this case did not choose 不留紀錄; delete it instead")
            if only_if_not_case and _holds_intake(connection, tenant_id, project_id):
                raise InvariantViolation("PROJECT_IS_A_CASE: it holds 開案資料 now; delete it from the case's own page")
            erased = ProjectSourceRepository.erase_case_rows(connection, tenant_id, project_id)
            runs = runs()
            items = [("source_blob", {"path": path}, "pending", None) for path in ProjectSourceRepository.unreferenced_blobs(connection, tenant_id, self._source_cas)]
            items += _artifact_items([*erased["artifact_references"], *(reference for run in runs for reference in run["artifacts"])])
            items += _run_items(runs)
            grants = IdentityStore.close_collect_grants_on(connection, tenant_id, project_id)
            counts = {"sources": erased["sources"], "events_deleted": erased["events_deleted"], "grants_closed": grants, **({"no_record": True} if no_record else {})}
            outbox.write_job(connection, tenant_id, CASE, project_id, identity_id, counts, items)
            tables = touched_tables(connection)
        physical_retention_hook(self._repo.databases, tenant_id, tables)

    def decide_groups(self, tenant_id: str, identity_id: str) -> dict[str, int]:
        """The account erasure's first step, before any case is erased (Codex F3): under the person lock held exclusive,
        refused while the person leads a group alone (ACCOUNT_IS_LAST_CONVENER -- nothing is erased then), else their
        memberships, invitations and group records go. decide_person runs the same part again for anything since."""
        with self._repo.transaction(tenant_id) as connection:
            db.owner_lock(connection, "person", tenant_id, identity_id, exclusive=True)
            erased = ProjectSourceRepository.erase_person_from_groups(connection, tenant_id, identity_id)
            tables = touched_tables(connection)
        physical_retention_hook(self._repo.databases, tenant_id, tables)
        return erased

    def decide_person(self, tenant_id: str, identity_id: str, runs: Callable[[], list[Mapping[str, Any]]]) -> dict[str, int]:
        """The person's own part, after their cases: the workflows and their records, their memberships and what they wrote
        in groups (refused while they lead a group alone: ACCOUNT_IS_LAST_CONVENER), the person's other records and the
        identity (a marker stays: IdentityStore.delete_identity) in one transaction, with the runs left in their folder as
        the outbox -- read under the person lock, after every admission in flight (admit_run)."""
        with self._repo.transaction(tenant_id) as connection:
            db.owner_lock(connection, "person", tenant_id, identity_id, exclusive=True)
            if connection.execute("SELECT 1 FROM platform_projects WHERE tenant_id=%s AND created_by_identity_id=%s LIMIT 1", (tenant_id, identity_id)).fetchone():
                raise InvariantViolation("ACCOUNT_HAS_LIVE_CASES: a case was opened while the account was being deleted; delete the account again")
            groups = ProjectSourceRepository.erase_person_from_groups(connection, tenant_id, identity_id)
            runs = runs()
            workflows = CustomWorkflowRepository.delete_person_on(connection, tenant_id, identity_id)   # first: one events table holds both
            records = record_log.delete_owned(connection, tenant_id, record_log.person(identity_id))
            records += record_log.delete_written_by(connection, tenant_id, identity_id, "platform", documents_only=True)   # their appeals
            if not IdentityStore.delete_identity_on(connection, tenant_id, identity_id):   # a second deletion that waited for the first
                raise InvariantViolation("ACCOUNT_ALREADY_ERASED: this account is already deleted")
            items = _artifact_items(reference for run in runs for reference in run["artifacts"]) + _run_items(runs)
            counts = {"records": records, "workflows": workflows, "runs": len(runs), **groups}
            outbox.write_job(connection, tenant_id, PERSON, identity_id, identity_id, counts, items)
            tables = touched_tables(connection)
        physical_retention_hook(self._repo.databases, tenant_id, tables)
        return counts

    # -- the entry points --------------------------------------------------------------------------------------------

    def erase_case(self, tenant_id: str, project_id: str, identity_id: str, runs: Callable[[], list[Mapping[str, Any]]], *, only_if_no_record: bool = False,
                   only_if_not_case: bool = False) -> dict[str, Any]:
        """Decide, then clean up. A second DELETE that lost the race to the first finds no case: it finishes the first's job
        instead (same person) -- never a second decision."""
        try:
            self.decide_case(tenant_id, project_id, identity_id, runs, only_if_no_record=only_if_no_record, only_if_not_case=only_if_not_case)
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

    def needs_attention(self) -> list[dict[str, Any]]:
        """For an operator (``python -m ai_lego.platform.erasure``, and logged at every API start): every item of an unfinished
        erasure that no retry will settle (unresolvable) or that kept failing (pending, ATTENTION_ATTEMPTS tries or more)."""
        databases = self._repo.databases
        found = []
        for region in databases.regions():
            with databases.transaction(region) as connection:
                found += [{"region": region, **dict(row)} for row in outbox.needs_attention(connection, ATTENTION_ATTEMPTS)]
        return found

    # -- 2. the cleanup, after the decision committed -----------------------------------------------------------------

    def finish(self, tenant_id: str, subject_kind: str, subject_id: str) -> dict[str, Any]:
        """Work the job's pending items, then complete it if none is open. Never raises once the decision is committed: a
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
                attempts = outbox.note_attempt(connection, tenant_id, subject_kind, subject_id, number, f"{type(failure).__name__}: {getattr(failure, 'errno', '')}"[:80])
                log = _log.error if attempts >= ATTENTION_ATTEMPTS else _log.warning
                log("erasure item not removed yet (tenant %s %s %s #%s, try %s): %s", tenant_id, subject_kind, subject_id, number, attempts, type(failure).__name__)
                return
            outbox.settle(connection, tenant_id, subject_kind, subject_id, number, state, error)

    def _remove(self, connection: psycopg.Connection, tenant_id: str, kind: str, target: Mapping[str, Any]) -> tuple[str, str | None]:
        """One item; idempotent. Returns (state, error). OSError: try again later."""
        try:
            if kind == "source_blob":
                path = target["path"]
                if ProjectSourceRepository.blob_referenced(connection, tenant_id, path.rsplit("/", 1)[-1]):
                    return "kept", None
                return self._unlink(self._source_cas, tenant_id, {"path": path, "tenant_segment": tenant_id})
            if kind == "artifact":
                cas_path = dict(target["reference"]["cas_path"])
                if ProjectSourceRepository.artifact_referenced(connection, tenant_id, cas_path["path"]):
                    return "kept", None
                return self._unlink(self._artifacts.cas, tenant_id, cas_path)   # by its path: a hash mismatch does not keep the file
            if kind == "run_files":
                folder = self._journal_path(tenant_id, "x", target["identity_id"]).parent
                run_id = target["run_id"]
                if not isinstance(run_id, str) or not run_id or "/" in run_id or "\\" in run_id or run_id in (".", ".."):
                    return "unresolvable", "RUN_REFERENCE_INVALID"
                journal = folder / f"{run_id}{JOURNAL_SUFFIX}"
                present = [path for path in (journal, lock_path_for(journal), sidecar_of(journal)) if path.exists()]
                for path in present:
                    path.unlink(missing_ok=True)
                return ("removed" if present else "absent"), None
            return "unresolvable", f"ERASURE_ITEM_KIND_UNKNOWN: {kind!r}"[:80]
        except InvariantViolation as error:
            if str(error).startswith(_RETRYABLE):
                raise OSError(str(error)) from error
            return "unresolvable", str(error)[:80]   # another tenant's path, or none: nothing of this tenant to reach

    @staticmethod
    def _unlink(cas: TenantScopedCas, tenant_id: str, cas_path: dict[str, str]) -> tuple[str, str | None]:
        try:
            cas.unlink(tenant_id, cas_path)
        except InvariantViolation as error:
            if str(error).startswith("CAS_OBJECT_NOT_FOUND"):
                return "absent", None
            raise
        return "removed", None

    def _complete(self, tenant_id: str, subject_kind: str, subject_id: str) -> dict[str, Any]:
        with self._repo.transaction(tenant_id) as connection:
            job = outbox.job(connection, tenant_id, subject_kind, subject_id, for_update=True)
            if job is None:   # another worker completed it after this one's items
                return self._completed_elsewhere(tenant_id, subject_kind, subject_id)
            tally = outbox.tally(connection, tenant_id, subject_kind, subject_id)
            failed = outbox.failed(connection, tenant_id, subject_kind, subject_id)
            pending = sum(count for (_, state), count in tally.items() if state == "pending")
            unresolved = sum(count for (_, state), count in tally.items() if state == "unresolvable")
            summary = self._summary(subject_kind, job["counts_json"], tally)
            if pending or unresolved:   # "done" only when every target is accounted for
                if not pending:
                    _log.error("erasure blocked: tenant %s %s %s has %d reference(s) that name no file of the tenant; an operator must look (python -m ai_lego.platform.erasure)",
                               tenant_id, subject_kind, subject_id, unresolved)
                return {**summary, "physical_cleanup": "pending" if pending else "blocked", "pending_items": pending + unresolved, "failed": failed}
            if subject_kind == CASE and not job["counts_json"].get("no_record"):   # 不留紀錄: not even 「已抹除」
                ProjectSourceRepository.append_tombstone(connection, tenant_id, subject_id, job["erased_by_identity_id"], summary["erased"])
            outbox.delete_job(connection, tenant_id, subject_kind, subject_id)
            tables = touched_tables(connection)
        self._after_cleanup(tenant_id, subject_kind, subject_id, tables)
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

    def _after_cleanup(self, tenant_id: str, subject_kind: str, subject_id: str, tables: tuple[str, ...]) -> None:
        """After the completing commit: a person's run folder goes when nothing is left in it; then the retention hook over
        what the completion touched (the outbox rows: references, never content)."""
        if subject_kind == PERSON:
            folder = self._journal_path(tenant_id, "x", subject_id).parent
            try:
                if folder.is_dir() and not any(folder.iterdir()):
                    folder.rmdir()
            except OSError:
                _log.warning("an emptied run folder stays (tenant %s): it holds nothing", tenant_id)
        physical_retention_hook(self._repo.databases, tenant_id, tables)


def main() -> int:
    """``python -m ai_lego.platform.erasure``: print, one JSON line each, the erasure items an operator must look at (read only)."""
    import json

    from ai_lego.data.db import Databases

    with Databases.from_env() as databases:
        for item in Erasure(ProjectSourceRepository(databases), TenantScopedCas(Path(".")), JsonArtifactStore(TenantScopedCas(Path("."))), lambda *_: Path(".")).needs_attention():
            print(json.dumps(item, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

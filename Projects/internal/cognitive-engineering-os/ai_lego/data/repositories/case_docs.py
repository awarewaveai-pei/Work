"""A block's documents in the record stream (共用紀錄): save a new version, delete, read the current versions or one
document's history. Every write goes through record_log (author, block, owner, the kind's own rules).

A document lives on its own aggregate ``doc:<doc_id>`` and belongs to a case, to the person or to a group (its kind says
which), in the tenant's region, so erasing the case, the person or the group erases it.

Across processes (docs/platform/STORAGE_SWITCH.md invariant 2): a next version is decided under the document's aggregate
lock (record_log.lock_aggregate), taken before its history is read, so DOC_STALE holds; a new document of a one-per-owner
kind under the (owner, kind) lock, so DOC_SINGLETON_EXISTS holds. A case's document is written under the case lock
(ProjectSourceRepository.require_case), and so is a person's record made from a case (its ``from_case`` field). A
group's document is written under the group lock while the group is open and, from a person, while they are a current
member (ProjectSourceRepository.require_group: G1, G3); only the person who wrote every version of one deletes it.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Callable, Iterator, Mapping
from uuid import uuid4

import psycopg

from ai_lego.core.domain import doc_kinds
from ai_lego.data import db
from ai_lego.data.db import Row
from ai_lego.data.events import record_log
from ai_lego.data.events.record_log import Owner, Writer
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation


def _row(row: Row) -> dict[str, Any]:
    payload = row["payload_json"]
    return {"doc_id": payload["doc_id"], "kind": payload["kind"], "version": payload.get("version"), "content": payload.get("content"),
            "author": row["author"], "block": row["block"], "at": row["occurred_at"], "deleted": row["event_type"] == "DocDeleted"}


def _lock_singleton(connection: psycopg.Connection, tenant_id: str, owner: Owner, kind: str) -> None:
    """DOC_SINGLETON_EXISTS's lock: one owner's new documents of one kind, one at a time."""
    db.advisory_xact_lock(connection, "doc-singleton", tenant_id, owner.kind, owner.id, kind)


def _not_a_group(owner: Owner) -> None:
    if owner.kind == "group":
        raise InvariantViolation("DOC_GROUP_READ_NEEDS_VISIBILITY: a group's records are read through platform/visibility.py")
    if owner.kind == "platform":   # an appeal: who wrote it is masked by its one read path
        raise InvariantViolation("DOC_PLATFORM_READ_NEEDS_VISIBILITY: the platform's documents are read through platform/visibility.py")


class CaseDocs:
    def __init__(self, repo: ProjectSourceRepository) -> None:
        self._repo = repo

    @property
    def reads(self) -> "CaseReads":
        """What block hooks may read beside the docs: the case itself, its stored pages, their events, its collection runs."""
        return CaseReads(self._repo)

    def hooks_lock(self, tenant_id: str, owner: Owner):
        """One run of an owner's after-sources hooks at a time, in every process (block_hooks)."""
        return self._repo.hooks_lock(tenant_id, owner.id)

    @staticmethod
    def _history(connection: psycopg.Connection, tenant_id: str, owner: Owner, doc_id: str) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT event_type, occurred_at, payload_json, author, block FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s AND aggregate_id=%s "
            "AND event_type IN ('DocSaved','DocDeleted') ORDER BY sequence",
            (tenant_id, owner.kind, owner.id, f"doc:{doc_id}"),
        ).fetchall()
        return [_row(row) for row in rows]

    def save(self, tenant_id: str, owner: Owner, kind: str, content: Mapping[str, Any], writer: Writer,
             doc_id: str | None = None, base_version: int | None = None) -> dict[str, Any]:
        """A new document (``doc_id`` None) or its next version. ``base_version``: the version the writer edited -- a
        newer one in between is a conflict (DOC_STALE), never a silent overwrite.

        The person saving over an AI or joint version: unchanged = the AI's (一字沒改照收的算「AI」), changed = joint
        (AI 起草、你改過的算「共同」)."""
        with self._repo.transaction(tenant_id) as connection:
            if owner.kind == "person":   # first, as a case writer takes the case lock (record_log.require_person)
                record_log.require_person(connection, tenant_id, owner.id)
            return self._save(connection, tenant_id, owner, kind, content, writer, doc_id, base_version)

    def save_many(self, tenant_id: str, owner: Owner, items: list[Mapping[str, Any]], writer: Writer,
                  check: Callable[[], None] | None = None,
                  derive: Callable[[list[dict[str, Any]]], list[tuple[str, Mapping[str, Any], Writer]]] | None = None) -> list[dict[str, Any]]:
        """Every item (``{"kind", "content", "doc_id"?, "base_version"?}``, each as ``save``) or none: one transaction.
        ``check()`` runs first and what it read holds until the writes commit: with a check the batch takes its owner's
        lock exclusive -- the case's, the person's (where SQLite's file write lock was) or the group's -- so no other writer of that
        owner's records commits in between; it raises to refuse. Its reads run on this batch's connection (db: one per
        thread), inside this transaction. It must only read: a write would join the batch. The platform's records have
        no owner lock: a check is refused there. The documents the items name are locked first in one order, so two
        batches never wait on each other crosswise. ``derive(saved)``: the records the system keeps because of these
        writes (a group's dissent from an objection), as ``(kind, content, writer)``, written new in this same transaction:
        both commit or neither. It may read like ``check``; it does not write."""
        if check is not None and owner.kind not in ("case", "person", "group"):
            raise InvariantViolation("DOC_BATCH_CHECK_NEEDS_AN_OWNER_LOCK: a batch's check holds only under a case's, a person's or a group's lock")
        with self._repo.transaction(tenant_id) as connection:
            if owner.kind == "case":
                self._repo.lock_case(connection, tenant_id, owner.id, exclusive=check is not None)
            elif owner.kind == "person":
                record_log.require_person(connection, tenant_id, owner.id, exclusive=check is not None)
            elif owner.kind == "group":   # first, in save's order (group, the writing person, documents); _save checks under them
                self._repo.lock_group(connection, tenant_id, owner.id, exclusive=check is not None)
                if writer.author in ("user", "joint"):
                    record_log.require_person(connection, tenant_id, writer.identity_id)
            elif owner.kind == "platform" and writer.author in ("user", "joint"):   # an erased account writes nothing more
                record_log.require_person(connection, tenant_id, writer.identity_id)
            for doc_id in sorted({item["doc_id"] for item in items if item.get("doc_id")}):
                record_log.lock_aggregate(connection, tenant_id, f"doc:{doc_id}")
            if check is not None:
                check()
            saved = [self._save(connection, tenant_id, owner, item["kind"], item["content"], writer, item.get("doc_id"), item.get("base_version")) for item in items]
            for kind, content, by in (derive(saved) if derive is not None else []):
                self._save(connection, tenant_id, owner, kind, content, by, None, None)
            return saved

    def record_read(self, tenant_id: str, owner: Owner, kind: str, doc_id: str, version: int, writer: Writer) -> dict[str, Any]:
        """Record that the person fetched one current document version without making a content version. Under the case
        lock (shared, as every case writer) and the document's aggregate lock, taken before its history is read, so the
        version checked is the version recorded (as DOC_STALE in ``_save``)."""
        if kind != "express.draft":
            raise InvariantViolation(f"DOC_READ_KIND_INVALID: {kind!r}")
        with self._repo.transaction(tenant_id) as connection:
            self._repo.require_case(connection, tenant_id, owner.id)
            record_log.lock_aggregate(connection, tenant_id, f"doc:{doc_id}")
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
            if not history or history[-1]["kind"] != kind:
                raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
            current = history[-1]["version"]
            if current != version:
                raise InvariantViolation(f"DOC_READ_STALE: {doc_id!r} is at version {current}, not {version}")
            return record_log.append(connection, tenant_id, f"doc:{doc_id}", "DocRead",
                                    {"kind": kind, "doc_id": doc_id, "version": version}, writer=writer, owner=owner)

    def last_read_version(self, tenant_id: str, owner: Owner, kind: str, doc_id: str, identity_id: str) -> int | None:
        """Return the latest version this signed-in person fetched, not a client-supplied marker."""
        with self._repo.transaction(tenant_id) as connection:
            row = connection.execute(
                "SELECT payload_json->>'version' AS version FROM events "
                "WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s AND aggregate_id=%s AND event_type='DocRead' "
                "AND author_identity_id=%s AND payload_json->>'kind' = %s ORDER BY sequence DESC LIMIT 1",
                (tenant_id, owner.kind, owner.id, f"doc:{doc_id}", identity_id, kind),
            ).fetchone()
        return None if row is None else int(row["version"])

    def _save(self, connection: psycopg.Connection, tenant_id: str, owner: Owner, kind: str, content: Mapping[str, Any], writer: Writer,
              doc_id: str | None, base_version: int | None) -> dict[str, Any]:
        spec = doc_kinds.require(kind)
        if owner.kind == "case":
            self._repo.require_case(connection, tenant_id, owner.id)
        elif owner.kind == "group":
            self._repo.require_group(connection, tenant_id, owner.id, after_close=spec.after_close,
                                     member=writer.identity_id if writer.author in ("user", "joint") else None)
        if doc_id is None:
            if spec.singleton:
                _lock_singleton(connection, tenant_id, owner, kind)
                if self._live_ids(connection, tenant_id, owner, kind):
                    raise InvariantViolation(f"DOC_SINGLETON_EXISTS: there is already a {kind}; save a new version of it")
            doc_id, version, previous = str(uuid4()), 1, None
        else:
            record_log.lock_aggregate(connection, tenant_id, f"doc:{doc_id}")
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
            if not history or history[-1]["kind"] != kind:
                raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
            previous = history[-1]
            if base_version != previous["version"]:
                raise InvariantViolation(f"DOC_STALE: {doc_id!r} is at version {previous['version']}, not {base_version}")
            version = previous["version"] + 1
        clean = doc_kinds.validate(kind, content, writer.author)
        if writer.author == "user" and previous is not None and previous["author"] in ("ai", "joint"):
            writer = Writer("ai", writer.block) if clean == previous["content"] and previous["author"] == "ai" else Writer("joint", writer.block, writer.identity_id)
        event = record_log.append(connection, tenant_id, f"doc:{doc_id}", "DocSaved", {"kind": spec.kind, "doc_id": doc_id, "version": version, "content": clean},
                                  writer=writer, owner=owner)
        if spec.from_case:   # a person's record made from one case goes with that case (erase_case_rows): checked after the
            self._repo.require_case(connection, tenant_id, clean[spec.from_case])   # writer's own checks; a refusal rolls the save back
        return {"doc_id": doc_id, "kind": kind, "version": version, "content": clean, "author": writer.author, "block": writer.block, "at": event["occurred_at"], "deleted": False}

    @staticmethod
    def _writers(connection: psycopg.Connection, tenant_id: str, owner: Owner, doc_id: str) -> set[str | None]:
        rows = connection.execute("SELECT DISTINCT author_identity_id FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s AND aggregate_id=%s",
                                  (tenant_id, owner.kind, owner.id, f"doc:{doc_id}")).fetchall()
        return {row[0] for row in rows}

    @staticmethod
    def _live_ids(connection: psycopg.Connection, tenant_id: str, owner: Owner, kind: str) -> set[str]:
        rows = connection.execute(
            "SELECT event_type, payload_json->>'doc_id' AS doc_id FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s "
            "AND event_type IN ('DocSaved','DocDeleted') AND payload_json->>'kind' = %s ORDER BY write_order",
            (tenant_id, owner.kind, owner.id, kind),
        ).fetchall()
        live: set[str] = set()
        for row in rows:
            (live.discard if row["event_type"] == "DocDeleted" else live.add)(row["doc_id"])
        return live

    def delete(self, tenant_id: str, owner: Owner, kind: str, doc_id: str, writer: Writer,
               then: Callable[[], list[Mapping[str, Any]]] | None = None) -> None:
        """Every version of it goes (完整刪除); one DocDeleted with only its kind and id stays, so the history shows a
        card was removed without showing what it said. ``then()``: items (as ``save_many``) the same writer saves in the
        same transaction -- what the delete means to its block (block_hooks ON_DELETE). It runs inside, before the
        delete, under the owner's lock taken exclusive (as ``save_many``'s check): what it read holds until the commit,
        and the documents it names are locked after this one with no other writer of the owner in between."""
        spec = doc_kinds.require(kind)
        with self._repo.transaction(tenant_id) as connection:
            if owner.kind == "case":
                if then is not None:
                    self._repo.lock_case(connection, tenant_id, owner.id, exclusive=True)
                self._repo.require_case(connection, tenant_id, owner.id)
            elif owner.kind == "person":
                record_log.require_person(connection, tenant_id, owner.id, exclusive=then is not None)
            elif owner.kind == "group" and then is None:   # G3: one who left may still delete what they wrote; a closed group too
                self._repo.require_group(connection, tenant_id, owner.id, after_close=True)
                record_log.require_person(connection, tenant_id, writer.identity_id)
            elif owner.kind == "platform" and then is None:
                record_log.require_person(connection, tenant_id, writer.identity_id)
            elif then is not None:
                raise InvariantViolation("DOC_BATCH_CHECK_NEEDS_AN_OWNER_LOCK: a delete's follow-up reads hold only under a case's or a person's lock")
            record_log.lock_aggregate(connection, tenant_id, f"doc:{doc_id}")
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
            if not history or history[-1]["kind"] != kind:
                raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
            if not spec.deletable:
                raise InvariantViolation(f"DOC_NOT_DELETABLE: every version of {kind} stays")
            if owner.kind in ("group", "platform") and self._writers(connection, tenant_id, owner, doc_id) != {writer.identity_id}:
                raise InvariantViolation("DOC_NOT_YOURS: in a group or the platform's, only the person who wrote every version of a document deletes it")
            if spec.from_case:   # its case's erase may be deleting it right now: no tombstone after the erase
                self._repo.require_case(connection, tenant_id, history[-1]["content"][spec.from_case])
            items = then() if then is not None else []   # reads the document before it goes, on this connection
            record_log.delete_owned(connection, tenant_id, owner, aggregate_id=f"doc:{doc_id}")
            record_log.append(connection, tenant_id, f"doc:{doc_id}", "DocDeleted", {"kind": kind, "doc_id": doc_id}, writer=writer, owner=owner)
            for item in items:
                self._save(connection, tenant_id, owner, item["kind"], item["content"], writer, item.get("doc_id"), item.get("base_version"))

    def current(self, tenant_id: str, owner: Owner, kind: str) -> list[dict[str, Any]]:
        """The latest version of every live document of this kind, oldest first (in the order written: write_order). Not
        for a group: its records are read only through platform/visibility.py (STEP34_SHARED_RULES.md §3)."""
        _not_a_group(owner)
        return self._current(tenant_id, owner, kind)

    @contextmanager
    def reading_group(self, tenant_id: str, group_id: str, identity_id: str) -> Iterator[None]:
        """One transaction for a read of a group's records (platform/visibility.py): the group lock shared (an erase waits)
        and the reader's membership row FOR SHARE (their leaving waits), so what was decided is what is fetched (Codex
        F5). Reads inside are savepoints of it (db: one connection per thread)."""
        with self._repo.transaction(tenant_id) as connection:
            self._repo.lock_group(connection, tenant_id, group_id)
            ProjectSourceRepository._membership(connection, tenant_id, group_id, identity_id, lock="FOR SHARE")
            yield

    def current_in_group(self, tenant_id: str, group_id: str, kind: str) -> list[dict[str, Any]]:
        """Every member's live documents of a group's kind, each with ``written_by`` (who wrote its first version). Called
        by platform/visibility.py only (tests/unit/test_visibility.py's gate): it decides what a viewer gets of these."""
        return self._current(tenant_id, record_log.group(group_id), kind)

    def current_on_platform(self, tenant_id: str, kind: str) -> list[dict[str, Any]]:
        """The tenant's live platform documents of a kind (an appeal), each with ``written_by``. platform/visibility.py only
        (tests/unit/test_visibility.py's gate): it masks the writer."""
        return self._current(tenant_id, record_log.platform(tenant_id), kind)

    def _current(self, tenant_id: str, owner: Owner, kind: str) -> list[dict[str, Any]]:
        with self._repo.transaction(tenant_id) as connection:
            rows = connection.execute(
                "SELECT event_type, occurred_at, payload_json, author, block, aggregate_id, author_identity_id FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s "
                "AND event_type IN ('DocSaved','DocDeleted') AND payload_json->>'kind' = %s ORDER BY write_order",
                (tenant_id, owner.kind, owner.id, kind),
            ).fetchall()
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            item = _row(row)
            if item["deleted"]:
                latest.pop(item["doc_id"], None)
            else:
                before = latest.get(item["doc_id"], {})
                latest[item["doc_id"]] = {**item, "created_at": before.get("created_at", item["at"])}
                if owner.kind in ("group", "platform"):
                    latest[item["doc_id"]]["written_by"] = before.get("written_by", row["author_identity_id"])
        return list(latest.values())

    def blocks_used(self, tenant_id: str, owner: Owner) -> set[str]:
        """The blocks something was made in by the person or the AI (你看得到哪幾格做過): event types marked ``done`` in
        record_log (a result, a document, a task -- never a request, a failure or a tombstone; deleting every card
        empties the slot). Reads the envelope's block only, never a payload (組裝器不讀各塊的其他內容)."""
        done = sorted(name for name, spec in record_log.EVENT_TYPES.items() if spec.done)
        with self._repo.transaction(tenant_id) as connection:
            rows = connection.execute(
                f"SELECT DISTINCT block FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s AND author IN ('user','ai','joint') "
                f"AND block IS NOT NULL AND event_type IN ({','.join(['%s'] * len(done))})",
                (tenant_id, owner.kind, owner.id, *done),
            ).fetchall()
        return {row["block"] for row in rows}

    def tools_run(self, tenant_id: str, owner: Owner) -> set[str]:
        """The tools that finished on this case the older way (an analysis on the project page, DONE); a request still
        pending or one that failed is not a use."""
        if owner.kind != "case":
            return set()
        return {item["method_id"] for item in self._repo.analyses(tenant_id, owner.id).get(owner.id, []) if item.get("method_id") and item.get("status") == "DONE"}

    def versions(self, tenant_id: str, owner: Owner, kind: str, doc_id: str) -> list[dict[str, Any]]:
        """Every version of one document, oldest first (舊版不刪). Not for a group (as ``current``)."""
        _not_a_group(owner)
        return self._versions(tenant_id, owner, kind, doc_id)

    def versions_in_group(self, tenant_id: str, group_id: str, kind: str, doc_id: str) -> list[dict[str, Any]]:
        """platform/visibility.py only, after it decided the viewer may read this document."""
        return self._versions(tenant_id, record_log.group(group_id), kind, doc_id)

    def _versions(self, tenant_id: str, owner: Owner, kind: str, doc_id: str) -> list[dict[str, Any]]:
        with self._repo.transaction(tenant_id) as connection:
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
        if not history or history[-1]["kind"] != kind:
            raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
        return history


class CaseReads:
    """Read-only: the repository's readers a block hook needs, and nothing that writes."""

    def __init__(self, repo: ProjectSourceRepository) -> None:
        self._repo = repo

    def case(self, tenant_id: str, project_id: str) -> dict[str, Any] | None:
        return self._repo.get_project(tenant_id, project_id)

    def sources(self, tenant_id: str, project_id: str) -> list[dict[str, Any]]:
        return self._repo.list_sources(tenant_id, project_id)

    def source_text(self, cas: Any, tenant_id: str, project_id: str) -> Any:
        return self._repo.active_source_reader(cas, tenant_id, project_id)

    def events(self, tenant_id: str, aggregate_id: str) -> list[dict[str, Any]]:
        return self._repo.list_events(tenant_id, aggregate_id)

    def collection_run(self, tenant_id: str, project_id: str, run_id: str) -> dict[str, Any] | None:
        return self._repo.get_collection_run(tenant_id, project_id, run_id)

    def hold_group(self, tenant_id: str, group_id: str, identity_id: str | None) -> None:
        """For a hook's check: the group still there (and ``identity_id`` a current member), under the group lock held
        shared until the hook's save commits -- an erase of the group waits for it (Codex F2). Raises as require_group."""
        with self._repo.transaction(tenant_id) as connection:
            ProjectSourceRepository.require_group(connection, tenant_id, group_id, after_close=True, member=identity_id)

    def membership(self, tenant_id: str, group_id: str, identity_id: str) -> dict[str, Any] | None:
        """The person's current membership of a group (its role and review state), or None (platform/visibility.py)."""
        return self._repo.get_group_for(tenant_id, group_id, identity_id)

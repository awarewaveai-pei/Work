"""A block's documents in the record stream (共用紀錄): save a new version, delete, read the current versions or one
document's history. Every write goes through record_log (author, block, owner, the kind's own rules).

A document lives on its own aggregate ``doc:<doc_id>`` and belongs to a case or to the person (its kind says which), in
the tenant's region with the case it belongs to, so erasing the case or the person erases it.

Across processes (docs/platform/STORAGE_SWITCH.md invariant 2): a next version is decided under the document's aggregate
lock (record_log.lock_aggregate), taken before its history is read, so DOC_STALE holds; a new document of a one-per-owner
kind under the (owner, kind) lock, so DOC_SINGLETON_EXISTS holds. A case's document is written under the case lock
(ProjectSourceRepository.require_case), and so is a person's record made from a case (its ``from_case`` field).
"""

from __future__ import annotations

from typing import Any, Callable, Mapping
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
            "SELECT event_type, occurred_at, payload_json, author, block FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s AND aggregate_id=%s ORDER BY sequence",
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
            return self._save(connection, tenant_id, owner, kind, content, writer, doc_id, base_version)

    def save_many(self, tenant_id: str, owner: Owner, items: list[Mapping[str, Any]], writer: Writer,
                  check: Callable[[], None] | None = None) -> list[dict[str, Any]]:
        """Every item (``{"kind", "content", "doc_id"?, "base_version"?}``, each as ``save``) or none: one transaction.
        ``check()`` runs first and what it read holds until the writes commit: with a check the batch takes the case's
        lock exclusive (where SQLite's file write lock was), so no other writer of the case commits in between; it
        raises to refuse. It must only read -- a write of its own would wait on this batch. A check needs a case: a
        person's records have no owner lock. The documents the items name are locked first in one order, so two batches
        never wait on each other crosswise."""
        if check is not None and owner.kind != "case":
            raise InvariantViolation("DOC_BATCH_CHECK_NEEDS_A_CASE: a batch's check holds only under a case's lock")
        with self._repo.transaction(tenant_id) as connection:
            if owner.kind == "case":
                self._repo.lock_case(connection, tenant_id, owner.id, exclusive=check is not None)
            for doc_id in sorted({item["doc_id"] for item in items if item.get("doc_id")}):
                record_log.lock_aggregate(connection, tenant_id, f"doc:{doc_id}")
            if check is not None:
                check()
            return [self._save(connection, tenant_id, owner, item["kind"], item["content"], writer, item.get("doc_id"), item.get("base_version")) for item in items]

    def _save(self, connection: psycopg.Connection, tenant_id: str, owner: Owner, kind: str, content: Mapping[str, Any], writer: Writer,
              doc_id: str | None, base_version: int | None) -> dict[str, Any]:
        spec = doc_kinds.require(kind)
        if owner.kind == "case":
            self._repo.require_case(connection, tenant_id, owner.id)
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
        if spec.from_case:   # a person's record made from one case goes with that case (erase_project): checked after the
            self._repo.require_case(connection, tenant_id, clean[spec.from_case])   # writer's own checks; a refusal rolls the save back
        return {"doc_id": doc_id, "kind": kind, "version": version, "content": clean, "author": writer.author, "block": writer.block, "at": event["occurred_at"], "deleted": False}

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

    def delete(self, tenant_id: str, owner: Owner, kind: str, doc_id: str, writer: Writer) -> None:
        """Every version of it goes (完整刪除); one DocDeleted with only its kind and id stays, so the history shows a
        card was removed without showing what it said."""
        spec = doc_kinds.require(kind)
        with self._repo.transaction(tenant_id) as connection:
            if owner.kind == "case":
                self._repo.require_case(connection, tenant_id, owner.id)
            record_log.lock_aggregate(connection, tenant_id, f"doc:{doc_id}")
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
            if not history or history[-1]["kind"] != kind:
                raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
            if not spec.deletable:
                raise InvariantViolation(f"DOC_NOT_DELETABLE: every version of {kind} stays")
            if spec.from_case:   # its case's erase may be deleting it right now: no tombstone after the erase
                self._repo.require_case(connection, tenant_id, history[-1]["content"][spec.from_case])
            record_log.delete_owned(connection, tenant_id, owner, aggregate_id=f"doc:{doc_id}")
            record_log.append(connection, tenant_id, f"doc:{doc_id}", "DocDeleted", {"kind": kind, "doc_id": doc_id}, writer=writer, owner=owner)

    def current(self, tenant_id: str, owner: Owner, kind: str) -> list[dict[str, Any]]:
        """The latest version of every live document of this kind, oldest first (in the order written: write_order)."""
        with self._repo.transaction(tenant_id) as connection:
            rows = connection.execute(
                "SELECT event_type, occurred_at, payload_json, author, block, aggregate_id FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s "
                "AND event_type IN ('DocSaved','DocDeleted') AND payload_json->>'kind' = %s ORDER BY write_order",
                (tenant_id, owner.kind, owner.id, kind),
            ).fetchall()
        latest: dict[str, dict[str, Any]] = {}
        for row in rows:
            item = _row(row)
            if item["deleted"]:
                latest.pop(item["doc_id"], None)
            else:
                first = latest.get(item["doc_id"], {}).get("created_at", item["at"])
                latest[item["doc_id"]] = {**item, "created_at": first}
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
        """Every version of one document, oldest first (舊版不刪)."""
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

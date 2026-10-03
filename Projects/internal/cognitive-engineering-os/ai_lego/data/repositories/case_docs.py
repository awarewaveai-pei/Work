"""A block's documents in the record stream (共用紀錄): save a new version, delete, read the current versions or one
document's history. Every write goes through record_log (author, block, owner, the kind's own rules).

A document lives on its own aggregate ``doc:<doc_id>`` and belongs to a case or to the person (its kind says which), in
the same file as the case it belongs to, so erasing the case or the person erases it.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Mapping
from uuid import uuid4

from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.events.record_log import Owner, Writer
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation


def _row(row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload_json"])
    return {"doc_id": payload["doc_id"], "kind": payload["kind"], "version": payload.get("version"), "content": payload.get("content"),
            "author": row["author"], "block": row["block"], "at": row["occurred_at"], "deleted": row["event_type"] == "DocDeleted"}


class CaseDocs:
    def __init__(self, repo: ProjectSourceRepository) -> None:
        self._repo = repo

    @staticmethod
    def _history(connection: sqlite3.Connection, tenant_id: str, owner: Owner, doc_id: str) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT event_type, occurred_at, payload_json, author, block FROM events WHERE tenant_id=? AND owner_kind=? AND owner_id=? AND aggregate_id=? ORDER BY sequence",
            (tenant_id, owner.kind, owner.id, f"doc:{doc_id}"),
        ).fetchall()
        return [_row(row) for row in rows]

    def save(self, tenant_id: str, owner: Owner, kind: str, content: Mapping[str, Any], writer: Writer,
             doc_id: str | None = None, base_version: int | None = None) -> dict[str, Any]:
        """A new document (``doc_id`` None) or its next version. ``base_version``: the version the writer edited -- a
        newer one in between is a conflict (DOC_STALE), never a silent overwrite.

        The person saving over an AI or joint version: unchanged = the AI's (一字沒改照收的算「AI」), changed = joint
        (AI 起草、你改過的算「共同」)."""
        spec = doc_kinds.require(kind)
        with self._repo.transaction() as connection:
            if doc_id is None:
                if spec.singleton and self._live_ids(connection, tenant_id, owner, kind):
                    raise InvariantViolation(f"DOC_SINGLETON_EXISTS: there is already a {kind}; save a new version of it")
                doc_id, version, previous = str(uuid4()), 1, None
            else:
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
        return {"doc_id": doc_id, "kind": kind, "version": version, "content": clean, "author": writer.author, "block": writer.block, "at": event["occurred_at"], "deleted": False}

    @staticmethod
    def _live_ids(connection: sqlite3.Connection, tenant_id: str, owner: Owner, kind: str) -> set[str]:
        rows = connection.execute(
            "SELECT event_type, json_extract(payload_json, '$.doc_id') AS doc_id FROM events WHERE tenant_id=? AND owner_kind=? AND owner_id=? "
            "AND event_type IN ('DocSaved','DocDeleted') AND json_extract(payload_json, '$.kind')=? ORDER BY occurred_at, sequence",
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
        with self._repo.transaction() as connection:
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
            if not history or history[-1]["kind"] != kind:
                raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
            if not spec.deletable:
                raise InvariantViolation(f"DOC_NOT_DELETABLE: every version of {kind} stays")
            record_log.delete_owned(connection, tenant_id, owner, aggregate_id=f"doc:{doc_id}")
            record_log.append(connection, tenant_id, f"doc:{doc_id}", "DocDeleted", {"kind": kind, "doc_id": doc_id}, writer=writer, owner=owner)

    def current(self, tenant_id: str, owner: Owner, kind: str) -> list[dict[str, Any]]:
        """The latest version of every live document of this kind, oldest first."""
        with self._repo.connection() as connection:
            rows = connection.execute(
                "SELECT event_type, occurred_at, payload_json, author, block, aggregate_id FROM events WHERE tenant_id=? AND owner_kind=? AND owner_id=? "
                "AND event_type IN ('DocSaved','DocDeleted') AND json_extract(payload_json, '$.kind')=? ORDER BY occurred_at, sequence",
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
        with self._repo.connection() as connection:
            rows = connection.execute(
                f"SELECT DISTINCT block FROM events WHERE tenant_id=? AND owner_kind=? AND owner_id=? AND author IN ('user','ai','joint') "
                f"AND block IS NOT NULL AND event_type IN ({','.join('?' * len(done))})",
                (tenant_id, owner.kind, owner.id, *done),
            ).fetchall()
        return {row["block"] for row in rows}

    def versions(self, tenant_id: str, owner: Owner, kind: str, doc_id: str) -> list[dict[str, Any]]:
        """Every version of one document, oldest first (舊版不刪)."""
        with self._repo.connection() as connection:
            history = [item for item in self._history(connection, tenant_id, owner, doc_id) if not item["deleted"]]
        if not history or history[-1]["kind"] != kind:
            raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
        return history

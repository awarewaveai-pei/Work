"""Local-first repository for tenant-authored Custom Workflows (own SQLite file, own table --
see ``ai_lego/core/domain/custom_workflow.py`` for why this is not folded into
``platform_projects``/``prov_sources`` or a curated Recipe file). Records go through ``record_log`` like every
other events table; a workflow belongs to the person who made it.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Mapping

from ai_lego.core.support import canonical_json, sha256_bytes
from ai_lego.data.events import record_log

_SCHEMA = """
CREATE TABLE IF NOT EXISTS custom_workflows (
    tenant_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    title TEXT NOT NULL,
    method_ids_json TEXT NOT NULL,
    created_by_identity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, workflow_id)
);
CREATE INDEX IF NOT EXISTS ix_custom_workflows_tenant ON custom_workflows (tenant_id, updated_at, workflow_id);
"""

_WORKFLOW_COLUMNS = ("workflow_id", "tenant_id", "title", "method_ids", "created_by_identity_id", "created_at", "updated_at")

# Owner of a record written before owners existed: the person who made the workflow. A workflow deleted before then left
# its events behind (the old delete kept them, title included) with no row to name its maker: it was deleted, so they go
# now, as delete() does today.
_LEGACY_OWNER_SQL = (
    "DELETE FROM events WHERE owner_kind IS NULL AND NOT EXISTS (SELECT 1 FROM custom_workflows w WHERE w.tenant_id=events.tenant_id "
    "AND 'custom_workflow:' || w.workflow_id = events.aggregate_id)",
    "UPDATE events SET owner_kind='person', owner_id=(SELECT w.created_by_identity_id FROM custom_workflows w "
    "WHERE w.tenant_id=events.tenant_id AND 'custom_workflow:' || w.workflow_id = events.aggregate_id) "
    "WHERE owner_kind IS NULL AND EXISTS (SELECT 1 FROM custom_workflows w WHERE w.tenant_id=events.tenant_id AND 'custom_workflow:' || w.workflow_id = events.aggregate_id)",
)


class CustomWorkflowRepository:
    """SQLite adapter for the Custom Workflow repository contract."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.executescript(_SCHEMA)
            record_log.migrate(connection, _LEGACY_OWNER_SQL)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @staticmethod
    def _append_event(connection: sqlite3.Connection, tenant_id: str, workflow_id: str, event_type: str, payload: Mapping[str, Any], identity_id: str) -> None:
        """A workflow's records belong to the person editing it (only its maker can reach it: see get/update/delete)."""
        record_log.append(connection, tenant_id, f"custom_workflow:{workflow_id}", event_type, payload,
                          writer=record_log.user(identity_id, "ASSEMBLER"), owner=record_log.person(identity_id))

    @staticmethod
    def _from_row(row: sqlite3.Row) -> dict[str, Any]:
        workflow = dict(row)
        workflow["method_ids"] = json.loads(workflow.pop("method_ids_json"))
        return workflow

    def create(self, record: Mapping[str, Any]) -> dict[str, Any]:
        workflow = {column: record[column] for column in _WORKFLOW_COLUMNS}
        method_ids_json = canonical_json(workflow.pop("method_ids"))
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO custom_workflows (workflow_id, tenant_id, title, method_ids_json, created_by_identity_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                (workflow["workflow_id"], workflow["tenant_id"], workflow["title"], method_ids_json, workflow["created_by_identity_id"], workflow["created_at"], workflow["updated_at"]),
            )
            self._append_event(
                connection,
                workflow["tenant_id"],
                workflow["workflow_id"],
                "CustomWorkflowCreated",
                {"workflow_id": workflow["workflow_id"], "title": workflow["title"], "step_count": len(record["method_ids"]), "record_sha256": sha256_bytes(canonical_json(record).encode("utf-8"))},
                workflow["created_by_identity_id"],
            )
        return dict(record)

    def update(self, tenant_id: str, workflow_id: str, title: str, method_ids: list[str], updated_at: str, identity_id: str) -> dict[str, Any] | None:
        """Only its maker's workflow changes; anyone else's reads as not found (None)."""
        method_ids_json = canonical_json(list(method_ids))
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE custom_workflows SET title=?, method_ids_json=?, updated_at=? WHERE tenant_id=? AND workflow_id=? AND created_by_identity_id=?",
                (title, method_ids_json, updated_at, tenant_id, workflow_id, identity_id),
            )
            if cursor.rowcount == 0:
                return None
            self._append_event(
                connection,
                tenant_id,
                workflow_id,
                "CustomWorkflowUpdated",
                {"workflow_id": workflow_id, "title": title, "step_count": len(method_ids)},
                identity_id,
            )
        return self.get(tenant_id, workflow_id, identity_id)

    def get(self, tenant_id: str, workflow_id: str, identity_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT workflow_id, tenant_id, title, method_ids_json, created_by_identity_id, created_at, updated_at FROM custom_workflows WHERE tenant_id=? AND workflow_id=? AND created_by_identity_id=?",
                (tenant_id, workflow_id, identity_id),
            ).fetchone()
        return None if row is None else self._from_row(row)

    def list(self, tenant_id: str, identity_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT workflow_id, tenant_id, title, method_ids_json, created_by_identity_id, created_at, updated_at FROM custom_workflows WHERE tenant_id=? AND created_by_identity_id=? ORDER BY updated_at DESC, workflow_id",
                (tenant_id, identity_id),
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def delete(self, tenant_id: str, workflow_id: str, identity_id: str) -> bool:
        """Removes the workflow and every record of it (完整刪除: nothing of it stays, not even its title in a log)."""
        with self._connection() as connection:
            deleted = connection.execute("DELETE FROM custom_workflows WHERE tenant_id=? AND workflow_id=? AND created_by_identity_id=?", (tenant_id, workflow_id, identity_id)).rowcount > 0
            if deleted:
                record_log.delete_owned(connection, tenant_id, record_log.person(identity_id), aggregate_id=f"custom_workflow:{workflow_id}")
        return deleted

    def delete_person(self, tenant_id: str, identity_id: str) -> int:
        """Erase everything this person holds here (GOVERN 刪除帳號): their workflows and every record they own."""
        with self._connection() as connection:
            removed = connection.execute("DELETE FROM custom_workflows WHERE tenant_id=? AND created_by_identity_id=?", (tenant_id, identity_id)).rowcount
            record_log.delete_owned(connection, tenant_id, record_log.person(identity_id))
        return removed

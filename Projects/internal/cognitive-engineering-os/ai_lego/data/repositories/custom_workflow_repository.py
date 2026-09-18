"""Local-first repository for tenant-authored Custom Workflows (own SQLite file, own table --
see ``ai_lego/core/domain/custom_workflow.py`` for why this is not folded into
``platform_projects``/``prov_sources`` or a curated Recipe file). Same connection/event-append
shape as ``ProjectSourceRepository`` for consistency, not because the two share a schema.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

from ai_lego.core.support import canonical_json, sha256_bytes

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
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT,
    payload_json TEXT NOT NULL,
    UNIQUE (tenant_id, aggregate_id, sequence)
);
CREATE INDEX IF NOT EXISTS ix_custom_workflows_tenant ON custom_workflows (tenant_id, updated_at, workflow_id);
"""

_WORKFLOW_COLUMNS = ("workflow_id", "tenant_id", "title", "method_ids", "created_by_identity_id", "created_at", "updated_at")


class CustomWorkflowRepository:
    """SQLite adapter for the Custom Workflow repository contract."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.executescript(_SCHEMA)

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
    def _append_event(connection: sqlite3.Connection, tenant_id: str, aggregate_id: str, event_type: str, payload: Mapping[str, Any]) -> None:
        row = connection.execute(
            "SELECT COALESCE(MAX(sequence), 0) AS current_sequence FROM events WHERE tenant_id=? AND aggregate_id=?",
            (tenant_id, aggregate_id),
        ).fetchone()
        sequence = int(row["current_sequence"]) + 1
        event_id = str(uuid4())
        connection.execute(
            "INSERT INTO events (event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id, causation_id, payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                event_id,
                tenant_id,
                aggregate_id,
                sequence,
                event_type,
                datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                "1.0.0",
                event_id,
                None,
                canonical_json(dict(payload)),
            ),
        )

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
                f"custom_workflow:{workflow['workflow_id']}",
                "CustomWorkflowCreated",
                {"workflow_id": workflow["workflow_id"], "title": workflow["title"], "step_count": len(record["method_ids"]), "record_sha256": sha256_bytes(canonical_json(record).encode("utf-8"))},
            )
        return dict(record)

    def update(self, tenant_id: str, workflow_id: str, title: str, method_ids: list[str], updated_at: str) -> dict[str, Any] | None:
        method_ids_json = canonical_json(list(method_ids))
        with self._connection() as connection:
            cursor = connection.execute(
                "UPDATE custom_workflows SET title=?, method_ids_json=?, updated_at=? WHERE tenant_id=? AND workflow_id=?",
                (title, method_ids_json, updated_at, tenant_id, workflow_id),
            )
            if cursor.rowcount == 0:
                return None
            self._append_event(
                connection,
                tenant_id,
                f"custom_workflow:{workflow_id}",
                "CustomWorkflowUpdated",
                {"workflow_id": workflow_id, "title": title, "step_count": len(method_ids)},
            )
        return self.get(tenant_id, workflow_id)

    def get(self, tenant_id: str, workflow_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT workflow_id, tenant_id, title, method_ids_json, created_by_identity_id, created_at, updated_at FROM custom_workflows WHERE tenant_id=? AND workflow_id=?",
                (tenant_id, workflow_id),
            ).fetchone()
        return None if row is None else self._from_row(row)

    def list(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT workflow_id, tenant_id, title, method_ids_json, created_by_identity_id, created_at, updated_at FROM custom_workflows WHERE tenant_id=? ORDER BY updated_at DESC, workflow_id",
                (tenant_id,),
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def delete(self, tenant_id: str, workflow_id: str) -> bool:
        with self._connection() as connection:
            cursor = connection.execute("DELETE FROM custom_workflows WHERE tenant_id=? AND workflow_id=?", (tenant_id, workflow_id))
            deleted = cursor.rowcount > 0
            if deleted:
                self._append_event(connection, tenant_id, f"custom_workflow:{workflow_id}", "CustomWorkflowDeleted", {"workflow_id": workflow_id})
        return deleted

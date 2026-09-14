"""Local-first Project/Source repository using the canonical relational table names.

Current-state rows and their append-only event are committed in one SQLite
transaction. Raw Source bytes are never accepted by this adapter.
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
from ai_lego.errors import InvariantViolation


_SCHEMA = """
CREATE TABLE IF NOT EXISTS platform_projects (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    data_classification TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_by_identity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, project_id),
    UNIQUE (tenant_id, workspace_id, name)
);
CREATE TABLE IF NOT EXISTS prov_sources (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    media_type TEXT NOT NULL,
    data_classification TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    artifact_uri_json TEXT NOT NULL,
    content_role TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_by_identity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cas_path_json TEXT NOT NULL,
    PRIMARY KEY (tenant_id, project_id, source_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
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
CREATE INDEX IF NOT EXISTS ix_platform_projects_workspace ON platform_projects (tenant_id, workspace_id, created_at, project_id);
CREATE INDEX IF NOT EXISTS ix_prov_sources_project ON prov_sources (tenant_id, project_id, created_at, source_id);
"""

_PROJECT_COLUMNS = (
    "project_id",
    "tenant_id",
    "workspace_id",
    "name",
    "purpose",
    "data_classification",
    "status",
    "version",
    "created_by_identity_id",
    "created_at",
)

_SOURCE_COLUMNS = (
    "source_id",
    "project_id",
    "tenant_id",
    "title",
    "media_type",
    "data_classification",
    "content_sha256",
    "size_bytes",
    "artifact_uri",
    "content_role",
    "verification_status",
    "status",
    "version",
    "created_by_identity_id",
    "created_at",
)

_SOURCE_SELECT = "source_id, project_id, tenant_id, title, media_type, data_classification, content_sha256, size_bytes, artifact_uri_json, content_role, verification_status, status, version, created_by_identity_id, created_at"


class ProjectSourceRepository:
    """SQLite adapter for the Project/Source repository contract."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def _source_from_row(row: sqlite3.Row) -> dict[str, Any]:
        source = dict(row)
        source["artifact_uri"] = json.loads(source.pop("artifact_uri_json"))
        return source

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

    def create_project(self, record: Mapping[str, Any]) -> dict[str, Any]:
        project = {column: record[column] for column in _PROJECT_COLUMNS}
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO platform_projects (project_id, tenant_id, workspace_id, name, purpose, data_classification, status, version, created_by_identity_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                tuple(project[column] for column in _PROJECT_COLUMNS),
            )
            self._append_event(
                connection,
                project["tenant_id"],
                f"project:{project['project_id']}",
                "ProjectCreated",
                {
                    "project_id": project["project_id"],
                    "workspace_id": project["workspace_id"],
                    "data_classification": project["data_classification"],
                    "record_sha256": sha256_bytes(canonical_json(project).encode("utf-8")),
                },
            )
        return project

    def get_project(self, tenant_id: str, project_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT project_id, tenant_id, workspace_id, name, purpose, data_classification, status, version, created_by_identity_id, created_at FROM platform_projects WHERE tenant_id=? AND project_id=?",
                (tenant_id, project_id),
            ).fetchone()
        return None if row is None else dict(row)

    def list_projects(self, tenant_id: str, workspace_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT project_id, tenant_id, workspace_id, name, purpose, data_classification, status, version, created_by_identity_id, created_at FROM platform_projects WHERE tenant_id=?"
        parameters: tuple[Any, ...] = (tenant_id,)
        if workspace_id is not None:
            query += " AND workspace_id=?"
            parameters += (workspace_id,)
        query += " ORDER BY created_at, project_id"
        with self._connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [dict(row) for row in rows]

    def add_source(self, record: Mapping[str, Any], cas_path: Mapping[str, str]) -> dict[str, Any]:
        source = {column: record[column] for column in _SOURCE_COLUMNS}
        if cas_path.get("tenant_segment") != source["tenant_id"] or cas_path.get("hash") != source["content_sha256"]:
            raise InvariantViolation("SOURCE_STORAGE_REFERENCE_INVALID")
        artifact_uri_json = canonical_json(source.pop("artifact_uri"))
        cas_path_json = canonical_json(dict(cas_path))
        with self._connection() as connection:
            project = connection.execute(
                "SELECT data_classification FROM platform_projects WHERE tenant_id=? AND project_id=?",
                (source["tenant_id"], source["project_id"]),
            ).fetchone()
            if project is None:
                raise InvariantViolation("SOURCE_PROJECT_NOT_FOUND")
            if project["data_classification"] != source["data_classification"]:
                raise InvariantViolation("SOURCE_PROJECT_CLASSIFICATION_MISMATCH")
            connection.execute(
                "INSERT INTO prov_sources (source_id, project_id, tenant_id, title, media_type, data_classification, content_sha256, size_bytes, artifact_uri_json, content_role, verification_status, status, version, created_by_identity_id, created_at, cas_path_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    source["source_id"],
                    source["project_id"],
                    source["tenant_id"],
                    source["title"],
                    source["media_type"],
                    source["data_classification"],
                    source["content_sha256"],
                    source["size_bytes"],
                    artifact_uri_json,
                    source["content_role"],
                    source["verification_status"],
                    source["status"],
                    source["version"],
                    source["created_by_identity_id"],
                    source["created_at"],
                    cas_path_json,
                ),
            )
            self._append_event(
                connection,
                source["tenant_id"],
                f"source:{source['source_id']}",
                "SourceAdded",
                {
                    "source_id": source["source_id"],
                    "project_id": source["project_id"],
                    "content_sha256": source["content_sha256"],
                    "size_bytes": source["size_bytes"],
                    "media_type": source["media_type"],
                    "content_role": source["content_role"],
                },
            )
        return dict(record)

    def get_source(self, tenant_id: str, project_id: str, source_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                f"SELECT {_SOURCE_SELECT} FROM prov_sources WHERE tenant_id=? AND project_id=? AND source_id=?",
                (tenant_id, project_id, source_id),
            ).fetchone()
        return None if row is None else self._source_from_row(row)

    def list_sources(self, tenant_id: str, project_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                f"SELECT {_SOURCE_SELECT} FROM prov_sources WHERE tenant_id=? AND project_id=? ORDER BY created_at, source_id",
                (tenant_id, project_id),
            ).fetchall()
        return [self._source_from_row(row) for row in rows]

    def get_source_content_reference(self, tenant_id: str, project_id: str, source_id: str) -> dict[str, str] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT cas_path_json FROM prov_sources WHERE tenant_id=? AND project_id=? AND source_id=?",
                (tenant_id, project_id, source_id),
            ).fetchone()
        return None if row is None else json.loads(row["cas_path_json"])

    def list_events(self, tenant_id: str, aggregate_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id, causation_id, payload_json FROM events WHERE tenant_id=? AND aggregate_id=? ORDER BY sequence",
                (tenant_id, aggregate_id),
            ).fetchall()
        events = []
        for row in rows:
            event = dict(row)
            event["payload"] = json.loads(event.pop("payload_json"))
            events.append(event)
        return events

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

from ai_lego.core.domain.collection_run import run_report
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
    doi TEXT,
    authors_json TEXT,
    venue TEXT,
    published_at TEXT,
    canonical_url TEXT,
    source_uri TEXT,
    fetched_at TEXT,
    provenance_json TEXT,
    source_class TEXT,
    relevance_json TEXT,
    supersedes_source_id TEXT,
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
CREATE TABLE IF NOT EXISTS project_interpretations (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    interpretation_id TEXT NOT NULL,
    artifact_reference_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, interpretation_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);
CREATE INDEX IF NOT EXISTS ix_project_interpretations_project ON project_interpretations (tenant_id, project_id, created_at);
CREATE TABLE IF NOT EXISTS collection_runs (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    seeds_json TEXT NOT NULL,
    budget_json TEXT NOT NULL,
    requested_by_identity_id TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    completed_at TEXT,
    report_json TEXT,
    PRIMARY KEY (tenant_id, run_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);
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
    "doi",
    "authors",
    "venue",
    "published_at",
    "canonical_url",
    "source_uri",
    "fetched_at",
    "provenance",
    "source_class",
    "relevance",
    "supersedes_source_id",
)
# Collection provenance (source.schema.yaml 1.2.0). Read with .get(): a record built before 1.2.0 lacks them.
_PROVENANCE_COLUMNS = frozenset({"canonical_url", "source_uri", "fetched_at", "provenance", "source_class", "relevance", "supersedes_source_id"})

_SOURCE_SELECT = "source_id, project_id, tenant_id, title, media_type, data_classification, content_sha256, size_bytes, artifact_uri_json, content_role, verification_status, status, version, created_by_identity_id, created_at, doi, authors_json, venue, published_at, canonical_url, source_uri, fetched_at, provenance_json, source_class, relevance_json, supersedes_source_id"

# 2026-09-18: doi/authors_json/venue/published_at added to an already-deployed table.
# ``CREATE TABLE IF NOT EXISTS`` above is a no-op against an existing table, so a
# pre-existing database file never gains these columns without this explicit migration
# (see ProjectSourceRepository._migrate_source_columns).
_SOURCE_MIGRATION_COLUMNS: tuple[tuple[str, str], ...] = (
    ("doi", "TEXT"),
    ("authors_json", "TEXT"),
    ("venue", "TEXT"),
    ("published_at", "TEXT"),
    # 2026-09-26: collection provenance (RESEARCH_LINES_MASTER_PLAN WC-P1-01).
    ("canonical_url", "TEXT"),
    ("source_uri", "TEXT"),
    ("fetched_at", "TEXT"),
    ("provenance_json", "TEXT"),
    ("source_class", "TEXT"),
    ("relevance_json", "TEXT"),
    ("supersedes_source_id", "TEXT"),
)


class ProjectSourceRepository:
    """SQLite adapter for the Project/Source repository contract."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.executescript(_SCHEMA)
            self._migrate_source_columns(connection)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def _migrate_source_columns(connection: sqlite3.Connection) -> None:
        existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(prov_sources)")}
        for column, column_type in _SOURCE_MIGRATION_COLUMNS:
            if column not in existing_columns:
                connection.execute(f"ALTER TABLE prov_sources ADD COLUMN {column} {column_type}")
        # One ACTIVE version per canonical URL per Project (plan I1), enforced by the database itself; a superseded
        # row keeps its canonical_url, so the index is partial. Created here, not in _SCHEMA, because an old file
        # only gains the column in the loop above.
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_prov_sources_active_canonical ON prov_sources (tenant_id, project_id, canonical_url) "
            "WHERE status = 'active' AND canonical_url IS NOT NULL"
        )

    @staticmethod
    def _source_from_row(row: sqlite3.Row) -> dict[str, Any]:
        source = dict(row)
        source["artifact_uri"] = json.loads(source.pop("artifact_uri_json"))
        authors_json = source.pop("authors_json")
        source["authors"] = None if authors_json is None else json.loads(authors_json)
        for column in ("provenance", "relevance"):
            raw = source.pop(f"{column}_json")
            source[column] = None if raw is None else json.loads(raw)
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

    @classmethod
    def _insert_source(cls, connection: sqlite3.Connection, record: Mapping[str, Any], cas_path: Mapping[str, str]) -> None:
        """Insert one Source row + its SourceAdded event on an open transaction (add_source, supersede, ingest share it)."""
        source = {column: (record.get(column) if column in _PROVENANCE_COLUMNS else record[column]) for column in _SOURCE_COLUMNS}
        if cas_path.get("tenant_segment") != source["tenant_id"] or cas_path.get("hash") != source["content_sha256"]:
            raise InvariantViolation("SOURCE_STORAGE_REFERENCE_INVALID")
        project = connection.execute(
            "SELECT data_classification FROM platform_projects WHERE tenant_id=? AND project_id=?",
            (source["tenant_id"], source["project_id"]),
        ).fetchone()
        if project is None:
            raise InvariantViolation("SOURCE_PROJECT_NOT_FOUND")
        if project["data_classification"] != source["data_classification"]:
            raise InvariantViolation("SOURCE_PROJECT_CLASSIFICATION_MISMATCH")
        json_or_none = lambda value: None if value is None else canonical_json(value)  # noqa: E731
        connection.execute(
            "INSERT INTO prov_sources (source_id, project_id, tenant_id, title, media_type, data_classification, content_sha256, size_bytes, artifact_uri_json, content_role, verification_status, status, version, created_by_identity_id, created_at, cas_path_json, doi, authors_json, venue, published_at, canonical_url, source_uri, fetched_at, provenance_json, source_class, relevance_json, supersedes_source_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                source["source_id"],
                source["project_id"],
                source["tenant_id"],
                source["title"],
                source["media_type"],
                source["data_classification"],
                source["content_sha256"],
                source["size_bytes"],
                canonical_json(source["artifact_uri"]),
                source["content_role"],
                source["verification_status"],
                source["status"],
                source["version"],
                source["created_by_identity_id"],
                source["created_at"],
                canonical_json(dict(cas_path)),
                source["doi"],
                json_or_none(source["authors"]),
                source["venue"],
                source["published_at"],
                source["canonical_url"],
                source["source_uri"],
                source["fetched_at"],
                json_or_none(source["provenance"]),
                source["source_class"],
                json_or_none(source["relevance"]),
                source["supersedes_source_id"],
            ),
        )
        cls._append_event(
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

    def add_source(self, record: Mapping[str, Any], cas_path: Mapping[str, str]) -> dict[str, Any]:
        with self._connection() as connection:
            self._insert_source(connection, record, cas_path)
        return dict(record)

    @classmethod
    def _find_active_source(cls, connection: sqlite3.Connection, tenant_id: str, project_id: str, canonical_url: str) -> dict[str, Any] | None:
        row = connection.execute(
            f"SELECT {_SOURCE_SELECT} FROM prov_sources WHERE tenant_id=? AND project_id=? AND canonical_url=? AND status='active'",
            (tenant_id, project_id, canonical_url),
        ).fetchone()
        return None if row is None else cls._source_from_row(row)

    def find_active_source(self, tenant_id: str, project_id: str, canonical_url: str) -> dict[str, Any] | None:
        """The current version of a collected URL in this Project, or None."""
        with self._connection() as connection:
            return self._find_active_source(connection, tenant_id, project_id, canonical_url)

    @classmethod
    def _supersede(cls, connection: sqlite3.Connection, old_source_id: str, record: Mapping[str, Any], cas_path: Mapping[str, str]) -> None:
        if record.get("supersedes_source_id") != old_source_id:
            raise InvariantViolation("SOURCE_SUPERSEDE_POINTER_INVALID")
        old = connection.execute(
            "SELECT canonical_url FROM prov_sources WHERE tenant_id=? AND project_id=? AND source_id=? AND status='active'",
            (record["tenant_id"], record["project_id"], old_source_id),
        ).fetchone()
        if old is None or old["canonical_url"] is None or old["canonical_url"] != record.get("canonical_url"):
            raise InvariantViolation("SOURCE_SUPERSEDE_CONFLICT")
        connection.execute(
            "UPDATE prov_sources SET status='superseded' WHERE tenant_id=? AND project_id=? AND source_id=? AND status='active'",
            (record["tenant_id"], record["project_id"], old_source_id),
        )
        cls._insert_source(connection, record, cas_path)
        cls._append_event(
            connection,
            record["tenant_id"],
            f"source:{old_source_id}",
            "SourceSuperseded",
            {"source_id": old_source_id, "superseded_by": record["source_id"], "project_id": record["project_id"]},
        )

    def supersede(self, old_source_id: str, record: Mapping[str, Any], cas_path: Mapping[str, str]) -> dict[str, Any]:
        """Replace the active version of a collected URL: old row -> superseded, new row -> active, both events,
        one transaction (plan I1). Any failure leaves the old row active."""
        with self._connection() as connection:
            self._supersede(connection, old_source_id, record, cas_path)
        return dict(record)

    # -- Collection runs (specs/domain/collection-run.schema.yaml) ---------------------------------------------
    # Events go on the Project's own aggregate and carry ids, counts and status only -- never seeds, which may name a
    # person (RESEARCH_LINES_MASTER_PLAN K8); erasing the Project removes the run rows with it.

    @staticmethod
    def _run_from_row(row: sqlite3.Row) -> dict[str, Any]:
        seeds = json.loads(row["seeds_json"])
        budget = json.loads(row["budget_json"])
        return {
            "run_id": row["run_id"],
            "project_id": row["project_id"],
            "tenant_id": row["tenant_id"],
            "status": row["status"],
            "seeds_count": len(seeds),
            "max_fetches": budget["fetches"],
            "requested_by_identity_id": row["requested_by_identity_id"],
            "requested_at": row["requested_at"],
            "completed_at": row["completed_at"],
            "report": None if row["report_json"] is None else json.loads(row["report_json"]),
        }

    def create_collection_run(self, record: Mapping[str, Any], seeds: list[Mapping[str, Any]]) -> dict[str, Any]:
        if record["status"] != "requested" or len(seeds) != record["seeds_count"]:
            raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO collection_runs (tenant_id, project_id, run_id, status, seeds_json, budget_json, requested_by_identity_id, requested_at, completed_at, report_json) VALUES (?,?,?,?,?,?,?,?,NULL,NULL)",
                (record["tenant_id"], record["project_id"], record["run_id"], "requested", canonical_json([dict(seed) for seed in seeds]), canonical_json({"fetches": record["max_fetches"]}), record["requested_by_identity_id"], record["requested_at"]),
            )
            self._append_event(connection, record["tenant_id"], f"project:{record['project_id']}", "CollectionRequested", {"run_id": record["run_id"], "seeds_count": record["seeds_count"], "max_fetches": record["max_fetches"]})
        return dict(record)

    def get_collection_run(self, tenant_id: str, project_id: str, run_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM collection_runs WHERE tenant_id=? AND project_id=? AND run_id=?", (tenant_id, project_id, run_id)).fetchone()
        return None if row is None else self._run_from_row(row)

    def collection_run_seeds(self, tenant_id: str, run_id: str) -> list[dict[str, Any]]:
        """The seeds as requested -- only for the call that hands the run to the Collection Service."""
        with self._connection() as connection:
            row = connection.execute("SELECT seeds_json FROM collection_runs WHERE tenant_id=? AND run_id=?", (tenant_id, run_id)).fetchone()
        return [] if row is None else json.loads(row["seeds_json"])

    def _transition(self, tenant_id: str, run_id: str, allowed_from: tuple[str, ...], to: str, event_type: str, payload: Mapping[str, Any], completed_at: str | None, report_json: str | None) -> dict[str, Any]:
        with self._connection() as connection:
            row = connection.execute("SELECT project_id, status FROM collection_runs WHERE tenant_id=? AND run_id=?", (tenant_id, run_id)).fetchone()
            if row is None or row["status"] not in allowed_from:
                raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
            placeholders = ",".join("?" for _ in allowed_from)
            changed = connection.execute(
                f"UPDATE collection_runs SET status=?, completed_at=COALESCE(?, completed_at), report_json=COALESCE(?, report_json) WHERE tenant_id=? AND run_id=? AND status IN ({placeholders})",
                (to, completed_at, report_json, tenant_id, run_id, *allowed_from),
            ).rowcount
            if changed != 1:
                raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
            self._append_event(connection, tenant_id, f"project:{row['project_id']}", event_type, {"run_id": run_id, **payload})
            final = connection.execute("SELECT * FROM collection_runs WHERE tenant_id=? AND run_id=?", (tenant_id, run_id)).fetchone()
        return self._run_from_row(final)

    def mark_collection_running(self, tenant_id: str, run_id: str) -> dict[str, Any]:
        """requested -> running: the Collection Service has exchanged the run's grant."""
        return self._transition(tenant_id, run_id, ("requested",), "running", "CollectionStarted", {}, None, None)

    def finish_collection_run(self, tenant_id: str, run_id: str, status: str, report: Mapping[str, Any] | None) -> dict[str, Any]:
        """requested|running -> completed|failed. ``failed`` from requested = the Collection Service was never reached."""
        if status not in ("completed", "failed"):
            raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
        clean = run_report(report)
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        event_type = "CollectionCompleted" if status == "completed" else "CollectionFailed"
        return self._transition(tenant_id, run_id, ("requested", "running"), status, event_type, {"status": status, "report": clean}, now, None if clean is None else canonical_json(clean))

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

    def append_event(self, tenant_id: str, aggregate_id: str, event_type: str, payload: Mapping[str, Any]) -> None:
        """Public transactional event seam for project-bound artifacts."""
        with self._connection() as connection:
            self._append_event(connection, tenant_id, aggregate_id, event_type, payload)

    def interpretation_events(self, tenant_id: str, interpretation_id: str) -> list[dict[str, Any]]:
        """Read one interpretation's lifecycle from the tenant's project event stream."""
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT aggregate_id, sequence, event_type, payload_json FROM events "
                "WHERE tenant_id=? AND event_type IN ('InterpretationRequested', 'InterpretationCreated', 'InterpretationFailed', 'InterpretationJudged') "
                "AND json_extract(payload_json, '$.interpretation_id')=? ORDER BY rowid",
                (tenant_id, interpretation_id),
            ).fetchall()
        return [{**dict(row), "payload": json.loads(row["payload_json"])} for row in rows]

    def save_interpretation(self, tenant_id: str, project_id: str, interpretation_id: str, artifact_reference: Mapping[str, Any], created_at: str) -> None:
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO project_interpretations (tenant_id, project_id, interpretation_id, artifact_reference_json, created_at) VALUES (?,?,?,?,?)",
                (tenant_id, project_id, interpretation_id, json.dumps(dict(artifact_reference), ensure_ascii=False, sort_keys=True), created_at),
            )
            self._append_event(connection, tenant_id, f"project:{project_id}", "InterpretationCreated", {"interpretation_id": interpretation_id, "artifact_reference": dict(artifact_reference)})

    def get_interpretation(self, tenant_id: str, interpretation_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT tenant_id, project_id, interpretation_id, artifact_reference_json, created_at FROM project_interpretations WHERE tenant_id=? AND interpretation_id=?",
                (tenant_id, interpretation_id),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["artifact_reference"] = json.loads(result.pop("artifact_reference_json"))
        return result

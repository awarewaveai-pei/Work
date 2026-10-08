"""Project/Source repository on PostgreSQL (docs/platform/STORAGE_SWITCH.md W2), the canonical relational table names.
Every call goes tenant -> region -> pool (``Databases.for_tenant``); the schema is Alembic's (ai_lego/data/migrations).

Current-state rows and their append-only event are committed in one transaction. Raw Source bytes are never accepted by
this adapter: the caller passes a ``put_content`` callback, which runs inside the write transaction.

Blob lifecycle (one rule): committed rows are the only record of which Source blobs are live. Content is written only
under the tenant's source-blob lock held shared (``_lock_source_blobs``), after its rows and before commit; a blob no
committed row references is garbage (a refused batch writes none, a crash or failed write between content and commit can
leave one). ``collect_unreferenced_blobs`` removes garbage under the same lock held exclusive -- so it never sees another
write in flight. Every erasure lists the garbage in its decision (``unreferenced_blobs``) and removes it only after
that decision commits (ai_lego/platform/erasure.py). There is no per-request cleanup.

A case is written only while it exists (invariant 3): every writer takes the case lock shared as the first statement of
its transaction (``lock_case``; a child row written first would hold the parent row the erase deletes: a deadlock) and
checks the case row under it (``require_case``); ``erase_case_rows`` takes the same lock exclusive. Writers do not wait
for each other; the erase waits only for the transactions in flight, and one that comes after it finds no case
(CASE_ERASED).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Mapping

import psycopg

from ai_lego.core.domain.collection_run import OPEN_STATUSES, effective_status, run_report
from ai_lego.core.support import canonical_json, sha256_bytes
from ai_lego.data import db
from ai_lego.data.db import Databases, Jsonb, Row
from ai_lego.data.events import record_log
from ai_lego.data.events.record_log import Writer
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.errors import InvariantViolation


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
_PROJECT_SELECT = ", ".join(_PROJECT_COLUMNS)

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


def _jsonb_or_none(value: Any) -> Jsonb | None:
    return None if value is None else Jsonb(value)


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value)


class ProjectSourceRepository:
    """PostgreSQL adapter for the Project/Source repository contract."""

    def __init__(self, databases: Databases) -> None:
        self._db = databases

    @property
    def databases(self) -> Databases:
        """The pools this repository reaches (the erasure's restart scan walks every region of them)."""
        return self._db

    @staticmethod
    def _source_from_row(row: Row) -> dict[str, Any]:
        source = dict(row)
        source["artifact_uri"] = source.pop("artifact_uri_json")
        source["authors"] = source.pop("authors_json")
        for column in ("provenance", "relevance"):
            source[column] = source.pop(f"{column}_json")
        return source

    def transaction(self, tenant_id: str):
        """A transaction in the tenant's region, for the other parts of the case layer (case_docs, GOVERN's export)."""
        return self._db.for_tenant(tenant_id)

    def hooks_lock(self, tenant_id: str, case_id: str):
        """Held across one run of a case's after-sources hooks (block_hooks), one run at a time in every process: a session
        lock under its own name, so the erase -- which takes the case lock -- never waits for a hook to finish."""
        region = self._db.region_of(tenant_id)
        if region is None:
            raise InvariantViolation(f"TENANT_REGION_UNKNOWN: tenant {tenant_id!r} is not in the tenant directory")
        return self._db.session_lock(region, "case-hooks", tenant_id, case_id)

    @staticmethod
    def lock_case(connection: psycopg.Connection, tenant_id: str, project_id: str, *, exclusive: bool = False) -> None:
        """Invariant 3: the case's owner lock (db.owner_lock) -- every writer of a case's records shared, first in its
        transaction; the erase, and a batch whose checks must hold (CaseDocs.save_many), exclusive."""
        db.owner_lock(connection, "case", tenant_id, project_id, exclusive=exclusive)

    @staticmethod
    def _lock_source_blobs(connection: psycopg.Connection, tenant_id: str, *, collect: bool = False) -> None:
        """The blob lifecycle rule's lock (module note): shared while a write puts content, exclusive while garbage goes."""
        db.advisory_xact_lock(connection, "source-blobs", tenant_id, shared=not collect)

    @classmethod
    def require_case(cls, connection: psycopg.Connection, tenant_id: str, project_id: str) -> None:
        """A case's records are written only while the case exists (完整刪除): late writers get CASE_ERASED. The check runs
        under the case lock held shared, so it is atomic with erase_case_rows, which holds it exclusive; a plain SELECT
        would let an erase commit between the check and the write (critic 2026-10-04, probe P4)."""
        cls.lock_case(connection, tenant_id, project_id)
        if connection.execute("SELECT 1 FROM platform_projects WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id)).fetchone() is None:
            raise InvariantViolation(f"CASE_ERASED: case {project_id!r} no longer exists; nothing is written to it")

    @classmethod
    def _append_event(cls, connection: psycopg.Connection, tenant_id: str, project_id: str, aggregate_id: str, event_type: str, payload: Mapping[str, Any], writer: Writer,
                      at: datetime | None = None) -> None:
        """Every record of this repository belongs to one case: the Project's own aggregate or one of its Sources'."""
        cls.require_case(connection, tenant_id, project_id)
        record_log.append(connection, tenant_id, aggregate_id, event_type, payload, writer=writer, owner=record_log.case(project_id), at=at)

    def create_project(self, record: Mapping[str, Any]) -> dict[str, Any]:
        """The Project as stored (its created_at read back as the database keeps it)."""
        project = {column: record[column] for column in _PROJECT_COLUMNS}
        with self._db.for_tenant(project["tenant_id"]) as connection:
            stored = connection.execute(
                f"INSERT INTO platform_projects ({_PROJECT_SELECT}) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {_PROJECT_SELECT}",
                tuple(project[column] for column in _PROJECT_COLUMNS),
            ).fetchone()
            self._append_event(
                connection,
                project["tenant_id"],
                project["project_id"],
                f"project:{project['project_id']}",
                "ProjectCreated",
                {
                    "project_id": project["project_id"],
                    "workspace_id": project["workspace_id"],
                    "data_classification": project["data_classification"],
                    "record_sha256": sha256_bytes(canonical_json(project).encode("utf-8")),
                },
                record_log.user(project["created_by_identity_id"], "ASSEMBLER"),
            )
        return dict(stored)

    def get_project(self, tenant_id: str, project_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(f"SELECT {_PROJECT_SELECT} FROM platform_projects WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id)).fetchone()
        return None if row is None else dict(row)

    def list_projects(self, tenant_id: str, workspace_id: str | None = None) -> list[dict[str, Any]]:
        query = f"SELECT {_PROJECT_SELECT} FROM platform_projects WHERE tenant_id=%s"
        parameters: tuple[Any, ...] = (tenant_id,)
        if workspace_id is not None:
            query += " AND workspace_id=%s"
            parameters += (workspace_id,)
        query += " ORDER BY created_at, project_id"
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [dict(row) for row in rows]

    @classmethod
    def _insert_source(cls, connection: psycopg.Connection, record: Mapping[str, Any], cas_path: Mapping[str, str], writer: Writer) -> dict[str, Any]:
        """Insert one Source row + its SourceAdded event on an open transaction (add_source, supersede, ingest share it); the
        row as stored. ``writer``: the person who typed it in, or the system that collected it."""
        source = {column: (record.get(column) if column in _PROVENANCE_COLUMNS else record[column]) for column in _SOURCE_COLUMNS}
        if cas_path.get("tenant_segment") != source["tenant_id"] or cas_path.get("hash") != source["content_sha256"]:
            raise InvariantViolation("SOURCE_STORAGE_REFERENCE_INVALID")
        project = connection.execute(
            "SELECT data_classification FROM platform_projects WHERE tenant_id=%s AND project_id=%s",
            (source["tenant_id"], source["project_id"]),
        ).fetchone()
        if project is None:
            raise InvariantViolation("SOURCE_PROJECT_NOT_FOUND")
        if project["data_classification"] != source["data_classification"]:
            raise InvariantViolation("SOURCE_PROJECT_CLASSIFICATION_MISMATCH")
        stored = connection.execute(
            "INSERT INTO prov_sources (source_id, project_id, tenant_id, title, media_type, data_classification, content_sha256, size_bytes, artifact_uri_json, content_role, verification_status, status, version, created_by_identity_id, created_at, cas_path_json, doi, authors_json, venue, published_at, canonical_url, source_uri, fetched_at, provenance_json, source_class, relevance_json, supersedes_source_id) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {_SOURCE_SELECT}",
            (
                source["source_id"],
                source["project_id"],
                source["tenant_id"],
                source["title"],
                source["media_type"],
                source["data_classification"],
                source["content_sha256"],
                source["size_bytes"],
                Jsonb(source["artifact_uri"]),
                source["content_role"],
                source["verification_status"],
                source["status"],
                source["version"],
                source["created_by_identity_id"],
                source["created_at"],
                Jsonb(dict(cas_path)),
                source["doi"],
                _jsonb_or_none(source["authors"]),
                source["venue"],
                source["published_at"],
                source["canonical_url"],
                source["source_uri"],
                source["fetched_at"],
                _jsonb_or_none(source["provenance"]),
                source["source_class"],
                _jsonb_or_none(source["relevance"]),
                source["supersedes_source_id"],
            ),
        ).fetchone()
        cls._append_event(
            connection,
            source["tenant_id"],
            source["project_id"],
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
            writer,
        )
        return cls._source_from_row(stored)

    @classmethod
    def _content_write(cls, connection: psycopg.Connection, tenant_id: str, project_id: str) -> None:
        """First in a transaction that adds Sources: the case lock (shared), then the blob lock (shared), in that order
        everywhere (the erase takes both exclusive, in the same order)."""
        cls.lock_case(connection, tenant_id, project_id)
        cls._lock_source_blobs(connection, tenant_id)

    def add_source(self, record: Mapping[str, Any], cas_path: Mapping[str, str], put_content: Callable[[], Any] | None = None, *, writer: Writer) -> dict[str, Any]:
        """Row first, then the content, then commit: a failing insert writes no blob; ``put`` is atomic. Returns the Source as stored."""
        with self._db.for_tenant(record["tenant_id"]) as connection:
            self._content_write(connection, record["tenant_id"], record["project_id"])
            stored = self._insert_source(connection, record, cas_path, writer)
            if put_content is not None:
                put_content()
        return stored

    @classmethod
    def _find_active_source(cls, connection: psycopg.Connection, tenant_id: str, project_id: str, canonical_url: str) -> dict[str, Any] | None:
        row = connection.execute(
            f"SELECT {_SOURCE_SELECT} FROM prov_sources WHERE tenant_id=%s AND project_id=%s AND canonical_url=%s AND status='active'",
            (tenant_id, project_id, canonical_url),
        ).fetchone()
        return None if row is None else cls._source_from_row(row)

    def find_active_source(self, tenant_id: str, project_id: str, canonical_url: str) -> dict[str, Any] | None:
        """The current version of a collected URL in this Project, or None."""
        with self._db.for_tenant(tenant_id) as connection:
            return self._find_active_source(connection, tenant_id, project_id, canonical_url)

    @classmethod
    def _supersede(cls, connection: psycopg.Connection, old_source_id: str, record: Mapping[str, Any], cas_path: Mapping[str, str]) -> dict[str, Any]:
        if record.get("supersedes_source_id") != old_source_id:
            raise InvariantViolation("SOURCE_SUPERSEDE_POINTER_INVALID")
        old = connection.execute(
            "SELECT canonical_url FROM prov_sources WHERE tenant_id=%s AND project_id=%s AND source_id=%s AND status='active'",
            (record["tenant_id"], record["project_id"], old_source_id),
        ).fetchone()
        if old is None or old["canonical_url"] is None or old["canonical_url"] != record.get("canonical_url"):
            raise InvariantViolation("SOURCE_SUPERSEDE_CONFLICT")
        connection.execute(
            "UPDATE prov_sources SET status='superseded' WHERE tenant_id=%s AND project_id=%s AND source_id=%s AND status='active'",
            (record["tenant_id"], record["project_id"], old_source_id),
        )
        stored = cls._insert_source(connection, record, cas_path, record_log.system("GATHER"))
        cls._append_event(
            connection,
            record["tenant_id"],
            record["project_id"],
            f"source:{old_source_id}",
            "SourceSuperseded",
            {"source_id": old_source_id, "superseded_by": record["source_id"], "project_id": record["project_id"]},
            record_log.system("GATHER"),
        )
        return stored

    def supersede(self, old_source_id: str, record: Mapping[str, Any], cas_path: Mapping[str, str], put_content: Callable[[], Any] | None = None) -> dict[str, Any]:
        """Replace the active version of a collected URL: old row -> superseded, new row -> active, both events,
        one write transaction (plan I1); content as in ``add_source``. Any failure leaves the old row active."""
        with self._db.for_tenant(record["tenant_id"]) as connection:
            self._content_write(connection, record["tenant_id"], record["project_id"])
            stored = self._supersede(connection, old_source_id, record, cas_path)
            if put_content is not None:
                put_content()
        return stored

    def ingest_batch(
        self,
        tenant_id: str,
        project_id: str,
        items: list[tuple[Mapping[str, Any], Mapping[str, str]]],
        put_content: Callable[[Mapping[str, str]], Any],
    ) -> list[dict[str, str]]:
        """Collected Sources, one write transaction for the whole batch (plan C2, R2). Per item, decided under the locks:
        same canonical_url + same sha256 = unchanged (nothing written); same URL + new sha256 = supersede; new URL =
        insert. All rows first, then each new content once (``put_content(cas_path)``), then commit.
        ``items`` = (record with supersedes_source_id None, cas_path)."""
        results: list[dict[str, str]] = []
        to_write: dict[str, Mapping[str, str]] = {}
        with self._db.for_tenant(tenant_id) as connection:
            self._content_write(connection, tenant_id, project_id)
            for record, cas_path in items:
                if record["tenant_id"] != tenant_id or record["project_id"] != project_id or not record.get("canonical_url"):
                    raise InvariantViolation("SOURCE_INGEST_SCOPE_INVALID")
                current = self._find_active_source(connection, tenant_id, project_id, record["canonical_url"])
                if current is not None and current["content_sha256"] == record["content_sha256"]:
                    results.append({"canonical_url": record["canonical_url"], "outcome": "unchanged", "source_id": current["source_id"]})
                elif current is not None:
                    self._supersede(connection, current["source_id"], {**record, "supersedes_source_id": current["source_id"]}, cas_path)
                    results.append({"canonical_url": record["canonical_url"], "outcome": "superseded", "source_id": record["source_id"]})
                    to_write[cas_path["hash"]] = cas_path
                else:
                    self._insert_source(connection, record, cas_path, record_log.system("GATHER"))
                    results.append({"canonical_url": record["canonical_url"], "outcome": "created", "source_id": record["source_id"]})
                    to_write[cas_path["hash"]] = cas_path
            for cas_path in to_write.values():
                put_content(cas_path)
        return results

    @classmethod
    def unreferenced_blobs(cls, connection: psycopg.Connection, tenant_id: str, cas: TenantScopedCas) -> list[str]:
        """Every Source object path of the tenant that no row this transaction sees references, under the blob lock held
        exclusive (until the transaction ends). Lists; removes nothing."""
        cls._lock_source_blobs(connection, tenant_id, collect=True)
        referenced = {row["content_sha256"] for row in connection.execute("SELECT DISTINCT content_sha256 FROM prov_sources WHERE tenant_id=%s", (tenant_id,))}
        return [object_path for object_path in cas.list_objects(tenant_id) if object_path.rsplit("/", 1)[-1] not in referenced]

    def collect_unreferenced_blobs(self, tenant_id: str, cas: TenantScopedCas) -> int:
        """Remove every Source blob of the tenant that no committed row references (the blob lifecycle rule above);
        under the blob lock held exclusive, so nothing in flight can be mistaken for garbage. Returns how many were removed.
        The unlink inside this transaction is safe because the transaction decides nothing: it only reads committed rows."""
        with self._db.for_tenant(tenant_id) as connection:
            garbage = self.unreferenced_blobs(connection, tenant_id, cas)
            for object_path in garbage:
                cas.unlink(tenant_id, {"path": object_path, "tenant_segment": tenant_id})
        return len(garbage)

    @classmethod
    def blob_referenced(cls, connection: psycopg.Connection, tenant_id: str, content_sha256: str) -> bool:
        """Whether a committed Source row of the tenant still names this content, read under the blob lock held exclusive:
        no write is between its content and its commit, and one that starts after waits for this transaction."""
        cls._lock_source_blobs(connection, tenant_id, collect=True)
        return connection.execute("SELECT 1 FROM prov_sources WHERE tenant_id=%s AND content_sha256=%s LIMIT 1", (tenant_id, content_sha256)).fetchone() is not None

    @classmethod
    def artifact_referenced(cls, connection: psycopg.Connection, tenant_id: str, cas_path: str) -> bool:
        """Whether a committed interpretation, synthesis or report row of the tenant still points at this artifact path."""
        return any(connection.execute(f"SELECT 1 FROM {table} WHERE tenant_id=%s AND artifact_reference_json->'cas_path'->>'path' = %s LIMIT 1", (tenant_id, cas_path)).fetchone()
                   for table in cls._ARTIFACT_TABLES)

    # -- Collection runs (specs/domain/collection-run.schema.yaml) ---------------------------------------------
    # Events go on the Project's own aggregate and carry ids, counts and status only -- never seeds, which may name a
    # person (RESEARCH_LINES_MASTER_PLAN K8); erasing the Project removes the run rows with it.

    @staticmethod
    def _run_from_row(row: Row) -> dict[str, Any]:
        return {
            "run_id": row["run_id"],
            "project_id": row["project_id"],
            "tenant_id": row["tenant_id"],
            "status": effective_status(row["status"], row["deadline_at"]),
            "seeds_count": len(row["seeds_json"]),
            "max_fetches": row["budget_json"]["fetches"],
            "requested_by_identity_id": row["requested_by_identity_id"],
            "requested_at": row["requested_at"],
            "deadline_at": row["deadline_at"],
            "completed_at": row["completed_at"],
            "report": row["report_json"],
        }

    def create_collection_run(self, record: Mapping[str, Any], seeds: list[Mapping[str, Any]]) -> dict[str, Any]:
        """The run as stored."""
        if record["status"] != "requested" or len(seeds) != record["seeds_count"]:
            raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
        with self._db.for_tenant(record["tenant_id"]) as connection:
            self.require_case(connection, record["tenant_id"], record["project_id"])
            stored = connection.execute(
                "INSERT INTO collection_runs (tenant_id, project_id, run_id, status, seeds_json, budget_json, requested_by_identity_id, requested_at, deadline_at, completed_at, report_json) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL) RETURNING *",
                (record["tenant_id"], record["project_id"], record["run_id"], "requested", Jsonb([dict(seed) for seed in seeds]), Jsonb({"fetches": record["max_fetches"]}),
                 record["requested_by_identity_id"], record["requested_at"], record["deadline_at"]),
            ).fetchone()
            self._append_event(connection, record["tenant_id"], record["project_id"], f"project:{record['project_id']}", "CollectionRequested",
                               {"run_id": record["run_id"], "seeds_count": record["seeds_count"], "max_fetches": record["max_fetches"]},
                               record_log.user(record["requested_by_identity_id"], "GATHER"))
        return self._run_from_row(stored)

    def get_collection_run(self, tenant_id: str, project_id: str, run_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute("SELECT * FROM collection_runs WHERE tenant_id=%s AND project_id=%s AND run_id=%s", (tenant_id, project_id, run_id)).fetchone()
        return None if row is None else self._run_from_row(row)

    def _transition(self, tenant_id: str, run_id: str, allowed_from: tuple[str, ...], to: str, event_type: str, payload: Mapping[str, Any], completed: bool, report: Mapping[str, Any] | None) -> dict[str, Any]:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute("SELECT project_id FROM collection_runs WHERE tenant_id=%s AND run_id=%s", (tenant_id, run_id)).fetchone()
            if row is None:
                raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
            self.require_case(connection, tenant_id, row["project_id"])
            # Only an open run before its deadline moves; past it the run IS failed (effective_status) and stays so.
            moment = db.now()
            placeholders = ",".join("%s" for _ in allowed_from)
            final = connection.execute(
                f"UPDATE collection_runs SET status=%s, completed_at=COALESCE(%s, completed_at), report_json=COALESCE(%s, report_json) WHERE tenant_id=%s AND run_id=%s AND status IN ({placeholders}) AND deadline_at > %s RETURNING *",
                (to, moment if completed else None, _jsonb_or_none(report), tenant_id, run_id, *allowed_from, moment),
            ).fetchone()
            if final is None:
                raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
            self._append_event(connection, tenant_id, row["project_id"], f"project:{row['project_id']}", event_type, {"run_id": run_id, **payload}, record_log.system("GATHER"))
        return self._run_from_row(final)

    def mark_collection_running(self, tenant_id: str, run_id: str) -> dict[str, Any]:
        """requested -> running: the Collection Service has exchanged the run's grant."""
        return self._transition(tenant_id, run_id, ("requested",), "running", "CollectionStarted", {}, False, None)

    def finish_collection_run(self, tenant_id: str, run_id: str, status: str, report: Mapping[str, Any] | None) -> dict[str, Any]:
        """requested|running -> completed|failed. ``failed`` from requested = the Collection Service was never reached."""
        if status not in ("completed", "failed"):
            raise InvariantViolation("COLLECTION_RUN_STATE_INVALID")
        clean = run_report(report)
        event_type = "CollectionCompleted" if status == "completed" else "CollectionFailed"
        return self._transition(tenant_id, run_id, OPEN_STATUSES, status, event_type, {"status": status, "report": clean}, True, clean)

    def get_source(self, tenant_id: str, project_id: str, source_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(
                f"SELECT {_SOURCE_SELECT} FROM prov_sources WHERE tenant_id=%s AND project_id=%s AND source_id=%s",
                (tenant_id, project_id, source_id),
            ).fetchone()
        return None if row is None else self._source_from_row(row)

    def list_sources(self, tenant_id: str, project_id: str) -> list[dict[str, Any]]:
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                f"SELECT {_SOURCE_SELECT} FROM prov_sources WHERE tenant_id=%s AND project_id=%s ORDER BY created_at, source_id",
                (tenant_id, project_id),
            ).fetchall()
        return [self._source_from_row(row) for row in rows]

    def search_active_sources(self, tenant_id: str, query: str, limit: int, identity_id: str) -> tuple[list[dict[str, Any]], bool]:
        """Search active Sources across the cases ``identity_id`` opened (no one else's) without wildcard injection, case
        folded (ILIKE: SQLite's LIKE folded ASCII; PostgreSQL's ILIKE folds every letter the database's locale knows).
        Returns ``(rows, truncated)``: ``truncated`` is True when more than ``limit`` Sources match (one extra row is
        fetched to know), so a caller never mistakes the first ``limit`` rows for the whole match set."""
        if not isinstance(query, str) or not query.strip():
            raise InvariantViolation("SOURCE_SEARCH_QUERY_REQUIRED")
        if not isinstance(limit, int) or not 1 <= limit <= 100:
            raise InvariantViolation("SOURCE_SEARCH_LIMIT_INVALID")
        escaped = query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        source_select = ", ".join(f"s.{column}" for column in _SOURCE_SELECT.split(", "))
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                f"SELECT {source_select}, p.name AS project_name, p.purpose AS project_purpose "
                "FROM prov_sources s JOIN platform_projects p ON p.tenant_id=s.tenant_id AND p.project_id=s.project_id "
                "WHERE s.tenant_id=%s AND p.created_by_identity_id=%s AND s.status='active' AND "
                "(s.source_id ILIKE %s ESCAPE '\\' OR s.title ILIKE %s ESCAPE '\\' OR COALESCE(s.doi,'') ILIKE %s ESCAPE '\\' "
                "OR COALESCE(s.canonical_url,'') ILIKE %s ESCAPE '\\' OR COALESCE(s.source_uri,'') ILIKE %s ESCAPE '\\') "
                "ORDER BY s.created_at, s.project_id, s.source_id LIMIT %s",
                (tenant_id, identity_id, pattern, pattern, pattern, pattern, pattern, limit + 1),
            ).fetchall()
        found = [{**self._source_from_row(row), "project_name": row["project_name"], "project_purpose": row["project_purpose"]} for row in rows]
        return found[:limit], len(found) > limit

    def get_source_content_reference(self, tenant_id: str, project_id: str, source_id: str) -> dict[str, str] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(
                "SELECT cas_path_json FROM prov_sources WHERE tenant_id=%s AND project_id=%s AND source_id=%s",
                (tenant_id, project_id, source_id),
            ).fetchone()
        return None if row is None else row["cas_path_json"]

    def active_source_reader(self, cas: TenantScopedCas, tenant_id: str, project_id: str) -> Callable[[str], "tuple[dict[str, Any], str] | None"]:
        """``read(source_id) -> (row, text)`` of one active stored source of this case, or None (what an AI turn that
        cites sources may read: ai_gate ``source_text``)."""
        def read(source_id: str) -> tuple[dict[str, Any], str] | None:
            row = self.get_source(tenant_id, project_id, source_id)
            reference = self.get_source_content_reference(tenant_id, project_id, source_id) if row and row["status"] == "active" else None
            return None if reference is None else (row, cas.read(tenant_id, reference).decode("utf-8"))
        return read

    def list_events(self, tenant_id: str, aggregate_id: str) -> list[dict[str, Any]]:
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                f"SELECT {record_log.ENVELOPE_COLUMNS} FROM events WHERE tenant_id=%s AND aggregate_id=%s ORDER BY sequence",
                (tenant_id, aggregate_id),
            ).fetchall()
        events = []
        for row in rows:
            event = dict(row)
            event["payload"] = event.pop("payload_json")
            events.append(event)
        return events

    def append_event(self, tenant_id: str, project_id: str, event_type: str, payload: Mapping[str, Any], writer: Writer) -> None:
        """One record on a case's own stream (record_log.append checks the writer, the block and the type)."""
        with self._db.for_tenant(tenant_id) as connection:
            self._append_event(connection, tenant_id, project_id, f"project:{project_id}", event_type, payload, writer)

    # An interpretation's lifecycle, in the project's event stream: asked for, created or failed, judged (同意／部分／不同意),
    # approved or returned (核准／退回). GET /interpretations/{id}, analyses() and the project summaries read the same list.
    INTERPRETATION_EVENTS = ("InterpretationRequested", "InterpretationCreated", "InterpretationFailed", "InterpretationJudged", "InterpretationApproved", "InterpretationReturned")

    def interpretation_events(self, tenant_id: str, interpretation_id: str) -> list[dict[str, Any]]:
        """Read one interpretation's lifecycle from the tenant's project event stream, in the order written."""
        placeholders = ",".join("%s" for _ in self.INTERPRETATION_EVENTS)
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                "SELECT aggregate_id, sequence, event_type, occurred_at, payload_json, author, block FROM events "
                f"WHERE tenant_id=%s AND event_type IN ({placeholders}) "
                "AND payload_json->>'interpretation_id' = %s ORDER BY write_order",
                (tenant_id, *self.INTERPRETATION_EVENTS, interpretation_id),
            ).fetchall()
        return [{**dict(row), "payload": row["payload_json"]} for row in rows]

    def _project_events(self, tenant_id: str, event_types: tuple[str, ...], project_id: str | None) -> list[Row]:
        placeholders = ",".join("%s" for _ in event_types)
        query = f"SELECT aggregate_id, event_type, occurred_at, payload_json FROM events WHERE tenant_id=%s AND event_type IN ({placeholders})"
        parameters: tuple[Any, ...] = (tenant_id, *event_types)
        if project_id is not None:
            query += " AND aggregate_id=%s"
            parameters += (f"project:{project_id}",)
        with self._db.for_tenant(tenant_id) as connection:
            return connection.execute(query + " ORDER BY write_order", parameters).fetchall()

    def analyses(self, tenant_id: str, project_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
        """project_id -> its analyses, oldest first, read from the event stream (their one record): the tool, when it was
        asked for and when it finished, PENDING / DONE / FAILED (GET /interpretations/{id} reads the same events), the
        user's latest judgment, the latest approval decision, and the version it redoes (退回 → 依原因重做).
        ``project_id`` limits it to one Project."""
        projects: dict[str, list[dict[str, Any]]] = {}
        by_id: dict[str, dict[str, Any]] = {}
        for row in self._project_events(tenant_id, self.INTERPRETATION_EVENTS, project_id):
            payload = row["payload_json"]
            key = payload.get("interpretation_id")
            kind = row["event_type"]
            if kind == "InterpretationRequested":
                revision = payload.get("revision") if isinstance(payload.get("revision"), dict) else None
                by_id[key] = {"interpretation_id": key, "method_id": payload.get("method_id"), "status": "PENDING", "requested_at": row["occurred_at"], "finished_at": None, "error": None, "judgment": None, "approval": None,
                              "revision_of": revision.get("of") if revision else None}
                projects.setdefault(row["aggregate_id"].removeprefix("project:"), []).append(by_id[key])
            elif key not in by_id:
                continue
            elif kind == "InterpretationJudged":
                by_id[key]["judgment"] = payload.get("stance")
            elif kind in ("InterpretationApproved", "InterpretationReturned"):
                by_id[key]["approval"] = {"decision": "approve" if kind == "InterpretationApproved" else "return", "at": row["occurred_at"], "by_name": payload.get("by_name"), "reason": payload.get("reason")}
            else:
                by_id[key].update(status="DONE" if kind == "InterpretationCreated" else "FAILED", finished_at=row["occurred_at"], error=payload.get("error"))
        return projects

    # Tasks (⑦ 把行動計畫存成任務) and rerun reminders (到期重跑並比較) live in the project's event stream like everything else
    # the project holds: created, then done/undone or owner/due filled in later; scheduled, then fulfilled by the
    # analysis that answered it.
    TASK_EVENTS = ("TaskCreated", "TaskDone", "TaskUpdated", "TaskNoted")
    RERUN_EVENTS = ("RerunScheduled", "RerunFulfilled")

    def tasks(self, tenant_id: str, project_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
        """project_id -> its tasks, oldest first: title, owner, due (YYYY-MM-DD), proof, target, the option it was
        saved under, the analysis it came from, its parent_task_id/kind (a card-created task or plan_change; None/
        "task" for a ⑦-saved plan row), its 4-state status (not_started/in_progress/done/on_hold -- done mirrors
        status=="done", kept for old readers), and its journal (oldest first, TaskNoted) with next_check = the
        latest entry's. TaskDone (old data) maps done=True -> status done, done=False -> in_progress if the task
        already had a journal entry, else not_started."""
        projects: dict[str, list[dict[str, Any]]] = {}
        by_id: dict[str, dict[str, Any]] = {}
        for row in self._project_events(tenant_id, self.TASK_EVENTS, project_id):
            payload = row["payload_json"]
            key = payload.get("task_id")
            event_type = row["event_type"]
            if event_type == "TaskCreated":
                by_id[key] = {"task_id": key, "interpretation_id": payload.get("interpretation_id"), "parent_task_id": payload.get("parent_task_id"), "kind": payload.get("kind", "task"),
                              "title": payload.get("title"), "owner": payload.get("owner"), "due": payload.get("due"), "proof": payload.get("proof"), "target": payload.get("target"),
                              "when": payload.get("when"), "option": payload.get("option"), "created_at": row["occurred_at"],
                              "status": "not_started", "done": False, "done_at": None, "notes": [], "next_check": None}
                projects.setdefault(row["aggregate_id"].removeprefix("project:"), []).append(by_id[key])
            elif key not in by_id:
                continue
            elif event_type == "TaskDone":
                done = bool(payload.get("done"))
                by_id[key]["status"] = "done" if done else ("in_progress" if by_id[key]["notes"] else "not_started")
                by_id[key]["done_at"] = row["occurred_at"] if done else None
            elif event_type == "TaskUpdated":   # owner and/or due filled in after creation (N-84); status = the 4-state board
                if "owner" in payload:
                    by_id[key]["owner"] = payload["owner"]
                if "due" in payload:
                    by_id[key]["due"] = payload["due"]
                if "status" in payload:
                    by_id[key]["status"] = payload["status"]
                    by_id[key]["done_at"] = row["occurred_at"] if payload["status"] == "done" else None
            else:   # TaskNoted: 實際狀況／想法／調整方針／卡住了／實際數字, at least one filled in
                by_id[key]["notes"].append({"note_id": payload.get("note_id"), "happened": payload.get("happened"), "thoughts": payload.get("thoughts"),
                                             "adjustment": payload.get("adjustment"), "blocker": payload.get("blocker"), "numbers": payload.get("numbers") or [],
                                             "next_check": payload.get("next_check"), "at": row["occurred_at"]})
                by_id[key]["next_check"] = payload.get("next_check")
            by_id[key]["done"] = by_id[key]["status"] == "done"
        return projects

    def reruns(self, tenant_id: str, project_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
        """project_id -> its rerun reminders, oldest first: the analysis to redo, when it is due, and the analysis that
        fulfilled it (None while open)."""
        projects: dict[str, list[dict[str, Any]]] = {}
        by_id: dict[str, dict[str, Any]] = {}
        for row in self._project_events(tenant_id, self.RERUN_EVENTS, project_id):
            payload = row["payload_json"]
            key = payload.get("rerun_id")
            if row["event_type"] == "RerunScheduled":
                by_id[key] = {"rerun_id": key, "interpretation_id": payload.get("interpretation_id"), "method_id": payload.get("method_id"), "due": payload.get("due"), "scheduled_at": row["occurred_at"], "fulfilled_by": None, "fulfilled_at": None}
                projects.setdefault(row["aggregate_id"].removeprefix("project:"), []).append(by_id[key])
            elif key in by_id:
                by_id[key].update(fulfilled_by=payload.get("interpretation_id"), fulfilled_at=row["occurred_at"])
        return projects

    def last_activity(self, tenant_id: str, project_id: str | None = None) -> dict[str, str]:
        """project_id -> when its own event stream last moved (created, collections, analyses, judgments)."""
        query = "SELECT aggregate_id, MAX(occurred_at) AS at FROM events WHERE tenant_id=%s AND aggregate_id LIKE 'project:%%'"
        parameters: tuple[Any, ...] = (tenant_id,)
        if project_id is not None:
            query += " AND aggregate_id=%s"
            parameters += (f"project:{project_id}",)
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(query + " GROUP BY aggregate_id", parameters).fetchall()
        return {row["aggregate_id"].removeprefix("project:"): row["at"] for row in rows}

    def save_interpretation(self, tenant_id: str, project_id: str, interpretation_id: str, artifact_reference: Mapping[str, Any], created_at: str, *, block: str) -> None:
        """``block``: the tool's block (its contract family); the AI wrote the result."""
        with self._db.for_tenant(tenant_id) as connection:
            self.require_case(connection, tenant_id, project_id)
            connection.execute(
                "INSERT INTO project_interpretations (tenant_id, project_id, interpretation_id, artifact_reference_json, created_at) VALUES (%s,%s,%s,%s,%s)",
                (tenant_id, project_id, interpretation_id, Jsonb(dict(artifact_reference)), created_at),
            )
            self._append_event(connection, tenant_id, project_id, f"project:{project_id}", "InterpretationCreated", {"interpretation_id": interpretation_id, "artifact_reference": dict(artifact_reference)}, record_log.ai(block),
                               at=_instant(created_at))

    def get_interpretation(self, tenant_id: str, interpretation_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(
                "SELECT tenant_id, project_id, interpretation_id, artifact_reference_json, created_at FROM project_interpretations WHERE tenant_id=%s AND interpretation_id=%s",
                (tenant_id, interpretation_id),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["artifact_reference"] = result.pop("artifact_reference_json")
        return result

    # -- Syntheses (P2 WC-06): same lifecycle shape as interpretations, their own table ---------------------------

    def synthesis_events(self, tenant_id: str, project_id: str, synthesis_id: str) -> list[dict[str, Any]]:
        """One synthesis's lifecycle (Requested -> Created | Failed) on its Project's event stream."""
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                "SELECT event_type, occurred_at, payload_json FROM events WHERE tenant_id=%s AND aggregate_id=%s "
                "AND event_type IN ('SynthesisRequested', 'SynthesisCreated', 'SynthesisFailed') "
                "AND payload_json->>'synthesis_id' = %s ORDER BY sequence",
                (tenant_id, f"project:{project_id}", synthesis_id),
            ).fetchall()
        return [{**dict(row), "payload": row["payload_json"]} for row in rows]

    def save_synthesis(self, tenant_id: str, project_id: str, synthesis_id: str, kind: str, artifact_reference: Mapping[str, Any], created_at: str) -> None:
        """Row and SynthesisCreated in one transaction; the event carries ids and hashes only (K8)."""
        with self._db.for_tenant(tenant_id) as connection:
            self.require_case(connection, tenant_id, project_id)
            connection.execute(
                "INSERT INTO project_syntheses (tenant_id, project_id, synthesis_id, kind, artifact_reference_json, created_at) VALUES (%s,%s,%s,%s,%s,%s)",
                (tenant_id, project_id, synthesis_id, kind, Jsonb(dict(artifact_reference)), created_at),
            )
            self._append_event(connection, tenant_id, project_id, f"project:{project_id}", "SynthesisCreated", {"synthesis_id": synthesis_id, "kind": kind, "artifact_reference": dict(artifact_reference)}, record_log.ai("VERIFY"),
                               at=_instant(created_at))

    def get_synthesis(self, tenant_id: str, project_id: str, synthesis_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(
                "SELECT project_id, synthesis_id, kind, artifact_reference_json, created_at FROM project_syntheses WHERE tenant_id=%s AND project_id=%s AND synthesis_id=%s",
                (tenant_id, project_id, synthesis_id),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["artifact_reference"] = result.pop("artifact_reference_json")
        return result

    def save_report(self, tenant_id: str, project_id: str, report_id: str, artifact_reference: Mapping[str, Any], created_at: str) -> None:
        """Persist one immutable report artifact and its creation event atomically."""
        with self._db.for_tenant(tenant_id) as connection:
            self.require_case(connection, tenant_id, project_id)
            connection.execute(
                "INSERT INTO project_reports (tenant_id, project_id, report_id, artifact_reference_json, created_at) VALUES (%s,%s,%s,%s,%s)",
                (tenant_id, project_id, report_id, Jsonb(dict(artifact_reference)), created_at),
            )
            self._append_event(connection, tenant_id, project_id, f"project:{project_id}", "ReportCreated", {"report_id": report_id, "artifact_reference": dict(artifact_reference)}, record_log.system("VERIFY"),
                               at=_instant(created_at))

    def get_report(self, tenant_id: str, project_id: str, report_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(
                "SELECT project_id, report_id, artifact_reference_json, created_at FROM project_reports WHERE tenant_id=%s AND project_id=%s AND report_id=%s",
                (tenant_id, project_id, report_id),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["artifact_reference"] = result.pop("artifact_reference_json")
        return result

    def update_report_reference(
        self, tenant_id: str, project_id: str, report_id: str, expected_reference: Mapping[str, Any],
        artifact_reference: Mapping[str, Any], event_type: str, payload: Mapping[str, Any], *, writer: Writer,
    ) -> None:
        """Replace a report's CAS pointer only together with its lifecycle event, and only if the pointer is still
        ``expected_reference`` (compare-and-swap, jsonb = compares values): a concurrent decision makes this one fail
        ``REPORT_STALE`` instead of silently overwriting it."""
        with self._db.for_tenant(tenant_id) as connection:
            self.lock_case(connection, tenant_id, project_id)
            updated = connection.execute(
                "UPDATE project_reports SET artifact_reference_json=%s WHERE tenant_id=%s AND project_id=%s AND report_id=%s AND artifact_reference_json=%s",
                (Jsonb(dict(artifact_reference)), tenant_id, project_id, report_id, Jsonb(dict(expected_reference))),
            ).rowcount
            if updated != 1:
                exists = connection.execute("SELECT 1 FROM project_reports WHERE tenant_id=%s AND project_id=%s AND report_id=%s", (tenant_id, project_id, report_id)).fetchone()
                raise InvariantViolation("REPORT_STALE" if exists else "REPORT_NOT_FOUND")
            self._append_event(connection, tenant_id, project_id, f"project:{project_id}", event_type, dict(payload), writer)

    # -- Project erasure (plan D10, K7) ---------------------------------------------------------------------------

    _ARTIFACT_TABLES = ("project_interpretations", "project_syntheses", "project_reports")

    def project_artifact_references(self, tenant_id: str, project_id: str) -> list[dict[str, Any]]:
        """The Project's AI artifacts -- interpretations and syntheses (their own CAS, one per result, never shared)."""
        with self._db.for_tenant(tenant_id) as connection:
            rows = [row for table in self._ARTIFACT_TABLES for row in connection.execute(f"SELECT artifact_reference_json FROM {table} WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id))]
        return [row["artifact_reference_json"] for row in rows]

    @classmethod
    def erase_case_rows(cls, connection: psycopg.Connection, tenant_id: str, project_id: str) -> dict[str, Any]:
        """The database half of a case's erasure, on the erasure's decision transaction (ai_lego/platform/erasure.py): every
        record the case owns (record_log.delete_owned) and every record made from it, Sources, AI artifact rows,
        collection runs and the Project row go. Returns the counts and the AI artifact references the rows held (read before
        they go), for the outbox. Removes no file: that happens only after this transaction commits. The case lock held
        exclusive first: the writers in flight finish, and every later one finds no case (require_case); a hook between two
        writes is not waited for."""
        cls.lock_case(connection, tenant_id, project_id, exclusive=True)
        if connection.execute("SELECT 1 FROM platform_projects WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id)).fetchone() is None:
            raise InvariantViolation("PROJECT_NOT_FOUND")
        sources = connection.execute("SELECT COUNT(*) FROM prov_sources WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id)).fetchone()[0]
        references = [row["artifact_reference_json"] for table in cls._ARTIFACT_TABLES
                      for row in connection.execute(f"SELECT artifact_reference_json FROM {table} WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id))]
        events_deleted = record_log.delete_owned(connection, tenant_id, record_log.case(project_id))
        events_deleted += cls._erase_records_from_case(connection, tenant_id, project_id)
        for table in ("prov_sources", *cls._ARTIFACT_TABLES, "collection_runs", "platform_projects"):
            connection.execute(f"DELETE FROM {table} WHERE tenant_id=%s AND project_id=%s", (tenant_id, project_id))
        return {"sources": int(sources), "events_deleted": events_deleted, "artifact_references": references}

    @staticmethod
    def append_tombstone(connection: psycopg.Connection, tenant_id: str, project_id: str, erased_by_identity_id: str, counts: Mapping[str, int]) -> None:
        """The one ProjectErased record, owned by the platform: appended only by the step that finished the physical
        cleanup, so a tombstone never claims more than was done."""
        record_log.append(connection, tenant_id, f"project:{project_id}", "ProjectErased", {"project_id": project_id, "erased_by_identity_id": erased_by_identity_id, **counts},
                          writer=record_log.user(erased_by_identity_id, "GOVERN"), owner=record_log.platform(tenant_id))

    @staticmethod
    def _erase_records_from_case(connection: psycopg.Connection, tenant_id: str, project_id: str) -> int:
        """A person's record made from this case (a kind's ``from_case`` field names it: LEARN's 個人歷程 line) goes with
        the case, every version -- otherwise an erased case keeps feeding the person's patterns (完整刪除)."""
        from ai_lego.core.domain import doc_kinds

        deleted = 0
        for spec in doc_kinds.kinds().values():
            if not spec.from_case:
                continue
            rows = connection.execute(
                "SELECT DISTINCT owner_id, aggregate_id FROM events WHERE tenant_id=%s AND owner_kind='person' AND event_type='DocSaved' "
                "AND payload_json->>'kind' = %s AND payload_json->'content'->>%s = %s",
                (tenant_id, spec.kind, spec.from_case, project_id),
            ).fetchall()
            for row in rows:
                deleted += record_log.delete_owned(connection, tenant_id, record_log.person(row["owner_id"]), aggregate_id=row["aggregate_id"])
        return deleted

    def erased_projects(self, tenant_id: str, identity_id: str) -> list[dict[str, Any]]:
        """The ProjectErased tombstones of the cases ``identity_id`` erased, newest first (N-66 已抹除): the Project row
        itself is gone by design (erase_case_rows deletes it); this event is what stays, written once the files are gone
        too (a case whose cleanup is still pending is not listed yet)."""
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                "SELECT occurred_at, payload_json FROM events WHERE tenant_id=%s AND event_type='ProjectErased' "
                "AND payload_json->>'erased_by_identity_id' = %s ORDER BY write_order DESC",
                (tenant_id, identity_id),
            ).fetchall()
        return [{"erased_at": row["occurred_at"], **row["payload_json"]} for row in rows]

    def rename_project(self, tenant_id: str, project_id: str, name: str, identity_id: str) -> dict[str, Any]:
        """UPDATE platform_projects.name in place (current-state row, like create_project's INSERT) + a
        ProjectRenamed event; the UNIQUE (tenant_id, workspace_id, created_by_identity_id, name) constraint refuses a
        duplicate the same way create_project's INSERT does (the caller turns that UniqueViolation into a 409)."""
        with self._db.for_tenant(tenant_id) as connection:
            self.lock_case(connection, tenant_id, project_id)
            row = connection.execute(f"UPDATE platform_projects SET name=%s WHERE tenant_id=%s AND project_id=%s RETURNING {_PROJECT_SELECT}", (name, tenant_id, project_id)).fetchone()
            if row is None:
                raise InvariantViolation("PROJECT_NOT_FOUND")
            self._append_event(connection, tenant_id, project_id, f"project:{project_id}", "ProjectRenamed", {"project_id": project_id, "name": name}, record_log.user(identity_id, "ASSEMBLER"))
        return dict(row)

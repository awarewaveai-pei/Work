"""Repository for tenant-authored Custom Workflows on PostgreSQL (own table -- see ``ai_lego/core/domain/custom_workflow.py``
for why this is not folded into ``platform_projects``/``prov_sources`` or a curated Recipe file). Records go through
``record_log`` like every other write to ``events``; a workflow belongs to the person who made it. Every call goes
tenant -> region -> pool (``Databases.for_tenant``).
"""

from __future__ import annotations

from typing import Any, Mapping

import psycopg

from ai_lego.core.support import canonical_json, sha256_bytes
from ai_lego.data.db import Databases, Jsonb, Row
from ai_lego.data.events import record_log

_WORKFLOW_COLUMNS = ("workflow_id", "tenant_id", "title", "method_ids", "created_by_identity_id", "created_at", "updated_at")
_WORKFLOW_SELECT = "workflow_id, tenant_id, title, method_ids_json, created_by_identity_id, created_at, updated_at"


class CustomWorkflowRepository:
    """PostgreSQL adapter for the Custom Workflow repository contract."""

    AGGREGATE_PREFIX = "custom_workflow:"   # a workflow's records: ``custom_workflow:<workflow_id>``, owned by its maker

    def __init__(self, databases: Databases) -> None:
        self._db = databases

    @staticmethod
    def _append_event(connection: psycopg.Connection, tenant_id: str, workflow_id: str, event_type: str, payload: Mapping[str, Any], identity_id: str) -> None:
        """A workflow's records belong to the person editing it (only its maker can reach it: see get/update/delete)."""
        record_log.append(connection, tenant_id, f"{CustomWorkflowRepository.AGGREGATE_PREFIX}{workflow_id}", event_type, payload,
                          writer=record_log.user(identity_id, "ASSEMBLER"), owner=record_log.person(identity_id))

    @staticmethod
    def _from_row(row: Row) -> dict[str, Any]:
        workflow = dict(row)
        workflow["method_ids"] = workflow.pop("method_ids_json")
        return workflow

    def create(self, record: Mapping[str, Any]) -> dict[str, Any]:
        """The workflow as stored."""
        workflow = {column: record[column] for column in _WORKFLOW_COLUMNS}
        with self._db.for_tenant(workflow["tenant_id"]) as connection:
            stored = connection.execute(
                f"INSERT INTO custom_workflows ({_WORKFLOW_SELECT}) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING {_WORKFLOW_SELECT}",
                (workflow["workflow_id"], workflow["tenant_id"], workflow["title"], Jsonb(list(workflow["method_ids"])), workflow["created_by_identity_id"], workflow["created_at"], workflow["updated_at"]),
            ).fetchone()
            self._append_event(
                connection,
                workflow["tenant_id"],
                workflow["workflow_id"],
                "CustomWorkflowCreated",
                {"workflow_id": workflow["workflow_id"], "title": workflow["title"], "step_count": len(record["method_ids"]), "record_sha256": sha256_bytes(canonical_json(record).encode("utf-8"))},
                workflow["created_by_identity_id"],
            )
        return self._from_row(stored)

    def update(self, tenant_id: str, workflow_id: str, title: str, method_ids: list[str], updated_at: str, identity_id: str) -> dict[str, Any] | None:
        """Only its maker's workflow changes; anyone else's reads as not found (None)."""
        with self._db.for_tenant(tenant_id) as connection:
            stored = connection.execute(
                f"UPDATE custom_workflows SET title=%s, method_ids_json=%s, updated_at=%s WHERE tenant_id=%s AND workflow_id=%s AND created_by_identity_id=%s RETURNING {_WORKFLOW_SELECT}",
                (title, Jsonb(list(method_ids)), updated_at, tenant_id, workflow_id, identity_id),
            ).fetchone()
            if stored is None:
                return None
            self._append_event(
                connection,
                tenant_id,
                workflow_id,
                "CustomWorkflowUpdated",
                {"workflow_id": workflow_id, "title": title, "step_count": len(method_ids)},
                identity_id,
            )
        return self._from_row(stored)

    def get(self, tenant_id: str, workflow_id: str, identity_id: str) -> dict[str, Any] | None:
        with self._db.for_tenant(tenant_id) as connection:
            row = connection.execute(
                f"SELECT {_WORKFLOW_SELECT} FROM custom_workflows WHERE tenant_id=%s AND workflow_id=%s AND created_by_identity_id=%s",
                (tenant_id, workflow_id, identity_id),
            ).fetchone()
        return None if row is None else self._from_row(row)

    def list(self, tenant_id: str, identity_id: str) -> list[dict[str, Any]]:
        with self._db.for_tenant(tenant_id) as connection:
            rows = connection.execute(
                f"SELECT {_WORKFLOW_SELECT} FROM custom_workflows WHERE tenant_id=%s AND created_by_identity_id=%s ORDER BY updated_at DESC, workflow_id",
                (tenant_id, identity_id),
            ).fetchall()
        return [self._from_row(row) for row in rows]

    def delete(self, tenant_id: str, workflow_id: str, identity_id: str) -> bool:
        """Removes the workflow and every record of it (完整刪除: nothing of it stays, not even its title in a log)."""
        with self._db.for_tenant(tenant_id) as connection:
            deleted = connection.execute("DELETE FROM custom_workflows WHERE tenant_id=%s AND workflow_id=%s AND created_by_identity_id=%s", (tenant_id, workflow_id, identity_id)).rowcount > 0
            if deleted:
                record_log.delete_owned(connection, tenant_id, record_log.person(identity_id), aggregate_id=f"{self.AGGREGATE_PREFIX}{workflow_id}")
        return deleted

    def delete_person(self, tenant_id: str, identity_id: str) -> int:
        """Erase what this person holds here (GOVERN 刪除帳號): their workflows and every record of each. The person's other
        records share the events table (one per region since 2026-10-04) and go with GOVERN's own erasure."""
        with self._db.for_tenant(tenant_id) as connection:
            removed = connection.execute("DELETE FROM custom_workflows WHERE tenant_id=%s AND created_by_identity_id=%s RETURNING workflow_id", (tenant_id, identity_id)).fetchall()
            for row in removed:
                record_log.delete_owned(connection, tenant_id, record_log.person(identity_id), aggregate_id=f"{self.AGGREGATE_PREFIX}{row['workflow_id']}")
        return len(removed)

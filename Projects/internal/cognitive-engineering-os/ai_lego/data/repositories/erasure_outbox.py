"""The erasure outbox's rows (migration 0004): every call runs on a transaction its caller opened, so the decision that
writes a job is the same transaction that deletes the rows it erases (ai_lego/platform/erasure.py owns the workflow).

A job (tenant, subject kind, subject id) exists exactly while its physical cleanup is unfinished. An item is one thing
on disk: ``pending`` until the cleanup step settles it as ``removed`` (it was there and is gone), ``absent`` (already
gone), ``kept`` (still referenced by something else: a blob another case's source shares) or ``unresolvable`` (the
reference names no file of this tenant: malformed, another tenant's -- nothing a retry can reach). An unresolvable item
keeps the job open ("done" means every target is accounted for) and is listed for an operator (``needs_attention``).
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import psycopg

from ai_lego.data import db
from ai_lego.data.db import Jsonb, Row

KINDS = ("source_blob", "artifact", "run_files")
SETTLED = ("removed", "absent", "kept", "unresolvable")
_KEY = "tenant_id=%s AND subject_kind=%s AND subject_id=%s"


def write_job(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str, erased_by_identity_id: str, counts: Mapping[str, int],
              items: Iterable[tuple[str, Mapping[str, Any], str, str | None]]) -> int:
    """The decision's outbox: the job and its items ``(kind, target, state, error)``, numbered in order. Returns how many."""
    key = (tenant_id, subject_kind, subject_id)
    connection.execute("INSERT INTO erasure_jobs (tenant_id, subject_kind, subject_id, erased_by_identity_id, decided_at, counts_json) VALUES (%s,%s,%s,%s,%s,%s)",
                       (*key, erased_by_identity_id, db.now(), Jsonb(dict(counts))))
    written = 0
    for number, (kind, target, state, error) in enumerate(items, start=1):
        connection.execute("INSERT INTO erasure_items (tenant_id, subject_kind, subject_id, item_no, kind, target_json, state, error) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                           (*key, number, kind, Jsonb(dict(target)), state, error))
        written = number
    return written


def job(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str, *, for_update: bool = False) -> Row | None:
    """The job, or None once it is finished (or was never decided). ``for_update``: held until the transaction ends, so two
    workers finishing the same job complete it once."""
    return connection.execute(f"SELECT erased_by_identity_id, decided_at, counts_json FROM erasure_jobs WHERE {_KEY}{' FOR UPDATE' if for_update else ''}",
                              (tenant_id, subject_kind, subject_id)).fetchone()


def jobs(connection: psycopg.Connection, tenant_id: str | None = None, erased_by_identity_id: str | None = None) -> list[Row]:
    """Every unfinished job in this region, oldest first; narrowed to a tenant and to who erased."""
    query, parameters = "SELECT tenant_id, subject_kind, subject_id, erased_by_identity_id FROM erasure_jobs WHERE TRUE", ()
    if tenant_id is not None:
        query, parameters = query + " AND tenant_id=%s", (*parameters, tenant_id)
    if erased_by_identity_id is not None:
        query, parameters = query + " AND erased_by_identity_id=%s", (*parameters, erased_by_identity_id)
    return connection.execute(query + " ORDER BY decided_at, tenant_id, subject_kind, subject_id", parameters).fetchall()


def pending_items(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str) -> list[int]:
    return [row[0] for row in connection.execute(f"SELECT item_no FROM erasure_items WHERE {_KEY} AND state='pending' ORDER BY item_no", (tenant_id, subject_kind, subject_id))]


def claim(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str, item_no: int) -> Row | None:
    """The item if it is still pending and no other worker holds it (SKIP LOCKED: a second DELETE or a second process never
    works the same item at the same time); held until this transaction ends."""
    return connection.execute(f"SELECT item_no, kind, target_json FROM erasure_items WHERE {_KEY} AND item_no=%s AND state='pending' FOR UPDATE SKIP LOCKED",
                              (tenant_id, subject_kind, subject_id, item_no)).fetchone()


def settle(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str, item_no: int, state: str, error: str | None = None) -> None:
    if state not in SETTLED:
        raise ValueError(state)
    connection.execute(f"UPDATE erasure_items SET state=%s, error=%s, attempts=attempts+1 WHERE {_KEY} AND item_no=%s", (state, error, tenant_id, subject_kind, subject_id, item_no))


def note_attempt(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str, item_no: int, error: str) -> int:
    """A try that failed and may succeed later (a filesystem error): the item stays pending. Returns its tries so far."""
    return connection.execute(f"UPDATE erasure_items SET error=%s, attempts=attempts+1 WHERE {_KEY} AND item_no=%s RETURNING attempts",
                              (error, tenant_id, subject_kind, subject_id, item_no)).fetchone()[0]


def tally(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str) -> dict[tuple[str, str], int]:
    """(kind, state) -> how many items."""
    rows = connection.execute(f"SELECT kind, state, COUNT(*) FROM erasure_items WHERE {_KEY} GROUP BY kind, state", (tenant_id, subject_kind, subject_id))
    return {(row[0], row[1]): row[2] for row in rows}


def failed(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str) -> list[dict[str, str]]:
    """The API's ``failed`` entries (artifact type and error code; never content): every unresolvable item."""
    rows = connection.execute(f"SELECT target_json, error FROM erasure_items WHERE {_KEY} AND state='unresolvable' ORDER BY item_no", (tenant_id, subject_kind, subject_id))
    return [{"artifact_type": str(row[0].get("artifact_type", "?")), "error": row[1] or ""} for row in rows]


def needs_attention(connection: psycopg.Connection, attempts: int) -> list[Row]:
    """Every item no retry will settle (unresolvable) or that failed ``attempts`` times or more, oldest job first."""
    return connection.execute(
        "SELECT i.tenant_id, i.subject_kind, i.subject_id, i.item_no, i.kind, i.state, i.error, i.attempts, j.decided_at FROM erasure_items i "
        "JOIN erasure_jobs j USING (tenant_id, subject_kind, subject_id) WHERE i.state='unresolvable' OR (i.state='pending' AND i.attempts >= %s) "
        "ORDER BY j.decided_at, i.tenant_id, i.subject_kind, i.subject_id, i.item_no", (attempts,)).fetchall()


def delete_job(connection: psycopg.Connection, tenant_id: str, subject_kind: str, subject_id: str) -> None:
    """The cleanup is finished: the job and (cascade) its items go."""
    connection.execute(f"DELETE FROM erasure_jobs WHERE {_KEY}", (tenant_id, subject_kind, subject_id))

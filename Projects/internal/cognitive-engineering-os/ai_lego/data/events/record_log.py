"""The one way a record enters a case's (or a person's) event stream (共用紀錄; ARCH_DECIDED 1-2 on the supervisor page).

Every repository that keeps an ``events`` table writes through ``append`` -- nothing else may INSERT INTO events
(tests/unit/test_record_log.py greps the tree for it). ``append`` refuses a record that:

* has no author, or an author its event type does not allow (作者: user / ai / joint / system; AI 起草、你改過 = joint,
  一字沒改照收 = ai) -- so the AI cannot land a conclusion in a field only the person writes (關卡二);
* names no block, or a block its type does not allow;
* has no owner: a case (``case``), the person (``person`` -- the daily calibration card, the cross-case history, the
  account's location) or the platform (``platform`` -- tombstones that must outlive what they record);
* is of an unregistered type (each type carries its own schema version, not a hard-coded 1.0.0);
* carries a key that scores a belief or a conclusion (不給信念打分).

Erasure goes by owner (``delete_owned``), never by an aggregate-id prefix.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import uuid4

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.blocks import ALL_CODES, FAMILY_BLOCK, require_block
from ai_lego.core.support import canonical_json
from ai_lego.errors import InvariantViolation

AUTHORS = ("user", "ai", "joint", "system")
OWNER_KINDS = ("case", "person", "platform")
# A payload key that grades what someone believes or concluded. Counts, sizes and an option's computed weight in a
# decision tool are not here; those live in the tool's own record, never in an event.
SCORE_KEYS = frozenset({"score", "scores", "rank", "ranking", "rating", "grade", "autonomy_score", "belief_score"})

_TOOL_BLOCKS = frozenset(FAMILY_BLOCK.values())


@dataclass(frozen=True)
class EventType:
    version: str
    authors: frozenset[str]
    blocks: frozenset[str]
    owners: frozenset[str]


def _t(version: str, authors: str, blocks: str | frozenset[str], owners: str = "case") -> EventType:
    return EventType(version, frozenset(authors.split()), frozenset(blocks.split()) if isinstance(blocks, str) else blocks, frozenset(owners.split()))


EVENT_TYPES: dict[str, EventType] = {
    # 開案資料 (組裝器)
    "ProjectCreated": _t("1.0.0", "user", "ASSEMBLER"),
    "ProjectRenamed": _t("1.0.0", "user", "ASSEMBLER"),
    # Sources and collection (GATHER): typed in by the person, or fetched by the collector
    "SourceAdded": _t("1.0.0", "user system", "GATHER"),
    "SourceSuperseded": _t("1.0.0", "system", "GATHER"),
    "CollectionRequested": _t("1.0.0", "user", "GATHER"),
    "CollectionStarted": _t("1.0.0", "system", "GATHER"),
    "CollectionCompleted": _t("1.0.0", "system", "GATHER"),
    "CollectionFailed": _t("1.0.0", "system", "GATHER"),
    # A tool's analysis: the block is the tool's (its contract family)
    "InterpretationRequested": _t("1.0.0", "user", _TOOL_BLOCKS),
    "InterpretationCreated": _t("1.0.0", "ai", _TOOL_BLOCKS),
    "InterpretationFailed": _t("1.0.0", "system", _TOOL_BLOCKS),
    "InterpretationJudged": _t("1.0.0", "user", _TOOL_BLOCKS),
    "InterpretationApproved": _t("1.0.0", "user", _TOOL_BLOCKS),
    "InterpretationReturned": _t("1.0.0", "user", _TOOL_BLOCKS),
    # Tasks, notes, rerun reminders (ACT). A task saved from an AI-drafted plan is ai (unchanged) or joint (edited).
    "TaskCreated": _t("1.0.0", "user ai joint", "ACT"),
    "TaskDone": _t("1.0.0", "user", "ACT"),
    "TaskUpdated": _t("1.0.0", "user", "ACT"),
    "TaskNoted": _t("1.0.0", "user", "ACT"),
    "RerunScheduled": _t("1.0.0", "user", "ACT"),
    "RerunFulfilled": _t("1.0.0", "system", "ACT"),
    # Research synthesis and reports (彙整與引註閘 -> VERIFY)
    "SynthesisRequested": _t("1.0.0", "user", "VERIFY"),
    "SynthesisCreated": _t("1.0.0", "ai", "VERIFY"),
    "SynthesisFailed": _t("1.0.0", "system", "VERIFY"),
    "ReportCreated": _t("1.0.0", "system", "VERIFY"),
    "ReportApproved": _t("1.0.0", "user", "VERIFY"),
    "ReportRejected": _t("1.0.0", "user", "VERIFY"),
    # GOVERN: the tombstone outlives the case it records
    "ProjectErased": _t("1.0.0", "user", "GOVERN", "platform"),
    # A person's own assembled tool chains (自訂工作流)
    "CustomWorkflowCreated": _t("1.0.0", "user", "ASSEMBLER", "person"),
    "CustomWorkflowUpdated": _t("1.0.0", "user", "ASSEMBLER", "person"),
    "CustomWorkflowDeleted": _t("1.0.0", "user", "ASSEMBLER", "person"),
    # A block's documents (core/domain/doc_kinds.py): the kind narrows author, block and owner further, per record
    "DocSaved": _t("1.0.0", "user ai joint system", frozenset(ALL_CODES), "case person"),
    "DocDeleted": _t("1.0.0", "user", frozenset(ALL_CODES), "case person"),
}
DOC_EVENTS = ("DocSaved", "DocDeleted")

for _name, _type in EVENT_TYPES.items():   # a registry typo fails at import, not on the first write
    assert _type.authors <= set(AUTHORS) and _type.blocks <= set(ALL_CODES) and _type.owners <= set(OWNER_KINDS), _name


@dataclass(frozen=True)
class Owner:
    kind: str
    id: str

    def __post_init__(self) -> None:
        if self.kind not in OWNER_KINDS or not isinstance(self.id, str) or not self.id:
            raise InvariantViolation(f"RECORD_OWNER_INVALID: {self.kind!r}/{self.id!r}")


def case(project_id: str) -> Owner:
    return Owner("case", project_id)


def person(identity_id: str) -> Owner:
    return Owner("person", identity_id)


def platform(tenant_id: str) -> Owner:
    return Owner("platform", tenant_id)


@dataclass(frozen=True)
class Writer:
    """Who wrote a record and from which block. ``identity_id`` is the signed-in person behind a user/joint record."""
    author: str
    block: str
    identity_id: str | None = None

    def __post_init__(self) -> None:
        if self.author not in AUTHORS:
            raise InvariantViolation(f"RECORD_AUTHOR_INVALID: {self.author!r}")
        require_block(self.block)
        if self.author in ("user", "joint") and not self.identity_id:
            raise InvariantViolation("RECORD_AUTHOR_IDENTITY_REQUIRED: a user or joint record names the signed-in person")


def user(identity_id: str, block: str) -> Writer:
    return Writer("user", block, identity_id)


def system(block: str) -> Writer:
    return Writer("system", block)


def ai(block: str) -> Writer:
    return Writer("ai", block)


SCHEMA = """
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
    author TEXT,
    author_identity_id TEXT,
    block TEXT,
    owner_kind TEXT,
    owner_id TEXT,
    UNIQUE (tenant_id, aggregate_id, sequence)
);
"""
# author/block are NULL only on rows written before 2026-10-03 (nobody recorded them; readers show 「記作者之前的紀錄」, never a
# guess). owner is filled for those rows by ``migrate`` from what the row itself names.
_ADDED_COLUMNS = (("author", "TEXT"), ("author_identity_id", "TEXT"), ("block", "TEXT"), ("owner_kind", "TEXT"), ("owner_id", "TEXT"))


def migrate(connection: sqlite3.Connection, legacy_owner_sql: tuple[str, ...] = ()) -> None:
    """Bring an events table to this shape. ``legacy_owner_sql``: UPDATEs that fill owner_kind/owner_id on rows that
    predate it, each derived from the row's own aggregate (the repository that owns the file knows how)."""
    connection.executescript(SCHEMA)
    existing = {row[1] for row in connection.execute("PRAGMA table_info(events)")}
    for column, column_type in _ADDED_COLUMNS:
        if column not in existing:
            connection.execute(f"ALTER TABLE events ADD COLUMN {column} {column_type}")
    for statement in legacy_owner_sql:
        connection.execute(statement)
    connection.execute("CREATE INDEX IF NOT EXISTS ix_events_owner ON events (tenant_id, owner_kind, owner_id)")


def _score_keys(value: Any) -> set[str]:
    if isinstance(value, Mapping):
        return {key for key in value if key in SCORE_KEYS} | {found for item in value.values() for found in _score_keys(item)}
    if isinstance(value, (list, tuple)):
        return {found for item in value for found in _score_keys(item)}
    return set()


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def append(connection: sqlite3.Connection, tenant_id: str, aggregate_id: str, event_type: str, payload: Mapping[str, Any], *, writer: Writer, owner: Owner) -> dict[str, Any]:
    """Append one record on an open transaction; returns its envelope. Every check runs before the INSERT."""
    if not isinstance(writer, Writer) or not isinstance(owner, Owner):
        raise InvariantViolation("RECORD_WRITER_AND_OWNER_REQUIRED")
    kind = EVENT_TYPES.get(event_type)
    if kind is None:
        raise InvariantViolation(f"RECORD_TYPE_UNREGISTERED: {event_type!r}")
    if writer.author not in kind.authors:
        raise InvariantViolation(f"RECORD_AUTHOR_NOT_ALLOWED: {event_type} takes {sorted(kind.authors)}, not {writer.author!r}")
    if writer.block not in kind.blocks:
        raise InvariantViolation(f"RECORD_BLOCK_NOT_ALLOWED: {event_type} is written by {sorted(kind.blocks)}, not {writer.block!r}")
    if owner.kind not in kind.owners:
        raise InvariantViolation(f"RECORD_OWNER_NOT_ALLOWED: {event_type} belongs to {sorted(kind.owners)}, not {owner.kind!r}")
    if event_type in DOC_EVENTS:
        doc_kinds.check_record(event_type, payload, writer.author, writer.block, owner.kind)
    scored = _score_keys(payload)
    if scored:
        raise InvariantViolation(f"RECORD_SCORE_REFUSED: {sorted(scored)} -- the platform does not score beliefs or conclusions")
    row = connection.execute("SELECT COALESCE(MAX(sequence), 0) FROM events WHERE tenant_id=? AND aggregate_id=?", (tenant_id, aggregate_id)).fetchone()
    event = {
        "event_id": str(uuid4()), "tenant_id": tenant_id, "aggregate_id": aggregate_id, "sequence": int(row[0]) + 1,
        "event_type": event_type, "occurred_at": _now(), "schema_version": kind.version, "payload": dict(payload),
        "author": writer.author, "author_identity_id": writer.identity_id, "block": writer.block, "owner_kind": owner.kind, "owner_id": owner.id,
    }
    connection.execute(
        "INSERT INTO events (event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id, causation_id, payload_json,"
        " author, author_identity_id, block, owner_kind, owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (event["event_id"], tenant_id, aggregate_id, event["sequence"], event_type, event["occurred_at"], kind.version, event["event_id"], None,
         canonical_json(event["payload"]), writer.author, writer.identity_id, writer.block, owner.kind, owner.id),
    )
    return event


def delete_owned(connection: sqlite3.Connection, tenant_id: str, owner: Owner, *, aggregate_id: str | None = None) -> int:
    """Erase every record the owner holds -- or, with ``aggregate_id``, only that one thing of theirs -- on an open
    transaction. Returns how many rows went."""
    query, parameters = "DELETE FROM events WHERE tenant_id=? AND owner_kind=? AND owner_id=?", (tenant_id, owner.kind, owner.id)
    if aggregate_id is not None:
        query, parameters = query + " AND aggregate_id=?", (*parameters, aggregate_id)
    return connection.execute(query, parameters).rowcount


ENVELOPE_COLUMNS = "event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id, causation_id, payload_json, author, author_identity_id, block, owner_kind, owner_id"

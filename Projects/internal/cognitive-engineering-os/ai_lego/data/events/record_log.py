"""The one way a record enters a case's (or a person's) event stream (共用紀錄; ARCH_DECIDED 1-2 on the supervisor page).

Every repository that keeps an ``events`` table writes through ``append`` -- nothing else may INSERT INTO events
(tests/unit/test_record_log.py greps the tree for it). ``append`` refuses a record that:

* has no author, or an author its event type does not allow (作者: user / ai / joint / system; AI 起草、你改過 = joint,
  一字沒改照收 = ai) -- so the AI cannot land a conclusion in a field only the person writes (關卡二);
* names no block, or a block its type does not allow;
* has no owner: a case (``case``), the person (``person`` -- the daily calibration card, the cross-case history, the
  account's location), a group (``group`` -- what a few people write together: STEP34_SHARED_RULES.md §2) or the
  platform (``platform`` -- tombstones that must outlive what they record; an appeal, read only through platform/visibility.py);
* is of an unregistered type (each type carries its own schema version, not a hard-coded 1.0.0);
* carries a key that scores a belief or a conclusion (不給信念打分).

Erasure goes by owner (``delete_owned``), never by an aggregate-id prefix.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping
from uuid import uuid4

import psycopg

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.blocks import ALL_CODES, FAMILY_BLOCK, require_block
from ai_lego.data import db
from ai_lego.errors import InvariantViolation

AUTHORS = ("user", "ai", "joint", "system")
OWNER_KINDS = ("case", "person", "platform", "group")
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
    done: bool   # something made in its block (一格「做過」): a result, a document, a task. A request, a failure or a status change is not.


def _t(version: str, authors: str, blocks: str | frozenset[str], owners: str = "case", *, done: bool) -> EventType:
    return EventType(version, frozenset(authors.split()), frozenset(blocks.split()) if isinstance(blocks, str) else blocks, frozenset(owners.split()), done)


EVENT_TYPES: dict[str, EventType] = {
    # 開案資料 (組裝器)
    "ProjectCreated": _t("1.0.0", "user", "ASSEMBLER", done=False),
    "ProjectRenamed": _t("1.0.0", "user", "ASSEMBLER", done=False),
    # Sources and collection (GATHER): typed in by the person, or fetched by the collector
    "SourceAdded": _t("1.0.0", "user system", "GATHER", done=True),
    "SourceSuperseded": _t("1.0.0", "system", "GATHER", done=False),
    "CollectionRequested": _t("1.0.0", "user", "GATHER", done=False),
    "CollectionStarted": _t("1.0.0", "system", "GATHER", done=False),
    "CollectionCompleted": _t("1.0.0", "system", "GATHER", done=False),
    "CollectionFailed": _t("1.0.0", "system", "GATHER", done=False),
    # A tool's analysis: the block is the tool's (its contract family)
    "InterpretationRequested": _t("1.0.0", "user", _TOOL_BLOCKS, done=False),
    "InterpretationCreated": _t("1.0.0", "ai", _TOOL_BLOCKS, done=True),
    "InterpretationFailed": _t("1.0.0", "system", _TOOL_BLOCKS, done=False),
    "InterpretationJudged": _t("1.0.0", "user", _TOOL_BLOCKS, done=True),
    "InterpretationApproved": _t("1.0.0", "user", _TOOL_BLOCKS, done=False),
    "InterpretationReturned": _t("1.0.0", "user", _TOOL_BLOCKS, done=False),
    # Tasks, notes, rerun reminders (ACT). A task saved from an AI-drafted plan is ai (unchanged) or joint (edited).
    "TaskCreated": _t("1.0.0", "user ai joint", "ACT", done=True),
    "TaskDone": _t("1.0.0", "user", "ACT", done=True),
    "TaskUpdated": _t("1.0.0", "user", "ACT", done=False),
    "TaskNoted": _t("1.0.0", "user", "ACT", done=True),
    "RerunScheduled": _t("1.0.0", "user", "ACT", done=False),
    "RerunFulfilled": _t("1.0.0", "system", "ACT", done=False),
    # Research synthesis and reports (彙整與引註閘 -> VERIFY)
    "SynthesisRequested": _t("1.0.0", "user", "VERIFY", done=False),
    "SynthesisCreated": _t("1.0.0", "ai", "VERIFY", done=True),
    "SynthesisFailed": _t("1.0.0", "system", "VERIFY", done=False),
    "ReportCreated": _t("1.0.0", "system", "VERIFY", done=False),
    "ReportApproved": _t("1.0.0", "user", "VERIFY", done=False),
    "ReportRejected": _t("1.0.0", "user", "VERIFY", done=False),
    # GOVERN: the tombstone outlives the case it records
    "ProjectErased": _t("1.0.0", "user", "GOVERN", "platform", done=False),
    # A person's own assembled tool chains (自訂工作流)
    "CustomWorkflowCreated": _t("1.0.0", "user", "ASSEMBLER", "person", done=False),
    "CustomWorkflowUpdated": _t("1.0.0", "user", "ASSEMBLER", "person", done=False),
    "CustomWorkflowDeleted": _t("1.0.0", "user", "ASSEMBLER", "person", done=False),
    # A block's documents (core/domain/doc_kinds.py): the kind narrows author, block and owner further, per record
    "DocSaved": _t("1.0.0", "user ai joint system", frozenset(ALL_CODES), "case person group platform", done=True),
    "DocDeleted": _t("1.0.0", "user", frozenset(ALL_CODES), "case person group platform", done=False),
    "DocRead": _t("1.0.0", "user", "EXPRESS", "case", done=False),
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

    @staticmethod
    def group(group_id: str) -> Owner:
        return group(group_id)


def case(project_id: str) -> Owner:
    return Owner("case", project_id)


def person(identity_id: str) -> Owner:
    return Owner("person", identity_id)


def platform(tenant_id: str) -> Owner:
    return Owner("platform", tenant_id)


def group(group_id: str) -> Owner:
    """A group's records: written only while the group is open and the writer a current member
    (ProjectSourceRepository.require_group, in CaseDocs); read by others only through platform/visibility.py."""
    return Owner("group", group_id)


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


def _score_keys(value: Any) -> set[str]:
    if isinstance(value, Mapping):
        return {key for key in value if key in SCORE_KEYS} | {found for item in value.values() for found in _score_keys(item)}
    if isinstance(value, (list, tuple)):
        return {found for item in value for found in _score_keys(item)}
    return set()


def _now() -> datetime:
    return db.now()


def require_person(connection: psycopg.Connection, tenant_id: str, identity_id: str, *, exclusive: bool = False) -> None:
    """The person's owner lock, shared (db.owner_lock "person"; the account erasure's decision holds it exclusive), and the
    person still there: an identity the account deletion marked deleted gets IDENTITY_ERASED and nothing is written. Every
    person-owned record passes here (``append``); a writer that also changes rows of its own takes it first in its
    transaction, as case writers take the case lock, so it never holds a row the erasure deletes while it waits. An
    identity with no row at all (a unit test's made-up owner) is not refused: only a deleted one is. ``exclusive``: a batch
    whose own checks must hold until its writes (CaseDocs.save_many), as a case's batch takes the case lock."""
    db.owner_lock(connection, "person", tenant_id, identity_id, exclusive=exclusive)
    row = connection.execute("SELECT status FROM identity WHERE tenant_id=%s AND identity_id=%s", (tenant_id, identity_id)).fetchone()
    if row is not None and row[0] != "active":
        raise InvariantViolation("IDENTITY_ERASED: the account is deleted; nothing more is written for it")


def lock_aggregate(connection: psycopg.Connection, tenant_id: str, aggregate_id: str) -> None:
    """The aggregate's lock (STORAGE_SWITCH.md invariant 1): taken first by every append, so MAX(sequence)+1 cannot race,
    and by a writer that decides the aggregate's next record from what it read (a document's next version: case_docs)."""
    db.advisory_xact_lock(connection, "events", tenant_id, aggregate_id)


def append(connection: psycopg.Connection, tenant_id: str, aggregate_id: str, event_type: str, payload: Mapping[str, Any], *, writer: Writer, owner: Owner,
           at: datetime | None = None) -> dict[str, Any]:
    """Append one record on an open transaction; returns its envelope. Every check runs before the INSERT. The sequence is
    the aggregate's next under its lock; UNIQUE (tenant_id, aggregate_id, sequence) refuses a duplicate if a writer ever
    skipped the lock. ``at``: the instant a row the caller stores beside this record already names (its created_at),
    so the two never differ; otherwise the record log's own clock. Order is by sequence either way."""
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
    if owner.kind == "person":   # every person-owned record, whoever writes it (a shared lock is taken again for free)
        require_person(connection, tenant_id, owner.id)
    lock_aggregate(connection, tenant_id, aggregate_id)   # first: the read below and the insert are one step for any other writer
    row = connection.execute("SELECT COALESCE(MAX(sequence), 0) FROM events WHERE tenant_id=%s AND aggregate_id=%s", (tenant_id, aggregate_id)).fetchone()
    moment = at if at is not None else _now()
    event = {
        "event_id": str(uuid4()), "tenant_id": tenant_id, "aggregate_id": aggregate_id, "sequence": int(row[0]) + 1,
        "event_type": event_type, "occurred_at": db.iso(moment), "schema_version": kind.version, "payload": dict(payload),
        "author": writer.author, "author_identity_id": writer.identity_id, "block": writer.block, "owner_kind": owner.kind, "owner_id": owner.id,
    }
    connection.execute(
        "INSERT INTO events (event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id, causation_id, payload_json,"
        " author, author_identity_id, block, owner_kind, owner_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (event["event_id"], tenant_id, aggregate_id, event["sequence"], event_type, moment, kind.version, event["event_id"], None,
         db.Jsonb(event["payload"]), writer.author, writer.identity_id, writer.block, owner.kind, owner.id),
    )
    return event


def delete_owned(connection: psycopg.Connection, tenant_id: str, owner: Owner, *, aggregate_id: str | None = None) -> int:
    """Erase every record the owner holds -- or, with ``aggregate_id``, only that one thing of theirs -- on an open
    transaction. Returns how many rows went."""
    query, parameters = "DELETE FROM events WHERE tenant_id=%s AND owner_kind=%s AND owner_id=%s", (tenant_id, owner.kind, owner.id)
    if aggregate_id is not None:
        query, parameters = query + " AND aggregate_id=%s", (*parameters, aggregate_id)
    return connection.execute(query, parameters).rowcount


def delete_written_by(connection: psycopg.Connection, tenant_id: str, identity_id: str, owner_kind: str, *, documents_only: bool = False) -> int:
    """Erase every record ``identity_id`` wrote (as user or joint) into owners of ``owner_kind`` -- a person's own part of
    the groups they wrote in, when their account is erased; the others' records there stay. ``documents_only``: their
    documents only (the platform's: their appeals go, the tombstones of cases they erased stay). On an open transaction."""
    if owner_kind not in OWNER_KINDS:
        raise InvariantViolation(f"RECORD_OWNER_INVALID: {owner_kind!r}")
    documents = " AND event_type IN ('DocSaved','DocDeleted')" if documents_only else ""
    return connection.execute("DELETE FROM events WHERE tenant_id=%s AND owner_kind=%s AND author_identity_id=%s" + documents, (tenant_id, owner_kind, identity_id)).rowcount


# author/block are NULL only on rows written before 2026-10-03 (nobody recorded them; readers show 「記作者之前的紀錄」, never a
# guess); the data move brings them over as they are, with the owner the SQLite migration derived for them.
ENVELOPE_COLUMNS ="event_id, tenant_id, aggregate_id, sequence, event_type, occurred_at, schema_version, correlation_id, causation_id, payload_json, author, author_identity_id, block, owner_kind, owner_id"

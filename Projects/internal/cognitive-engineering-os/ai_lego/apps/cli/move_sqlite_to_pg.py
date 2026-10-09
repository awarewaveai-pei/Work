"""The one-time SQLite -> PostgreSQL data move (docs/platform/STORAGE_SWITCH.md "Data move").

Run it on a COPY of the live ``.runtime`` while the site is in maintenance, from the engine image, on the network of the
database (docs/platform/GO_LIVE.md has the exact commands). The database URL comes from ``COGNITIVE_OS_DATABASE_URLS``
(never an argument: arguments show in process lists)::

    python -m ai_lego.apps.cli.move_sqlite_to_pg move   --source-dir /src --region-map local-dev=eu --files-root /dest
    python -m ai_lego.apps.cli.move_sqlite_to_pg move   ... --dry-run     # reads, converts, hashes; writes nothing
    python -m ai_lego.apps.cli.move_sqlite_to_pg verify --source-dir /src --region-map local-dev=eu --files-root /dest

What it does, in this order, all or nothing:
1. Opens the three SQLite files read-only (``mode=ro``) and checks each against the frozen schema
   (``ai_lego/data/migrations/sqlite_schema_2026_10_04.sql``): same tables, same columns, nothing else. A file that is not
   at that shape is first opened once by the engine of commit a76af28da, whose on-open migrations bring it there; this
   script never re-implements them. A journal/WAL file beside a database, or an event with no owner, stops the move.
2. Refuses a target that is not at the Alembic head or holds any row (every table is locked first, so nothing writes
   between the check and the commit).
3. Copies every table by column NAME, each table's rows in its SQLite rowid order (``write_order`` numbers them; it is
   never copied in): ``*_at`` text -> timestamptz, ``*_json`` text -> jsonb, the two ``events`` tables -> one (projects
   first, then custom workflows), ``tenant.data_residency_region`` -> the region ``--region-map`` names (the same value the
   directory line gets: the engine keeps the two equal, IdentityStore.create_tenant), then ``setval`` of both identity
   sequences past the largest id ever used (``sqlite_sequence`` included, so a deleted id is never handed out again).
4. Proves it before the commit: per table the row count and a digest of every row; per aggregate a hash of its events
   (sequence, type, canonical JSON of the payload) computed from the SQLite side and from the PostgreSQL side; the
   rowid order of ``events`` and ``workspace``; both sequences. Any difference rolls everything back.
5. Copies each tenant's files (Source/artifact/journal CAS, run journals) under ``--files-root`` and proves them: file
   count, bytes and a digest of (path, sha256) per tenant, both sides. A failure removes what this run created.
6. Commits. The SQLite files are hashed before and after and must be unchanged.

A message names tables, columns, rowids and counts, never a value: the rows are personal data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence

import psycopg
from psycopg.types.json import Jsonb

from ai_lego.apps.cli.migrate_db import describe
from ai_lego.core.support import canonical_json
from ai_lego.data.db import DATABASE_URLS_ENV, head_revisions, parse_database_urls, schema_revisions
from ai_lego.errors import InvariantViolation

FROZEN_SCHEMA = Path(__file__).resolve().parents[2] / "data" / "migrations" / "sqlite_schema_2026_10_04.sql"
BATCH = 1000
FETCH = 5000
CAS_ROOTS = ("source-cas", "artifact-cas", "workflow-cas")
JOURNAL_ROOT = "workflows"
IGNORED_TOP_LEVEL = frozenset({"matplotlib", "interpretation", "synthesis"})   # fonts cache and transient run locks
SQLITE_SIDE_FILES = ("-journal", "-wal", "-shm")
TIME_FORM = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$")
EXIT_REFUSED, EXIT_PROOF = 2, 1


class MoveError(Exception):
    """``code`` is a stable name; the message never carries a stored value."""

    def __init__(self, code: str, message: str, exit_code: int = EXIT_REFUSED) -> None:
        super().__init__(f"{code}: {message}")
        self.code, self.exit_code = code, exit_code


@dataclass(frozen=True)
class TableSpec:
    name: str
    sources: tuple[str, ...]            # source file keys, in the order their rows go in
    order_key: str | None = None        # a write_order table: the column that names its rows in the proof of the order
    identity: bool = False              # copies its ids, then setval


FILES = {"identity": "identity.sqlite3", "projects": "projects.sqlite3", "custom_workflows": "custom_workflows.sqlite3", "derived": None}
# Insertion order = foreign-key order. events: projects first, then custom workflows (no order exists between the two
# old files; every aggregate lives in exactly one of them).
TABLES = (
    TableSpec("tenant", ("identity",)),
    TableSpec("workspace", ("identity",), order_key="workspace_id"),
    TableSpec("identity", ("identity",)),
    TableSpec("identity_credential", ("identity",)),
    TableSpec("session", ("identity",)),
    TableSpec("password_reset_token", ("identity",)),
    TableSpec("handoff_code", ("identity",)),
    TableSpec("collect_grant", ("identity",)),
    TableSpec("entitlement_audit", ("identity",), identity=True),
    TableSpec("ai_usage", ("identity",), identity=True),
    TableSpec("platform_projects", ("projects",)),
    TableSpec("prov_sources", ("projects",)),
    TableSpec("project_interpretations", ("projects",)),
    TableSpec("project_syntheses", ("projects",)),
    TableSpec("project_reports", ("projects",)),
    TableSpec("collection_runs", ("projects",)),
    TableSpec("custom_workflows", ("custom_workflows",)),
    TableSpec("derived_artifact_cache", ("derived",)),
    TableSpec("events", ("projects", "custom_workflows"), order_key="event_id"),
)
KINDS = {"timestamp with time zone": "ts", "jsonb": "json", "bytea": "bytes", "bigint": "int", "integer": "int", "text": "text"}


def q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


# -- the SQLite side ----------------------------------------------------------------------------------------------


def frozen_columns() -> dict[str, tuple[str, ...]]:
    memory = sqlite3.connect(":memory:")
    try:
        memory.executescript(FROZEN_SCHEMA.read_text(encoding="utf-8"))
        tables = [row[0] for row in memory.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
        return {table: tuple(row[1] for row in memory.execute(f"PRAGMA table_info({q(table)})")) for table in tables}
    finally:
        memory.close()


class Source:
    """The three files (and the optional derived-cache index) opened read-only, shape-checked against the frozen schema."""

    def __init__(self, directory: Path, derived_index: Path | None) -> None:
        self.directory = directory
        self.paths: dict[str, Path] = {key: directory / name for key, name in FILES.items() if name}
        if derived_index is not None:
            self.paths["derived"] = derived_index
        self.connections: dict[str, sqlite3.Connection] = {}
        self.sha_before: dict[str, str] = {}

    def open(self) -> None:
        expected = frozen_columns()
        for key, path in self.paths.items():
            if not path.is_file():
                raise MoveError("SOURCE_FILE_MISSING", f"{path.name} is not in {self.directory}")
            for suffix in SQLITE_SIDE_FILES:
                if Path(str(path) + suffix).exists():
                    raise MoveError("SOURCE_NOT_QUIET", f"{path.name}{suffix} exists: the copy was taken while the engine was writing; copy again with the site in maintenance")
            self.sha_before[key] = file_sha256(path)
            connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
            self.connections[key] = connection
            if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise MoveError("SOURCE_CORRUPT", f"{path.name} fails PRAGMA quick_check")
            wanted = {spec.name for spec in TABLES if key in spec.sources}
            found = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")}
            if found != wanted:
                raise MoveError("SOURCE_SHAPE", f"{path.name}: missing tables {sorted(wanted - found)}, unknown tables {sorted(found - wanted)}; a file not at the a76af28da shape is opened once by that engine first")
            for table in sorted(wanted):
                columns = tuple(row[1] for row in connection.execute(f"PRAGMA table_info({q(table)})"))
                if set(columns) != set(expected[table]):
                    raise MoveError("SOURCE_SHAPE", f"{path.name}.{table}: missing columns {sorted(set(expected[table]) - set(columns))}, unknown columns {sorted(set(columns) - set(expected[table]))}")
        self._check_owners()

    def _check_owners(self) -> None:
        for key in ("projects", "custom_workflows"):
            count, first = self.connections[key].execute(
                "SELECT COUNT(*), MIN(rowid) FROM events WHERE owner_kind IS NULL OR owner_kind = '' OR owner_id IS NULL OR owner_id = ''").fetchone()
            if count:
                raise MoveError("EVENT_OWNER_MISSING", f"{count} event(s) in {self.paths[key].name} have no owner (first rowid {first}); a record with no owner could never be erased")

    def rows(self, spec: TableSpec, key: str, columns: Sequence[str]) -> Iterator[tuple[int, tuple[Any, ...]]]:
        cursor = self.connections[key].execute(f"SELECT rowid, {', '.join(q(c) for c in columns)} FROM {q(spec.name)} ORDER BY rowid")
        while batch := cursor.fetchmany(FETCH):
            for row in batch:
                yield row[0], tuple(row[1:])

    def sequence_floor(self, table: str) -> int:
        connection = self.connections["identity"]
        if connection.execute("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'").fetchone() is None:
            return 0
        row = connection.execute("SELECT seq FROM sqlite_sequence WHERE name = ?", (table,)).fetchone()
        return int(row[0]) if row else 0

    def close(self) -> None:
        for connection in self.connections.values():
            connection.close()
        self.connections.clear()

    def unchanged(self) -> None:
        for key, path in self.paths.items():
            if file_sha256(path) != self.sha_before[key]:
                raise MoveError("SOURCE_CHANGED", f"{path.name} changed while the move ran (it is opened read-only: something else wrote it)", EXIT_PROOF)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(1 << 20):
            digest.update(block)
    return digest.hexdigest()


# -- conversion: one place, used for the copy and for the source side of the proof ---------------------------------


def to_time(text: Any) -> datetime:
    if not isinstance(text, str) or TIME_FORM.fullmatch(text) is None:
        raise ValueError("not an ISO-8601 time with an offset")
    return datetime.fromisoformat(text).astimezone(timezone.utc)


def _no_constant(name: str) -> Any:
    raise ValueError(f"JSON constant {name}")


def to_json(text: Any) -> Any:
    if not isinstance(text, str):
        raise ValueError("not JSON text")
    value = json.loads(text, parse_constant=_no_constant)
    if value is None:
        raise ValueError("the JSON literal null")
    return value


def convert(value: Any, kind: str) -> Any:
    if value is None:
        return None
    if kind == "ts":
        return to_time(value)
    if kind == "json":
        return to_json(value)
    if kind == "bytes":
        if not isinstance(value, (bytes, memoryview)):
            raise ValueError("not a blob")
        return bytes(value)
    if kind == "int":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError("not an integer")
        return value
    if not isinstance(value, str):
        raise ValueError("not text")
    return value


def normalize(value: Any, kind: str) -> Any:
    """The form both sides hash: a time in UTC to the microsecond, JSON as canonical text, a blob as hex."""
    if value is None:
        return None
    if kind == "ts":
        return value.astimezone(timezone.utc).isoformat(timespec="microseconds")
    if kind == "json":
        return canonical_json(value)
    if kind == "bytes":
        return bytes(value).hex()
    return value


def row_digest(values: Sequence[Any], kinds: Sequence[str]) -> bytes:
    return hashlib.sha256(json.dumps([normalize(v, k) for v, k in zip(values, kinds)], ensure_ascii=False, separators=(",", ":")).encode("utf-8")).digest()


def event_line_digest(sequence: int, event_type: str, payload: Any) -> bytes:
    return hashlib.sha256(f"{sequence}\x1f{event_type}\x1f{canonical_json(payload)}".encode("utf-8")).digest()


def combine(digests: Sequence[bytes]) -> str:
    return hashlib.sha256(b"".join(digests)).hexdigest()


# -- the proof ---------------------------------------------------------------------------------------------------


@dataclass
class Proof:
    counts: dict[str, int] = field(default_factory=dict)
    digests: dict[str, str] = field(default_factory=dict)
    orders: dict[str, str] = field(default_factory=dict)
    sequences: dict[str, int | None] = field(default_factory=dict)
    aggregates: dict[tuple[str, str], str] = field(default_factory=dict)
    files: dict[str, tuple[int, int, str]] = field(default_factory=dict)   # tenant -> (files, bytes, digest)


class TableProof:
    def __init__(self, order: bool) -> None:
        self.rows: list[bytes] = []
        self.order = hashlib.sha256() if order else None

    def add(self, row: bytes, key: Any = None) -> None:
        self.rows.append(row)
        if self.order is not None:
            self.order.update(str(key).encode("utf-8") + b"\n")

    def finish(self, proof: Proof, table: str) -> None:
        proof.counts[table] = len(self.rows)
        proof.digests[table] = combine(sorted(self.rows))
        if self.order is not None:
            proof.orders[table] = self.order.hexdigest()


def differences(source: Proof, target: Proof) -> list[str]:
    found: list[str] = []
    for table in sorted(source.counts):
        if source.counts[table] != target.counts.get(table):
            found.append(f"rows {table}: source {source.counts[table]}, target {target.counts.get(table)}")
        elif source.digests[table] != target.digests.get(table):
            found.append(f"rows {table}: same count ({source.counts[table]}) but the row digests differ")
    for table in sorted(source.orders):
        if source.orders[table] != target.orders.get(table):
            found.append(f"order {table}: write_order does not follow the SQLite rowid order")
    for table in sorted(source.sequences):
        if source.sequences[table] != target.sequences.get(table):
            found.append(f"sequence {table}.id: expected last value {source.sequences[table]}, target {target.sequences.get(table)}")
    if source.aggregates != target.aggregates:
        differing = sorted(key for key in source.aggregates.keys() | target.aggregates.keys() if source.aggregates.get(key) != target.aggregates.get(key))
        found.append(f"event aggregates: {len(differing)} differ (source {len(source.aggregates)}, target {len(target.aggregates)}); first: {[aggregate for _, aggregate in differing[:5]]}")
    for tenant in sorted(source.files.keys() | target.files.keys()):
        if source.files.get(tenant) != target.files.get(tenant):
            found.append(f"files of tenant {tenant}: source {source.files.get(tenant)}, destination {target.files.get(tenant)}")
    return found


# -- the target -------------------------------------------------------------------------------------------------


@dataclass
class Plan:
    columns: dict[str, tuple[str, ...]]     # table -> the columns copied, frozen order
    kinds: dict[str, tuple[str, ...]]
    tables: list[str]                       # every table of the target (alembic_version aside)


def plan_target(connection: psycopg.Connection) -> Plan:
    expected = frozen_columns()
    found: dict[str, dict[str, tuple[str, bool]]] = defaultdict(dict)   # table -> column -> (type, fills itself)
    for table, column, data_type, nullable, default, identity, generated in connection.execute(
        "SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity, is_generated FROM information_schema.columns "
        "WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position"):
        found[table][column] = (data_type, nullable == "YES" or default is not None or identity == "YES" or generated != "NEVER")
    columns: dict[str, tuple[str, ...]] = {}
    kinds: dict[str, tuple[str, ...]] = {}
    for spec in TABLES:
        have = found.get(spec.name)
        if have is None:
            raise MoveError("TARGET_SHAPE", f"table {spec.name} does not exist in the target")
        names = expected[spec.name]
        missing = [name for name in names if name not in have]
        if missing:
            raise MoveError("TARGET_SHAPE", f"{spec.name} lacks columns {missing}")
        unknown = [name for name, (_, fills_itself) in have.items() if name not in names and not fills_itself]
        if unknown:
            raise MoveError("TARGET_SHAPE", f"{spec.name} has NOT NULL column(s) {unknown} the move does not fill: a migration after the a76af28da shape added them; teach the move before going live")
        for name in names:
            if have[name][0] not in KINDS:
                raise MoveError("TARGET_SHAPE", f"{spec.name}.{name} has type {have[name][0]}, which the move does not know")
        columns[spec.name] = names
        kinds[spec.name] = tuple(KINDS[have[name][0]] for name in names)
    if "tenant_directory" not in found:
        raise MoveError("TARGET_SHAPE", "table tenant_directory does not exist in the target")
    tables = sorted(table for table in found if table != "alembic_version")
    return Plan(columns, kinds, tables)


def require_head_and_empty(connection: psycopg.Connection, plan: Plan) -> list[str]:
    """Head, no row, and every sequence unused: a sequence that has been read from outlives its rows (a deleted or rolled
    back insert still advanced it), and the move's setval to the source's largest id would then hand out an id already used
    on the target. Returns every sequence of the schema (qualified), which a failed move restarts: they were all proven unused."""
    current, heads = schema_revisions(connection), head_revisions()
    if current != heads:
        raise MoveError("TARGET_SCHEMA_BEHIND", f"the target is at {sorted(current) or 'no revision'}, head is {sorted(heads)}: run ai_lego.apps.cli.migrate_db first")
    connection.execute("LOCK TABLE " + ", ".join(q(t) for t in plan.tables) + " IN ACCESS EXCLUSIVE MODE")
    for table in plan.tables:
        if connection.execute(f"SELECT EXISTS (SELECT 1 FROM {q(table)})").fetchone()[0]:
            raise MoveError("TARGET_NOT_EMPTY", f"table {table} already holds rows: the move fills an empty database only")
    used = [row[0] for row in connection.execute("SELECT sequencename FROM pg_sequences WHERE schemaname = current_schema() AND last_value IS NOT NULL ORDER BY 1")]
    if used:
        raise MoveError("TARGET_NOT_EMPTY", f"sequence(s) {used} were already used (rows since deleted, or a move that died): restore the empty database (GO_LIVE.md C2); setval would reuse ids")
    return [row[0] for row in connection.execute("SELECT quote_ident(schemaname) || '.' || quote_ident(sequencename) FROM pg_sequences WHERE schemaname = current_schema() ORDER BY 1")]


def target_proof(connection: psycopg.Connection, plan: Plan) -> Proof:
    proof = Proof()
    for spec in TABLES:
        columns, kinds = plan.columns[spec.name], plan.kinds[spec.name]
        table = TableProof(spec.order_key is not None)
        key_at = columns.index(spec.order_key) if spec.order_key else None
        select = ", ".join(q(c) for c in columns)
        with connection.cursor(name=f"proof_{spec.name}") as cursor:
            cursor.itersize = FETCH
            cursor.execute(f"SELECT {select} FROM {q(spec.name)}" + (" ORDER BY write_order" if spec.order_key else ""))
            for row in cursor:
                table.add(row_digest(row, kinds), row[key_at] if key_at is not None else None)
        table.finish(proof, spec.name)
        if spec.identity:
            row = connection.execute("SELECT last_value FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = "
                                     "split_part(pg_get_serial_sequence(%s, 'id'), '.', 2)", (spec.name,)).fetchone()
            proof.sequences[spec.name] = None if row is None else row[0]
    directory = TableProof(False)
    with connection.cursor(name="proof_tenant_directory") as cursor:
        cursor.itersize = FETCH
        cursor.execute("SELECT tenant_id, region FROM tenant_directory")
        for row in cursor:
            directory.add(row_digest(row, ("text", "text")))
    directory.finish(proof, "tenant_directory")
    lines: dict[tuple[str, str], list[bytes]] = {}
    with connection.cursor(name="proof_aggregates") as cursor:
        cursor.itersize = FETCH
        cursor.execute("SELECT tenant_id, aggregate_id, sequence, event_type, payload_json FROM events ORDER BY tenant_id, aggregate_id, sequence")
        for tenant, aggregate, sequence, event_type, payload in cursor:
            lines.setdefault((tenant, aggregate), []).append(event_line_digest(sequence, event_type, payload))
    proof.aggregates = {key: combine(digests) for key, digests in lines.items()}
    return proof


# -- the copy ---------------------------------------------------------------------------------------------------


@dataclass
class Counted:
    proof: Proof
    tenants: dict[str, str]    # tenant_id -> source region


def copy_and_prove_source(source: Source, plan: Plan, region_map: Mapping[str, str], connection: psycopg.Connection | None) -> Counted:
    """One pass over the SQLite rows: convert, insert (when ``connection`` is given), and build the source side of the
    proof from the converted values -- what is hashed is exactly what is inserted."""
    proof = Proof()
    tenants: dict[str, str] = {}
    aggregates: dict[tuple[str, str], list[tuple[int, bytes]]] = {}
    for spec in TABLES:
        if spec.sources == ("derived",) and "derived" not in source.paths:
            proof.counts[spec.name], proof.digests[spec.name] = 0, combine([])
            continue
        columns, kinds = plan.columns[spec.name], plan.kinds[spec.name]
        table = TableProof(spec.order_key is not None)
        statement = f"INSERT INTO {q(spec.name)} ({', '.join(q(c) for c in columns)}) VALUES ({', '.join(['%s'] * len(columns))})"
        pending: list[tuple[Any, ...]] = []
        position = {name: index for index, name in enumerate(columns)}
        for key in spec.sources:
            for rowid, raw in source.rows(spec, key, columns):
                values = []
                for name, kind, value in zip(columns, kinds, raw):
                    try:
                        values.append(convert(value, kind))
                    except ValueError as error:
                        raise MoveError("CONVERT", f"{FILES[key] or 'derived index'}.{spec.name} rowid {rowid} column {name}: {error}") from None
                if spec.name == "tenant":
                    tenants[values[position["tenant_id"]]] = values[position["data_residency_region"]]
                    values[position["data_residency_region"]] = region_map[values[position["data_residency_region"]]]
                if spec.name == "events":
                    aggregates.setdefault((values[position["tenant_id"]], values[position["aggregate_id"]]), []).append(
                        (values[position["sequence"]], event_line_digest(values[position["sequence"]], values[position["event_type"]], values[position["payload_json"]])))
                table.add(row_digest(values, kinds), values[position[spec.order_key]] if spec.order_key else None)
                if connection is not None:
                    pending.append(tuple(Jsonb(v) if k == "json" and v is not None else v for v, k in zip(values, kinds)))
                    if len(pending) >= BATCH:
                        _insert(connection, spec.name, statement, pending)
                        pending = []
        if connection is not None and pending:
            _insert(connection, spec.name, statement, pending)
        table.finish(proof, spec.name)
        if spec.identity:
            largest = source.connections["identity"].execute(f"SELECT MAX(id) FROM {q(spec.name)}").fetchone()[0] or 0
            top = max(largest, source.sequence_floor(spec.name))   # sqlite_sequence remembers ids of rows since deleted
            proof.sequences[spec.name] = top or None
            if connection is not None and top:
                connection.execute("SELECT setval(pg_get_serial_sequence(%s, 'id'), %s)", (spec.name, top))
    directory = TableProof(False)
    for tenant_id, region in tenants.items():
        directory.add(row_digest((tenant_id, region_map[region]), ("text", "text")))
        if connection is not None:
            connection.execute("INSERT INTO tenant_directory (tenant_id, region) VALUES (%s, %s)", (tenant_id, region_map[region]))
    directory.finish(proof, "tenant_directory")
    proof.aggregates = {key: combine([digest for _, digest in sorted(items)]) for key, items in aggregates.items()}
    return Counted(proof, tenants)


def _insert(connection: psycopg.Connection, table: str, statement: str, rows: list[tuple[Any, ...]]) -> None:
    try:
        with connection.cursor() as cursor:
            cursor.executemany(statement, rows)
    except psycopg.Error as error:   # the library's message quotes the failing row: say where, not what
        diag = error.diag
        raise MoveError("INSERT", f"{table}: SQLSTATE {error.sqlstate} ({type(error).__name__}); constraint {diag.constraint_name}, column {diag.column_name}") from None


# -- files ------------------------------------------------------------------------------------------------------


def tenant_namespace(tenant_id: str) -> str:
    return hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:32]


def plan_files(source_dir: Path, tenants: Sequence[str], extra_known: frozenset[str]) -> dict[str, list[str]]:
    """tenant -> its directories (relative, posix) under the file root. Anything that belongs to no tenant stops the move."""
    names: dict[str, str] = {}
    for tenant in tenants:
        names[tenant] = tenant
        names[tenant_namespace(tenant)] = tenant
    known_top = {name for name in FILES.values() if name} | set(CAS_ROOTS) | {JOURNAL_ROOT} | IGNORED_TOP_LEVEL | extra_known
    strangers = sorted(entry.name for entry in source_dir.iterdir() if entry.name not in known_top)
    if strangers:
        raise MoveError("FILES_UNKNOWN", f"entries in the source directory the move does not know: {strangers}; remove them from the copy or teach the move")
    plan: dict[str, list[str]] = {tenant: [] for tenant in tenants}
    for root in CAS_ROOTS:
        base = source_dir / root
        if not base.exists():
            continue
        if sorted(entry.name for entry in base.iterdir()) != ["objects"]:
            raise MoveError("FILES_UNKNOWN", f"{root} holds something besides objects/")
        for entry in sorted((base / "objects").iterdir()):
            if entry.name not in names:
                raise MoveError("FILES_ORPHAN", f"{root}/objects/{entry.name} belongs to no tenant in the database; remove it from the copy if it is junk")
            plan[names[entry.name]].append(f"{root}/objects/{entry.name}")
    journals = source_dir / JOURNAL_ROOT
    if journals.exists():
        for entry in sorted(journals.iterdir()):
            if entry.name not in names:
                raise MoveError("FILES_ORPHAN", f"{JOURNAL_ROOT}/{entry.name} belongs to no tenant in the database")
            plan[names[entry.name]].append(f"{JOURNAL_ROOT}/{entry.name}")
    return plan


def tree_digest(root: Path, relatives: Sequence[str]) -> tuple[int, int, str]:
    lines: list[str] = []
    total = 0
    for relative in relatives:
        base = root / relative
        for directory, subdirectories, names in os.walk(base):
            for entry in [*subdirectories, *names]:
                if os.path.islink(os.path.join(directory, entry)):
                    raise MoveError("FILES_SYMLINK", f"{os.path.relpath(os.path.join(directory, entry), root)} is a symbolic link")
            for name in names:
                path = Path(directory, name)
                lines.append(f"{path.relative_to(root).as_posix()}\x1f{path.stat().st_size}\x1f{file_sha256(path)}")
                total += path.stat().st_size
    return len(lines), total, hashlib.sha256("\n".join(sorted(lines)).encode("utf-8")).hexdigest()


class CopiedFiles:
    """Copies the planned directories and remembers what this run created, so a failure removes exactly that."""

    def __init__(self, destination: Path) -> None:
        self.destination = destination
        self.created: list[Path] = []

    def copy(self, source_dir: Path, plan: Mapping[str, Sequence[str]]) -> None:
        for relatives in plan.values():
            for relative in relatives:
                target = self.destination / relative
                if target.exists():
                    raise MoveError("FILES_TARGET_NOT_EMPTY", f"{relative} already exists under the destination")
                for parent in reversed(target.parents):
                    if not parent.exists() and self.destination in parent.parents:
                        parent.mkdir()
                        self.created.append(parent)
                shutil.copytree(source_dir / relative, target, symlinks=False)
                self.created.append(target)

    def remove(self) -> None:
        for path in reversed(self.created):
            if path.is_dir():
                shutil.rmtree(path)
        self.created.clear()


# -- the move ---------------------------------------------------------------------------------------------------


@dataclass
class Result:
    source: Proof
    target: Proof | None
    differences: list[str]
    committed: bool
    source_sha256: dict[str, str]
    regions: dict[str, str]

    def summary(self) -> list[str]:
        lines = [f"tenants: {len(self.regions)} (their source regions: {dict(sorted(Counter(self.regions.values()).items()))})"]
        lines += [f"{table:<24} source rows {self.source.counts[table]:>8}  target rows {self.target.counts[table] if self.target else '-':>8}" for table in sorted(self.source.counts)]
        lines.append(f"event aggregates hashed: {len(self.source.aggregates)}; files: {sum(f[0] for f in self.source.files.values())} in {len(self.source.files)} tenant(s)")
        return lines

    def report(self) -> dict[str, Any]:
        return {"committed": self.committed, "differences": self.differences, "source_files_sha256": self.source_sha256,
                "counts": self.source.counts, "table_digests": self.source.digests, "sequences": self.source.sequences,
                "aggregates": len(self.source.aggregates), "aggregates_digest": combine([bytes.fromhex(v) for _, v in sorted(self.source.aggregates.items())]),
                "files": {tenant: list(value) for tenant, value in sorted(self.source.files.items())}}


def check_region_map(region_map: Mapping[str, str], configured: str, tenants: Mapping[str, str]) -> None:
    used = set(tenants.values())
    if used - set(region_map):
        raise MoveError("REGION_UNMAPPED", f"tenants say region(s) {sorted(used - set(region_map))} and --region-map maps only {sorted(region_map)}")
    if set(region_map) - used:
        raise MoveError("REGION_MAP_UNUSED", f"--region-map names {sorted(set(region_map) - used)}, which no tenant says")
    if set(region_map.values()) != {configured}:
        raise MoveError("REGION_NOT_CONFIGURED", f"--region-map targets {sorted(set(region_map.values()))}; the configured region is {configured!r}")


def read_tenants(source: Source) -> dict[str, str]:
    return {row[0]: row[1] for row in source.connections["identity"].execute("SELECT tenant_id, data_residency_region FROM tenant")}


def _check_files_absent(files_root: Path, plan: Mapping[str, Sequence[str]]) -> None:
    for relatives in plan.values():
        for relative in relatives:
            if (files_root / relative).exists():
                raise MoveError("FILES_TARGET_NOT_EMPTY", f"{relative} already exists under the destination")


def run(command: str, source_dir: Path, urls: Mapping[str, str], region_map: Mapping[str, str], files_root: Path | None,
        derived_index: Path | None = None, dry_run: bool = False) -> Result:
    if len(urls) != 1:
        raise MoveError("REGIONS", "exactly one region is configured today (D7: files are not routed per region yet)")
    (region, url), = urls.items()
    if files_root is None and not (command == "move" and dry_run):
        raise MoveError("ARGUMENTS", "--files-root is required (only move --dry-run may leave it out)")
    if files_root is not None and not files_root.is_dir():
        raise MoveError("FILES_TARGET", f"--files-root {files_root} is not a directory")
    source = Source(source_dir, derived_index)
    copied = CopiedFiles(files_root) if files_root is not None and command == "move" and not dry_run else None
    try:
        source.open()
        tenants = read_tenants(source)
        check_region_map(region_map, region, tenants)
        extra = frozenset({derived_index.name}) if derived_index is not None and derived_index.parent == source_dir else frozenset()
        files_plan = plan_files(source_dir, sorted(tenants), extra)
        source_files = {tenant: tree_digest(source_dir, relatives) for tenant, relatives in files_plan.items()}
        with psycopg.connect(url, autocommit=True) as connection:
            connection.execute("SET TIME ZONE 'UTC'")
            writes = command == "move" and not dry_run
            proven_unused: list[str] = []   # set once the target is proven empty and unused; a rolled-back move restarts exactly these
            try:
                with connection.transaction():
                    if command == "verify":
                        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                    plan = plan_target(connection)
                    if command == "move":
                        sequences = require_head_and_empty(connection, plan)
                        proven_unused = sequences if writes else []
                    counted = copy_and_prove_source(source, plan, region_map, connection if writes else None)
                    counted.proof.files = source_files
                    if command == "move" and dry_run:
                        if files_root is not None:
                            _check_files_absent(files_root, files_plan)
                        source.unchanged()
                        return Result(counted.proof, None, [], False, dict(source.sha_before), counted.tenants)
                    if copied is not None:
                        copied.copy(source_dir, files_plan)
                    target = target_proof(connection, plan)
                    assert files_root is not None
                    target.files = {tenant: tree_digest(files_root, relatives) for tenant, relatives in files_plan.items()}
                    found = differences(counted.proof, target)
                    if command == "move" and found:
                        raise MoveError("PROOF_FAILED", "; ".join(found), EXIT_PROOF)
                    source.unchanged()
            except BaseException:
                # nextval and setval survive a rollback; the target was proven unused under lock, so put them back or the
                # retry (and the next run's emptiness check) would see a used sequence.
                for sequence in proven_unused:
                    connection.execute(f"ALTER SEQUENCE {sequence} RESTART")
                raise
        return Result(counted.proof, target, found, command == "move", dict(source.sha_before), counted.tenants)
    except BaseException:
        if copied is not None:
            copied.remove()
        raise
    finally:
        source.close()


def parse_region_map(entries: Sequence[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for entry in entries:
        for part in entry.split(","):
            old, separator, new = part.partition("=")
            if not separator or not old or not new or old in mapping:
                raise MoveError("ARGUMENTS", "--region-map is SOURCE_REGION=CONFIGURED_REGION, each source region once")
            mapping[old] = new
    return mapping


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("move", "verify"))
    parser.add_argument("--source-dir", required=True, type=Path, help="a COPY of the live .runtime (identity/projects/custom_workflows .sqlite3 + the file trees)")
    parser.add_argument("--region-map", required=True, action="append", help="SOURCE_REGION=CONFIGURED_REGION (every tenant's data_residency_region must be mapped; explicit on purpose)")
    parser.add_argument("--files-root", type=Path, help="the region's file root: the new .runtime volume")
    parser.add_argument("--derived-cache-index", type=Path, help="the derived-artifact cache index file, if one is in use (the engine opens none today)")
    parser.add_argument("--dry-run", action="store_true", help="read, convert, hash and check the target; write nothing")
    parser.add_argument("--report", type=Path, help="write the proof (counts, digests, source file hashes; no row content) as JSON")
    args = parser.parse_args(argv)
    try:
        urls = parse_database_urls(os.environ.get(DATABASE_URLS_ENV, "").strip() or _missing())
        result = run(args.command, args.source_dir.resolve(), urls, parse_region_map(args.region_map),
                     args.files_root.resolve() if args.files_root else None, args.derived_cache_index.resolve() if args.derived_cache_index else None, args.dry_run)
    except (MoveError, InvariantViolation) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return error.exit_code if isinstance(error, MoveError) else EXIT_REFUSED
    except psycopg.Error as error:
        print(f"FAIL: DATABASE: {describe(error)}", file=sys.stderr)
        return EXIT_REFUSED
    for line in result.summary():
        print(line)
    if args.report:
        args.report.write_text(json.dumps(result.report(), indent=2, sort_keys=True), encoding="utf-8")
    if result.differences:
        print("FAIL: PROOF_FAILED: " + "; ".join(result.differences), file=sys.stderr)
        return EXIT_PROOF
    print({("move", False): "MOVE OK: committed, proof equal on both sides", ("move", True): "DRY RUN OK: nothing written", ("verify", False): "VERIFY OK: proof equal on both sides"}[(args.command, args.dry_run)])
    return 0


def _missing() -> str:
    raise InvariantViolation(f"DB_URLS_MISSING: {DATABASE_URLS_ENV} is not set (region=postgresql://...)")


if __name__ == "__main__":
    raise SystemExit(main())

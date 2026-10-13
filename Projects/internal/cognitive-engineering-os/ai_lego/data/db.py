"""PostgreSQL for the engine: one connection pool per region, one transaction per unit of work (docs/platform/
STORAGE_SWITCH.md D1, D2, D4, D6). psycopg 3, no ORM. The schema belongs to Alembic (ai_lego/data/migrations): the
engine never migrates by itself, it refuses to run on a region whose schema is not at head (``require_schema_at_head``).

Conventions -- every SQL call site follows them (STORAGE_SWITCH.md "Conventions"):
- Placeholders are %s. A literal % in a query that takes parameters is written %%.
- A row is ``Row``: ``row["column"]``, ``row[0]`` and ``dict(row)`` all work, as with SQLite's Row.
- jsonb is written as ``Jsonb(value)`` and read back as the Python value, every object's keys in sorted order (the order
  the SQLite text had: canonical_json), never jsonb's own. Stored JSON is compared as jsonb (= compares values), never as
  text; one field is ``column->>'key'``.
- timestamptz is written as an aware datetime or an ISO-8601 string with its offset ('Z') and read back as ``iso()`` text
  (six fraction digits, 'Z'), so two times read from the database compare correctly as strings. Within one aggregate the
  order is by sequence, never by time; across aggregates time orders a display only, with an id as the tiebreak.
- LIKE is case-sensitive here (SQLite's folded ASCII): a person's search uses ILIKE; a fixed lowercase prefix keeps LIKE.
- INSERT OR IGNORE / OR REPLACE is INSERT ... ON CONFLICT (its key) DO NOTHING / DO UPDATE.
- An identity column (SQLite AUTOINCREMENT) numbers rows per region: a row is found by (tenant, id), never by id alone.
- Booleans are what the baseline kept (entitlement_audit.granted: 0/1).
- A tenant's rows are reached only through ``Databases.for_tenant`` (tenant -> region -> pool); a credential that names no
  tenant (a session token, a code, a grant) is looked up region by region (``regions``).
- A lock is ``advisory_xact_lock`` named by parts, the first part the kind of thing locked; one function per lock builds
  its name, so a reader and a writer can never name it differently. The lock map: STORAGE_SWITCH.md "Locks".
"""

from __future__ import annotations

import json
import os
import re
import threading
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache, partial
from operator import itemgetter
from pathlib import Path
from types import MappingProxyType
from typing import Any

import psycopg
from psycopg import sql
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from psycopg.conninfo import conninfo_to_dict
from psycopg.pq import TransactionStatus
from psycopg.types.datetime import TimestamptzBinaryLoader, TimestamptzLoader
from psycopg.types.json import Jsonb, set_json_loads
from psycopg_pool import ConnectionPool

from ai_lego.errors import InvariantViolation

__all__ = ["Databases", "Jsonb", "Rehearsal", "Row", "advisory_xact_lock", "iso", "now", "owner_lock"]

DATABASE_URLS_ENV = "COGNITIVE_OS_DATABASE_URLS"
# Connections one process may hold per region. Workers x this must stay under the server max_connections (150 since 2026-10-12; 100 before) with room for
# the migration, backup and operator sessions: 8 workers x 10 reached 82 backends on the capacity rig (2026-10-12).
POOL_MAX_ENV = "COGNITIVE_OS_DB_POOL_MAX"
DEFAULT_POOL_MAX = 10
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
REGION_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_URL_SCHEMES = ("postgresql://", "postgres://")
# Refused inside a part, so ("a", "bc") and ("ab", "c") can never name the same lock.
LOCK_KEY_SEPARATOR = "\x1f"


def parse_database_urls(value: str) -> dict[str, str]:
    """``region=postgresql://...,region=postgresql://...`` -> {region: url}. An error names the entry by position (and
    region once the entry is otherwise sound), never by its text: the part after '=' carries the password."""
    entries = value.split(",")
    urls: dict[str, str] = {}
    for position, entry in enumerate(entries, start=1):
        where = f"entry {position} of {len(entries)}"
        region, separator, url = (part.strip() for part in entry.partition("="))
        if not separator or not REGION_PATTERN.fullmatch(region) or not url.startswith(_URL_SCHEMES):
            raise InvariantViolation(f"DB_URLS_MALFORMED: {where} of {DATABASE_URLS_ENV} is not region=postgresql://... (region: lowercase letters, digits, '-')")
        try:
            conninfo_to_dict(url)
        except psycopg.Error:
            # from None: libpq's message quotes the URL, password included.
            raise InvariantViolation(f"DB_URLS_MALFORMED: {where} (region {region!r}) of {DATABASE_URLS_ENV}: the URL does not parse") from None
        if region in urls:
            raise InvariantViolation(f"DB_URLS_MALFORMED: {where}: region {region!r} appears twice in {DATABASE_URLS_ENV}")
        urls[region] = url
    return urls


class Row(tuple):
    """A result row read like SQLite's Row: by column name or by position, and ``dict(row)``."""

    __slots__ = ()
    _positions: Mapping[str, int] = MappingProxyType({})

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, str):
            try:
                key = self._positions[key]
            except KeyError:
                raise IndexError(f"no column named {key!r}") from None
        return tuple.__getitem__(self, key)

    def keys(self) -> list[str]:
        return list(self._positions)


@lru_cache(maxsize=4096)
def _row_type(names: tuple[str, ...]) -> type[Row]:
    positions: dict[str, int] = {}
    for index, name in enumerate(names):
        positions.setdefault(name, index)   # a repeated name reads its first column
    return type("Row", (Row,), {"__slots__": (), "_positions": MappingProxyType(positions)})


def row_factory(cursor: psycopg.Cursor[Any]) -> Callable[[Sequence[Any]], Any]:
    if cursor.description is None:
        return tuple
    return _row_type(tuple(column.name for column in cursor.description))


def _sorted_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    return dict(sorted(pairs, key=itemgetter(0)))


class _IsoTimestamptzLoader(TimestamptzLoader):
    def load(self, data: Any) -> str:
        return iso(super().load(data))


class _IsoTimestamptzBinaryLoader(TimestamptzBinaryLoader):
    def load(self, data: Any) -> str:
        return iso(super().load(data))


def _configure(connection: psycopg.Connection) -> None:
    # A time string without an offset is then read as UTC, not as the server's zone.
    connection.execute("SET TIME ZONE 'UTC'")
    connection.row_factory = row_factory
    connection.adapters.register_loader("timestamptz", _IsoTimestamptzLoader)
    connection.adapters.register_loader("timestamptz", _IsoTimestamptzBinaryLoader)
    set_json_loads(partial(json.loads, object_pairs_hook=_sorted_object), connection)


def _lock_key(parts: tuple[str, ...]) -> str:
    if not parts or any(not isinstance(part, str) or LOCK_KEY_SEPARATOR in part for part in parts):
        raise InvariantViolation("DB_LOCK_KEY_INVALID: a lock is named by one or more text parts, none containing the separator")
    return LOCK_KEY_SEPARATOR.join(parts)


class Databases:
    """One pool per region. Build it once per process (``from_env``) and ``close`` it at shutdown. The first region
    configured holds the tenant directory (D6).

    A thread holds at most one connection of a pool (``_held_connection``): a transaction asked for inside another of the
    same thread and region is a savepoint of it (it commits with the outer one), and the transactions under a session lock
    run on the lock's connection. So no thread waits on a pool while it holds a connection of it, and threads on a pool of
    any size cannot all wait for each other (Codex W1-W3 F2: two hooks each holding a session-lock connection, each asking
    for a second, on max_size=2)."""

    def __init__(self, urls: Mapping[str, str], *, min_size: int = 1, max_size: int = 10) -> None:
        if not urls:
            raise InvariantViolation(f"DB_URLS_MISSING: no region configured ({DATABASE_URLS_ENV})")
        self._directory_region = next(iter(urls))
        self._held = threading.local()   # .connections: {region: the connection this thread holds}
        # autocommit: every transaction is an explicit connection.transaction() block, nothing is left open between them.
        self._pools = {
            region: ConnectionPool(url, min_size=min_size, max_size=max_size, kwargs={"autocommit": True}, configure=_configure,
                                   check=ConnectionPool.check_connection, name=f"cognitive-db-{region}", open=True)
            for region, url in urls.items()
        }

    @classmethod
    def from_env(cls, environ: Mapping[str, str] = os.environ, *, min_size: int = 1, max_size: int | None = None) -> Databases:
        if max_size is None:
            raw = environ.get(POOL_MAX_ENV, "").strip()
            if raw and not (raw.isdecimal() and int(raw) >= 1):
                raise InvariantViolation(f"DB_POOL_MAX_INVALID: {POOL_MAX_ENV} is a whole number of at least 1")
            max_size = int(raw) if raw else DEFAULT_POOL_MAX
        value = environ.get(DATABASE_URLS_ENV, "").strip()
        if not value:
            raise InvariantViolation(f"DB_URLS_MISSING: {DATABASE_URLS_ENV} is not set (region=postgresql://...,region=postgresql://...)")
        urls = parse_database_urls(value)
        if len(urls) > 1:
            raise InvariantViolation("DB_MULTI_REGION_BLOBS_NOT_READY: one region only until source, artifact and journal roots are routed per region (D7)")
        return cls(urls, min_size=min_size, max_size=max_size)

    def regions(self) -> tuple[str, ...]:
        return tuple(sorted(self._pools))

    @property
    def directory_region(self) -> str:
        """Where the tenant directory lives: the first region in COGNITIVE_OS_DATABASE_URLS (reordering the list moves it)."""
        return self._directory_region

    def _pool(self, region: str) -> ConnectionPool:
        pool = self._pools.get(region)
        if pool is None:
            raise InvariantViolation(f"DB_REGION_UNKNOWN: {region!r} (configured: {', '.join(self.regions())})")
        return pool

    def require_region(self, region: str) -> str:
        self._pool(region)
        return region

    @contextmanager
    def _held_connection(self, region: str) -> Iterator[psycopg.Connection]:
        """This thread's connection to ``region``: the one it already holds, else one from the pool, held until the block
        ends. The only way to a pooled connection (see the class note)."""
        held = self._held.__dict__.setdefault("connections", {})
        if region in held:
            yield held[region]
            return
        with self._pool(region).connection() as connection:
            held[region] = connection
            try:
                yield connection
            finally:
                del held[region]

    @contextmanager
    def transaction(self, region: str) -> Iterator[psycopg.Connection]:
        """One transaction on this thread's connection: committed when the block ends, rolled back when it raises. Inside
        another transaction of this thread and region it is a savepoint: rolled back alone, committed with the outer one."""
        with self._held_connection(region) as connection, connection.transaction():
            yield connection

    def _read_one(self, region: str, query: str, parameters: Sequence[Any]) -> Row | None:
        """One statement on this thread's connection: its own transaction (autocommit), or the open one's."""
        with self._held_connection(region) as connection:
            return connection.execute(query, parameters).fetchone()

    # -- the tenant directory: tenant -> region, nothing else (no personal data) -----------------------------------

    def region_of(self, tenant_id: str) -> str | None:
        """The one place a tenant is mapped to its region; None for a tenant the directory does not hold. A tenant row is written
        once and never changed or deleted (add_to_directory is the only writer), so a found region is kept for the life of this
        object: every unit of work asked the database first, which doubled the pool borrows of a request (the capacity rig,
        2026-10-12). A tenant not found is asked again. If tenants ever move region, this cache is what to invalidate."""
        known = self.__dict__.setdefault("_regions_by_tenant", {})   # Rehearsal does not run __init__
        region = known.get(tenant_id)
        if region is None:
            row = self._read_one(self.directory_region, "SELECT region FROM tenant_directory WHERE tenant_id = %s", (tenant_id,))
            if row is None:
                return None
            region = known[tenant_id] = self.require_region(row[0])
        return region

    @staticmethod
    def add_to_directory(connection: psycopg.Connection, tenant_id: str, region: str) -> None:
        """On the directory region's transaction; a different home region commits separately (see create_tenant)."""
        connection.execute("INSERT INTO tenant_directory (tenant_id, region) VALUES (%s, %s)", (tenant_id, region))

    @contextmanager
    def for_tenant(self, tenant_id: str) -> Iterator[psycopg.Connection]:
        """A transaction in the tenant's region: every repository call goes tenant -> region -> pool through here."""
        region = self.region_of(tenant_id)
        if region is None:
            raise InvariantViolation(f"TENANT_REGION_UNKNOWN: tenant {tenant_id!r} is not in the tenant directory")
        with self.transaction(region) as connection:
            yield connection

    # -- locks held across transactions, and the rehearsal ---------------------------------------------------------

    @contextmanager
    def session_lock(self, region: str, *parts: str) -> Iterator[None]:
        """Hold the lock named by ``parts`` across many transactions; the server drops it if this process dies. Same name
        space as ``advisory_xact_lock``. The lock's connection is the thread's: the transactions inside run on it, so the
        holder never asks the pool for a second one. It is the thread's first hold of that pool (refused inside a
        transaction or another session lock): closing it on a failed unlock must not end anything else."""
        key = _lock_key(parts)
        if region in self._held.__dict__.get("connections", {}):
            raise InvariantViolation("DB_SESSION_LOCK_NESTED: a session lock is taken before anything else holds this thread's connection")
        with self._held_connection(region) as connection:
            connection.execute("SELECT pg_advisory_lock(hashtextextended(%s, 0))", (key,))
            try:
                yield
            finally:
                try:
                    connection.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (key,))
                except BaseException:
                    connection.close()   # a closed connection drops the lock; the pool throws it away
                    raise

    def vacuum(self, region: str, table: str) -> None:
        """``VACUUM (INDEX_CLEANUP ON)`` of one table, on this thread's connection outside any transaction (VACUUM refuses to
        run inside one): the dead rows are pruned from the heap and their index entries removed. The freed space is not
        zeroed: bytes at the page's free-space edge stay until a later write reuses them."""
        if region in self._held.__dict__.get("connections", {}):
            raise InvariantViolation("DB_VACUUM_IN_TRANSACTION: a VACUUM runs on a connection this thread does not already hold")
        with self._held_connection(region) as connection:
            connection.execute("SET lock_timeout = '30s'")   # a conflicting lock (ALTER TABLE...) fails it, never parks the caller
            try:
                connection.execute(sql.SQL("VACUUM (INDEX_CLEANUP ON) {}").format(sql.Identifier(table)))
            finally:
                connection.execute("RESET lock_timeout")   # a pooled session: the next borrower gets the server default

    @contextmanager
    def rehearsal(self) -> Iterator[Rehearsal]:
        """The real repository code on this database, nothing kept (see ``Rehearsal``)."""
        with self._held_connection(self.directory_region) as connection, connection.transaction(force_rollback=True):
            yield Rehearsal(connection, self.directory_region)

    def require_schema_at_head(self, region: str) -> None:
        with self.transaction(region) as connection:
            current = schema_revisions(connection)
        heads = head_revisions()
        if current != heads:
            raise InvariantViolation(
                f"DB_SCHEMA_BEHIND: region {region!r} is at {sorted(current) or 'no revision'}, head is {sorted(heads)} -- "
                "run the migration (ai_lego.data.db.migrate) first; the engine never migrates by itself"
            )

    def require_connection_budget(self, region: str, workers: int) -> None:
        """Every worker process may hold up to the pool maximum: together they must fit the connections the server leaves to ordinary
        sessions (max_connections less superuser_reserved_connections), or a busy hour fails requests with the health check still
        green (COGNITIVE_OS_DB_POOL_MAX, COGNITIVE_OS_API_WORKERS)."""
        with self.transaction(region) as connection:
            slots = connection.execute("SELECT current_setting(%s)::int - current_setting(%s)::int", ("max_connections", "superuser_reserved_connections")).fetchone()[0]
        need = workers * self._pool(region).max_size
        if need > slots:
            raise InvariantViolation(f"DB_POOL_EXCEEDS_SERVER: {workers} workers x {self._pool(region).max_size} connections = {need}, the server allows {slots}; lower {POOL_MAX_ENV} or the worker count, or raise max_connections")

    def close(self) -> None:
        for pool in self._pools.values():
            pool.close()

    def __enter__(self) -> Databases:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()


class Rehearsal(Databases):
    """One connection, one outer transaction that is always rolled back: every ``transaction`` is a savepoint in it and every
    region is this one. The pre-launch integrity check runs the real save path here and leaves nothing behind. One thread
    only (a savepoint stack cannot be shared); a session lock is a no-op (nothing else runs inside it)."""

    def __init__(self, connection: psycopg.Connection, region: str) -> None:   # no super().__init__: it would open pools
        self._connection = connection
        self._directory_region = region
        self._thread = threading.get_ident()

    def regions(self) -> tuple[str, ...]:
        return (self._directory_region,)

    def require_region(self, region: str) -> str:
        return region

    @contextmanager
    def transaction(self, region: str) -> Iterator[psycopg.Connection]:
        if threading.get_ident() != self._thread:
            raise InvariantViolation("DB_REHEARSAL_THREAD: a rehearsal runs in the thread that opened it")
        with self._connection.transaction():
            yield self._connection

    def _read_one(self, region: str, query: str, parameters: Sequence[Any]) -> Row | None:
        with self.transaction(region) as connection:
            return connection.execute(query, parameters).fetchone()

    @contextmanager
    def session_lock(self, region: str, *parts: str) -> Iterator[None]:
        yield

    def vacuum(self, region: str, table: str) -> None:
        pass   # nothing a rehearsal deletes is kept

    @contextmanager
    def rehearsal(self) -> Iterator[Rehearsal]:
        yield self

    def close(self) -> None:
        pass


def advisory_xact_lock(connection: psycopg.Connection, *parts: str, shared: bool = False) -> None:
    """Wait for the lock named by ``parts`` (first part = the kind of thing locked, e.g. "events"). It is held until
    the transaction ends; two names sharing a 64-bit hash only wait for each other, never interleave wrongly.
    ``shared``: holders of the shared lock do not wait for each other; an exclusive holder waits for all of them, and a
    shared request that comes after a waiting exclusive one queues behind it."""
    if connection.info.transaction_status != TransactionStatus.INTRANS:
        raise InvariantViolation("DB_LOCK_OUTSIDE_TRANSACTION: an advisory xact lock taken outside a transaction is released at once")
    function = "pg_advisory_xact_lock_shared" if shared else "pg_advisory_xact_lock"
    connection.execute(f"SELECT {function}(hashtextextended(%s, 0))", (_lock_key(parts),))


def owner_lock(connection: psycopg.Connection, kind: str, tenant_id: str, owner_id: str, *, exclusive: bool = False) -> None:
    """The lock of a thing many write into and one erase removes whole -- a case today, a group next (STORAGE_SWITCH.md
    "Locks"). Every writer takes it shared as its transaction's first statement and checks under it that the thing still
    exists; the erase -- or a batch whose own checks must hold until its writes -- takes it exclusive. Writers never wait
    for each other; an exclusive holder waits only for the writes in flight, and a writer that comes after it waits, then
    reads what it left (no case: CASE_ERASED). The name is (kind, tenant, owner) for both modes: one key, never two."""
    advisory_xact_lock(connection, kind, tenant_id, owner_id, shared=not exclusive)


def now() -> datetime:
    """The current UTC time with microseconds: what a timestamptz column stores (D4)."""
    return datetime.now(timezone.utc)


def iso(moment: datetime) -> str:
    """The API's ISO-8601 'Z' string, always six fraction digits (plain isoformat() drops them at .000000)."""
    if moment.tzinfo is None:
        raise InvariantViolation("DB_TIME_NAIVE: a time without an offset cannot be written as UTC")
    return moment.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def alembic_config(url: str | None = None) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR).replace("%", "%%"))
    config.attributes["url"] = url
    return config


def head_revisions() -> frozenset[str]:
    return frozenset(ScriptDirectory.from_config(alembic_config()).get_heads())


def schema_revisions(connection: psycopg.Connection) -> frozenset[str]:
    if connection.execute("SELECT to_regclass('alembic_version')").fetchone()[0] is None:
        return frozenset()
    return frozenset(row[0] for row in connection.execute("SELECT version_num FROM alembic_version"))


def migrate(url: str, revision: str = "head") -> None:
    """Upgrade one database. Run by an operator or a test fixture, never by the engine (D2)."""
    command.upgrade(alembic_config(url), revision)


def downgrade(url: str, revision: str) -> None:
    command.downgrade(alembic_config(url), revision)

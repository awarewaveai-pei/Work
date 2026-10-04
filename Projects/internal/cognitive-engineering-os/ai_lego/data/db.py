"""PostgreSQL for the engine: one connection pool per region, one transaction per unit of work (docs/platform/
STORAGE_SWITCH.md D1, D2, D4, D6). psycopg 3, no ORM. The schema belongs to Alembic (ai_lego/data/migrations): the
engine never migrates by itself, it refuses to run on a region whose schema is not at head (``require_schema_at_head``).
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from psycopg.conninfo import conninfo_to_dict
from psycopg.pq import TransactionStatus
from psycopg_pool import ConnectionPool

from ai_lego.errors import InvariantViolation

DATABASE_URLS_ENV = "COGNITIVE_OS_DATABASE_URLS"
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


def _configure(connection: psycopg.Connection) -> None:
    # A time string without an offset is then read as UTC, not as the server's zone.
    connection.execute("SET TIME ZONE 'UTC'")


class Databases:
    """One pool per region. Build it once per process (``from_env``) and ``close`` it at shutdown."""

    def __init__(self, urls: Mapping[str, str], *, min_size: int = 1, max_size: int = 10) -> None:
        if not urls:
            raise InvariantViolation(f"DB_URLS_MISSING: no region configured ({DATABASE_URLS_ENV})")
        # autocommit: every transaction is an explicit connection.transaction() block, nothing is left open between them.
        self._pools = {
            region: ConnectionPool(url, min_size=min_size, max_size=max_size, kwargs={"autocommit": True}, configure=_configure,
                                   check=ConnectionPool.check_connection, name=f"cognitive-db-{region}", open=True)
            for region, url in urls.items()
        }

    @classmethod
    def from_env(cls, environ: Mapping[str, str] = os.environ, *, min_size: int = 1, max_size: int = 10) -> Databases:
        value = environ.get(DATABASE_URLS_ENV, "").strip()
        if not value:
            raise InvariantViolation(f"DB_URLS_MISSING: {DATABASE_URLS_ENV} is not set (region=postgresql://...,region=postgresql://...)")
        return cls(parse_database_urls(value), min_size=min_size, max_size=max_size)

    def regions(self) -> tuple[str, ...]:
        return tuple(sorted(self._pools))

    def _pool(self, region: str) -> ConnectionPool:
        pool = self._pools.get(region)
        if pool is None:
            raise InvariantViolation(f"DB_REGION_UNKNOWN: {region!r} (configured: {', '.join(self.regions())})")
        return pool

    @contextmanager
    def transaction(self, region: str) -> Iterator[psycopg.Connection]:
        """One pooled connection, one transaction: committed when the block ends, rolled back when it raises."""
        with self._pool(region).connection() as connection, connection.transaction():
            yield connection

    def require_schema_at_head(self, region: str) -> None:
        with self.transaction(region) as connection:
            current = schema_revisions(connection)
        heads = head_revisions()
        if current != heads:
            raise InvariantViolation(
                f"DB_SCHEMA_BEHIND: region {region!r} is at {sorted(current) or 'no revision'}, head is {sorted(heads)} -- "
                "run the migration (ai_lego.data.db.migrate) first; the engine never migrates by itself"
            )

    def close(self) -> None:
        for pool in self._pools.values():
            pool.close()

    def __enter__(self) -> Databases:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()


def advisory_xact_lock(connection: psycopg.Connection, *parts: str) -> None:
    """Wait for the lock named by ``parts`` (first part = the kind of thing locked, e.g. "events"). It is held until
    the transaction ends; two names sharing a 64-bit hash only wait for each other, never interleave wrongly."""
    if connection.info.transaction_status != TransactionStatus.INTRANS:
        raise InvariantViolation("DB_LOCK_OUTSIDE_TRANSACTION: an advisory xact lock taken outside a transaction is released at once")
    if not parts or any(LOCK_KEY_SEPARATOR in part for part in parts):
        raise InvariantViolation("DB_LOCK_KEY_INVALID: a lock is named by one or more parts, none containing the separator")
    connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (LOCK_KEY_SEPARATOR.join(parts),))


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

"""A real PostgreSQL for tests (docs/platform/STORAGE_SWITCH.md D3; never SQLite as a stand-in).

The server is ``COGNITIVE_OS_TEST_DATABASE_URL`` (a role allowed to CREATE DATABASE) when set, otherwise one throwaway
Docker container per test process, removed at exit. A template database is migrated to head once; every
``PgTestCase`` class gets its own copy (CREATE DATABASE ... TEMPLATE), dropped after the class. With neither a URL nor a
working Docker, the classes are skipped and the reason is printed: they did not pass, they did not run.

Tests of one class share its database: each test makes its own tenant (a fresh id), and a test that needs empty tables
calls ``empty_tables``. A tenant id a unit test makes up is routed with ``add_tenant`` (the directory line only).
"""

from __future__ import annotations

import atexit
import os
import secrets
import shutil
import subprocess
import sys
import time
import unittest
from unittest import mock
from urllib.parse import quote, urlencode

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from ai_lego.data.db import DATABASE_URLS_ENV, Databases, migrate

TEST_DATABASE_URL_ENV = "COGNITIVE_OS_TEST_DATABASE_URL"
REQUIRE_POSTGRES_ENV = "COGNITIVE_OS_REQUIRE_POSTGRES"
IMAGE = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"
CONTAINER_PREFIX = "cos-db-test-"
READY_TIMEOUT_S = 90


class PgServer:
    def __init__(self, admin_url: str) -> None:
        self.admin_url = admin_url
        self.template: str | None = None

    def url(self, database: str) -> str:
        return make_conninfo(self.admin_url, dbname=database)

    def _admin(self, statement: sql.Composable) -> None:
        with psycopg.connect(self.admin_url, autocommit=True) as connection:
            connection.execute(statement)

    def create_database(self, *, migrated: bool = True) -> str:
        """A fresh database: a copy of the migrated template, or (``migrated=False``) empty, without even alembic_version."""
        name = f"cos_test_{secrets.token_hex(6)}"
        source = self.template if migrated else "template0"
        self._admin(sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(sql.Identifier(name), sql.Identifier(source)))
        return name

    def drop_database(self, name: str) -> None:
        self._admin(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))

    def prepare_template(self) -> None:
        name = self.create_database(migrated=False)
        atexit.register(self.drop_database, name)
        migrate(self.url(name))
        self.template = name


_server: PgServer | None = None
_unavailable: str | None = None


def _docker_problem() -> str | None:
    if shutil.which("docker") is None:
        return "docker is not on PATH"
    try:
        probe = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"], capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return "the docker daemon did not answer within 30 s"
    if probe.returncode != 0:
        return f"the docker daemon does not answer ({(probe.stderr.strip().splitlines() or ['no message'])[-1]})"
    return None


def _docker(*args: str, timeout: int = 300) -> str:
    return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout, check=True).stdout.strip()


def _start_container() -> PgServer:
    name = CONTAINER_PREFIX + secrets.token_hex(4)
    password = secrets.token_urlsafe(18)
    # Removal is registered before anything can fail, so a container that never became ready still goes.
    atexit.register(subprocess.run, ["docker", "rm", "-f", "-v", name], capture_output=True, timeout=60)
    _docker("run", "-d", "--rm", "--name", name, "-e", f"POSTGRES_PASSWORD={password}", "-p", "127.0.0.1::5432", IMAGE)
    port = _docker("port", name, "5432/tcp").splitlines()[0].rsplit(":", 1)[1]
    url = f"postgresql://postgres:{password}@127.0.0.1:{port}/postgres"
    # Ready = a TCP login from here. The image's init phase runs a socket-only server, so pg_isready inside the
    # container says yes before the real server is up.
    deadline = time.monotonic() + READY_TIMEOUT_S
    while True:
        try:
            with psycopg.connect(url, connect_timeout=3) as connection:
                connection.execute("SELECT 1")
            return PgServer(url)
        except psycopg.OperationalError:
            if time.monotonic() > deadline:
                logs = subprocess.run(["docker", "logs", "--tail", "20", name], capture_output=True, text=True).stderr
                raise RuntimeError(f"PostgreSQL container {name} not ready after {READY_TIMEOUT_S} s:\n{logs}") from None
            time.sleep(0.5)


def server() -> PgServer:
    """The process's PostgreSQL server; fail in CI or skip with a reason on a laptop when unavailable."""
    global _server, _unavailable
    if _server is not None:
        return _server
    if _unavailable is not None:
        _raise_or_skip(_unavailable)
    external = os.environ.get(TEST_DATABASE_URL_ENV, "").strip()
    if external:
        candidate = PgServer(external)
    else:
        problem = _docker_problem()
        if problem is not None:
            _unavailable = f"NO POSTGRESQL: {TEST_DATABASE_URL_ENV} is unset and {problem} -- the PostgreSQL tests did NOT run"
            print(f"\n*** {_unavailable} ***", file=sys.stderr)
            _raise_or_skip(_unavailable)
        candidate = _start_container()
    candidate.prepare_template()
    _server = candidate
    return _server


def _raise_or_skip(reason: str) -> None:
    if os.environ.get(REQUIRE_POSTGRES_ENV) == "1":
        raise RuntimeError(f"{REQUIRE_POSTGRES_ENV}=1: {reason}")
    raise unittest.SkipTest(reason)


class PgTestCase(unittest.TestCase):
    """Each class gets ``cls.pg`` (the server), ``cls.url`` (its own migrated database) and ``cls.databases``
    (a ``Databases`` with that database as region ``REGION``). For the class's duration COGNITIVE_OS_DATABASE_URLS names
    that database too, so code that reads the environment (a command line, the integrity check) uses it."""

    REGION = "test"

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.pg = server()
        database = cls.pg.create_database()
        cls.addClassCleanup(cls.pg.drop_database, database)
        cls.url = cls.pg.url(database)
        cls.databases = Databases({cls.REGION: cls.url})
        cls.addClassCleanup(cls.databases.close)
        cls.enterClassContext(mock.patch.dict(os.environ, cls.database_urls()))

    @classmethod
    def database_urls(cls) -> dict[str, str]:
        """``COGNITIVE_OS_DATABASE_URLS`` naming this class's database, for code that reads the environment."""
        return {DATABASE_URLS_ENV: f"{cls.REGION}={as_url(cls.url)}"}


def as_url(conninfo: str) -> str:
    """A key=value connection string as the postgresql:// URL that COGNITIVE_OS_DATABASE_URLS takes."""
    parts = conninfo_to_dict(conninfo)
    user, password, host, port, dbname = (parts.pop(key, None) for key in ("user", "password", "host", "port", "dbname"))
    auth = quote(user or "", safe="") + (":" + quote(password, safe="") if password else "")
    address = (host or "localhost") + (f":{port}" if port else "")
    return f"postgresql://{auth + '@' if auth else ''}{address}/{quote(dbname or '', safe='')}" + (f"?{urlencode(parts)}" if parts else "")


def add_tenant(databases: Databases, tenant_id: str, region: str | None = None) -> str:
    """Route a tenant id a unit test made up (no tenant row): its line in the directory, nothing else."""
    with databases.transaction(databases.directory_region) as connection:
        Databases.add_to_directory(connection, tenant_id, region or databases.directory_region)
    return tenant_id


def empty_tables(databases: Databases, region: str | None = None) -> None:
    """Every table of the region empty (alembic_version kept), for a test that counts rows a class-mate may have left."""
    with databases.transaction(region or databases.directory_region) as connection:
        tables = [row[0] for row in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'alembic_version'")]
        connection.execute("TRUNCATE " + ", ".join(f'"{table}"' for table in tables) + " RESTART IDENTITY")


def dump(databases: Databases, region: str | None = None) -> list[str]:
    """Every row of every table of the region as text, one line per row: "the content is gone from the database" is that
    no line holds it. Rows only -- unlike SQLite with secure_delete, PostgreSQL keeps a deleted row's bytes in its data
    files until a vacuum reuses the space (STORAGE_SWITCH.md "Erasure and the bytes on disk")."""
    with databases.transaction(region or databases.directory_region) as connection:
        tables = [row[0] for row in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename")]
        return [f"{table}: {row[0]}" for table in tables for row in connection.execute(f'SELECT t::text FROM "{table}" t')]

"""Bring every configured region's database to the Alembic head -- the one explicit migration step (STORAGE_SWITCH.md D2:
the engine refuses a database that is not at head and never migrates by itself). Run from the engine image on the
database's network, with ``COGNITIVE_OS_DATABASE_URLS`` in the environment (deploy.sh and install-cognitive-db.sh do)::

    python -m ai_lego.apps.cli.migrate_db            # upgrade to head; prints each region's revision before and after
    python -m ai_lego.apps.cli.migrate_db --check    # change nothing; exit 0 = every region is at head, 1 = one is behind
    python -m ai_lego.apps.cli.migrate_db --head     # print the revision(s) this code expects; needs no database

A migration runs in one transaction (ai_lego/data/migrations/env.py): a failure leaves the database at its old revision.
Nothing printed here carries a connection string.
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg

from ai_lego.data.db import DATABASE_URLS_ENV, head_revisions, migrate, parse_database_urls, schema_revisions
from ai_lego.errors import InvariantViolation


def revisions(url: str) -> frozenset[str]:
    with psycopg.connect(url, autocommit=True) as connection:
        return schema_revisions(connection)


def describe(error: psycopg.Error) -> str:
    """Safe to print: the class and SQLSTATE always. A connection failure (unreachable, wrong password, no such database)
    adds libpq's first line, which never carries the password; any other error's text can quote a row."""
    text = f"{type(error).__name__} (SQLSTATE {error.sqlstate})"
    lines = str(error).strip().splitlines() if isinstance(error, psycopg.OperationalError) else []
    return f"{text}: {lines[0]}" if lines else text


def label(found: frozenset[str]) -> str:
    return ",".join(sorted(found)) or "none"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="change nothing; exit 1 when a region is behind head")
    mode.add_argument("--head", action="store_true", help="print the head revision(s) of this code and exit")
    args = parser.parse_args(argv)
    heads = head_revisions()
    if args.head:
        print(label(heads))
        return 0
    value = os.environ.get(DATABASE_URLS_ENV, "").strip()
    try:
        if not value:
            raise InvariantViolation(f"DB_URLS_MISSING: {DATABASE_URLS_ENV} is not set (region=postgresql://...)")
        urls = parse_database_urls(value)
        behind = False
        for region, url in urls.items():
            before = revisions(url)
            if before == heads:
                print(f"region {region}: at head {label(heads)}")
                continue
            if args.check:
                print(f"region {region}: at {label(before)}, head is {label(heads)}")
                behind = True
                continue
            migrate(url)
            after = revisions(url)
            print(f"region {region}: {label(before)} -> {label(after)}")
            if after != heads:
                raise InvariantViolation(f"DB_MIGRATION_INCOMPLETE: region {region!r} is at {label(after)}, head is {label(heads)}")
        return 1 if behind else 0
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 2
    except psycopg.Error as error:
        print(f"FAIL: DATABASE: {describe(error)}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

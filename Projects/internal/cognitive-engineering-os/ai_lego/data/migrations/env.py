"""Alembic environment, online only: ``ai_lego.data.db.migrate(url)`` hands the database URL over in
``config.attributes["url"]``; a migration always runs against the database it changes, in one transaction."""

from __future__ import annotations

import psycopg
from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from ai_lego.errors import InvariantViolation

url = context.config.attributes.get("url")
if context.is_offline_mode() or not url:
    raise InvariantViolation("DB_MIGRATION_URL_MISSING: run migrations through ai_lego.data.db.migrate(url), online")

# SQLAlchemy only because Alembic runs on it (D1). The URL goes straight to psycopg, never through SQLAlchemy's URL
# parser, so a password holding '@', '%' or ':' arrives intact.
engine = create_engine("postgresql+psycopg://", creator=lambda: psycopg.connect(url), poolclass=NullPool)
try:
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
finally:
    engine.dispose()

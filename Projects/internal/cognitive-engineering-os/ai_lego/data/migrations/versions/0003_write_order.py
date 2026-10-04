"""The order rows were written in, where the engine read SQLite's rowid for it (docs/platform/STORAGE_SWITCH.md
"Conventions"): events (a person's or a case's records across their aggregates, in the order written) and workspace
(a tenant's workspaces in the order made). A time cannot stand in: two rows can share one, and a host clock can step
back. Within one aggregate the order is still ``sequence``; write_order agrees with it there (an append takes the
aggregate's lock, so the next one is numbered after it commits).

The data move inserts each SQLite table's rows in rowid order and lets the identity number them (never copies a value
in), so the moved order is the SQLite order.
"""

from __future__ import annotations

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_TABLES = ("events", "workspace")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN write_order bigint GENERATED ALWAYS AS IDENTITY")


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN write_order")

"""The tenant directory (docs/platform/STORAGE_SWITCH.md D6, invariant 4): tenant -> region, the only cross-region table.

Read only in the first region's database (ai_lego.data.db.Databases.directory_region); every region carries the same
schema, so the table exists empty in the others. It holds no personal data: a tenant id and a region name. The data move
writes one line per tenant from the SQLite tenant table (its data_residency_region mapped to a configured region).
"""

from __future__ import annotations

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TABLE tenant_directory (tenant_id text PRIMARY KEY, region text NOT NULL)")


def downgrade() -> None:
    op.execute("DROP TABLE tenant_directory")

"""Research exports (docs/platform/STEP34_SHARED_RULES.md §10, card 31): one row per export of a study -- when, and the
hash of its manifest -- so the next export counts the consents withdrawn in between. No identity, no content. Named
0005 in the card (0005-0006 were taken by groups and invitations); 0007 is left to COLLAB's card, so at merge this
revision's down_revision becomes the last one on main.
"""

from __future__ import annotations

from alembic import op

revision = "0008"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE research_exports (
            tenant_id text NOT NULL,
            study_id text NOT NULL CHECK (char_length(btrim(study_id)) BETWEEN 1 AND 200),
            exported_at timestamptz NOT NULL,
            manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
            PRIMARY KEY (tenant_id, study_id, exported_at)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE research_exports")

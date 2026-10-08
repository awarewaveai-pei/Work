"""Who brought an account in (docs/platform/STEP34_SHARED_RULES.md §4, card 12): an identity made by accepting an invitation
names the inviter, in the same tenant. Read by nothing but GOVERN's account-flooding rule; emptied when either account is
erased (IdentityStore.delete_identity_on). Named 0003 in the card; 0002-0005 were taken.
"""

from __future__ import annotations

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE identity ADD COLUMN invited_by text")
    op.execute("ALTER TABLE identity ADD CONSTRAINT fk_identity_invited_by FOREIGN KEY (tenant_id, invited_by) REFERENCES identity (tenant_id, identity_id)")


def downgrade() -> None:
    op.execute("ALTER TABLE identity DROP CONSTRAINT fk_identity_invited_by")
    op.execute("ALTER TABLE identity DROP COLUMN invited_by")

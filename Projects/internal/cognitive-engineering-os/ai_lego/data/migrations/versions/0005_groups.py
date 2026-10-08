"""The group (docs/platform/STEP34_SHARED_RULES.md §2; named 0002_groups there -- 0002-0004 were taken by the storage
port, STORAGE_SWITCH.md "Locks"): the owner of the records a few people write together, its members, its invitations
and the one granted role. Every row carries tenant_id and every foreign key includes it, so a group never holds a
member, an inviter or a workspace of another tenant (residency is per tenant).

Table            Written by (ai_lego/...)                                   Notes
  platform_groups  data/repositories/project_source_repository.py            status 'erased' keeps the row (name emptied) so a
                                                                             late writer gets GROUP_ERASED, never a new group
  group_members    project_source_repository.py (create, add, leave, erase)   review_state: §4's held account (pending_review)
  group_invites    project_source_repository.py (card 12)                    only sha256(token) is stored
  identity_roles   apps/cli/grant_role.py (card 13)                          one live grant per (identity, role)

identity and workspace gain UNIQUE (tenant_id, <id>): the target of the tenant-scoped foreign keys (the id alone was
already unique, so no row can violate it).
"""

from __future__ import annotations

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

ROLES = "'convener', 'participant', 'facilitator'"

_STATEMENTS = (
    "ALTER TABLE identity ADD CONSTRAINT uq_identity_tenant UNIQUE (tenant_id, identity_id)",
    "ALTER TABLE workspace ADD CONSTRAINT uq_workspace_tenant UNIQUE (tenant_id, workspace_id)",
    """
    CREATE TABLE platform_groups (
        group_id text PRIMARY KEY,
        tenant_id text NOT NULL,
        workspace_id text NOT NULL,
        purpose text NOT NULL CHECK (purpose IN ('decision', 'class', 'workshop', 'research')),
        name text NOT NULL CHECK (char_length(name) <= 120 AND (status = 'erased' OR char_length(btrim(name)) >= 1)),
        created_by_identity_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('open', 'closed', 'erased')),
        created_at timestamptz NOT NULL,
        closed_at timestamptz,
        CONSTRAINT uq_platform_groups_tenant UNIQUE (tenant_id, group_id),
        FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspace (tenant_id, workspace_id),
        FOREIGN KEY (tenant_id, created_by_identity_id) REFERENCES identity (tenant_id, identity_id)
    )
    """,
    f"""
    CREATE TABLE group_members (
        group_id text NOT NULL,
        tenant_id text NOT NULL,
        identity_id text NOT NULL,
        role text NOT NULL CHECK (role IN ({ROLES})),
        joined_at timestamptz NOT NULL,
        left_at timestamptz,
        review_state text NOT NULL DEFAULT 'confirmed' CHECK (review_state IN ('confirmed', 'pending_review')),
        PRIMARY KEY (group_id, identity_id),
        FOREIGN KEY (tenant_id, group_id) REFERENCES platform_groups (tenant_id, group_id),
        FOREIGN KEY (tenant_id, identity_id) REFERENCES identity (tenant_id, identity_id)
    )
    """,
    "CREATE INDEX ix_group_members_identity ON group_members (tenant_id, identity_id)",
    f"""
    CREATE TABLE group_invites (
        invite_id text PRIMARY KEY,
        tenant_id text NOT NULL,
        group_id text NOT NULL,
        role text NOT NULL CHECK (role IN ({ROLES})),
        token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{{64}}$'),
        inviter_identity_id text NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        used_by_identity_id text,
        revoked_at timestamptz,
        CHECK ((used_at IS NULL) = (used_by_identity_id IS NULL)),
        FOREIGN KEY (tenant_id, group_id) REFERENCES platform_groups (tenant_id, group_id),
        FOREIGN KEY (tenant_id, inviter_identity_id) REFERENCES identity (tenant_id, identity_id),
        FOREIGN KEY (tenant_id, used_by_identity_id) REFERENCES identity (tenant_id, identity_id)
    )
    """,
    "CREATE INDEX ix_group_invites_group ON group_invites (tenant_id, group_id)",
    """
    CREATE TABLE identity_roles (
        tenant_id text NOT NULL,
        identity_id text NOT NULL,
        role text NOT NULL CHECK (role IN ('appeal_handler')),
        granted_by text NOT NULL CHECK (char_length(btrim(granted_by)) >= 1),
        granted_at timestamptz NOT NULL,
        revoked_at timestamptz,
        PRIMARY KEY (tenant_id, identity_id, role, granted_at),
        FOREIGN KEY (tenant_id, identity_id) REFERENCES identity (tenant_id, identity_id)
    )
    """,
    "CREATE UNIQUE INDEX uq_identity_roles_live ON identity_roles (tenant_id, identity_id, role) WHERE revoked_at IS NULL",
)

# Children before parents; the two constraints last (the foreign keys above depend on them).
_DOWN = (
    "DROP TABLE identity_roles",
    "DROP TABLE group_invites",
    "DROP TABLE group_members",
    "DROP TABLE platform_groups",
    "ALTER TABLE workspace DROP CONSTRAINT uq_workspace_tenant",
    "ALTER TABLE identity DROP CONSTRAINT uq_identity_tenant",
)


def upgrade() -> None:
    for statement in _STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in _DOWN:
        op.execute(statement)

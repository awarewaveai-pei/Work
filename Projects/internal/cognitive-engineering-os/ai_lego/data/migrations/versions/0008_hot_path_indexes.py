"""Indexes for the filters the capacity rig (ops/load-test, 2026-10-12) and the code show to be read tenant-wide or by address:

* ai_usage (tenant_id, used_at): every AI reservation sums today's rows of the tenant (IdentityStore.reserve_ai_usage_for, under the
  tenant's ai-usage lock) -- a scan of the tenant's whole usage history without it.
* ai_usage (tenant_id, identity_id, used_at): one person's use (ai_usage_totals(identity_id=...), the erasure UPDATE).
* identity (email) WHERE status = 'active': every login without a tenant (authenticate_anywhere) and the most-accounts-per-address
  count (a GROUP BY over every active identity, once per login: authenticate_anywhere pads to its result so timing never says how many
  tenants an address is in) look an address up across tenants; identity's unique key leads with tenant_id, so each was a scan of every identity.
  With the index the count is an index-only ordered scan and stays exact; a per-process copy of it was tried and dropped (a stale copy
  makes an address in more tenants than the copy remembers cost one hash more than an unknown one).
* platform_projects (tenant_id, created_by_identity_id, created_at, project_id): every GET /projects, /me/reminders and govern export reads one
  person's cases (list_projects(created_by=...)); the existing index leads with workspace_id, so each was a scan of the tenant's every case
  (capacity rig 2026-10-12, pg_stat_user_tables: 4833 sequential scans, 9.7 M rows read in one 4-minute run of 1000 people).
* events (tenant_id, payload_json->>'interpretation_id') WHERE that is not null: interpretation_events reads one interpretation's
  lifecycle by an id inside the payload; without it each poll scans the tenant's event stream. Partial: only the few interpretation
  events pay for it, not every saved document.

Plain CREATE INDEX, not CONCURRENTLY: a migration runs in one transaction (migrations/env.py) and deploy.sh runs it with the API stopped.
Named 0008; the COLLAB card's "0008" (STEP34_CHECKLIST.md) takes the next free number, as 0003-0007 did before it.
"""

from __future__ import annotations

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_INDEXES = (
    "CREATE INDEX ix_ai_usage_tenant_used ON ai_usage (tenant_id, used_at)",
    "CREATE INDEX ix_ai_usage_person_used ON ai_usage (tenant_id, identity_id, used_at)",
    "CREATE INDEX ix_identity_email_active ON identity (email) WHERE status = 'active'",
    "CREATE INDEX ix_platform_projects_creator ON platform_projects (tenant_id, created_by_identity_id, created_at, project_id)",
    "CREATE INDEX ix_events_interpretation ON events (tenant_id, (payload_json->>'interpretation_id')) WHERE (payload_json->>'interpretation_id') IS NOT NULL",
)


def upgrade() -> None:
    for statement in _INDEXES:
        op.execute(statement)


def downgrade() -> None:
    for statement in reversed(_INDEXES):
        op.execute("DROP INDEX " + statement.split()[2])

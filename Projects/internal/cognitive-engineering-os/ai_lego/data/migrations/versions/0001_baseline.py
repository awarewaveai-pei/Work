"""Baseline: the 19 tables the engine kept in SQLite on 2026-10-04, same names, same column order (docs/platform/
STORAGE_SWITCH.md D4, D5, invariant 1). tests/unit/test_pg_foundation.py compares it with the SQLite text itself.

Type rules (every table)
  TEXT ..._at     -> timestamptz   D4: microseconds; the SQLite text had second ties. Exception: prov_sources.published_at
                                   stays text -- a citation's own printed date ("2019", "Spring 2020"), not a moment.
  TEXT ..._json   -> jsonb         D5. jsonb keeps neither key order nor spacing: hash the value, never the stored text.
  INTEGER         -> bigint        SQLite's INTEGER is 64-bit. entitlement_audit.granted stays 0/1 (store.py writes int()).
  INTEGER PRIMARY KEY AUTOINCREMENT -> bigint identity   the data move copies the ids, then must setval() the sequence.
  BLOB            -> bytea
  TEXT ids        -> text          D5: the uuid strings the API already returns.

SQLite source                                    table                     changes beyond the rules
  data/events/record_log.py (projects.sqlite3    events                    the two files' events tables become one
    and custom_workflows.sqlite3)                                          (aggregate ids carry a project:/source:/
                                                                           custom_workflow: prefix); UNIQUE named
                                                                           uq_events_aggregate_sequence (invariant 1)
  data/object/derived_artifact_cache.py          derived_artifact_cache    -
  data/repositories/custom_workflow_repository   custom_workflows          -
  data/repositories/project_source_repository    platform_projects, prov_sources, project_interpretations,
                                                 project_syntheses, project_reports, collection_runs
                                                                           collection_runs.deadline_at has no DEFAULT:
                                                                           the 1970 default only served ALTER on old files
  platform/identity/store.py                     tenant, workspace, identity, identity_credential, session,
                                                 password_reset_token, handoff_code, collect_grant, entitlement_audit,
                                                 ai_usage                  -
Foreign keys are the SQLite ones (enforced there with PRAGMA foreign_keys = ON). The SQLite text has no CHECK.
"""

from __future__ import annotations

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# op.execute wraps the text in sqlalchemy text(): a ':word' in a statement is a bind parameter (write '\:word').
_TABLES = (
    """
    CREATE TABLE events (
        event_id text PRIMARY KEY,
        tenant_id text NOT NULL,
        aggregate_id text NOT NULL,
        sequence bigint NOT NULL,
        event_type text NOT NULL,
        occurred_at timestamptz NOT NULL,
        schema_version text NOT NULL,
        correlation_id text NOT NULL,
        causation_id text,
        payload_json jsonb NOT NULL,
        author text,
        author_identity_id text,
        block text,
        owner_kind text,
        owner_id text,
        CONSTRAINT uq_events_aggregate_sequence UNIQUE (tenant_id, aggregate_id, sequence)
    )
    """,
    "CREATE INDEX ix_events_owner ON events (tenant_id, owner_kind, owner_id)",
    """
    CREATE TABLE derived_artifact_cache (
        tenant_id text NOT NULL,
        source_sha256 text NOT NULL,
        capability_ref text NOT NULL,
        adapter_version text NOT NULL,
        cas_path_json jsonb NOT NULL,
        artifact_sha256 text NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz,
        PRIMARY KEY (tenant_id, source_sha256, capability_ref, adapter_version)
    )
    """,
    """
    CREATE TABLE custom_workflows (
        tenant_id text NOT NULL,
        workflow_id text NOT NULL,
        title text NOT NULL,
        method_ids_json jsonb NOT NULL,
        created_by_identity_id text NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        PRIMARY KEY (tenant_id, workflow_id)
    )
    """,
    "CREATE INDEX ix_custom_workflows_tenant ON custom_workflows (tenant_id, updated_at, workflow_id)",
    """
    CREATE TABLE platform_projects (
        tenant_id text NOT NULL,
        project_id text NOT NULL,
        workspace_id text NOT NULL,
        name text NOT NULL,
        purpose text NOT NULL,
        data_classification text NOT NULL,
        status text NOT NULL,
        version bigint NOT NULL,
        created_by_identity_id text NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (tenant_id, project_id),
        UNIQUE (tenant_id, workspace_id, created_by_identity_id, name)
    )
    """,
    "CREATE INDEX ix_platform_projects_workspace ON platform_projects (tenant_id, workspace_id, created_at, project_id)",
    """
    CREATE TABLE prov_sources (
        tenant_id text NOT NULL,
        project_id text NOT NULL,
        source_id text NOT NULL,
        title text NOT NULL,
        media_type text NOT NULL,
        data_classification text NOT NULL,
        content_sha256 text NOT NULL,
        size_bytes bigint NOT NULL,
        artifact_uri_json jsonb NOT NULL,
        content_role text NOT NULL,
        verification_status text NOT NULL,
        status text NOT NULL,
        version bigint NOT NULL,
        created_by_identity_id text NOT NULL,
        created_at timestamptz NOT NULL,
        cas_path_json jsonb NOT NULL,
        doi text,
        authors_json jsonb,
        venue text,
        published_at text,
        canonical_url text,
        source_uri text,
        fetched_at timestamptz,
        provenance_json jsonb,
        source_class text,
        relevance_json jsonb,
        supersedes_source_id text,
        PRIMARY KEY (tenant_id, project_id, source_id),
        FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
    )
    """,
    "CREATE INDEX ix_prov_sources_project ON prov_sources (tenant_id, project_id, created_at, source_id)",
    "CREATE UNIQUE INDEX ux_prov_sources_active_canonical ON prov_sources (tenant_id, project_id, canonical_url) "
    "WHERE status = 'active' AND canonical_url IS NOT NULL",
    """
    CREATE TABLE project_interpretations (
        tenant_id text NOT NULL,
        project_id text NOT NULL,
        interpretation_id text NOT NULL,
        artifact_reference_json jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (tenant_id, interpretation_id),
        FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
    )
    """,
    "CREATE INDEX ix_project_interpretations_project ON project_interpretations (tenant_id, project_id, created_at)",
    """
    CREATE TABLE project_syntheses (
        tenant_id text NOT NULL,
        project_id text NOT NULL,
        synthesis_id text NOT NULL,
        kind text NOT NULL,
        artifact_reference_json jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (tenant_id, synthesis_id),
        FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
    )
    """,
    "CREATE INDEX ix_project_syntheses_project ON project_syntheses (tenant_id, project_id, created_at)",
    """
    CREATE TABLE project_reports (
        tenant_id text NOT NULL,
        project_id text NOT NULL,
        report_id text NOT NULL,
        artifact_reference_json jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (tenant_id, report_id),
        FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
    )
    """,
    "CREATE INDEX ix_project_reports_project ON project_reports (tenant_id, project_id, created_at)",
    """
    CREATE TABLE collection_runs (
        tenant_id text NOT NULL,
        project_id text NOT NULL,
        run_id text NOT NULL,
        status text NOT NULL,
        seeds_json jsonb NOT NULL,
        budget_json jsonb NOT NULL,
        requested_by_identity_id text NOT NULL,
        requested_at timestamptz NOT NULL,
        deadline_at timestamptz NOT NULL,
        completed_at timestamptz,
        report_json jsonb,
        PRIMARY KEY (tenant_id, run_id),
        FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
    )
    """,
    """
    CREATE TABLE tenant (
        tenant_id text PRIMARY KEY,
        legal_name text NOT NULL,
        status text NOT NULL,
        home_jurisdiction text NOT NULL,
        data_residency_region text NOT NULL,
        encryption_root_key_ref text NOT NULL,
        created_at timestamptz NOT NULL,
        deleted_at timestamptz
    )
    """,
    """
    CREATE TABLE workspace (
        workspace_id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenant (tenant_id),
        name text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        UNIQUE (tenant_id, name)
    )
    """,
    """
    CREATE TABLE identity (
        identity_id text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenant (tenant_id),
        email text NOT NULL,
        display_name text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        UNIQUE (tenant_id, email)
    )
    """,
    """
    CREATE TABLE identity_credential (
        identity_id text PRIMARY KEY REFERENCES identity (identity_id),
        password_hash bytea NOT NULL,
        password_salt bytea NOT NULL,
        iterations bigint NOT NULL
    )
    """,
    """
    CREATE TABLE session (
        session_token text PRIMARY KEY,
        identity_id text NOT NULL REFERENCES identity (identity_id),
        tenant_id text NOT NULL REFERENCES tenant (tenant_id),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL
    )
    """,
    """
    CREATE TABLE password_reset_token (
        reset_id text PRIMARY KEY,
        identity_id text NOT NULL REFERENCES identity (identity_id),
        token_hash text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
    )
    """,
    """
    CREATE TABLE handoff_code (
        code_hash text PRIMARY KEY,
        identity_id text NOT NULL REFERENCES identity (identity_id),
        tenant_id text NOT NULL REFERENCES tenant (tenant_id),
        redirect_path text NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
    )
    """,
    """
    CREATE TABLE collect_grant (
        grant_ref text PRIMARY KEY,
        tenant_id text NOT NULL REFERENCES tenant (tenant_id),
        project_id text NOT NULL,
        run_id text NOT NULL,
        collector_identity_id text NOT NULL REFERENCES identity (identity_id),
        scope text NOT NULL DEFAULT 'source.ingest',
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        token_hash text UNIQUE,
        exchanged_at timestamptz,
        closed_at timestamptz
    )
    """,
    """
    CREATE TABLE entitlement_audit (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL,
        capability_id text NOT NULL,
        granted bigint NOT NULL,
        checked_at timestamptz NOT NULL
    )
    """,
    """
    CREATE TABLE ai_usage (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        tenant_id text NOT NULL,
        identity_id text NOT NULL,
        purpose text NOT NULL,
        model text NOT NULL,
        input_tokens bigint NOT NULL,
        output_tokens bigint NOT NULL,
        used_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'settled',
        run_id text
    )
    """,
)

# Children before parents.
_DROP_ORDER = (
    "ai_usage", "entitlement_audit", "collect_grant", "handoff_code", "password_reset_token", "session", "identity_credential",
    "identity", "workspace", "tenant", "collection_runs", "project_reports", "project_syntheses", "project_interpretations",
    "prov_sources", "platform_projects", "custom_workflows", "derived_artifact_cache", "events",
)


def upgrade() -> None:
    for statement in _TABLES:
        op.execute(statement)


def downgrade() -> None:
    for table in _DROP_ORDER:
        op.execute(f"DROP TABLE {table}")

-- The SQLite schema the engine kept until 2026-10-04 (git a76af28da), frozen when the storage moved to PostgreSQL
-- (docs/platform/STORAGE_SWITCH.md). Every CREATE TABLE / CREATE INDEX the source then held, each table under the file
-- that created it. Two readers: tests/unit/test_pg_foundation.py compares the baseline migration with it, and the
-- SQLite -> PostgreSQL data move reads the old files by it. Never edited: the SQLite files it describes no longer change.

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    identity_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    used_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'settled',
    run_id TEXT
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS collect_grant (
    grant_ref TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    collector_identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    scope TEXT NOT NULL DEFAULT 'source.ingest',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    token_hash TEXT UNIQUE,
    exchanged_at TEXT,
    closed_at TEXT
);

-- ai_lego/data/repositories/project_source_repository.py
CREATE TABLE IF NOT EXISTS collection_runs (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    seeds_json TEXT NOT NULL,
    budget_json TEXT NOT NULL,
    requested_by_identity_id TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    completed_at TEXT,
    report_json TEXT,
    PRIMARY KEY (tenant_id, run_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);

-- ai_lego/data/repositories/custom_workflow_repository.py
CREATE TABLE IF NOT EXISTS custom_workflows (
    tenant_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    title TEXT NOT NULL,
    method_ids_json TEXT NOT NULL,
    created_by_identity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, workflow_id)
);
CREATE INDEX IF NOT EXISTS ix_custom_workflows_tenant ON custom_workflows (tenant_id, updated_at, workflow_id);

-- ai_lego/data/object/derived_artifact_cache.py
CREATE TABLE IF NOT EXISTS derived_artifact_cache (
    tenant_id TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    capability_ref TEXT NOT NULL,
    adapter_version TEXT NOT NULL,
    cas_path_json TEXT NOT NULL,
    artifact_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    PRIMARY KEY (tenant_id, source_sha256, capability_ref, adapter_version)
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS entitlement_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    granted INTEGER NOT NULL,
    checked_at TEXT NOT NULL
);

-- ai_lego/data/events/record_log.py
CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT,
    payload_json TEXT NOT NULL,
    author TEXT,
    author_identity_id TEXT,
    block TEXT,
    owner_kind TEXT,
    owner_id TEXT,
    UNIQUE (tenant_id, aggregate_id, sequence)
);
CREATE INDEX IF NOT EXISTS ix_events_owner ON events (tenant_id, owner_kind, owner_id);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS handoff_code (
    code_hash TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    redirect_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS identity (
    identity_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(tenant_id, email)
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS identity_credential (
    identity_id TEXT PRIMARY KEY REFERENCES identity(identity_id),
    password_hash BLOB NOT NULL,
    password_salt BLOB NOT NULL,
    iterations INTEGER NOT NULL
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS password_reset_token (
    reset_id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);

-- ai_lego/data/repositories/project_source_repository.py
CREATE TABLE IF NOT EXISTS platform_projects (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    data_classification TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_by_identity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, project_id),
    UNIQUE (tenant_id, workspace_id, created_by_identity_id, name)
);
CREATE INDEX IF NOT EXISTS ix_platform_projects_workspace ON platform_projects (tenant_id, workspace_id, created_at, project_id);

-- ai_lego/data/repositories/project_source_repository.py
CREATE TABLE IF NOT EXISTS project_interpretations (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    interpretation_id TEXT NOT NULL,
    artifact_reference_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, interpretation_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);
CREATE INDEX IF NOT EXISTS ix_project_interpretations_project ON project_interpretations (tenant_id, project_id, created_at);

-- ai_lego/data/repositories/project_source_repository.py
CREATE TABLE IF NOT EXISTS project_reports (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    report_id TEXT NOT NULL,
    artifact_reference_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, report_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);
CREATE INDEX IF NOT EXISTS ix_project_reports_project ON project_reports (tenant_id, project_id, created_at);

-- ai_lego/data/repositories/project_source_repository.py
CREATE TABLE IF NOT EXISTS project_syntheses (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    synthesis_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    artifact_reference_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, synthesis_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);
CREATE INDEX IF NOT EXISTS ix_project_syntheses_project ON project_syntheses (tenant_id, project_id, created_at);

-- ai_lego/data/repositories/project_source_repository.py
CREATE TABLE IF NOT EXISTS prov_sources (
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    media_type TEXT NOT NULL,
    data_classification TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    artifact_uri_json TEXT NOT NULL,
    content_role TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_by_identity_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cas_path_json TEXT NOT NULL,
    doi TEXT,
    authors_json TEXT,
    venue TEXT,
    published_at TEXT,
    canonical_url TEXT,
    source_uri TEXT,
    fetched_at TEXT,
    provenance_json TEXT,
    source_class TEXT,
    relevance_json TEXT,
    supersedes_source_id TEXT,
    PRIMARY KEY (tenant_id, project_id, source_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES platform_projects (tenant_id, project_id)
);
CREATE INDEX IF NOT EXISTS ix_prov_sources_project ON prov_sources (tenant_id, project_id, created_at, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_prov_sources_active_canonical ON prov_sources (tenant_id, project_id, canonical_url) WHERE status = 'active' AND canonical_url IS NOT NULL;

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS session (
    session_token TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS tenant (
    tenant_id TEXT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    status TEXT NOT NULL,
    home_jurisdiction TEXT NOT NULL,
    data_residency_region TEXT NOT NULL,
    encryption_root_key_ref TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

-- ai_lego/platform/identity/store.py
CREATE TABLE IF NOT EXISTS workspace (
    workspace_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(tenant_id, name)
);

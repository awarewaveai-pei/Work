export type PackageInstallRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "rolled_back";

export type PackageInstallRunInsertSpec = {
  id: string;
  organizationId: string;
  workspaceId: string;
  siteId: string;
  environmentId: string;
  packageVersionId: string;
  manifestId: string;
  workflowRunId: string | null;
  triggeredByUserId: string | null;
  triggeredByAgentId?: string | null;
  status: PackageInstallRunStatus;
  resultSummary: Record<string, unknown>;
  logsRef: string | null;
  rollbackRunId: string | null;
  metadata: Record<string, unknown>;
};

export function buildPackageInstallRunInsertSql(spec: PackageInstallRunInsertSpec) {
  const columns = [
    "id",
    "organization_id",
    "workspace_id",
    "site_id",
    "environment_id",
    "package_version_id",
    "manifest_id",
    "workflow_run_id",
    "triggered_by_user_id",
    "triggered_by_agent_id",
    "status",
    "result_summary",
    "logs_ref",
    "rollback_run_id",
    "metadata",
  ];

  const values = [
    `'${spec.id}'`,
    `'${spec.organizationId}'`,
    `'${spec.workspaceId}'`,
    `'${spec.siteId}'`,
    `'${spec.environmentId}'`,
    `'${spec.packageVersionId}'`,
    `'${spec.manifestId}'`,
    spec.workflowRunId ? `'${spec.workflowRunId}'` : "NULL",
    spec.triggeredByUserId ? `'${spec.triggeredByUserId}'` : "NULL",
    spec.triggeredByAgentId ? `'${spec.triggeredByAgentId}'` : "NULL",
    `'${spec.status}'`,
    `'${JSON.stringify(spec.resultSummary).replace(/'/g, "''")}'::jsonb`,
    spec.logsRef ? `'${spec.logsRef}'` : "NULL",
    spec.rollbackRunId ? `'${spec.rollbackRunId}'` : "NULL",
    `'${JSON.stringify(spec.metadata).replace(/'/g, "''")}'::jsonb`,
  ];

  return {
    sql: `insert into package_install_runs (${columns.join(", ")}) values (${values.join(
      ", "
    )}) returning id;`,
    spec,
  };
}

export function buildPackageInstallRunRow(spec: PackageInstallRunInsertSpec) {
  return {
    id: spec.id,
    organization_id: spec.organizationId,
    workspace_id: spec.workspaceId,
    site_id: spec.siteId,
    environment_id: spec.environmentId,
    package_version_id: spec.packageVersionId,
    manifest_id: spec.manifestId,
    workflow_run_id: spec.workflowRunId,
    triggered_by_user_id: spec.triggeredByUserId,
    triggered_by_agent_id: spec.triggeredByAgentId ?? null,
    status: spec.status,
    result_summary: spec.resultSummary,
    logs_ref: spec.logsRef,
    rollback_run_id: spec.rollbackRunId,
    metadata: spec.metadata,
  };
}



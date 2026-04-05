export type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "blocked" | "cancelled";

export type WorkflowRunInsertSpec = {
  id: string;
  workflowVersionId: string;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  siteId: string | null;
  environmentId: string | null;
  parentRunId: string | null;
  triggerType: string;
  triggerRef: string | null;
  actorType: "human" | "agent" | "webhook" | "schedule" | "system";
  actorRef: string | null;
  status: WorkflowRunStatus;
  riskLevel: "low" | "medium" | "high";
  riskLevelReason?: string;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  artifacts: unknown[];
};

/**
 * Phase 1: generate a safe SQL template for insert.
 * We intentionally do NOT execute it here.
 *
 * NOTE: Caller must parameterize execution in a real DB adapter.
 */
export function buildWorkflowRunInsertSql(spec: WorkflowRunInsertSpec) {
  const columns = [
    "id",
    "workflow_version_id",
    "organization_id",
    "workspace_id",
    "project_id",
    "site_id",
    "environment_id",
    "parent_run_id",
    "trigger_type",
    "trigger_ref",
    "actor_type",
    "actor_ref",
    "status",
    "risk_level",
    "input_snapshot",
    "output_snapshot",
    "artifacts",
  ];

  const values = [
    `'${spec.id}'`,
    `'${spec.workflowVersionId}'`,
    `'${spec.organizationId}'`,
    spec.workspaceId ? `'${spec.workspaceId}'` : "NULL",
    spec.projectId ? `'${spec.projectId}'` : "NULL",
    spec.siteId ? `'${spec.siteId}'` : "NULL",
    spec.environmentId ? `'${spec.environmentId}'` : "NULL",
    spec.parentRunId ? `'${spec.parentRunId}'` : "NULL",
    `'${spec.triggerType}'`,
    spec.triggerRef ? `'${spec.triggerRef}'` : "NULL",
    `'${spec.actorType}'`,
    spec.actorRef ? `'${spec.actorRef}'` : "NULL",
    `'${spec.status}'`,
    `'${spec.riskLevel}'`,
    `'${JSON.stringify(spec.inputSnapshot).replace(/'/g, "''")}'::jsonb`,
    `'${JSON.stringify(spec.outputSnapshot).replace(/'/g, "''")}'::jsonb`,
    `'${JSON.stringify(spec.artifacts).replace(/'/g, "''")}'::jsonb`,
  ];

  return {
    sql: `insert into workflow_runs (${columns.join(", ")}) values (${values.join(", ")}) returning id;`,
    spec,
  };
}

export function buildWorkflowRunRow(spec: WorkflowRunInsertSpec) {
  return {
    id: spec.id,
    workflow_version_id: spec.workflowVersionId,
    organization_id: spec.organizationId,
    workspace_id: spec.workspaceId,
    project_id: spec.projectId,
    site_id: spec.siteId,
    environment_id: spec.environmentId,
    parent_run_id: spec.parentRunId,
    trigger_type: spec.triggerType,
    trigger_ref: spec.triggerRef,
    actor_type: spec.actorType,
    actor_ref: spec.actorRef,
    status: spec.status,
    risk_level: spec.riskLevel,
    input_snapshot: spec.inputSnapshot,
    output_snapshot: spec.outputSnapshot,
    artifacts: spec.artifacts,
  };
}



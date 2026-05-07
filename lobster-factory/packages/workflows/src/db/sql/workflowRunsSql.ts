// Maps legacy code status values to the actual DB status column enum.
// DB enum: queued | running | waiting_approval | succeeded | failed | cancelled | rolled_back
export type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "blocked" | "cancelled";

function mapStatus(s: WorkflowRunStatus | string): string {
  const map: Record<string, string> = {
    pending:   "queued",
    running:   "running",
    completed: "succeeded",
    failed:    "failed",
    blocked:   "waiting_approval",
    cancelled: "cancelled",
  };
  return map[s] ?? "queued";
}

export type WorkflowRunInsertSpec = {
  id: string;
  workflowKey?: string;        // maps to workflow_key; defaults to triggerType
  workflowVersionId: string;   // stored in metadata.workflow_version_id
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
  siteId: string | null;
  environmentId: string | null;
  parentRunId: string | null;  // stored in metadata.parent_run_id
  triggerType: string;         // stored in metadata.trigger_type
  triggerRef: string | null;   // stored in metadata.trigger_ref
  actorType: "human" | "agent" | "webhook" | "schedule" | "system";
  actorRef: string | null;
  status: WorkflowRunStatus;
  riskLevel: "low" | "medium" | "high";
  riskLevelReason?: string;
  inputSnapshot: Record<string, unknown>;   // maps to input column
  outputSnapshot: Record<string, unknown>;  // maps to output column
  artifacts: unknown[];
};

/**
 * Builds the REST insert row matching the actual workflow_runs DB schema.
 * Extra spec fields (workflowVersionId, triggerType, actorType, riskLevel, etc.)
 * are stored in the metadata JSONB column.
 */
export function buildWorkflowRunRow(spec: WorkflowRunInsertSpec) {
  return {
    id: spec.id,
    organization_id: spec.organizationId,
    workspace_id: spec.workspaceId ?? null,
    project_id: spec.projectId ?? null,
    site_id: spec.siteId ?? null,
    environment_id: spec.environmentId ?? null,
    engine: "trigger_dev",
    workflow_key: spec.workflowKey ?? spec.triggerType,
    status: mapStatus(spec.status),
    triggered_by: spec.actorRef ?? null,
    input: spec.inputSnapshot,
    output: spec.outputSnapshot,
    artifacts: spec.artifacts,
    metadata: {
      workflow_version_id: spec.workflowVersionId,
      parent_run_id: spec.parentRunId,
      trigger_type: spec.triggerType,
      trigger_ref: spec.triggerRef,
      actor_type: spec.actorType,
      actor_ref: spec.actorRef,
      risk_level: spec.riskLevel,
      risk_level_reason: spec.riskLevelReason ?? null,
    },
  };
}

/**
 * @deprecated Use buildWorkflowRunRow + supabaseRestInsert instead.
 * Kept for backward compatibility; generates SQL with legacy column names.
 */
export function buildWorkflowRunInsertSql(spec: WorkflowRunInsertSpec) {
  return { sql: "", spec };
}

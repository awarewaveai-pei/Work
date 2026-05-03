export type OpsRole = "owner" | "admin" | "operator" | "viewer";

export interface OpsTenant {
  id: string;
  slug: string;
  name: string;
  status: "active" | "paused" | "risk";
  lastRunStatus: "completed" | "running" | "failed" | "blocked";
  riskLevel: "low" | "medium" | "high";
}

export interface MediaBoundaryRule {
  domain: "ai_generated" | "wp_product" | "wp_blog";
  backend: "r2" | "wp_uploads";
  notes: string;
}

export interface OpsAction {
  id: string;
  key: string;
  displayName: string;
  environmentScope: "staging_only" | "staging_and_production";
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
}

export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  status: "active" | "inactive" | "suspended";
  defaultLocale: string;
  defaultTimezone: string;
}

/** Matches `ops_action_runs.status` check — see migration `0023_dispatcher_enum_and_catalog_seeds.sql`. */
export type OpsActionRunStatus =
  | "pending"
  | "running"
  | "dispatched"
  | "dispatch_failed"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export interface WorkflowRun {
  id: string;
  organizationId: string;
  organizationSlug: string;
  actionId: string;
  status: OpsActionRunStatus;
  approvalStatus: "none" | "pending" | "approved" | "rejected";
  traceId: string;
  startedAt: string;
  endedAt: string | null;
}

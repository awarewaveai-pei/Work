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

export interface WorkflowRun {
  id: string;
  organizationId: string;
  organizationSlug: string;
  actionId: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked" | "cancelled";
  approvalStatus: "none" | "pending" | "approved" | "rejected";
  traceId: string;
  startedAt: string;
  endedAt: string | null;
}

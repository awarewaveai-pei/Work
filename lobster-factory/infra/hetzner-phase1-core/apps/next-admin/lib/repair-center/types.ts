import type { Incident, IncidentSource } from "@/lib/ops-inbox/types";

export type RepairPolicy = "auto_repair" | "analysis_only" | "human_only" | "triage_needed";

export type RepairRunState =
  | "detected"
  | "triage_needed"
  | "approved"
  | "backing_up"
  | "repairing"
  | "pr_ready"
  | "deploy_pending"
  | "deploying"
  | "rolled_back"
  | "resolved"
  | "human_only";

export type RepairBackupStatus = "not_started" | "running" | "passed" | "failed" | "skipped";
export type RepairDeployStatus = "not_started" | "pending_manual" | "running" | "passed" | "failed" | "rolled_back";

export interface RepairRun {
  id: string;
  incident_id: string;
  organization_id?: string | null;
  asset_id?: string | null;
  source: IncidentSource;
  client_slug: string | null;
  policy: RepairPolicy;
  state: RepairRunState;
  approved_by: string | null;
  approved_at: string | null;
  backup_status: RepairBackupStatus;
  backup_ref: string | null;
  backup_checked_at: string | null;
  backup_error: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  deploy_status: RepairDeployStatus;
  deploy_ref: string | null;
  deploy_checked_at: string | null;
  risk_level: "low" | "medium" | "high" | "critical";
  needs_human_review: boolean;
  audit_log: RepairAuditEntry[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface RepairAuditEntry {
  ts: string;
  actor: string;
  action: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface RepairIncident extends Incident {
  client_slug?: string | null;
}

export interface RepairRunWithIncident extends RepairRun {
  incident?: RepairIncident;
}

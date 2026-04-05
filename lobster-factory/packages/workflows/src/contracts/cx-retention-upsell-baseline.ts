export interface CxRetentionInput {
  organization_id: string;
  workspace_id: string;
  workflow_run_id?: string;
  health_score: number;
  trigger_type: "health_score" | "ticket";
}

export interface CxRetentionOutput {
  severity: "info" | "warning" | "critical";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  action_plan: Record<string, unknown>;
}

export function deriveRetentionPlan(input: CxRetentionInput): CxRetentionOutput {
  if (input.health_score < 30) {
    return {
      severity: "critical",
      status: "open",
      action_plan: { playbook: "rescue", sla_hours: 24, schedule_call: true },
    };
  }
  if (input.health_score < 50) {
    return {
      severity: "warning",
      status: "open",
      action_plan: { playbook: "retention", sla_hours: 72, proactive_email: true },
    };
  }
  return {
    severity: "info",
    status: "dismissed",
    action_plan: { monitor_only: true },
  };
}

export interface CxUpsellInput {
  organization_id: string;
  workspace_id: string;
  workflow_run_id?: string;
  source_type: "ticket" | "health_score" | "manual";
  score: number;
}

export interface CxUpsellOutput {
  status: "open" | "qualified";
  recommendation: Record<string, unknown>;
}

export function deriveUpsellRecommendation(input: CxUpsellInput): CxUpsellOutput {
  if (input.score >= 80) {
    return {
      status: "qualified",
      recommendation: { playbook: "upsell_outreach", proposal_template: "growth-pack" },
    };
  }
  return {
    status: "open",
    recommendation: { playbook: "monitor", next_review_days: 14 },
  };
}

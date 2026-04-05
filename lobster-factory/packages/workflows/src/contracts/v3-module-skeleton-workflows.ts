export interface V3WorkflowContract {
  module: "sales" | "marketing" | "partner" | "media" | "decision_engine" | "merchandising";
  workflow_name: string;
  trigger: string;
  input_shape: Record<string, string>;
  output_shape: Record<string, string>;
}

export const v3SkeletonContracts: V3WorkflowContract[] = [
  {
    module: "sales",
    workflow_name: "sales-lead-triage",
    trigger: "new lead captured",
    input_shape: { lead_id: "uuid", source: "string" },
    output_shape: { lead_score: "number", next_action: "string" },
  },
  {
    module: "marketing",
    workflow_name: "marketing-campaign-sync",
    trigger: "campaign status changed",
    input_shape: { campaign_id: "uuid", channel: "string" },
    output_shape: { sync_status: "string", alerts: "array" },
  },
  {
    module: "partner",
    workflow_name: "partner-referral-routing",
    trigger: "referral created",
    input_shape: { referral_id: "uuid", partner_name: "string" },
    output_shape: { assigned_owner: "string", status: "string" },
  },
  {
    module: "media",
    workflow_name: "media-asset-process",
    trigger: "asset uploaded",
    input_shape: { asset_id: "uuid", asset_type: "string" },
    output_shape: { processing_status: "string", storage_key: "string" },
  },
  {
    module: "decision_engine",
    workflow_name: "decision-score-refresh",
    trigger: "daily cron",
    input_shape: { workspace_id: "uuid", score_type: "string" },
    output_shape: { score_value: "number", recommendation_count: "number" },
  },
  {
    module: "merchandising",
    workflow_name: "merchandising-insight-generate",
    trigger: "catalog snapshot updated",
    input_shape: { workspace_id: "uuid", snapshot_at: "string" },
    output_shape: { insight_count: "number", top_priority: "string" },
  },
];

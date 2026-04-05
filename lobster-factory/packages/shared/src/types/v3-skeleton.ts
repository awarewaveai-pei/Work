export type V3ModuleName =
  | "sales"
  | "marketing"
  | "partner"
  | "media"
  | "decision_engine"
  | "merchandising";

export interface V3SkeletonRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  module: V3ModuleName;
  status: string;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface DecisionScoreInput {
  organization_id: string;
  workspace_id: string;
  score_type: string;
  score_value: number;
  context?: Record<string, unknown>;
}

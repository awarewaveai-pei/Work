export interface DecisionRecommendationInput {
  organization_id: string;
  workspace_id: string;
  score_type: string;
  score_value: number;
  context?: Record<string, unknown>;
}

export interface DecisionRecommendationOutput {
  recommendation_type: string;
  priority: "low" | "medium" | "high" | "critical";
  reason: Record<string, unknown>;
}

export function deriveBaselineRecommendation(
  input: DecisionRecommendationInput
): DecisionRecommendationOutput {
  if (input.score_type === "churn_risk" && input.score_value >= 70) {
    return {
      recommendation_type: "retention_intervention",
      priority: "critical",
      reason: { threshold: "churn_risk>=70", score: input.score_value },
    };
  }

  if (input.score_type === "upsell_score" && input.score_value >= 80) {
    return {
      recommendation_type: "upsell_outreach",
      priority: "high",
      reason: { threshold: "upsell_score>=80", score: input.score_value },
    };
  }

  return {
    recommendation_type: "monitor",
    priority: "medium",
    reason: { score_type: input.score_type, score: input.score_value },
  };
}

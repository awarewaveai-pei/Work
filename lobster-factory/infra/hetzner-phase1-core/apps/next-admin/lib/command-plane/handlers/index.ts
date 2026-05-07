// Phase 1 handler registry. Add new low-risk handlers here.
// Handler keys MUST match policyEngine RISK_TABLE keys.

import type { CommandHandler } from "../commandRouter";
import { statusHandler } from "./status";
import { healthHandler } from "./health";
import { dailyReviewHandler } from "./dailyReview";
import { weeklyReviewHandler } from "./weeklyReview";
import { listFailedRunsHandler } from "./listFailedRuns";

export const phase1Handlers: Record<string, CommandHandler> = {
  "/status": statusHandler,
  "/health": healthHandler,
  "/daily_review": dailyReviewHandler,
  "/weekly_review": weeklyReviewHandler,
  "/list_failed_runs": listFailedRunsHandler,
};

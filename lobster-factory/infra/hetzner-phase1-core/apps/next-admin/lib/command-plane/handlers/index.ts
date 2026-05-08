// Phase 1 handler registry. Add new low-risk handlers here.
// Handler keys MUST match policyEngine RISK_TABLE keys.

import type { CommandHandler } from "../commandRouter";
import { startHandler } from "./start";
import { statusHandler } from "./status";
import { healthHandler } from "./health";
import { dailyReviewHandler } from "./dailyReview";
import { weeklyReviewHandler } from "./weeklyReview";
import { listFailedRunsHandler } from "./listFailedRuns";
import { setSystemModeHandler } from "./systemModeControl";

export const phase1Handlers: Record<string, CommandHandler> = {
  "/start": startHandler,
  "/help": startHandler,
  "/status": statusHandler,
  "/health": healthHandler,
  "/daily_review": dailyReviewHandler,
  "/weekly_review": weeklyReviewHandler,
  "/list_failed_runs": listFailedRunsHandler,
  // Phase 2a — kill-switch ENABLE (medium risk; unlock requires SSO/SQL).
  "/emergency_stop":   setSystemModeHandler("emergency_stop"),
  "/maintenance_mode": setSystemModeHandler("maintenance"),
  "/read_only_mode":   setSystemModeHandler("read_only"),
};

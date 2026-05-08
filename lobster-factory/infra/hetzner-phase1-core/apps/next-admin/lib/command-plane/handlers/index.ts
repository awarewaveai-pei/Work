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
import { triggerWorkflowHandler } from "./triggerWorkflow";
import { replayDeadLetterHandler } from "./replayDeadLetter";
import { normalModeHandler } from "./normalMode";

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
  // Phase 2b — Trigger.dev medium-risk dispatch (workflow kick-off + DLQ diag).
  "/trigger_staging_workflow": triggerWorkflowHandler,
  "/replay_dead_letter":       replayDeadLetterHandler,
  // Phase 2c — kill-switch UNLOCK (high-risk; ops console approval only).
  // Registered here so the approval API can look it up; Telegram source is
  // hard-blocked from high-risk commands by policyEngine, so this entry is
  // not reachable from Telegram even though it appears in the registry.
  "/normal_mode":      normalModeHandler,
};

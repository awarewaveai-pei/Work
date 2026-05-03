/**
 * Dispatcher: ops_action_runs → Trigger.dev durable workflows.
 *
 * This task is triggered by a Trigger.dev scheduled job (or a Supabase webhook).
 * It polls for pending ops_action_runs records and routes each one to the
 * correct durable workflow based on action_key.
 *
 * Action key → workflow mapping:
 *   ops.profile-a.ao-infrastructure-check → ao-infrastructure-check
 *   ops.profile-b.create-wp-site           → create-wp-site
 *   ops.profile-c.adopt-client-os           → adopt-client-os
 */

import { task, tasks, logger, schedules } from "@trigger.dev/sdk";
import { z } from "zod";
import { supabaseRestQuery, supabaseRestPatch } from "../db/supabase/supabaseRestInsert";
import { captureWorkflowEvent } from "../observability/posthog";
import { captureWorkflowException } from "../observability/sentry";

// ─────────────────────────────────────────────
// Action key → Trigger.dev task ID mapping
// ─────────────────────────────────────────────
const ACTION_KEY_TO_TASK_ID: Record<string, string> = {
  "ops.profile-a.ao-infrastructure-check": "ao-infrastructure-check",
  "ops.profile-b.create-wp-site":          "create-wp-site",
  "ops.profile-c.adopt-client-os":         "adopt-client-os",
};

// Shape of an ops_action_runs row (only fields we need)
const ActionRunSchema = z.object({
  id:              z.string().uuid(),
  action_key:      z.string(),
  organization_id: z.string().uuid().nullish(),
  input_snapshot:  z.record(z.unknown()).default({}),
  status:          z.string(),
  trace_id:        z.string().nullish(),
});

type ActionRun = z.infer<typeof ActionRunSchema>;

// ─────────────────────────────────────────────
// Helper: get Supabase credentials from env
// ─────────────────────────────────────────────
function getSupabaseCreds() {
  const supabaseUrl     = process.env.LOBSTER_SUPABASE_URL || "";
  const serviceRoleKey  = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl, serviceRoleKey };
}

// ─────────────────────────────────────────────
// Mark a run as dispatched or failed
// ─────────────────────────────────────────────
async function updateRunStatus(
  creds: ReturnType<typeof getSupabaseCreds>,
  runId: string,
  status: "dispatched" | "dispatch_failed" | "running",
  extra: Record<string, unknown> = {}
) {
  await supabaseRestPatch(
    creds,
    "ops_action_runs",
    runId,
    { status, updated_at: new Date().toISOString(), ...extra },
    { traceId: `dispatcher-${runId}` }
  );
}

// ─────────────────────────────────────────────
// Dispatch a single action run
// ─────────────────────────────────────────────
async function dispatchRun(creds: ReturnType<typeof getSupabaseCreds>, run: ActionRun) {
  const taskId = ACTION_KEY_TO_TASK_ID[run.action_key];
  if (!taskId) {
    logger.warn("dispatcher: unknown action_key, skipping", { runId: run.id, actionKey: run.action_key });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      dispatch_error: `unknown action_key: ${run.action_key}`,
    });
    return;
  }

  // Mark as running before triggering so a crash doesn't leave it in 'queued'
  await updateRunStatus(creds, run.id, "running");

  const triggerPayload = {
    ...run.input_snapshot,
    _dispatchedFromActionRunId: run.id,
    _traceId: run.trace_id,
  };

  try {
    const handle = await tasks.trigger(taskId, triggerPayload);
    logger.info("dispatcher: triggered task", {
      runId: run.id,
      taskId,
      triggerId: handle.id,
    });
    await updateRunStatus(creds, run.id, "dispatched", {
      trigger_run_id: handle.id,
    });
    captureWorkflowEvent("dispatcher dispatched", {
      actionRunId: run.id,
      actionKey: run.action_key,
      taskId,
      triggerId: handle.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("dispatcher: trigger failed", { runId: run.id, taskId, error: message });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      dispatch_error: message,
    });
    captureWorkflowException(err, {
      workflowId: "dispatch-action-run",
      route: "dispatchRun",
      runId: run.id,
      taskId,
    });
  }
}

// ─────────────────────────────────────────────
// Main dispatcher task (triggered on-demand or by schedule)
// ─────────────────────────────────────────────
export const dispatchActionRun = task({
  id: "dispatch-action-run",
  run: async (payload: unknown) => {
    const creds = getSupabaseCreds();

    // Fetch pending queued runs (max 10 per invocation to stay within time limits)
    const rows = await supabaseRestQuery(
      creds,
      "ops_action_runs",
      { status: "eq.queued", limit: 10, order: "created_at.asc" }
    );

    const runs = z.array(ActionRunSchema).parse(rows ?? []);

    if (runs.length === 0) {
      logger.info("dispatcher: no pending action runs");
      return { dispatched: 0 };
    }

    logger.info(`dispatcher: found ${runs.length} queued run(s)`);

    let dispatched = 0;
    for (const run of runs) {
      await dispatchRun(creds, run);
      dispatched++;
    }

    return { dispatched, total: runs.length };
  },
});

// ─────────────────────────────────────────────
// Scheduled dispatcher — polls every 30 seconds
// ─────────────────────────────────────────────
export const dispatchActionRunSchedule = schedules.task({
  id: "dispatch-action-run-schedule",
  cron: "*/1 * * * *",   // every minute; for real-time use webhook trigger instead
  run: async () => {
    return tasks.trigger("dispatch-action-run", {});
  },
});

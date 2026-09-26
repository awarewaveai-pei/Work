/**
 * Dispatcher: ops_action_runs → Trigger.dev durable workflows.
 *
 * Polls for pending ops_action_runs records and routes each one to the
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
import { checkOrgSystemMode } from "../lib/systemMode";
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
  id:               z.string().uuid(),
  action_key:       z.string().optional(),   // joined from ops_action_catalog if needed
  action_id:        z.string().uuid(),
  organization_id:  z.string().uuid().nullish(),
  input_payload:    z.record(z.unknown()).default({}),  // correct column name
  status:           z.string(),
  trace_id:         z.string().nullish(),
  metadata:         z.record(z.unknown()).default({}),
  approval_required: z.boolean().default(false),
  approval_status:   z.string().default("none"),
});

type ActionRun = z.infer<typeof ActionRunSchema>;

// ─────────────────────────────────────────────
// Helper: get Supabase credentials from env
// ─────────────────────────────────────────────
function getSupabaseCreds() {
  const supabaseUrl    = process.env.LOBSTER_SUPABASE_URL || "";
  const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl, serviceRoleKey };
}

// ─────────────────────────────────────────────
// Lookup action_key from ops_action_catalog
// ─────────────────────────────────────────────
async function resolveActionKey(
  creds: ReturnType<typeof getSupabaseCreds>,
  actionId: string
): Promise<string | null> {
  try {
    const rows = await supabaseRestQuery(creds, "ops_action_catalog", {
      id: `eq.${actionId}`,
      select: "action_key",
      limit: 1,
    });
    const row = rows[0] as Record<string, unknown> | undefined;
    return typeof row?.action_key === "string" ? row.action_key : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Mark a run as dispatched or failed
// ─────────────────────────────────────────────
async function updateRunStatus(
  creds: ReturnType<typeof getSupabaseCreds>,
  runId: string,
  status: "running" | "dispatched" | "dispatch_failed",
  extra: Record<string, unknown> = {}
) {
  await supabaseRestPatch(
    creds,
    "ops_action_runs",
    runId,
    { status, ...extra },
    { traceId: `dispatcher-${runId}` }
  );
}

/**
 * M10: atomic claim. Transition pending → running ONLY if the row is still pending.
 * Two concurrent dispatcher invocations can fetch the same pending row (the poll
 * filter is `status=eq.pending`); the conditional PATCH (`WHERE id=X AND status=pending`)
 * is evaluated atomically by Postgres row-locking, so exactly one wins. The loser gets
 * an empty representation and skips — preventing double `tasks.trigger`.
 * Returns true if this caller claimed the run.
 */
async function claimPendingRun(
  creds: ReturnType<typeof getSupabaseCreds>,
  runId: string
): Promise<boolean> {
  const rep = await supabaseRestPatch(
    creds,
    "ops_action_runs",
    runId,
    { status: "running" },
    { traceId: `dispatcher-claim-${runId}`, match: { status: "eq.pending" } }
  );
  return Array.isArray(rep) && rep.length > 0;
}

// ─────────────────────────────────────────────
// Dispatch a single action run
// ─────────────────────────────────────────────
async function dispatchRun(creds: ReturnType<typeof getSupabaseCreds>, run: ActionRun) {
  // Defence-in-depth: block approval-gated runs even if the DB filter somehow missed them.
  if (run.approval_required && run.approval_status !== "approved") {
    logger.warn("dispatcher: run blocked by approval gate", {
      id: run.id,
      approval_required: run.approval_required,
      approval_status: run.approval_status,
    });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      error_summary: "approval_gate_blocked: run requires approval before dispatch",
    });
    return;
  }

  // Resolve action_key from metadata (set by Build Console) or look up from catalog
  const actionKeyFromMeta =
    typeof run.metadata?.action_key === "string" ? run.metadata.action_key : null;
  const actionKey = actionKeyFromMeta ?? (await resolveActionKey(creds, run.action_id));

  if (!actionKey) {
    logger.warn("dispatcher: could not resolve action_key, skipping", { runId: run.id });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      error_summary: "could not resolve action_key from catalog",
    });
    return;
  }

  const taskId = ACTION_KEY_TO_TASK_ID[actionKey];
  if (!taskId) {
    logger.warn("dispatcher: unknown action_key, skipping", { runId: run.id, actionKey });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      error_summary: `unknown action_key: ${actionKey}`,
    });
    return;
  }

  // System-mode gate, re-checked here (not only at enqueue in NA/app/api/build/runs/route.ts):
  // a run queued while the org's mode was "normal" must not execute after it flips to something
  // else. A blocked run must NOT stay "pending" -- that would just execute the moment the mode
  // flips back, silently ignoring the operator's intent. Finish it now, the same way every other
  // guard clause above does.
  const gate = await checkOrgSystemMode(creds, run.organization_id ?? null);
  if (gate.blocks) {
    logger.warn("dispatcher: run blocked by system mode", { runId: run.id, mode: gate.mode });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      error_summary: `system_mode_blocks_change: ${gate.mode}`,
    });
    return;
  }

  // M10: atomic claim (pending → running) before triggering. If a concurrent
  // dispatcher already claimed this run, skip — do not double-trigger.
  const claimed = await claimPendingRun(creds, run.id);
  if (!claimed) {
    logger.info("dispatcher: run already claimed by another dispatcher, skipping", {
      runId: run.id,
    });
    return;
  }

  // Build trigger payload: merge input_payload + dispatcher metadata
  const triggerPayload = {
    ...run.input_payload,
    _dispatchedFromActionRunId: run.id,
    _traceId: run.trace_id,
    _actionKey: actionKey,
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
      actionKey,
      taskId,
      triggerId: handle.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("dispatcher: trigger failed", { runId: run.id, taskId, error: message });
    await updateRunStatus(creds, run.id, "dispatch_failed", {
      error_summary: message,
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

    // Fetch pending runs that are either pre-approval-not-required or already approved.
    // Runs with approval_required=true AND approval_status != 'approved' are excluded.
    const rows = await supabaseRestQuery(
      creds,
      "ops_action_runs",
      {
        status: "eq.pending",
        or: "(approval_required.eq.false,approval_status.eq.approved)",
        limit: 10,
        order: "started_at.asc",
      }
    );

    const runs = z.array(ActionRunSchema).parse(rows ?? []);

    if (runs.length === 0) {
      logger.info("dispatcher: no pending action runs");
      return { dispatched: 0 };
    }

    logger.info(`dispatcher: found ${runs.length} pending run(s)`);

    let dispatched = 0;
    for (const run of runs) {
      await dispatchRun(creds, run);
      dispatched++;
    }

    return { dispatched, total: runs.length };
  },
});

// ─────────────────────────────────────────────
// Safety-net dispatcher — backstop only, NOT the primary path.
// Primary dispatch is on-demand: every ops_action_runs enqueue calls
// kickActionRunDispatcher() (lib/kick-dispatcher.ts) → immediate dispatch
// (verified HTTP 200 in prod, WORKLOG 2026-06-25). This schedule only catches
// the rare case a kick fails (Trigger restart / network blip / token issue),
// so an enqueued action is never silently stuck. Cadence cut */1 → */10 on
// 2026-06-25: the every-minute poll spawned ~1,440 no-op runner containers/day
// (queue usually empty); */10 keeps the no-stuck-action guarantee at 1/10th the
// idle container churn. Do NOT remove entirely — that reintroduces a single
// point of failure on the kick.
// ─────────────────────────────────────────────
export const dispatchActionRunSchedule = schedules.task({
  id: "dispatch-action-run-schedule",
  cron: "*/10 * * * *",
  run: async () => {
    return tasks.trigger("dispatch-action-run", {});
  },
});

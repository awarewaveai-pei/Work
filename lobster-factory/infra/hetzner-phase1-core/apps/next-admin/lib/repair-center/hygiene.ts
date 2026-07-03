// Closed-loop hygiene (Auto-Repair A3, 2026-07-03).
//
// 1. autoVerifyRunsOnDeploySuccess — when the VPS auto-deploy script reports
//    deploy_success for an app, repair runs sitting in deploy_pending/deploying
//    for that service are verified and resolved. The deploy script itself ran
//    the health + smoke gates (sg-deploy.sh), so deploy_success IS the health
//    signal — no second probe, no guessing.
// 2. reapStaleRuns — a run stuck mid-pipeline (backing_up / approved /
//    deploying) or an ops_action_runs row stuck "running" after a process kill
//    is flagged back to human attention instead of rotting as "in progress"
//    forever. The reaper NEVER moves anything to a terminal state on its own —
//    repair runs go back to triage_needed; only action runs (pure audit rows)
//    are closed as failed.
//
// Both are deterministic, idempotent, and safe to call repeatedly from any
// heartbeat (deploy webhook, manual route, future cron).

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAudit } from "./audit";
import type { RepairRun } from "./types";

/** Pipeline states that are transient by design — minutes, not days. */
export const TRANSIENT_STATES = ["backing_up", "approved", "deploying"] as const;
export const DEFAULT_REPAIR_STALE_HOURS = 6;
export const DEFAULT_ACTION_STALE_HOURS = 2;

export function staleCutoffIso(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

export interface AutoVerifyResult {
  ok: boolean;
  verified: number;
  runIds: string[];
  error?: string;
}

/**
 * Resolve deploy-stage repair runs for `app` after a successful deploy.
 * Matching is strict: the run's own incident must belong to the same service.
 */
export async function autoVerifyRunsOnDeploySuccess(
  supabase: SupabaseClient,
  args: { app: string; deployedCommit?: string; actor?: string },
): Promise<AutoVerifyResult> {
  try {
    const { data, error } = await supabase
      .from("repair_runs")
      .select("*")
      .in("state", ["deploy_pending", "deploying"])
      .is("archived_at", null)
      .limit(20);
    if (error) return { ok: false, verified: 0, runIds: [], error: error.message };

    const rows = (data ?? []) as RepairRun[];
    // Two-step service match (no FK-name coupling): run → its incident's service.
    const incidentIds = [...new Set(rows.map((r) => r.incident_id))];
    const serviceById = new Map<string, string | null>();
    if (incidentIds.length > 0) {
      const { data: incidents } = await supabase
        .from("ops_incidents")
        .select("id,service")
        .in("id", incidentIds);
      for (const inc of (incidents ?? []) as Array<{ id: string; service: string | null }>) {
        serviceById.set(inc.id, inc.service);
      }
    }
    const matching = rows.filter((r) => (serviceById.get(r.incident_id) ?? null) === args.app);
    const runIds: string[] = [];

    for (const run of matching) {
      const { error: updErr } = await supabase
        .from("repair_runs")
        .update({
          state: "resolved",
          deploy_status: "passed",
          deploy_checked_at: new Date().toISOString(),
          ...(args.deployedCommit ? { deploy_ref: args.deployedCommit } : {}),
          audit_log: appendAudit(run.audit_log, {
            actor: args.actor ?? "system",
            action: "auto_verified_by_deploy",
            detail: `sg-deploy reported deploy_success for ${args.app} (health + smoke gates passed on the VPS).`,
            data: { deployed_commit: args.deployedCommit ?? null },
          }),
        })
        .eq("id", run.id)
        .in("state", ["deploy_pending", "deploying"]); // concurrency guard: only if still in a deploy state
      if (!updErr) runIds.push(run.id);
    }
    return { ok: true, verified: runIds.length, runIds };
  } catch (e) {
    return { ok: false, verified: 0, runIds: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ReaperResult {
  ok: boolean;
  repair_runs_flagged: number;
  action_runs_closed: number;
  error?: string;
}

/**
 * Flag stale mid-pipeline repair runs back to triage_needed and close stale
 * "running" ops_action_runs rows as failed. Uses updated_at for repair runs
 * (touch trigger since migration 0027) and started_at for action runs.
 */
export async function reapStaleRuns(
  supabase: SupabaseClient,
  opts?: { repairStaleHours?: number; actionStaleHours?: number },
): Promise<ReaperResult> {
  const repairCutoff = staleCutoffIso(opts?.repairStaleHours ?? DEFAULT_REPAIR_STALE_HOURS);
  const actionCutoff = staleCutoffIso(opts?.actionStaleHours ?? DEFAULT_ACTION_STALE_HOURS);
  const result: ReaperResult = { ok: true, repair_runs_flagged: 0, action_runs_closed: 0 };

  try {
    const { data, error } = await supabase
      .from("repair_runs")
      .select("id,state,updated_at,audit_log")
      .in("state", [...TRANSIENT_STATES])
      .lt("updated_at", repairCutoff)
      .is("archived_at", null)
      .limit(50);
    if (error) {
      result.ok = false;
      result.error = error.message;
    } else {
      for (const run of (data ?? []) as Array<Pick<RepairRun, "id" | "state" | "audit_log"> & { updated_at: string }>) {
        const { error: updErr } = await supabase
          .from("repair_runs")
          .update({
            state: "triage_needed",
            needs_human_review: true,
            audit_log: appendAudit(run.audit_log, {
              actor: "system",
              action: "reaper_flagged_stale",
              detail: `Run sat in transient state "${run.state}" past the staleness ceiling — likely process kill or lost callback. Returned to triage.`,
            }),
          })
          .eq("id", run.id)
          .eq("state", run.state); // concurrency guard: skip if it moved meanwhile
        if (!updErr) result.repair_runs_flagged += 1;
      }
    }
  } catch (e) {
    result.ok = false;
    result.error = e instanceof Error ? e.message : String(e);
  }

  try {
    const { data, error } = await supabase
      .from("ops_action_runs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", actionCutoff)
      .limit(100);
    if (!error) {
      for (const row of (data ?? []) as Array<{ id: string }>) {
        const { error: updErr } = await supabase
          .from("ops_action_runs")
          .update({
            status: "failed",
            error_summary: "reaper: stale running row (process killed or stream aborted before finish)",
            ended_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("status", "running");
        if (!updErr) result.action_runs_closed += 1;
      }
    } else if (result.ok) {
      result.ok = false;
      result.error = error.message;
    }
  } catch (e) {
    if (result.ok) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }
  }

  return result;
}

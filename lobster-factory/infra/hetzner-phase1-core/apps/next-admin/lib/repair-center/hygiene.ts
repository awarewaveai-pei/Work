// Closed-loop hygiene (Auto-Repair A3, 2026-07-03).
//
// 1. noteDeploySuccessOnPendingRuns — when the VPS auto-deploy script reports
//    deploy_success for an app, annotate repair runs sitting in
//    deploy_pending/deploying for that service with an audit note. It does NOT
//    auto-resolve: the deploy cron fires on ANY push to a service, not only the
//    fix's merge commit, and the run does not record the fix commit — so
//    resolving on a service match would falsely close a loop and claim
//    verification that never happened. The operator confirms via the existing
//    「確認部署」button once they know the deploy included the fix.
// 2. reapStaleRuns — a run stuck mid-pipeline or an ops_action_runs row stuck
//    "running" after a process kill is flagged back to human attention instead
//    of rotting as "in progress" forever. The reaper NEVER moves a repair run
//    to a terminal state — it returns them to triage_needed; only action runs
//    (pure audit rows) are closed as failed.
//
// Both are deterministic, idempotent, and safe to call repeatedly from any
// heartbeat (deploy webhook, manual route, future cron).

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAudit } from "./audit";
import type { RepairRun } from "./types";

// Fast mid-pipeline states: transitions that should take minutes. A run parked
// here past the ceiling means a lost callback or a killed process.
export const FAST_TRANSIENT_STATES = ["approved", "deploying"] as const;
// backing_up runs a synchronous two-VPS backup; give it a much longer ceiling
// so a legitimately slow backup is never reaped out from under its own
// completion write.
export const BACKUP_STATE = "backing_up" as const;
export const DEFAULT_FAST_STALE_HOURS = 6;
export const DEFAULT_BACKUP_STALE_HOURS = 12;
export const DEFAULT_ACTION_STALE_HOURS = 2;

export function staleCutoffIso(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

export interface NoteDeployResult {
  ok: boolean;
  annotated: number;
  runIds: string[];
  error?: string;
}

/**
 * Annotate (NOT resolve) deploy-stage repair runs for `app` after a successful
 * deploy. Matching is by service; resolution stays with the human because a
 * service-scoped deploy signal cannot prove the specific fix shipped.
 */
export async function noteDeploySuccessOnPendingRuns(
  supabase: SupabaseClient,
  args: { app: string; deployedCommit?: string; actor?: string },
): Promise<NoteDeployResult> {
  try {
    const { data, error } = await supabase
      .from("repair_runs")
      .select("*")
      .in("state", ["deploy_pending", "deploying"])
      .is("archived_at", null)
      .limit(100);
    if (error) return { ok: false, annotated: 0, runIds: [], error: error.message };

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
          audit_log: appendAudit(run.audit_log, {
            actor: args.actor ?? "system",
            action: "deploy_success_observed",
            detail: `sg-deploy reported deploy_success for ${args.app}. If this deploy included the fix, confirm via 確認部署 to close the run. NOT auto-resolved (deploy is service-scoped, not commit-matched).`,
            data: { deployed_commit: args.deployedCommit ?? null },
          }),
        })
        .eq("id", run.id)
        .in("state", ["deploy_pending", "deploying"]); // concurrency guard: only if still in a deploy state
      if (!updErr) runIds.push(run.id);
    }
    return { ok: true, annotated: runIds.length, runIds };
  } catch (e) {
    return { ok: false, annotated: 0, runIds: [], error: e instanceof Error ? e.message : String(e) };
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
  opts?: { fastStaleHours?: number; backupStaleHours?: number; actionStaleHours?: number },
): Promise<ReaperResult> {
  const actionCutoff = staleCutoffIso(opts?.actionStaleHours ?? DEFAULT_ACTION_STALE_HOURS);
  const result: ReaperResult = { ok: true, repair_runs_flagged: 0, action_runs_closed: 0 };

  // Two ceilings: fast mid-pipeline states at 6h; backing_up at 12h so a
  // legitimately slow two-VPS backup is never reaped out from under its own
  // completion write.
  const tiers: Array<{ states: string[]; cutoff: string }> = [
    { states: [...FAST_TRANSIENT_STATES], cutoff: staleCutoffIso(opts?.fastStaleHours ?? DEFAULT_FAST_STALE_HOURS) },
    { states: [BACKUP_STATE], cutoff: staleCutoffIso(opts?.backupStaleHours ?? DEFAULT_BACKUP_STALE_HOURS) },
  ];

  for (const tier of tiers) {
    try {
      const { data, error } = await supabase
        .from("repair_runs")
        .select("id,state,updated_at,audit_log")
        .in("state", tier.states)
        .lt("updated_at", tier.cutoff)
        .is("archived_at", null)
        .limit(50);
      if (error) {
        result.ok = false;
        result.error = error.message;
        continue;
      }
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
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }
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

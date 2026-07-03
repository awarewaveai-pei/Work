// Generic ops_action_runs recorder (2026-07-03).
//
// Single write path for every feature that audits work into ops_action_runs
// (wp-update plugin maintenance, remediation executor, future actions).
// Contract:
//   - Fail-open: recording failure must NEVER break the action being recorded.
//   - Catalog self-seed: if the action_key has no ops_action_catalog row yet
//     (migration not applied), an identical row is upserted idempotently so
//     recording works on first deploy. Keep seed values in sync with the
//     corresponding migration file.
//   - Callers begin a run (status=running) and MUST finish it on every
//     terminal path they control; rows orphaned by process kills are closed by
//     reapStaleRuns (lib/repair-center/hygiene.ts).

import { getSupabaseWriteClient } from "@/lib/supabase-server";

export interface OpsActionSeed {
  actionKey: string;
  displayName: string;
  riskLevel: "low" | "medium" | "high";
}

export interface BeginOpsActionArgs extends OpsActionSeed {
  organizationId: string;
  actorRole: "owner" | "admin" | "operator" | "viewer";
  inputPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export async function beginOpsActionRun(args: BeginOpsActionArgs): Promise<string | null> {
  try {
    const supabaseWrite = getSupabaseWriteClient();
    if (!supabaseWrite) {
      console.warn(`[ops-actions] SUPABASE_SERVICE_ROLE_KEY missing — ${args.actionKey} run not recorded`);
      return null;
    }

    let { data: action } = await supabaseWrite
      .from("ops_action_catalog")
      .select("id")
      .eq("action_key", args.actionKey)
      .maybeSingle();

    if (!action?.id) {
      const { data: seeded } = await supabaseWrite
        .from("ops_action_catalog")
        .upsert(
          {
            action_key: args.actionKey,
            display_name: args.displayName,
            risk_level: args.riskLevel,
            environment_scope: "staging_and_production",
            enabled: true,
            metadata: { requires_approval: false, source: `self-seed:${args.actionKey}` },
          },
          { onConflict: "action_key" },
        )
        .select("id")
        .maybeSingle();
      action = seeded ?? null;
    }
    if (!action?.id) return null;

    const runId = crypto.randomUUID();
    const { error } = await supabaseWrite.from("ops_action_runs").insert({
      id: runId,
      action_id: action.id,
      organization_id: args.organizationId,
      actor_role: args.actorRole,
      status: "running",
      trace_id: `${args.actionKey}-${runId}`,
      input_payload: args.inputPayload,
      metadata: { action_key: args.actionKey, ...args.metadata },
    });
    if (error) {
      console.warn(`[ops-actions] ops_action_runs insert failed (fail-open): ${error.message}`);
      return null;
    }
    return runId;
  } catch (e) {
    console.warn("[ops-actions] beginOpsActionRun failed (fail-open):", e);
    return null;
  }
}

export async function finishOpsActionRun(
  runId: string | null,
  ok: boolean,
  output: Record<string, unknown>,
  errorSummary?: string,
): Promise<void> {
  if (!runId) return;
  try {
    const supabaseWrite = getSupabaseWriteClient();
    if (!supabaseWrite) return;
    await supabaseWrite
      .from("ops_action_runs")
      .update({
        status: ok ? "completed" : "failed",
        output_payload: output,
        error_summary: errorSummary ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (e) {
    console.warn("[ops-actions] finishOpsActionRun failed (fail-open):", e);
  }
}

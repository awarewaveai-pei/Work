// /list-failed-runs — read-only listing of recent failures across both
// command_requests and workflow_runs (covers Phase 1 + Phase 2 dispatch).

import type { CommandHandler } from "../commandRouter";

export const listFailedRunsHandler: CommandHandler = async (request, { supabase }) => {
  const orgId = request.organization_id;

  const [crFails, wfFails] = await Promise.all([
    supabase
      .from("command_requests")
      .select("id, command, source, rejection_reason, received_at")
      .eq("organization_id", orgId)
      .eq("status", "failed")
      .order("received_at", { ascending: false })
      .limit(10),
    supabase
      .from("workflow_runs")
      .select("id, status, trigger_type, started_at")
      .eq("organization_id", orgId)
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const cr = crFails.data ?? [];
  const wf = wfFails.data ?? [];

  const lines = ["*Recent failures*"];
  lines.push("", "_command_requests_");
  lines.push(
    cr.length === 0
      ? "_none_"
      : cr
          .map(
            (r) =>
              `• ${r.command} · ${r.source} · ${truncate(r.rejection_reason ?? "", 60)} · ${shortTime(r.received_at)}`,
          )
          .join("\n"),
  );
  lines.push("", "_workflow_runs_");
  lines.push(
    wf.length === 0
      ? "_none_"
      : wf.map((r) => `• ${r.trigger_type} · ${shortTime(r.started_at)}`).join("\n"),
  );

  return {
    text: lines.join("\n"),
    command_requests_count: cr.length,
    workflow_runs_count: wf.length,
  };
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function shortTime(iso: string | null): string {
  if (!iso) return "?";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

// /weekly-review — last 7d slice, AI-summarised. Counts only (no row dump)
// to keep payload small for cost / quality.

import type { CommandHandler } from "../commandRouter";
import { generateSummary } from "./_anthropic";

export const weeklyReviewHandler: CommandHandler = async (request, { supabase }) => {
  const orgId = request.organization_id;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [commands, incidents, failedCmd, criticalInc, errs] = await Promise.all([
    supabase
      .from("command_requests")
      .select("status")
      .eq("organization_id", orgId)
      .gte("received_at", since),
    supabase
      .from("incidents")
      .select("severity, status, title, first_seen_at")
      .eq("organization_id", orgId)
      .gte("first_seen_at", since),
    supabase
      .from("command_requests")
      .select("command, rejection_reason, received_at")
      .eq("organization_id", orgId)
      .eq("status", "failed")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(10),
    supabase
      .from("incidents")
      .select("title, severity, status, first_seen_at")
      .eq("organization_id", orgId)
      .eq("severity", "critical")
      .gte("first_seen_at", since),
    supabase
      .from("error_events")
      .select("source_type", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("occurred_at", since),
  ]);

  const cmdRows = commands.data ?? [];
  const byStatus = cmdRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const text = await generateSummary({
    title: "Weekly review (last 7 days)",
    payload: {
      window_start: since,
      window_end: new Date().toISOString(),
      command_counts_by_status: byStatus,
      total_commands: cmdRows.length,
      total_incidents: (incidents.data ?? []).length,
      critical_incidents: criticalInc.data ?? [],
      recent_failed_commands: failedCmd.data ?? [],
      total_error_events: errs.count ?? 0,
    },
  });

  return {
    text,
    counts: {
      commands: cmdRows.length,
      incidents: (incidents.data ?? []).length,
      critical_incidents: (criticalInc.data ?? []).length,
      errors: errs.count ?? 0,
    },
  };
};

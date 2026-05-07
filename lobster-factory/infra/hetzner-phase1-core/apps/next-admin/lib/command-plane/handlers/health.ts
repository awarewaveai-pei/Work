// /health — Phase 1 reads ops_incidents counters directly (mirrors logic of
// /api/ops/inbox/health without an internal HTTP roundtrip).

import type { CommandHandler } from "../commandRouter";

export const healthHandler: CommandHandler = async (_request, { supabase }) => {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [active, critical, lastIngest, recentErrors] = await Promise.all([
    supabase
      .from("ops_incidents")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "investigating"]),
    supabase
      .from("ops_incidents")
      .select("id", { count: "exact", head: true })
      .eq("severity", "critical")
      .in("status", ["open", "investigating"]),
    supabase
      .from("ops_incidents")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", dayAgo),
  ]);

  const status = (critical.count ?? 0) > 0 ? "critical" : (active.count ?? 0) > 0 ? "warn" : "ok";
  const lastIngestAt =
    lastIngest.data && "created_at" in lastIngest.data ? lastIngest.data.created_at : null;

  const lines = [
    `*Health: ${status.toUpperCase()}*`,
    `open incidents: ${active.count ?? 0}`,
    `critical: ${critical.count ?? 0}`,
    `errors (24h): ${recentErrors.count ?? 0}`,
    `last ingest: ${lastIngestAt ?? "_no data_"}`,
  ];

  return {
    text: lines.join("\n"),
    status,
    open_count: active.count ?? 0,
    critical_count: critical.count ?? 0,
    errors_24h: recentErrors.count ?? 0,
  };
};

// /health — Phase 1 reads ops_incidents counters directly (mirrors logic of
// /api/ops/inbox/health without an internal HTTP roundtrip).

import type { CommandHandler } from "../commandRouter";

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

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

  const lastIngestAt =
    lastIngest.data && "created_at" in lastIngest.data ? lastIngest.data.created_at : null;
  const maxIngestAgeMinutes = parsePositiveIntEnv("OPS_INBOX_MAX_INGEST_AGE_MINUTES", 1440);
  let ingestAgeMinutes: number | null = null;
  let ingestFresh = true;
  if (lastIngestAt) {
    const ts = Date.parse(lastIngestAt);
    if (Number.isFinite(ts)) {
      ingestAgeMinutes = Math.floor((Date.now() - ts) / 60000);
      ingestFresh = ingestAgeMinutes <= maxIngestAgeMinutes;
    } else {
      ingestFresh = false;
    }
  } else {
    ingestFresh = false;
  }
  const status = !ingestFresh
    ? "critical"
    : (critical.count ?? 0) > 0
      ? "critical"
      : (active.count ?? 0) > 0
        ? "warn"
        : "ok";

  const lines = [
    `*Health: ${status.toUpperCase()}*`,
    `open incidents: ${active.count ?? 0}`,
    `critical: ${critical.count ?? 0}`,
    `errors (24h): ${recentErrors.count ?? 0}`,
    `last ingest: ${lastIngestAt ?? "_no data_"}`,
    `ingest fresh: ${ingestFresh ? "yes" : "no"} (age=${ingestAgeMinutes ?? "n/a"}m, max=${maxIngestAgeMinutes}m)`,
  ];

  return {
    text: lines.join("\n"),
    status,
    open_count: active.count ?? 0,
    critical_count: critical.count ?? 0,
    errors_24h: recentErrors.count ?? 0,
    ingest_fresh: ingestFresh,
    ingest_age_minutes: ingestAgeMinutes,
    max_ingest_age_minutes: maxIngestAgeMinutes,
  };
};

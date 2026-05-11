// /health — reads ops_incidents counters + ops_health_probes heartbeat.
//
// Ingest-freshness: checked against ops_health_probes('ops-inbox'), updated every
// 30 min by /api/ops/probe (called by SG cron). This correctly separates pipeline
// liveness from incident volume — a healthy system with no alerts has zero incidents
// but should still have a fresh probe heartbeat.
//
// Status ladder:
//   CRITICAL  — active critical-severity incidents
//   WARN      — active non-critical incidents OR stale probe heartbeat
//   OK        — no open incidents AND probe is fresh

import type { CommandHandler } from "../commandRouter";

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const healthHandler: CommandHandler = async (_request, { supabase }) => {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [active, critical, probeRow, recentErrors] = await Promise.all([
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
      .from("ops_health_probes")
      .select("checked_at, status, latency_ms")
      .eq("probe_key", "ops-inbox")
      .maybeSingle(),
    supabase
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", dayAgo),
  ]);

  const lastProbeAt = probeRow.data?.checked_at ?? null;
  const maxIngestAgeMinutes = parsePositiveIntEnv("OPS_INBOX_MAX_INGEST_AGE_MINUTES", 1440);
  let ingestAgeMinutes: number | null = null;
  let ingestFresh = false;

  if (lastProbeAt) {
    const ts = Date.parse(lastProbeAt);
    if (Number.isFinite(ts)) {
      ingestAgeMinutes = Math.floor((Date.now() - ts) / 60000);
      ingestFresh = ingestAgeMinutes <= maxIngestAgeMinutes && probeRow.data?.status === "ok";
    }
  }

  const status =
    (critical.count ?? 0) > 0
      ? "critical"
      : (active.count ?? 0) > 0
        ? "warn"
        : !ingestFresh
          ? "warn"
          : "ok";

  const probeLatency = probeRow.data?.latency_ms != null ? `${probeRow.data.latency_ms}ms` : "n/a";
  const lines = [
    `*Health: ${status.toUpperCase()}*`,
    `open incidents: ${active.count ?? 0}`,
    `critical: ${critical.count ?? 0}`,
    `errors (24h): ${recentErrors.count ?? 0}`,
    `probe: ${ingestFresh ? "✅" : "⚠️"} (age=${ingestAgeMinutes ?? "n/a"}m, latency=${probeLatency}, max=${maxIngestAgeMinutes}m)`,
    `last probe: ${lastProbeAt ?? "_never — run /api/ops/probe to seed_"}`,
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

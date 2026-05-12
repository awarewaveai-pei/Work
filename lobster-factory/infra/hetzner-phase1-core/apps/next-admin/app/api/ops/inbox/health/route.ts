import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { isOpsInboxNotifyGloballyEnabled } from "@/lib/ops-inbox/notify/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const [active, critical, high, quota, probe] = await Promise.all([
    supabase.from("ops_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
    supabase.from("ops_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]).eq("severity", "critical"),
    supabase.from("ops_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]).eq("severity", "high"),
    supabase.from("ops_inbox_gemini_quota").select("count").eq("date", today).maybeSingle(),
    supabase
      .from("ops_health_probes")
      .select("checked_at, status, latency_ms")
      .eq("probe_key", "ops-inbox")
      .maybeSingle(),
  ]);

  const lastProbeAt = (probe.data as any)?.checked_at ?? null;
  const probeStatus = (probe.data as any)?.status ?? null;
  const probeLatencyMs = (probe.data as any)?.latency_ms ?? null;
  const maxIngestAgeMinutes = parsePositiveIntEnv("OPS_INBOX_MAX_INGEST_AGE_MINUTES", 1440);
  const requireRecentIngest = parseBooleanEnv("OPS_INBOX_REQUIRE_RECENT_INGEST", true);
  const ingestTokenConfigured = Boolean(process.env.OPS_INBOX_INGEST_TOKEN?.trim());
  const notifyEnabled = isOpsInboxNotifyGloballyEnabled();
  const slackWebhookConfigured = Boolean(process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK?.trim());

  let ingestAgeMinutes: number | null = null;
  let ingestFresh = true;
  if (lastProbeAt) {
    const lastMs = Date.parse(lastProbeAt);
    if (Number.isFinite(lastMs)) {
      ingestAgeMinutes = Math.floor((Date.now() - lastMs) / 60000);
      ingestFresh = ingestAgeMinutes <= maxIngestAgeMinutes && probeStatus === "ok";
    } else {
      ingestFresh = false;
    }
  } else {
    ingestFresh = false;
  }

  // If token is configured, we expect webhook traffic and synthetic probes.
  const ingestFreshnessRequired = requireRecentIngest && ingestTokenConfigured;
  const ok = !ingestFreshnessRequired || ingestFresh;

  return NextResponse.json({
    ok,
    open_count: active.count ?? 0,
    critical_count: critical.count ?? 0,
    high_count: high.count ?? 0,
    gemini_quota_used: quota.data?.count ?? 0,
    gemini_quota_limit: Number(process.env.OPS_INBOX_GEMINI_DAILY_LIMIT ?? 1400),
    last_ingest_at: lastProbeAt,
    last_probe_at: lastProbeAt,
    probe_status: probeStatus,
    probe_latency_ms: probeLatencyMs,
    ingest_age_minutes: ingestAgeMinutes,
    ingest_fresh: ingestFresh,
    max_ingest_age_minutes: maxIngestAgeMinutes,
    /** Booleans only — no secret values (for curl / smoke checks). */
    ingest_token_configured: ingestTokenConfigured,
    notify_enabled: notifyEnabled,
    slack_webhook_configured: slackWebhookConfigured,
  }, { status: ok ? 200 : 503 });
}

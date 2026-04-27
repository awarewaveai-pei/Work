import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const [open, critical, high, quota, lastIngest] = await Promise.all([
    supabase.from("ops_incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("ops_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]).eq("severity", "critical"),
    supabase.from("ops_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]).eq("severity", "high"),
    supabase.from("ops_inbox_gemini_quota").select("count").eq("date", today).maybeSingle(),
    supabase.from("ops_incidents").select("last_seen_at").order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    open_count: open.count ?? 0,
    critical_count: critical.count ?? 0,
    high_count: high.count ?? 0,
    gemini_quota_used: quota.data?.count ?? 0,
    gemini_quota_limit: Number(process.env.OPS_INBOX_GEMINI_DAILY_LIMIT ?? 1400),
    last_ingest_at: (lastIngest.data as any)?.last_seen_at ?? null,
    /** Booleans only — no secret values (for curl / smoke checks). */
    ingest_token_configured: Boolean(process.env.OPS_INBOX_INGEST_TOKEN?.trim()),
    notify_enabled: process.env.OPS_INBOX_NOTIFY_ENABLED === "true",
    slack_webhook_configured: Boolean(process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK?.trim()),
  });
}

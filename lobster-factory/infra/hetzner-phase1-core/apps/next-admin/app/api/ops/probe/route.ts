// POST /api/ops/probe
// Heartbeat endpoint called by a scheduler (SG cron, every 30 min).
// Upserts ops_health_probes('ops-inbox') so /health can verify pipeline
// liveness independently of whether any real incidents have occurred.
//
// Auth: Bearer $OPS_INBOX_INGEST_TOKEN (same token as other ops webhooks).
// Returns: { ok: true, latency_ms: N } or { ok: false, error: "..." }.

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = process.env.OPS_INBOX_INGEST_TOKEN?.trim();
  const auth = req.headers.get("authorization") ?? "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "probe_not_configured" }, { status: 503 });
  }
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  const latencyMs = Date.now() - t0;
  const { error } = await supabase.from("ops_health_probes").upsert(
    {
      probe_key: "ops-inbox",
      status: "ok",
      checked_at: new Date().toISOString(),
      latency_ms: latencyMs,
      detail: "heartbeat via /api/ops/probe",
    },
    { onConflict: "probe_key" },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, latency_ms: latencyMs });
}

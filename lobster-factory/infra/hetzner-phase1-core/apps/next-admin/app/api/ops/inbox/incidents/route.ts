import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { verifyIngestToken } from "@/lib/ops-inbox/verifyIngestToken";
import { REPAIR_SOURCE_POLICIES } from "@/lib/repair-center/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INCIDENTS = 50;
const MAX_LOOKBACK_HOURS = 48;

/**
 * GET /api/ops/inbox/incidents?source=<source>&since=<ISO>&until=<ISO>
 *
 * Returns ops_incidents filtered by source and time range.
 * Used by scripts/fetch-external-signals.ps1 to surface VPS deploy events in AO-RESUME.
 *
 * Auth: Bearer OPS_INBOX_INGEST_TOKEN
 */
export async function GET(req: Request) {
  if (!verifyIngestToken(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sourceParam = searchParams.get("source");
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");

  let sinceDate: Date;
  if (sinceParam) {
    sinceDate = new Date(sinceParam);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid since param" }, { status: 400 });
    }
    const cap = new Date(Date.now() - MAX_LOOKBACK_HOURS * 3600 * 1000);
    if (sinceDate < cap) sinceDate = cap;
  } else {
    sinceDate = new Date(Date.now() - 8 * 3600 * 1000);
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  }

  // Every IncidentSource (policy.ts `satisfies Record<IncidentSource, …>`), not a second hand-typed list.
  const ALLOWED_SOURCES = new Set<string>(REPAIR_SOURCE_POLICIES.map((p) => p.source));
  if (sourceParam && !ALLOWED_SOURCES.has(sourceParam)) {
    return NextResponse.json({ ok: false, error: "invalid source param" }, { status: 400 });
  }

  let query = supabase
    .from("ops_incidents")
    .select("id, source, signal_type, severity, service, environment, title, message, status, occurrence_count, tags, created_at, last_seen_at")
    .gte("last_seen_at", sinceDate.toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(MAX_INCIDENTS);

  if (sourceParam) {
    query = query.eq("source", sourceParam);
  }
  if (untilParam) {
    const untilDate = new Date(untilParam);
    if (!isNaN(untilDate.getTime())) {
      query = query.lte("last_seen_at", untilDate.toISOString());
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const incidents = (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    source: row.source,
    signal_type: row.signal_type,
    severity: row.severity,
    service: row.service,
    environment: row.environment,
    title: row.title,
    message: row.message,
    status: row.status,
    occurrence_count: row.occurrence_count,
    tags: row.tags,
  }));

  return NextResponse.json({
    ok: true,
    since: sinceDate.toISOString(),
    count: incidents.length,
    incidents,
  });
}

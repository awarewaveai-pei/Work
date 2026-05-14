import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { verifyIngestToken } from "@/lib/ops-inbox/verifyIngestToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 50;
const MAX_LOOKBACK_HOURS = 48;

/**
 * GET /api/ops/inbox/digest?since=<ISO timestamp>
 *
 * Returns Telegram command_requests received since `since`.
 * Used by scripts/fetch-external-signals.ps1 during AO-RESUME to populate
 * the external-signals-digest.json with messages sent while the operator was offline.
 *
 * Auth: Bearer OPS_INBOX_INGEST_TOKEN (same token as webhook ingest).
 */
export async function GET(req: Request) {
  if (!verifyIngestToken(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get("since");

  let sinceDate: Date;
  if (sinceParam) {
    sinceDate = new Date(sinceParam);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid since param" }, { status: 400 });
    }
    // Cap lookback to avoid huge result sets.
    const cap = new Date(Date.now() - MAX_LOOKBACK_HOURS * 3600 * 1000);
    if (sinceDate < cap) sinceDate = cap;
  } else {
    sinceDate = new Date(Date.now() - 8 * 3600 * 1000); // default: last 8h
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("command_requests")
    .select("id, source, command, args, status, actor_ref, received_at, result, risk_level")
    .eq("source", "telegram")
    .gte("received_at", sinceDate.toISOString())
    .order("received_at", { ascending: false })
    .limit(MAX_MESSAGES);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const messages = (data ?? []).map((row) => ({
    created_at: row.received_at,
    event_type: row.command,
    summary: buildSummary(row),
    status: row.status,
    actor: row.actor_ref ?? "unknown",
    risk_level: row.risk_level,
  }));

  return NextResponse.json({
    ok: true,
    since: sinceDate.toISOString(),
    count: messages.length,
    messages,
  });
}

function buildSummary(row: {
  command: string;
  args: Record<string, unknown>;
  status: string;
  result: Record<string, unknown>;
}): string {
  const argStr = Object.entries(row.args ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const base = argStr ? `/${row.command} ${argStr}` : `/${row.command}`;
  const statusHint = row.status === "completed" ? "✅" : row.status === "failed" ? "❌" : "⏳";
  return `${statusHint} ${base}`;
}

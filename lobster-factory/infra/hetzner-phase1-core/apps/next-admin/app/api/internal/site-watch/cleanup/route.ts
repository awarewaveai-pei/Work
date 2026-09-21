// POST /api/internal/site-watch/cleanup — called every heartbeat; does real work at most once per UTC
// day (C9). Runs even with the kill switch off: retention is a promise about data already stored,
// not part of the monitoring load the switch exists to stop.

import { NextResponse } from "next/server";
import { runDailyCleanup } from "@/lib/site-watch/cleanup";
import { createSiteWatchObjects } from "@/lib/site-watch/objects";
import { verifySiteWatchToken } from "@/lib/site-watch/wiring";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!verifySiteWatchToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const result = await runDailyCleanup(sb, createSiteWatchObjects(), new Date());
  return NextResponse.json({ ok: true, result });
}

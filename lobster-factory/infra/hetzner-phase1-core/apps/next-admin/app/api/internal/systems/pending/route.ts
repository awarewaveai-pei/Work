// GET /api/internal/systems/pending
//
// Asked every 5 minutes by the host importer (scripts/systems-import.py --if-requested). Answers 契約 3
// (agency-os/handoffs/2026-11-21-systems-control-center/briefs/COMMON.md): { refresh, requested_at, proposals[] } from the page's
// refresh_request / system_proposed events. Same bearer token as the ingest route (SYSTEMS_INGEST_TOKEN; unset = 401
// for all). Read-only.

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { verifySystemsToken } from "@/lib/systems/ingest-token";
import { readPending } from "@/lib/systems/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifySystemsToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 500 });
  try {
    const p = await readPending(sb);
    return NextResponse.json({ refresh: p.refresh, requested_at: p.requestedAt, proposals: p.proposals });
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e).slice(0, 300);
    console.error(`[systems/pending] ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

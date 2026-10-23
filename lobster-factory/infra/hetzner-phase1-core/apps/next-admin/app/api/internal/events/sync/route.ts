// POST /api/internal/events/sync -- monthly global events refresh, called by scripts/sync-events-monthly.sh on the host.
// /api/internal skips middleware, so the shared secret checked here is the only gate; unset secret = 401.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { forceParam, syncEventsResponse } from "@/lib/events/sync-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  const provided = req.headers.get("x-ops-sync-key") ?? "";
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return syncEventsResponse(forceParam(req));
}

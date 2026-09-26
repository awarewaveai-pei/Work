// POST /api/internal/pod-orders/sweep
//
// Called every 10 minutes by the self-hosted Trigger schedule `pod-order-inbox-sweep`
// (packages/workflows/src/trigger/pod-order-inbox-sweep.ts). Without it a failed or abandoned paid
// order waits for the next Woo delivery or the next switch back to normal, which on a quiet store is
// days. Own bearer token (POD_INBOX_SWEEP_TOKEN): one token per caller, see verifyIngestToken.ts M2.
// Answers before draining (after()): a drain is many Printful round trips.

import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { drainPodOrderInbox } from "@/lib/studio/pod-order-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(request: Request): boolean {
  const expected = process.env.POD_INBOX_SWEEP_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  after(async () => {
    const result = await drainPodOrderInbox(db);
    if (result.error || result.processed > 0 || result.blocked) console.log("[pod-orders/sweep]", result);
  });
  return NextResponse.json({ ok: true, scheduled: true });
}

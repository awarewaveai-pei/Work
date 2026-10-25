// POST /api/internal/pod-orders/sweep
//
// Called every 10 minutes by the host clock (scripts/poke.sh, cron.d/awarewave-schedules). Without it a failed or
// abandoned paid order waits for the next Woo delivery or the next switch back to normal, which on a quiet store is
// days. Answers after the drain, with its result: the caller waits up to 310 s, and a drain that errors must turn the
// row on /ops/schedules red (until 2026-10-25 it answered first via after() and a failed drain looked green).

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { drainPodOrderInbox } from "@/lib/studio/pod-order-inbox";
import { verifyPodInboxToken } from "@/lib/studio/pod-inbox-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyPodInboxToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const result = await drainPodOrderInbox(db);
  if (result.error || result.processed > 0 || result.blocked) console.log("[pod-orders/sweep]", result);
  if (result.error) return NextResponse.json({ ok: false, ...result }, { status: 500 });
  return NextResponse.json({ ok: true, ...result });
}

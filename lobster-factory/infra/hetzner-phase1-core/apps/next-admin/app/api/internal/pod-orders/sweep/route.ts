// POST /api/internal/pod-orders/sweep
//
// Called every 10 minutes by the self-hosted Trigger schedule `pod-order-inbox-sweep`
// (packages/workflows/src/trigger/pod-order-inbox-sweep.ts). Without it a failed or abandoned paid
// order waits for the next Woo delivery or the next switch back to normal, which on a quiet store is
// days. Answers before draining (after()): a drain is many Printful round trips.

import { after, NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { drainPodOrderInbox } from "@/lib/studio/pod-order-inbox";
import { verifyPodInboxToken } from "@/lib/studio/pod-inbox-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyPodInboxToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  after(async () => {
    const result = await drainPodOrderInbox(db);
    if (result.error || result.processed > 0 || result.blocked) console.log("[pod-orders/sweep]", result);
  });
  return NextResponse.json({ ok: true, scheduled: true });
}

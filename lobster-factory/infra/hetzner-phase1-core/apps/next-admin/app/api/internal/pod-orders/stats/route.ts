// GET /api/internal/pod-orders/stats -- read-only pod_order_inbox buckets for the AO smoke check
// (scripts/check-smoke-tests.ps1 check pod_order_inbox, which runs this inside the next-admin
// container over SSH, so the token never leaves the host). Same shape as the system-modes GET's
// podOrderInbox; the buckets live only in lib/studio/pod-order-inbox.ts getPodOrderInboxStats.

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getPodOrderInboxStats } from "@/lib/studio/pod-order-inbox";
import { verifyPodInboxToken } from "@/lib/studio/pod-inbox-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyPodInboxToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  return NextResponse.json({ ok: true, podOrderInbox: await getPodOrderInboxStats(db) });
}

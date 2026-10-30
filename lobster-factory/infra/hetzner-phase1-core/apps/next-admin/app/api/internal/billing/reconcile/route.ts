// Daily: aware-wave.com's paid orders against payment_events (lib/payments/woo-reconcile.ts). Rung by the host clock
// (scripts/cron.d/awarewave-schedules billing_reconcile). A gap or an extra opens one ops incident per day; /ops/billing
// shows the same comparison live.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { runWooReconciliation } from "@/lib/payments/woo-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 500 });
  try {
    const r = await runWooReconciliation(db);
    if ("enabled" in r) return NextResponse.json({ ok: true, enabled: false });
    if (r.missing.length || r.extra.length) {
      // The same unresolved mismatch is one incident, not one a day for the week it stays in the window.
      const set = [...r.missing.map((m) => `m:${m.orderId}:${m.expected}`), ...r.extra.map((e) => `x:${e.eventId}`)].sort().join("|");
      const fingerprint = `payments:reconcile:${createHash("sha256").update(set).digest("hex").slice(0, 32)}`;
      const res = await ingestIncident(db, {
        source: "payments", external_id: fingerprint, fingerprint, signal_type: "error", severity: "high", service: "payments-woo",
        environment: process.env.NODE_ENV === "production" ? "production" : "development",
        title: "WooCommerce 對帳不符：付款與開通紀錄對不上", message: `漏送 ${r.missing.length}、多送 ${r.extra.length}（/ops/billing 對帳）`,
        raw: { missing: r.missing, extra: r.extra.map((e) => e.eventId), from: r.from, to: r.to }, tags: { product: "billing" }, client_slug: null,
      });
      if (res.error) console.error(`[billing-reconcile] incident not written: ${res.error}`);
    }
    return NextResponse.json({ ok: true, matched: r.matched, missing: r.missing.length, extra: r.extra.length, manual: r.manual.length });
  } catch (error) {
    console.error("[billing-reconcile] failed", String(error).slice(0, 200));
    return NextResponse.json({ ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 80) }, { status: 502 });
  }
}

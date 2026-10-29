// GET /api/internal/sellers/sites?host=<host> -> {host, active}: whether a host is a registered, active cash-register
// site (seller_sites, 0133). Asked by scripts/rollout-wp-bridge.ps1 -Plugin store before it installs the store plugin
// (cards/step-4-seller.md 4c-3): the plugin goes only onto a site the control plane will take payments from.
// Bearer SCHEDULE_INGEST_TOKEN, as the other host-side internal routes. Read-only.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { siteActiveForHost } from "@/lib/payments/sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const host = new URL(request.url).searchParams.get("host")?.trim().toLowerCase() ?? "";
  if (!host) return NextResponse.json({ ok: false, error: "host_required" }, { status: 400 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  try {
    return NextResponse.json({ host, active: await siteActiveForHost(db, host) });
  } catch (error) {
    console.error("[sellers-sites] lookup failed", String(error).slice(0, 200));
    return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
  }
}

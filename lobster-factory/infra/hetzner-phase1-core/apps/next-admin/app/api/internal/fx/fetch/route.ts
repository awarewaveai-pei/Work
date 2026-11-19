// Daily 17:00 Taipei: the central bank's NT$/USD closing rates into fx_daily_rates (lib/ai/fx-cbc.ts runFxFetch), the
// automatic layer of /ops/costs 月報's accounting rate. Rung by the host clock (scripts/cron.d/awarewave-schedules
// fx_fetch_cbc). A failure opens an incident and answers non-2xx, so /ops/schedules shows the row red too.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runFxFetch } from "@/lib/ai/fx-cbc";

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
  const r = await runFxFetch(db, new Date());
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error.slice(0, 120) }, { status: 502 });
  return NextResponse.json({ ok: true, ...r });
}

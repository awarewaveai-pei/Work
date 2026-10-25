// POST /api/internal/social/metrics
//
// Called daily at 19:30 UTC (03:30 Taiwan) by the host cron (scripts/poke.sh, cron.d/awarewave-schedules): snapshots every connected channel's numbers into
// social_metrics_daily / social_post_metrics (lib/social/metrics.ts; sources per platform there). Same caller class,
// token and switch as rotation (SOCIAL_DISPATCH_TOKEN; off unless SOCIAL_DISPATCH_ENABLED=true): the social automation
// is one switch. Reads platforms only; writes nothing but our own snapshot rows.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { runMetricsSnapshot } from "@/lib/social/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.SOCIAL_DISPATCH_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.SOCIAL_DISPATCH_ENABLED?.trim().toLowerCase() !== "true") return NextResponse.json({ ok: true, enabled: false });
  try {
    const result = await runMetricsSnapshot();
    console.log("[social/metrics]", JSON.stringify(result).slice(0, 2000));
    return NextResponse.json({ ok: result.errors.length === 0, enabled: true, ...result }, { status: result.errors.length ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}

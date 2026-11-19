// POST /api/internal/social/channel-health
//
// Called every 5 minutes by the host cron (scripts/social-channel-health.sh, cron.d/awarewave-schedules) with Postiz's own
// "Integration" rows as JSON: [{id, provider, refreshNeeded, disabled, inBetweenSteps, deleted}]. Mirrors them into
// social_accounts.status (lib/social/channel-health.ts). Same caller class and token as the sender
// (SOCIAL_DISPATCH_TOKEN). Not behind SOCIAL_DISPATCH_ENABLED: it only keeps our status equal to Postiz's, never posts.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { applyChannelHealth, parseHealth } from "@/lib/social/channel-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyToken(request: Request): boolean {
  const expected = process.env.SOCIAL_DISPATCH_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const health = parseHealth(await request.json().catch(() => null));
  if (!health) return NextResponse.json({ ok: false, error: "body must be [{id, provider, refreshNeeded, disabled, inBetweenSteps, deleted}]" }, { status: 400 });
  try {
    const r = await applyChannelHealth(health);
    if (r.expired || r.connected || r.errors.length) console.log("[social/channel-health]", JSON.stringify(r).slice(0, 2000));
    return NextResponse.json({ ok: r.errors.length === 0, channels: health.length, ...r }, { status: r.errors.length ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}

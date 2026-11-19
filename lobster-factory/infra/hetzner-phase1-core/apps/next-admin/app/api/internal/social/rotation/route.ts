// POST /api/internal/social/rotation
//
// Called daily at 00:05 UTC by the host cron (scripts/poke.sh, cron.d/awarewave-schedules): materialises the next 7 days of every active rotation list
// (lib/social/rotation.ts; once per slot, migration 0101). Same caller class and token as the sender
// (SOCIAL_DISPATCH_TOKEN) and the same switch: off unless SOCIAL_DISPATCH_ENABLED=true, so no automation adds posts
// while sending is off (AGENTS.md §0 自動化預設 OFF). Channel status is mirrored hourly by
// /api/internal/social/channel-health (lib/social/channel-health.ts), no longer here.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { runRotation } from "@/lib/social/rotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const result = await runRotation();
    const errors = result.errors;
    if (result.posts || errors.length) console.log("[social/rotation]", JSON.stringify(result).slice(0, 2000));
    return NextResponse.json({ ok: errors.length === 0, enabled: true, ...result }, { status: errors.length ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}

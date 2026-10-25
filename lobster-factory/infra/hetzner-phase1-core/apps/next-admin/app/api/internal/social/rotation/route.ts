// POST /api/internal/social/rotation
//
// Called daily at 00:05 UTC by the host cron (scripts/poke.sh, cron.d/awarewave-schedules): materialises the next 7 days of every active rotation list
// (lib/social/rotation.ts; once per slot, migration 0101). Same caller class and token as the sender
// (SOCIAL_DISPATCH_TOKEN) and the same switch: off unless SOCIAL_DISPATCH_ENABLED=true, so no automation adds posts
// while sending is off (AGENTS.md §0 自動化預設 OFF). The same daily run marks channels Postiz shows as disabled
// expired and tells someone (ADR 016 §4; lib/social/review.ts reconcileAccounts).

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { runRotation } from "@/lib/social/rotation";
import { reconcileAccounts } from "@/lib/social/review";

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
    const rotation = await runRotation();
    const accounts = await reconcileAccounts().catch((e) => ({ expired: 0, errors: [`accounts: ${String(e).slice(0, 200)}`] }));
    const errors = [...rotation.errors, ...accounts.errors];
    const result = { ...rotation, expiredAccounts: accounts.expired, errors };
    if (result.posts || result.expiredAccounts || errors.length) console.log("[social/rotation]", JSON.stringify(result).slice(0, 2000));
    return NextResponse.json({ ok: errors.length === 0, enabled: true, ...result }, { status: errors.length ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}

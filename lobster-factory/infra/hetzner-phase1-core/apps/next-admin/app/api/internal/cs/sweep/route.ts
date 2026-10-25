// POST /api/internal/cs/sweep
//
// Called every 5 minutes by the host cron (scripts/poke.sh, cron.d/awarewave-schedules). Hands Chatwoot messages whose pipeline never
// finished to a human (lib/cs/sweep.ts). Runs inside the request: a handful of rows, a few Chatwoot
// calls each. Own token, CS_SWEEP_TOKEN: one token per caller class (verifyIngestToken.ts M2).

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { sweepUnfinishedClaims } from "@/lib/cs/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(request: Request): boolean {
  const expected = process.env.CS_SWEEP_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await sweepUnfinishedClaims();
    if (result.handedOff || result.failed) console.log("[cs/sweep]", result);
    // A failed claim fails the host clock's run (poke.sh exit 1: the /ops/schedules row turns red and one push goes out), not a 200 nobody reads.
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 502 : 200 });
  } catch (err) {
    // Claim list unreadable (DB down, migration 0099 missing): a 500 fails the host clock's run (poke.sh exit 1: the /ops/schedules row turns red and one push goes out), never a green no-op.
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}

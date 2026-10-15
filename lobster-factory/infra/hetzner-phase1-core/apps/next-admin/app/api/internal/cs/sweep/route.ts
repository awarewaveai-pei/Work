// POST /api/internal/cs/sweep
//
// Called every 5 minutes by the self-hosted Trigger schedule `cs-inbound-sweep`
// (packages/workflows/src/trigger/cs-inbound-sweep.ts). Hands Chatwoot messages whose pipeline never
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
    // A failed claim fails the Trigger run (Sentry), not a 200 nobody reads.
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 502 : 200 });
  } catch (err) {
    // Claim list unreadable (DB down, migration 0099 missing): a 500 fails the Trigger run, never a green no-op.
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}

// POST /api/internal/site-watch/run/<targetId> — one target, one lease (lib/site-watch/runner.ts).
// Called once per target by the host round (scripts/site-watch-tick.sh, 2 at a time), so no route invocation ever loops over clients
// (MASTER PLAN §4.2 C4). Always 200 with the run status; the caller decides what counts as a failed run.

import { NextResponse } from "next/server";
import { runTarget } from "@/lib/site-watch/runner";
import { productionDeps, verifySiteWatchToken } from "@/lib/site-watch/wiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ targetId: string }> }) {
  if (!verifySiteWatchToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { targetId } = await context.params;
  if (!UUID_RE.test(targetId)) return NextResponse.json({ ok: false, error: "bad_target_id" }, { status: 400 });
  const deps = productionDeps();
  if (!deps) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const result = await runTarget(targetId, deps);
  return NextResponse.json({ ok: true, result });
}

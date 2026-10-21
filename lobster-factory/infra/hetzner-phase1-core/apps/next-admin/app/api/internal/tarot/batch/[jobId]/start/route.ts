// POST /api/internal/tarot/batch/[jobId]/start
//
// Called by the Trigger task tarot-batch-generate when its run begins: marks the job running and moves its
// deadline to now + the run budget (lib/tarot/batch-store.ts markRunning).
// Own token BATCH_INTERNAL_SECRET, same check as ../card/route.ts (no role-header fallback: /api/internal/* skips the
// middleware, so identity headers are not stripped).

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { BatchStoreUnavailableError, markRunning } from "@/lib/tarot/batch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(request: Request): boolean {
  const expected = process.env.BATCH_INTERNAL_SECRET?.trim();
  if (!expected) return false;
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1].trim(), expected);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  if (!verifyToken(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  try {
    const ok = await markRunning(jobId);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (e) {
    if (!(e instanceof BatchStoreUnavailableError)) throw e;
    console.error("[tarot-batch] start:", e.message);
    // 503 is retryable for the worker; never 404 (that would read as "job lost" and fail the run).
    return NextResponse.json({ ok: false, error: "batch_store_unavailable" }, { status: 503 });
  }
}

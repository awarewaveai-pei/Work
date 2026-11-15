// POST /api/internal/codex-images/claim  { waitMs? }
//
// Long-polled by the operator's laptop (scripts/codex-image-worker.mjs): returns the oldest waiting Codex picture
// { ok, job: { id, prompt, aspectRatio, refs } } or { ok, job: null } after up to 25 s. Each call also marks the worker
// online, so generate calls fail fast with codex_worker_offline when the laptop is off (lib/tarot/codex-bridge.ts).
// Own token CODEX_WORKER_SECRET. The middleware does not run on /api/internal/*: never fall back to a role header.

import { NextResponse } from "next/server";
import { claimJob, CLAIM_WAIT_MAX_MS } from "@/lib/tarot/codex-bridge";
import { verifyCodexWorker } from "../worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!verifyCodexWorker(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let waitMs = CLAIM_WAIT_MAX_MS;
  try {
    const body = (await req.json()) as { waitMs?: unknown };
    if (typeof body.waitMs === "number" && Number.isFinite(body.waitMs)) waitMs = Math.max(0, Math.min(body.waitMs, CLAIM_WAIT_MAX_MS));
  } catch { /* empty body = default wait */ }
  const job = await claimJob(waitMs);
  return NextResponse.json({ ok: true, job });
}

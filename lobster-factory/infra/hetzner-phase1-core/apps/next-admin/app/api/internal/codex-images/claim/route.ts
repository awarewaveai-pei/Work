// POST /api/internal/codex-images/claim  { waitMs?, leaving?, tools? }   leaving: true = the worker is stopping (workerLeft)
//
// Long-polled by a subscription worker (scripts/codex-image-worker.mjs): returns the oldest job this worker may take,
// { ok, job: { id, kind: "image", prompt, aspectRatio, refs, timeLeftMs } | { id, kind: "text", tool, cliModel, system,
// prompt, timeLeftMs } }, or { ok, job: null } after up to 25 s. tools: the CLIs the worker can run ("codex" | "claude");
// no tools list = an old picture-only worker (Codex pictures, never a text job: it would read job.refs). Each call also marks the worker online, so callers fail fast when it
// is off (lib/tarot/codex-bridge.ts). The lane comes from the secret (../worker-auth.ts). The middleware does not run
// on /api/internal/*: never fall back to a role header.

import { NextResponse } from "next/server";
import { claimJob, CLAIM_WAIT_MAX_MS, SUB_TOOLS, workerLeft, type SubTool } from "@/lib/tarot/codex-bridge";
import { workerLane } from "../worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const lane = workerLane(req);
  if (!lane) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let waitMs = CLAIM_WAIT_MAX_MS;
  let tools: SubTool[] | undefined;
  try {
    const body = (await req.json()) as { waitMs?: unknown; leaving?: unknown; tools?: unknown };
    if (body.leaving === true) { workerLeft(lane); return NextResponse.json({ ok: true, job: null }); }
    if (typeof body.waitMs === "number" && Number.isFinite(body.waitMs)) waitMs = Math.max(0, Math.min(body.waitMs, CLAIM_WAIT_MAX_MS));
    if (Array.isArray(body.tools)) tools = SUB_TOOLS.filter((t) => (body.tools as unknown[]).includes(t));
  } catch { /* empty body = default wait, picture-only */ }
  const job = await claimJob(waitMs, lane, tools);
  return NextResponse.json({ ok: true, job });
}

// POST /api/internal/codex-images/complete  { id, image } | { id, error }
//
// The operator's laptop hands back a claimed Codex picture (data:image/png|jpeg|webp;base64,...) or why it failed.
// 404 = the job is unknown or expired (its lease ran out, codex-bridge.ts RUN_LEASE_MS): the worker just drops the picture.
// Own token CODEX_WORKER_SECRET (see ../claim/route.ts).

import { NextResponse } from "next/server";
import { CODEX_USAGE_KEYS, completeJob, type CodexUsage } from "@/lib/tarot/codex-bridge";
import { verifyCodexWorker } from "../worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 30 * 1024 * 1024; // ~22 MB of picture; one Codex PNG measured ~2 MB

/** Only the known numeric fields, finite and non-negative: the worker's report is written to the ledger as-is. */
function usageOf(raw: unknown): CodexUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: CodexUsage = {};
  for (const k of CODEX_USAGE_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request): Promise<Response> {
  if (!verifyCodexWorker(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { id?: unknown; image?: unknown; error?: unknown; usage?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  let accepted: boolean;
  if (typeof body.image === "string") {
    if (body.image.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URL.test(body.image)) {
      return NextResponse.json({ ok: false, error: "invalid_image" }, { status: 400 });
    }
    accepted = completeJob(body.id, { ok: true, image: body.image, usage: usageOf(body.usage) });
  } else {
    // A worker's error text is shown to the operator as a code: keep it short and plain.
    const error = typeof body.error === "string" && /^[a-z0-9_]{1,60}$/.test(body.error) ? body.error : "codex_worker_failed";
    accepted = completeJob(body.id, { ok: false, error });
  }
  return accepted ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "unknown_job" }, { status: 404 });
}

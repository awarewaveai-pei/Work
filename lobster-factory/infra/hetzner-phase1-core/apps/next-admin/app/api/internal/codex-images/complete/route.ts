// POST /api/internal/codex-images/complete  { id, image, usage? } | { id, text, usage?, answeredModel? } | { id, error, quotaResetsAt?, tool? }
//
// A subscription worker hands back a claimed job: a picture (data:image/png|jpeg|webp;base64,...), a text answer, or why
// it failed (quotaResetsAt = epoch ms the spent allowance comes back; tool = whose allowance, used when the job is gone). 404 = the job is unknown, expired (its lease ran
// out, codex-bridge.ts RUN_LEASE_MS) or another lane's: the worker just drops its answer. Lane from the secret (../worker-auth.ts).

import { NextResponse } from "next/server";
import { CODEX_USAGE_KEYS, completeJob, SUB_TEXT_USAGE_KEYS, SUB_TOOLS, type SubTextUsage } from "@/lib/tarot/codex-bridge";
import { workerLane } from "../worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 30 * 1024 * 1024; // ~22 MB of picture; one Codex PNG measured ~2 MB
const MAX_TEXT_CHARS = 400_000;
/** A model id as the CLI reports it (e.g. claude-haiku-4-5, gpt-5.4): shown and logged, so kept short and plain. */
const MODEL_ID = /^[A-Za-z0-9._:/-]{1,100}$/;

/** Only the known numeric fields, finite and non-negative: the worker's report is written to the ledger as-is. */
function usageOf(raw: unknown, keys: readonly (keyof SubTextUsage)[]): SubTextUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: SubTextUsage = {};
  for (const k of keys) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request): Promise<Response> {
  const lane = workerLane(req);
  if (!lane) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { id?: unknown; image?: unknown; text?: unknown; answeredModel?: unknown; error?: unknown; usage?: unknown; quotaResetsAt?: unknown; tool?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  let accepted: boolean;
  if (typeof body.image === "string") {
    if (body.image.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URL.test(body.image)) {
      return NextResponse.json({ ok: false, error: "invalid_image" }, { status: 400 });
    }
    accepted = completeJob(body.id, { ok: true, image: body.image, usage: usageOf(body.usage, CODEX_USAGE_KEYS) }, lane);
  } else if (typeof body.text === "string") {
    if (body.text.length > MAX_TEXT_CHARS || !body.text.trim()) {
      return NextResponse.json({ ok: false, error: "invalid_text" }, { status: 400 });
    }
    const answeredModel = typeof body.answeredModel === "string" && MODEL_ID.test(body.answeredModel) ? body.answeredModel : undefined;
    accepted = completeJob(body.id, { ok: true, text: body.text, usage: usageOf(body.usage, SUB_TEXT_USAGE_KEYS), answeredModel }, lane);
  } else {
    // A worker's error text is shown to the operator as a code: keep it short and plain.
    const error = typeof body.error === "string" && /^[a-z0-9_]{1,60}$/.test(body.error) ? body.error : "codex_worker_failed";
    const r = body.quotaResetsAt;
    const quotaResetsAt = typeof r === "number" && Number.isFinite(r) && r > 0 ? r : undefined;
    const tool = SUB_TOOLS.find((t) => t === body.tool);
    accepted = completeJob(body.id, { ok: false, error, ...(quotaResetsAt === undefined ? {} : { quotaResetsAt }), ...(tool ? { tool } : {}) }, lane);
  }
  return accepted ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "unknown_job" }, { status: 404 });
}

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../../../lib/ops-role";
import { generateTarotImage, isTarotModel, isAspectRatio } from "../../../../../../../lib/tarot/image-gen";
import { recordCardResult, getJob } from "../../../../../../../lib/tarot/batch-store";
import { putDesignObject, parseImageDataUrl, isR2Configured, getDesignsPublicBase } from "../../../../../../../lib/storage/r2";
import { checkAndConsumeQuota } from "../../../../../../../lib/tarot/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  // Primary guard: shared secret for Trigger.dev → SG server-to-server calls.
  // If BATCH_INTERNAL_SECRET is set, require it in Authorization header.
  // Falls back to ops-role check (dev/local where secret may not be configured).
  const batchSecret = process.env.BATCH_INTERNAL_SECRET?.trim();
  if (batchSecret) {
    const authHeader = req.headers.get("authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (provided !== batchSecret) {
      return NextResponse.json({ ok: false, error: "forbidden_secret" }, { status: 403 });
    }
  } else {
    const { role } = resolveOpsRole(req);
    if (!canCreateAiImageJob(role)) {
      return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
    }
  }

  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const cardIndex = typeof body.cardIndex === "number" ? body.cardIndex : -1;
  const cardName  = typeof body.cardName  === "string" ? body.cardName  : "";
  const prompt    = typeof body.prompt    === "string" ? body.prompt    : "";
  const model     = body.model    as string | undefined ?? job.model;
  const arRaw     = body.aspectRatio as string | undefined ?? job.aspectRatio;
  const seed      = typeof body.seed === "number" ? body.seed : null;

  if (cardIndex < 0 || !prompt || !cardName) {
    return NextResponse.json({ ok: false, error: "cardIndex / cardName / prompt required" }, { status: 400 });
  }
  if (!isTarotModel(model)) {
    return NextResponse.json({ ok: false, error: "invalid_model" }, { status: 400 });
  }
  const aspectRatio = isAspectRatio(arRaw) ? arRaw : "2:3";

  const quota = checkAndConsumeQuota();
  if (!quota.ok) {
    recordCardResult(jobId, { cardIndex, cardName, url: "", error: "quota_exceeded" });
    return NextResponse.json({ ok: false, error: "quota_exceeded", code: "quota_exceeded" }, { status: 429 });
  }

  const result = await generateTarotImage({ model, prompt, aspectRatio, seed, printQuality: true });

  if (!result.ok) {
    const errMsg = (result as { ok: false; error: string }).error;
    recordCardResult(jobId, { cardIndex, cardName, url: "", error: errMsg });
    return NextResponse.json({ ok: false, error: errMsg, cardIndex }, { status: 200 });
  }

  // Save to R2 — key: tarot-batch/{jobId}/{index:03d}.png
  let publicUrl = "";
  if (isR2Configured()) {
    const parsed = parseImageDataUrl(result.image);
    if (parsed) {
      const key = `tarot-batch/${jobId}/${String(cardIndex).padStart(3, "0")}.png`;
      const r2result = await putDesignObject(key, parsed.buffer, parsed.mime);
      if (r2result.ok) {
        publicUrl = r2result.publicUrl;
      } else {
        publicUrl = `${getDesignsPublicBase()}/${key}`;
      }
    }
  }

  // Fallback: store data URL in results (large, but works without R2)
  const url = publicUrl || result.image;
  recordCardResult(jobId, { cardIndex, cardName, url });

  return NextResponse.json({ ok: true, cardIndex, url: publicUrl || "data:saved" });
}

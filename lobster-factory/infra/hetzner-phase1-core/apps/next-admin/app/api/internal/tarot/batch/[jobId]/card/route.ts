// POST /api/internal/tarot/batch/[jobId]/card
//
// Called once per card by the Trigger task tarot-batch-generate (packages/workflows/src/trigger/tarot-batch-generate.ts).
// Generates the image with this server's API keys, saves it to R2 and records it in the in-memory batch store.
// Own token BATCH_INTERNAL_SECRET. The middleware does not run on /api/internal/*, so client identity headers are NOT
// stripped here: never fall back to a role header.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { generateTarotImage, isTarotModel, isAspectRatio } from "@/lib/tarot/image-gen";
import { grantFor } from "@/lib/entitlements/grant";
import { recordCardResult, getJob } from "@/lib/tarot/batch-store";
import { putDesignObject, parseImageDataUrl, isR2Configured, getDesignsPublicBase } from "@/lib/storage/r2";
import { checkAndConsumeQuota } from "@/lib/tarot/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyToken(request: Request): boolean {
  const expected = process.env.BATCH_INTERNAL_SECRET?.trim();
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1].trim(), expected);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  if (!verifyToken(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

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

  const result = await generateTarotImage({ model, prompt, aspectRatio, seed, printQuality: true }, await grantFor("tarot.image"));

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

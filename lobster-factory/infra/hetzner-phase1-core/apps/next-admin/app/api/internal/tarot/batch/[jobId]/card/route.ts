// POST /api/internal/tarot/batch/[jobId]/card
//
// Called once per card by the Trigger task tarot-batch-generate (packages/workflows/src/trigger/tarot-batch-generate.ts).
// Generates the image with this server's API keys, saves it to R2 and records it as the card's row (migration 0115).
// The card is claimed BEFORE generating: a retried callback for a finished card returns the stored URL, and one
// arriving while the first attempt still runs gets 409 -- neither generates, bills or counts the card again.
// Own token BATCH_INTERNAL_SECRET. The middleware does not run on /api/internal/*, so client identity headers are NOT
// stripped here: never fall back to a role header.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { generateTarotImage, isTarotModel, isAspectRatio } from "@/lib/tarot/image-gen";
import { grantFor } from "@/lib/entitlements/grant";
import { BatchStoreUnavailableError, claimCard, finishCard, getJob } from "@/lib/tarot/batch-store";
import { putDesignObject, parseImageDataUrl } from "@/lib/storage/r2";
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

function storeUnavailable(e: unknown): Response {
  if (!(e instanceof BatchStoreUnavailableError)) throw e;
  console.error("[tarot-batch] card:", e.message);
  // 503 is retryable for the worker; never 404 (that would read as "job lost" and fail the run).
  return NextResponse.json({ ok: false, error: "batch_store_unavailable" }, { status: 503 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  if (!verifyToken(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { jobId } = await params;
  let job;
  try { job = await getJob(jobId); }
  catch (e) { return storeUnavailable(e); }
  if (!job) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }
  // A job past its deadline (or stored as ended) takes no new cards: nothing is generated or billed for it.
  if (job.state === "timed_out" || job.state === "error") {
    return NextResponse.json({ ok: false, error: `job_${job.state}` }, { status: 410 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const cardIndex = typeof body.cardIndex === "number" && Number.isInteger(body.cardIndex) ? body.cardIndex : -1;
  const cardName  = typeof body.cardName  === "string" ? body.cardName  : "";
  const prompt    = typeof body.prompt    === "string" ? body.prompt    : "";
  const model     = body.model    as string | undefined ?? job.model;
  const arRaw     = body.aspectRatio as string | undefined ?? job.aspectRatio;
  const seed      = typeof body.seed === "number" ? body.seed : null;

  if (cardIndex < 0 || cardIndex >= job.totalCards || !prompt || !cardName) {
    return NextResponse.json({ ok: false, error: "cardIndex (0..totalCards-1) / cardName / prompt required" }, { status: 400 });
  }
  if (!isTarotModel(model)) {
    return NextResponse.json({ ok: false, error: "invalid_model" }, { status: 400 });
  }
  const aspectRatio = isAspectRatio(arRaw) ? arRaw : "2:3";

  let claim;
  try { claim = await claimCard(jobId, cardIndex, cardName); }
  catch (e) { return storeUnavailable(e); }
  if (claim.outcome === "no_job") return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  if (claim.outcome === "done") return NextResponse.json({ ok: true, cardIndex, url: claim.url, reused: true });
  if (claim.outcome === "in_progress") {
    return NextResponse.json({ ok: false, error: "card_in_progress", cardIndex }, { status: 409 });
  }

  // From here the card is claimed: every exit records an outcome, so it never sits "generating" until the lease ends.
  let outcome: { url: string } | { error: string } = { error: "card_route_failed" };
  try {
    const quota = checkAndConsumeQuota();
    if (!quota.ok) {
      outcome = { error: "quota_exceeded" };
      return NextResponse.json({ ok: false, error: "quota_exceeded", code: "quota_exceeded" }, { status: 429 });
    }

    // Asked as the person who started the batch (0119), not "system": a customer's deck gets the customer's verdict
    // and the usage row names who used it. Jobs from before 0119 have no actor and keep the old system judgment.
    const asker = { actor: job.actor ?? "system", ...(job.organizationId ? { orgId: job.organizationId } : {}) };
    const result = await generateTarotImage({ model, prompt, aspectRatio, seed, printQuality: true }, await grantFor("tarot.image", asker));
    if (!result.ok) {
      const errMsg = (result as { ok: false; error: string }).error;
      outcome = { error: errMsg };
      return NextResponse.json({ ok: false, error: errMsg, cardIndex }, { status: 200 });
    }

    // R2 is the only home of the image (the batch POST refuses to start without R2). Key: tarot-batch/{jobId}/{NNN}.png
    const parsed = parseImageDataUrl(result.image);
    if (!parsed) {
      outcome = { error: "unparseable_image" };
      return NextResponse.json({ ok: false, error: "unparseable_image", cardIndex }, { status: 200 });
    }
    const key = `tarot-batch/${jobId}/${String(cardIndex).padStart(3, "0")}.png`;
    const r2result = await putDesignObject(key, parsed.buffer, parsed.mime);
    if (!r2result.ok) {
      outcome = { error: `r2_upload_failed: ${(r2result as { error: string }).error}` };
      return NextResponse.json({ ok: false, error: "r2_upload_failed", cardIndex }, { status: 200 });
    }
    outcome = { url: r2result.publicUrl };
    return NextResponse.json({ ok: true, cardIndex, url: r2result.publicUrl });
  } finally {
    await finishCard(jobId, cardIndex, outcome).catch((e) =>
      console.error("[tarot-batch] card: finishCard failed", e instanceof Error ? e.message : String(e)));
  }
}

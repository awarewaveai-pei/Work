import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { CONTEXT_FILL_PROMPT, cropOutpaintResult, generativeFill, imageSize, isFillTool, outpaintCanvas, OUTPAINT_PRESETS, type OutpaintPreset } from "../../../../../lib/studio/generative-fill"
import { outpaintFrame } from "../../../../../lib/studio/outpaint-presets";
import { generateTarotImage } from "../../../../../lib/tarot/image-gen";
import { isStudioModel, modelsFor, nearestAspectRatio } from "../../../../../lib/studio/model-options";
import { holdCost, logImageCost, releaseHold } from "../../../../../lib/ai/log-ai-call";
import { imageCostUsd } from "../../../../../lib/ai/cost-calculator";
import { IMAGE_RATES } from "../../../../../lib/ai/cost-model";

export const runtime = "nodejs";
export const maxDuration = 120; // openai-26-edit runs up to 110 s (image-gen.ts timeoutMs); the Replicate tools stay under 60

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64, same ceiling as inpaint / remove-bg / designs save
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;
const ROUTE = "tools/studio/genfill";

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("studio.fill", handlePost);

interface Body { image?: string; mask?: string; prompt?: string; outpaint?: string; model?: string; _jobId?: string }

/**
 * 生成填色 {image, mask, prompt?} or 擴圖 {image, prompt?, outpaint}; `model` = a catalog row offering that use
 * (public/editor-shared/image-models.js modelsFor("fill" | "outpaint")), default flux-fill-pro (the /tools/canvas editor sends none).
 * Empty prompt = fill from the surroundings (CONTEXT_FILL_PROMPT). Mask: WHITE = change.
 */
async function handlePost(request: Request, grant: Grant) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.image !== "string") {
    return NextResponse.json({ ok: false, error: "image (data URL) is required" }, { status: 400 });
  }
  if (body.prompt !== undefined && typeof body.prompt !== "string") {
    return NextResponse.json({ ok: false, error: "prompt must be a string" }, { status: 400 });
  }
  // Exactly one steering input: mask (generative fill) OR outpaint (extend canvas).
  const hasMask = typeof body.mask === "string";
  const hasOutpaint = typeof body.outpaint === "string";
  if (!hasMask && !hasOutpaint) {
    return NextResponse.json({ ok: false, error: "mask or outpaint is required" }, { status: 400 });
  }
  if (body.image.length > MAX_IMAGE_CHARS || (hasMask && body.mask!.length > MAX_IMAGE_CHARS)) {
    return NextResponse.json({ ok: false, error: "image/mask too large (~9MB limit)" }, { status: 413 });
  }
  if (!DATA_URL_RE.test(body.image)) {
    return NextResponse.json({ ok: false, error: "image must be a png/jpeg/webp base64 data URL" }, { status: 400 });
  }
  if (hasMask && !DATA_URL_RE.test(body.mask!)) {
    return NextResponse.json({ ok: false, error: "mask must be a png/jpeg/webp base64 data URL" }, { status: 400 });
  }
  if (hasOutpaint && !OUTPAINT_PRESETS.includes(body.outpaint as OutpaintPreset)) {
    return NextResponse.json({ ok: false, error: "invalid outpaint preset" }, { status: 400 });
  }
  const model = body.model ?? "flux-fill-pro";
  if (!modelsFor(hasOutpaint ? "outpaint" : "fill").some((m) => m.value === model)) {
    return NextResponse.json({ ok: false, error: "invalid_model" }, { status: 400 });
  }
  // A preset that adds no canvas (補成正方形 on an already-square image) is a paid no-op on every model: refuse it
  // before any hold. Found by lib/studio/__tests__/outpaint-canvas.test.ts, 2026-11-14.
  if (hasOutpaint) {
    const src = await imageSize(body.image);
    const f = src ? outpaintFrame(body.outpaint as OutpaintPreset, src.width, src.height) : null;
    if (!src || !f) return NextResponse.json({ ok: false, error: "invalid_image" }, { status: 400 });
    if (Math.round(f.W) <= src.width && Math.round(f.H) <= src.height) {
      return NextResponse.json({ ok: false, error: "nothing_to_outpaint" });
    }
  }
  const jobId = typeof body._jobId === "string" ? body._jobId : null;
  const prompt = body.prompt?.trim() || CONTEXT_FILL_PROMPT;

  // An OpenAI image model edits with the mask through the shared engine, which holds, settles on the reported usage and logs.
  if (isStudioModel(model)) {
    // 擴圖: these models have no `outpaint` input, so the extended canvas and its mask are built here and the model
    // simply fills the transparent margin. 生成填色 passes the caller's own image and mask through unchanged.
    const built = hasOutpaint ? await outpaintCanvas(body.image, body.outpaint as OutpaintPreset) : null;
    if (hasOutpaint && !built) return NextResponse.json({ ok: false, error: "invalid_image" }, { status: 400 });
    const image = built?.image ?? body.image;
    const size = await imageSize(image);
    if (!size) return NextResponse.json({ ok: false, error: "invalid_image" }, { status: 400 });
    const r = await generateTarotImage({
      model, prompt, referenceImages: [image], mask: built?.mask ?? body.mask,
      // An outpaint asks for the box its canvas was letterboxed into; anything else comes back a different shape.
      aspectRatio: built?.aspectRatio ?? nearestAspectRatio(size.width, size.height),
      costLog: { route: ROUTE, tool: "canvas", jobId },
    }, grant);
    if (r.ok === false) return NextResponse.json({ ok: false, error: r.error });
    const finished = built ? await cropOutpaintResult(r.image, built) : r.image;
    if (!finished) return NextResponse.json({ ok: false, error: "genfill_failed" });
    return NextResponse.json({ ok: true, image: finished });
  }
  if (!isFillTool(model)) return NextResponse.json({ ok: false, error: "invalid_model" }, { status: 400 });

  // Credits held before the provider runs (Grant.hold); every delivered call is charged, with or without a _jobId.
  const costUsd = imageCostUsd(model);
  const hold = await holdCost(grant, costUsd);
  if (!hold) return NextResponse.json({ ok: false, error: "no_credits" });
  const result = await generativeFill({
    model,
    image: body.image,
    prompt,
    mask: hasOutpaint ? undefined : body.mask, // outpaint ignores the mask
    outpaint: hasOutpaint ? (body.outpaint as OutpaintPreset) : undefined,
  }).catch((e) => { releaseHold(hold, ROUTE); throw e; });
  if (result.ok) void logImageCost({ route: ROUTE, model, vendor: IMAGE_RATES[model].vendor, costUsd, jobId, tool: "canvas", grant, hold });
  else releaseHold(hold, ROUTE);
  // HTTP 200 with ok:false on failure — same nginx error_page rationale as the other studio routes.
  return NextResponse.json(result);
}

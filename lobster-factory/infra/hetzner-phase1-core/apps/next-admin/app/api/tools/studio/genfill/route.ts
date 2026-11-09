import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { CONTEXT_FILL_PROMPT, generativeFill, imageSize, isFillTool, OUTPAINT_PRESETS, type OutpaintPreset } from "../../../../../lib/studio/generative-fill";
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
  const jobId = typeof body._jobId === "string" ? body._jobId : null;
  const prompt = body.prompt?.trim() || CONTEXT_FILL_PROMPT;

  // An OpenAI image model edits with the mask through the shared engine, which holds, settles on the reported usage and logs.
  if (isStudioModel(model)) {
    const size = await imageSize(body.image);
    if (!size) return NextResponse.json({ ok: false, error: "invalid_image" }, { status: 400 });
    const r = await generateTarotImage({
      model, prompt, referenceImages: [body.image], mask: body.mask, aspectRatio: nearestAspectRatio(size.width, size.height),
      costLog: { route: ROUTE, tool: "canvas", jobId },
    }, grant);
    return NextResponse.json(r.ok === false ? { ok: false, error: r.error } : { ok: true, image: r.image });
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

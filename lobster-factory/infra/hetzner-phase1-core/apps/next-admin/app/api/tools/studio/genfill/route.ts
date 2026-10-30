import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { generativeFill, OUTPAINT_PRESETS, type OutpaintPreset } from "../../../../../lib/studio/generative-fill";
import { logImageCost } from "../../../../../lib/ai/log-ai-call";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64, same ceiling as inpaint / remove-bg / designs save
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("studio.fill", handlePost);

async function handlePost(request: Request, grant: Grant) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { image?: string; mask?: string; prompt?: string; outpaint?: string; _jobId?: string };
  try {
    body = (await request.json()) as { image?: string; mask?: string; prompt?: string; outpaint?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.image !== "string" || typeof body.prompt !== "string") {
    return NextResponse.json({ ok: false, error: "image (data URL) and prompt are required" }, { status: 400 });
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

  const result = await generativeFill({
    image: body.image,
    prompt: body.prompt,
    mask: hasOutpaint ? undefined : body.mask, // outpaint ignores the mask
    outpaint: hasOutpaint ? (body.outpaint as OutpaintPreset) : undefined,
  });
  if (result.ok) {
    const jobId = typeof body._jobId === "string" ? body._jobId : null;
    if (jobId) {
      void logImageCost({ route: "tools/studio/genfill", model: "flux-fill-pro", vendor: "Replicate", costUsd: 0.05, jobId, tool: "canvas", grant });
    }
  }
  // HTTP 200 with ok:false on failure — same nginx error_page rationale as the other studio routes.
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { removeObject } from "../../../../../lib/studio/inpaint";
import { holdCost, logImageCost, releaseHold } from "../../../../../lib/ai/log-ai-call";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64, same ceiling as remove-bg / designs save
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("studio.inpaint", handlePost);

async function handlePost(request: Request, grant: Grant) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { image?: string; mask?: string; _jobId?: string };
  try {
    body = (await request.json()) as { image?: string; mask?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.image !== "string" || typeof body.mask !== "string") {
    return NextResponse.json({ ok: false, error: "image and mask (base64 data URLs) are required" }, { status: 400 });
  }
  if (body.image.length > MAX_IMAGE_CHARS || body.mask.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ ok: false, error: "image/mask too large (~9MB limit)" }, { status: 413 });
  }
  if (!DATA_URL_RE.test(body.image) || !DATA_URL_RE.test(body.mask)) {
    return NextResponse.json({ ok: false, error: "image/mask must be png/jpeg/webp base64 data URLs" }, { status: 400 });
  }

  // Credits held before the provider runs (Grant.hold); every delivered call is charged, with or without a _jobId.
  const hold = await holdCost(grant, 0.003);
  if (!hold) return NextResponse.json({ ok: false, error: "no_credits" });
  const result = await removeObject(body.image, body.mask).catch((e) => { releaseHold(hold, "tools/studio/inpaint"); throw e; });
  const jobId = typeof body._jobId === "string" ? body._jobId : null;
  if (result.ok) void logImageCost({ route: "tools/studio/inpaint", model: "bria-eraser", vendor: "Replicate", costUsd: 0.003, jobId, tool: "canvas", grant, hold });
  else releaseHold(hold, "tools/studio/inpaint");
  // HTTP 200 with ok:false on failure — same nginx error_page rationale as the other studio routes.
  return NextResponse.json(result);
}

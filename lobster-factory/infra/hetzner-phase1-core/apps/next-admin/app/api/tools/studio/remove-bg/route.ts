import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { removeBackground } from "../../../../../lib/studio/bg-remover";
import { holdCost, logImageCost, releaseHold } from "../../../../../lib/ai/log-ai-call";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64, same ceiling as designs save

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("studio.remove-bg", handlePost);

async function handlePost(request: Request, grant: Grant) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { image?: string; _jobId?: string };
  try {
    body = (await request.json()) as { image?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body.image || typeof body.image !== "string") {
    return NextResponse.json({ ok: false, error: "image (base64 data URL) is required" }, { status: 400 });
  }
  if (body.image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ ok: false, error: "image too large (~9MB limit)" }, { status: 413 });
  }
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(body.image)) {
    return NextResponse.json(
      { ok: false, error: "image must be a png/jpeg/webp base64 data URL" },
      { status: 400 },
    );
  }

  // Credits held before the provider runs (Grant.hold); every delivered call is charged, with or without a _jobId.
  const hold = await holdCost(grant, 0.002);
  if (!hold) return NextResponse.json({ ok: false, error: "no_credits" });
  const result = await removeBackground(body.image).catch((e) => { releaseHold(hold, "tools/studio/remove-bg"); throw e; });
  if (result.ok) {
    const jobId = typeof body._jobId === "string" ? body._jobId : null;
    void logImageCost({ route: "tools/studio/remove-bg", model: "rembg", vendor: "Replicate", costUsd: 0.002, jobId, tool: "studio", grant, hold });
    return NextResponse.json(result);
  }
  releaseHold(hold, "tools/studio/remove-bg");
  // HTTP 200 with ok:false — same nginx error_page rationale as the generate routes.
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import {
  generateImage,
  isStudioModel,
  isAspectRatio,
  STUDIO_MODEL_OPTIONS,
} from "../../../../../lib/studio/image-provider";
import { getDesignsPublicBase } from "../../../../../lib/storage/r2";
import { imageCostUsd } from "../../../../../lib/ai/cost-calculator";
import { logImageCost } from "../../../../../lib/ai/log-ai-call";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  model?: string;
  prompt?: string;
  referenceImages?: unknown;
  seed?: number | null;
  aspectRatio?: string;
  _jobId?: string;
}

// Per-image ceiling matches the tarot generate route; per-model count comes from
// STUDIO_MODEL_OPTIONS (nano-banana-2 takes 14, most take 0–5). Refs are downscaled
// client-side to ~1024px JPEG, so the total cap below is generous headroom while
// still bounding the request body well under nginx client_max_body_size.
const MAX_REF_CHARS = 12_000_000; // ~9 MB base64 per image
const MAX_TOTAL_REF_CHARS = 24_000_000; // ~18 MB across all reference images

function maxRefsForModel(model: string): number {
  return STUDIO_MODEL_OPTIONS.find((m) => m.value === model)?.maxRefs ?? 0;
}

function friendlyError(code: string): string {
  if (code.includes("billing_hard_limit") || code.includes("insufficient_quota"))
    return "OpenAI 帳號額度已達上限 — 請到 platform.openai.com → Billing 加額度後再試（FLUX 模型不受影響）。";
  if (code.includes("missing_openai")) return "伺服器未設定 OpenAI 金鑰。";
  if (code.includes("missing_replicate")) return "伺服器未設定 Replicate 金鑰。";
  if (code.includes("content_policy") || code.includes("moderation"))
    return "提示詞被內容安全政策擋下，請調整描述。";
  if (code.includes("character_reference_required")) return "此模型需要至少 1 張角色參考圖。";
  if (code === "generation_timeout") return "生成逾時，請重試或改用較快的模型（FLUX schnell）。";
  return `生成失敗：${code}`;
}

export const POST = withFeature("studio.image", handlePost);
async function handlePost(request: Request, grant: Grant): Promise<Response> {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isStudioModel(body.model)) {
    return NextResponse.json({ ok: false, error: "unknown_model" }, { status: 400 });
  }
  if (body.aspectRatio != null && !isAspectRatio(body.aspectRatio)) {
    return NextResponse.json(
      { ok: false, error: "aspectRatio must be one of: 1:1 2:3 3:2 4:3 3:4 4:5 9:16 16:9" },
      { status: 400 },
    );
  }
  if (!body.prompt || body.prompt.trim().length < 3) {
    return NextResponse.json({ ok: false, error: "prompt is required (min length 3)" }, { status: 400 });
  }
  let referenceImages: string[] = [];
  if (body.referenceImages != null) {
    if (!Array.isArray(body.referenceImages)) {
      return NextResponse.json({ ok: false, error: "referenceImages must be an array" }, { status: 400 });
    }
    const refCap = maxRefsForModel(body.model);
    if (body.referenceImages.length > refCap) {
      return NextResponse.json(
        { ok: false, error: refCap === 0 ? "此模型不吃參考圖" : `此模型最多 ${refCap} 張參考圖` },
        { status: 400 },
      );
    }
    // data URLs, or our own designs bucket (My Designs picks travel as public URLs —
    // Replicate fetches them directly; arbitrary外部 URL 仍擋掉避免 SSRF/權限外洩).
    const designsBase = getDesignsPublicBase() + "/";
    let totalChars = 0;
    for (const ref of body.referenceImages) {
      const isDataUrl = typeof ref === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(ref);
      const isOwnDesignUrl = typeof ref === "string" && ref.startsWith(designsBase);
      if (!isDataUrl && !isOwnDesignUrl) {
        return NextResponse.json(
          { ok: false, error: "每張參考圖須為 png/jpeg/webp 的 base64 data URL，或 My Designs 的圖庫 URL" },
          { status: 400 },
        );
      }
      if (ref.length > MAX_REF_CHARS) {
        return NextResponse.json({ ok: false, error: "參考圖太大（單張上限 ~9MB）" }, { status: 413 });
      }
      totalChars += ref.length;
      if (totalChars > MAX_TOTAL_REF_CHARS) {
        return NextResponse.json({ ok: false, error: "參考圖總量太大（合計上限 ~18MB）" }, { status: 413 });
      }
    }
    referenceImages = body.referenceImages;
  }
  if (body.seed != null && (!Number.isInteger(body.seed) || body.seed < 0)) {
    return NextResponse.json({ ok: false, error: "seed must be a non-negative integer" }, { status: 400 });
  }

  const result = await generateImage({
    model: body.model,
    prompt: body.prompt,
    referenceImages,
    seed: body.seed ?? null,
    aspectRatio: isAspectRatio(body.aspectRatio) ? body.aspectRatio : undefined,
  }, grant);

  if (result.ok) {
    const jobId = typeof body._jobId === "string" ? body._jobId : null;
    if (jobId) {
      void logImageCost({ route: "tools/studio/generate", model: body.model ?? "unknown", vendor: "Replicate", costUsd: imageCostUsd(body.model ?? ""), jobId, tool: "studio" });
    }
    return NextResponse.json(result);
  }
  // HTTP 200 with ok:false so the JSON reaches the browser (nginx error_page would
  // otherwise replace a 5xx body with HTML → client sees "Unexpected token '<'").
  const code = (result as { ok: false; error: string }).error;
  return NextResponse.json({ ok: false, error: friendlyError(code), code });
}

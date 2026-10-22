import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { generateTarotImage, isTarotModel, isAspectRatio } from "../../../../../lib/tarot/image-gen";
import { checkAndConsumeQuota } from "../../../../../lib/tarot/quota";
import { MAX_REFS_PER_REQUEST } from "../../../../../lib/tarot/model-specs";
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
  printQuality?: boolean;
  _jobId?: string;
}

const MAX_REF_IMAGES = MAX_REFS_PER_REQUEST;
const MAX_REF_CHARS = 12_000_000; // ~9 MB base64

/** Map an internal error code to a human-readable (zh-TW) message for the UI. */
function friendlyError(code: string): string {
  if (code.includes("billing_hard_limit") || code.includes("insufficient_quota"))
    return "OpenAI 帳號額度已達上限 — 請到 platform.openai.com → Billing 加額度後再試（FLUX 模型不受影響）。";
  if (code.includes("missing_openai")) return "伺服器未設定 OpenAI 金鑰。";
  if (code.includes("missing_replicate")) return "伺服器未設定 Replicate 金鑰。";
  if (code.includes("content_policy") || code.includes("moderation"))
    return "提示詞被內容安全政策擋下，請調整描述。";
  if (code === "generation_timeout") return "生成逾時，請重試或改用較快的模型（FLUX schnell）。";
  return `生成失敗：${code}`;
}

export const POST = withFeature("tarot.image", handlePost);
async function handlePost(request: Request, grant: Grant): Promise<Response> {
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

  if (!isTarotModel(body.model)) {
    return NextResponse.json(
      { ok: false, error: "unknown model — check TarotModel type for valid values" },
      { status: 400 },
    );
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
    if (body.referenceImages.length > MAX_REF_IMAGES) {
      return NextResponse.json({ ok: false, error: `最多 ${MAX_REF_IMAGES} 張參考圖` }, { status: 400 });
    }
    for (const ref of body.referenceImages) {
      if (typeof ref !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(ref)) {
        return NextResponse.json(
          { ok: false, error: "每張參考圖須為 png/jpeg/webp 的 base64 data URL" },
          { status: 400 },
        );
      }
      if (ref.length > MAX_REF_CHARS) {
        return NextResponse.json({ ok: false, error: "參考圖太大（單張上限 ~9MB）" }, { status: 413 });
      }
    }
    referenceImages = body.referenceImages;
  }
  if (body.seed != null && (!Number.isInteger(body.seed) || body.seed < 0)) {
    return NextResponse.json({ ok: false, error: "seed must be a non-negative integer" }, { status: 400 });
  }

  const quota = checkAndConsumeQuota();
  if (!quota.ok) {
    return NextResponse.json(
      { ok: false, error: `每日生成上限已達（${quota.limit} 張），UTC 00:00 重置。`, code: "quota_exceeded" },
      { status: 429 },
    );
  }

  const result = await generateTarotImage({
    model: body.model,
    prompt: body.prompt,
    referenceImages,
    seed: body.seed ?? null,
    aspectRatio: isAspectRatio(body.aspectRatio) ? body.aspectRatio : undefined,
    printQuality: body.printQuality === true,
  }, grant);

  if (result.ok) {
    const jobId = typeof body._jobId === "string" ? body._jobId : null;
    if (jobId) {
      void logImageCost({ route: "tools/tarot/generate", model: body.model, vendor: "Replicate", costUsd: imageCostUsd(body.model), jobId, tool: "tarot" });
    }
    return NextResponse.json(result);
  }
  // Return HTTP 200 with ok:false so the JSON reaches the browser. A 5xx here would let
  // nginx error_page replace the body with an HTML page → client sees "Unexpected token '<'".
  const code = (result as { ok: false; error: string }).error;
  return NextResponse.json({ ok: false, error: friendlyError(code), code });
}

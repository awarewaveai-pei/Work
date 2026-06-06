import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { generateTarotImage, isTarotModel } from "../../../../../lib/tarot/image-gen";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  model?: string;
  prompt?: string;
  referenceImages?: unknown;
  seed?: number | null;
}

const MAX_REF_IMAGES = 5;
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

export async function POST(request: Request) {
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
      { ok: false, error: "model must be one of flux-schnell|flux-dev|openai-low|openai-medium|openai-high" },
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

  const result = await generateTarotImage({
    model: body.model,
    prompt: body.prompt,
    referenceImages,
    seed: body.seed ?? null,
  });

  if (result.ok) {
    return NextResponse.json(result);
  }
  // Return HTTP 200 with ok:false so the JSON reaches the browser. A 5xx here would let
  // nginx error_page replace the body with an HTML page → client sees "Unexpected token '<'".
  const code = (result as { ok: false; error: string }).error;
  return NextResponse.json({ ok: false, error: friendlyError(code), code });
}

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { generateMockup } from "../../../../../lib/studio/printful-mockup";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64

const SUPPORTED_PRODUCT_TYPES = ["tshirt", "hoodie", "mug", "tote"] as const;

export async function POST(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { image?: string; productType?: string };
  try {
    body = (await request.json()) as { image?: string; productType?: string };
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

  const productType = body.productType ?? "tshirt";
  if (!SUPPORTED_PRODUCT_TYPES.includes(productType as (typeof SUPPORTED_PRODUCT_TYPES)[number])) {
    return NextResponse.json(
      { ok: false, error: `unsupported productType: ${productType}. Supported: ${SUPPORTED_PRODUCT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const result = await generateMockup(body.image, productType);

  if (result.ok) {
    return NextResponse.json(result);
  }
  // HTTP 200 with ok:false — same nginx rationale as other studio routes
  const code = (result as { ok: false; error: string }).error;
  let friendly = `Mockup 生成失敗：${code}`;
  if (code.includes("missing_printful_key")) friendly = "伺服器未設定 Printful API Key（PRINTFUL_API_KEY）。";
  if (code.includes("missing_printful_store_id")) friendly = "伺服器未設定 Printful Store ID（PRINTFUL_STORE_ID）。";
  if (code.includes("timeout")) friendly = "Printful mockup 逾時（> 60 秒），請重試。";
  if (code.includes("upload")) friendly = `設計圖上傳失敗：${code}`;
  return NextResponse.json({ ok: false, error: friendly, code });
}

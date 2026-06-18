import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { generateMockup, SUPPORTED_PRODUCT_TYPES } from "../../../../../lib/studio/printful-mockup";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64

export async function POST(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  // Accept either a base64 data URL (`image`) or a pre-uploaded R2 URL (`imageUrl`).
  // `imageUrl` is used when the design is already in R2 — avoids a browser CORS fetch.
  // `imageWidth`/`imageHeight` carry the image's natural pixel dimensions so the
  // server can compute aspect-ratio-correct print position (avoids 1:1 squish).
  let body: { image?: string; imageUrl?: string; productType?: string; imageWidth?: number; imageHeight?: number };
  try {
    body = (await request.json()) as { image?: string; imageUrl?: string; productType?: string; imageWidth?: number; imageHeight?: number };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const imageInput = body.imageUrl ?? body.image;
  if (!imageInput || typeof imageInput !== "string") {
    return NextResponse.json({ ok: false, error: "image (base64 data URL) or imageUrl (R2 https URL) is required" }, { status: 400 });
  }

  // Validate: either a known R2 https URL, or a base64 data URL.
  const isR2Url = /^https:\/\/[^/]+\.r2\.dev\//.test(imageInput) || /^https:\/\/[^/]+\.r2\.cloudflarestorage\.com\//.test(imageInput);
  const isDataUrl = /^data:image\/(png|jpe?g|webp);base64,/.test(imageInput);
  if (!isR2Url && !isDataUrl) {
    return NextResponse.json(
      { ok: false, error: "image must be a png/jpeg/webp base64 data URL or an R2 https:// URL" },
      { status: 400 },
    );
  }
  if (isDataUrl && imageInput.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ ok: false, error: "image too large (~9MB limit)" }, { status: 413 });
  }

  const productType = body.productType ?? "tshirt";
  if (!(SUPPORTED_PRODUCT_TYPES as string[]).includes(productType)) {
    return NextResponse.json(
      { ok: false, error: `unsupported productType: ${productType}. Supported: ${SUPPORTED_PRODUCT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const imageDims =
    typeof body.imageWidth === "number" && typeof body.imageHeight === "number" &&
    body.imageWidth > 0 && body.imageHeight > 0
      ? { width: body.imageWidth, height: body.imageHeight }
      : undefined;

  const result = await generateMockup(imageInput, productType, imageDims);

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

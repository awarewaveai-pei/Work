import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import {
  generateMockup,
  generateMockupBySpec,
  SUPPORTED_PRODUCT_TYPES,
  type DynamicProductSpec,
} from "../../../../../lib/studio/printful-mockup";
import { fetchProductSpec } from "../../../../../lib/studio/printful-catalog";
import { getCatalogVariants } from "../../../../../lib/studio/print-provider";
import { logImageCost } from "../../../../../lib/ai/log-ai-call";
import { POD_PRODUCT_MODELS } from "@/lib/studio/pod-catalog-config";

// Product doors serve this route (studio, design): only the products we sell -- the catalog Mockup Studio shows and the
// publish flow binds -- may spend the shared Printful store's mockup quota.
const SELLABLE_PRODUCT_IDS = new Set(POD_PRODUCT_MODELS.map((m) => m.catalogProductId));

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

  let body: {
    image?: string;
    imageUrl?: string;
    productType?: string;    // legacy (tshirt/hoodie/mug/tote)
    productId?: number;      // catalog product ID (preferred)
    variantId?: number;      // optional override for catalog product
    imageWidth?: number;
    imageHeight?: number;
    designSizePct?: number;  // 0.4–1.0, fraction of print-area width (default 0.8)
    color?: "white" | "grey" | "black"; // shirt colour → real Printful variant (default white)
    colorHex?: string;       // resolve the variant by Printful hex (per-colour mockup) — preferred over variantId/color
    _jobId?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const imageInput = body.imageUrl ?? body.image;
  if (!imageInput || typeof imageInput !== "string") {
    return NextResponse.json(
      { ok: false, error: "image (base64 data URL) or imageUrl (R2 https URL) is required" },
      { status: 400 },
    );
  }

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

  const imageDims =
    typeof body.imageWidth === "number" && typeof body.imageHeight === "number" &&
    body.imageWidth > 0 && body.imageHeight > 0
      ? { width: body.imageWidth, height: body.imageHeight }
      : undefined;

  // ── Route: catalog product ID vs legacy product type ──────────────────────
  if (typeof body.productId === "number") {
    if (!SELLABLE_PRODUCT_IDS.has(body.productId)) {
      return NextResponse.json({ ok: false, error: "unknown_product" }, { status: 400 });
    }
    // Dynamic catalog path: fetch printfile spec, then generate
    const color = body.color === "grey" || body.color === "black" ? body.color : "white";
    const catalogSpec = await fetchProductSpec(body.productId, color);
    if (!catalogSpec) {
      return NextResponse.json(
        { ok: false, error: `無法取得 Printful 產品規格 (productId=${body.productId})。此產品可能不支援 Mockup Generator。` },
        { status: 400 },
      );
    }
    // Resolve the mockup garment variant: explicit variantId > colorHex lookup (per-colour mockup,
    // uses the hex Phase 1b already verified) > catalog default. The mockup is per-colour not per-size,
    // so prefer the M variant of that colour.
    let resolvedVariantId = body.variantId ?? catalogSpec.variantId;
    if (!body.variantId && body.colorHex) {
      const cv = await getCatalogVariants(body.productId, [body.colorHex]);
      if (cv.ok && cv.value.length > 0) {
        const m = cv.value.find((v) => /^m$/i.test(v.size)) ?? cv.value[0];
        resolvedVariantId = m.id;
      }
    }
    const spec: DynamicProductSpec = {
      productId: catalogSpec.productId,
      variantId: resolvedVariantId,
      placement: catalogSpec.placement,
      areaWidth: catalogSpec.areaWidth,
      areaHeight: catalogSpec.areaHeight,
      designSizePct: typeof body.designSizePct === "number" ? body.designSizePct : 0.8,
    };
    const result = await generateMockupBySpec(imageInput, spec, imageDims);
    return jsonResult(result, typeof body._jobId === "string" ? body._jobId : null);
  }

  // Legacy: productType key in PRODUCT_CONFIG
  const productType = body.productType ?? "tshirt";
  if (!(SUPPORTED_PRODUCT_TYPES as string[]).includes(productType)) {
    return NextResponse.json(
      { ok: false, error: `unsupported productType: ${productType}. Supported: ${SUPPORTED_PRODUCT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  const result = await generateMockup(imageInput, productType, imageDims);
  return jsonResult(result, typeof body._jobId === "string" ? body._jobId : null);
}

function jsonResult(result: { ok: boolean; error?: string; [k: string]: unknown }, jobId?: string | null) {
  if (result.ok) {
    if (jobId) {
      void logImageCost({ route: "tools/studio/mockup", model: "printful-mockup", vendor: "Printful", costUsd: 0, jobId, tool: "mockup" });
    }
    return NextResponse.json(result);
  }
  const code = (result as { ok: false; error: string }).error;
  let friendly = `Mockup 生成失敗：${code}`;
  if (code.includes("missing_printful_key")) friendly = "伺服器未設定 Printful API Key（PRINTFUL_API_KEY）。";
  if (code.includes("missing_printful_store_id")) friendly = "伺服器未設定 Printful Store ID（PRINTFUL_STORE_ID）。";
  if (code.includes("timeout")) friendly = "Printful mockup 逾時（> 60 秒），請重試。";
  if (code.includes("upload")) friendly = `設計圖上傳失敗：${code}`;
  return NextResponse.json({ ok: false, error: friendly, code });
}

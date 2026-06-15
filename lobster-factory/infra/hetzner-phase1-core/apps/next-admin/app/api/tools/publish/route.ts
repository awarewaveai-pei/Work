import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { buildDesignKey, getDesignsPublicBase, putDesignObject } from "../../../../lib/storage/r2";
import { upscaleToPrintFile } from "../../../../lib/studio/upscaler";
import { buildFaithfulPrintFile } from "../../../../lib/studio/print-file";
import { toProductImage } from "../../../../lib/studio/to-product-image";
import { composeFlatlay, parseHexColor } from "../../../../lib/studio/flatlay";
import { generateProductCopy } from "../../../../lib/studio/product-copy";
import { createWooProduct, isBridgeConfigured } from "../../../../lib/studio/wp-bridge-client";
import { buildPodProductPayload, buildVariantPlan, priceForSize } from "../../../../lib/studio/pod-product";
import {
  createSyncProductOnNative,
  getCatalogVariants,
  getSyncProduct,
  isNativeStoreConfigured,
  isPrintfulConfigured,
  linkSyncVariant,
  listSyncProducts,
} from "../../../../lib/studio/print-provider";

export const runtime = "nodejs";
export const maxDuration = 120; // upscale step can take ~1-2 min

/**
 * One-click publish chain, split into bounded steps (each < nginx timeout):
 *   upscale     → print file into the designs bucket. printMode决定忠实度:
 *                 "original" (default, 100% 像素忠实) / "resample" (Lanczos 忠实放大) /
 *                 "ai-enhance" (Real-ESRGAN — 非忠实, opt-in only)
 *   productimage→ bake the design itself into a web-square WebP product image (~100KB)
 *   create      → wp-bridge draft Woo product (Color×Size variations, mockup images)
 *   status      → has the Printful plugin synced the Woo product yet?
 *   link        → bind every synced variant to its Bella 3001 catalog variant + print file
 */

function gate(request: Request): NextResponse | null {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  return null;
}

interface PublishBody {
  action?: "upscale" | "productimage" | "flatlay" | "copy" | "create" | "status" | "link" | "pfcreate";
  // upscale / productimage / flatlay
  designUrl?: string;
  longEdgePx?: number;
  // flatlay (faithful real-design overlay)
  bgColor?: string; // "#rrggbb"
  bgUrl?: string; // optional decorative background from My Designs (R2)
  // upscale fidelity: default "original" (100% faithful). "ai-enhance" = Real-ESRGAN (not faithful).
  printMode?: "original" | "resample" | "ai-enhance";
  // copy (AI SEO/GEO/AEO/RankMath product copy)
  designPrompt?: string;
  subject?: string;
  productType?: string;
  theme?: string;
  brand?: string;
  focusKeywordHint?: string;
  // create
  title?: string;
  designName?: string; // SKU seed — pfcreate must rebuild the SAME plan/SKUs as `create`
  retailPrice?: string;
  plusPrice?: string;
  sizes?: string[];
  shortDescription?: string;
  bullets?: string[];
  seo?: { focus_keyword?: string; title?: string; description?: string };
  mockupUrls?: string[];
  // status / link
  wooProductId?: number;
  printFileUrl?: string;
  variantMap?: { variationId: number; color: string; size: string }[];
}

const PRICE_RE = /^\d+(\.\d{1,2})?$/;

export async function POST(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const designsBase = getDesignsPublicBase() + "/";

  // ── Step 1: design → print file ────────────────────────────────────────────
  // Default = faithful (100% pixel-identical artwork). ai-enhance = Real-ESRGAN opt-in.
  if (body.action === "upscale") {
    if (!body.designUrl || !body.designUrl.startsWith(designsBase)) {
      return NextResponse.json(
        { ok: false, error: "designUrl must be a My Designs asset URL" },
        { status: 400 },
      );
    }
    const mode = body.printMode ?? "original";
    if (mode === "ai-enhance") {
      // Real-ESRGAN — sharper but synthesises detail (NOT 100% faithful). Explicit opt-in.
      const r = await upscaleToPrintFile(body.designUrl, body.longEdgePx ?? null);
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
      }
      return NextResponse.json({
        ok: true,
        printFileUrl: r.printFileUrl,
        mode: "ai-enhance",
        faithful: false,
        byteSize: r.byteSize,
        inputLongEdgePx: r.inputLongEdgePx,
        achievedLongEdgePx: r.achievedLongEdgePx,
        meetsTarget: r.meetsTarget,
        passes: r.passes,
      });
    }
    // "original" | "resample" — faithful (no AI hallucination).
    const r = await buildFaithfulPrintFile(body.designUrl, { mode });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      printFileUrl: r.printFileUrl,
      mode: r.mode,
      faithful: true,
      byteSize: r.byteSize,
      inputLongEdgePx: r.inputLongEdgePx,
      achievedLongEdgePx: r.longEdgePx,
      dpiAtFullPrint: r.dpiAtFullPrint,
      meetsTarget: r.meetsTarget,
      passes: 0,
    });
  }

  // ── Step 1b: design → web product image (faithful WebP ~100KB, no reinterpretation) ──
  if (body.action === "productimage") {
    if (!body.designUrl || !body.designUrl.startsWith(designsBase)) {
      return NextResponse.json(
        { ok: false, error: "designUrl must be a My Designs asset URL" },
        { status: 400 },
      );
    }
    // Size + timeout caps mirror print-file.ts — the SG host is OOM-prone and the
    // designs bucket is user-writable, so never buffer an unbounded body (critic 2026-06-15).
    const PRODUCTIMAGE_MAX_BYTES = 60 * 1024 * 1024;
    const piController = new AbortController();
    const piKiller = setTimeout(() => piController.abort(), 25_000);
    let inputBuffer: Buffer;
    try {
      const res = await fetch(body.designUrl, { redirect: "manual", signal: piController.signal });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `fetch_input_failed_${res.status}` }, { status: 502 });
      }
      if (Number(res.headers.get("content-length") ?? "0") > PRODUCTIMAGE_MAX_BYTES) {
        return NextResponse.json({ ok: false, error: "input_too_large" }, { status: 413 });
      }
      const ab = await res.arrayBuffer();
      if (ab.byteLength > PRODUCTIMAGE_MAX_BYTES) {
        return NextResponse.json({ ok: false, error: "input_too_large" }, { status: 413 });
      }
      inputBuffer = Buffer.from(ab);
    } catch {
      return NextResponse.json(
        { ok: false, error: piController.signal.aborted ? "fetch_input_timeout" : "fetch_input_network_error" },
        { status: 502 },
      );
    } finally {
      clearTimeout(piKiller);
    }
    let webp: Buffer;
    try {
      // web-square: 1000×1000 contain on white — the design composited only by scale/letterbox,
      // never reinterpreted (sharp deterministic). sRGB WebP for product pages.
      webp = await toProductImage(inputBuffer, "web-square");
    } catch {
      return NextResponse.json({ ok: false, error: "product_image_encode_failed" }, { status: 502 });
    }
    const key = buildDesignKey("image/webp");
    if (!key) return NextResponse.json({ ok: false, error: "unsupported_image_mime" }, { status: 500 });
    const put = await putDesignObject(key, webp, "image/webp");
    if (!put.ok) {
      return NextResponse.json({ ok: false, error: (put as { ok: false; error: string }).error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, productImageUrl: put.publicUrl, byteSize: put.byteSize });
  }

  // ── Step 1d: faithful flat-lay — real design overlaid on a background (no AI redraw) ──
  if (body.action === "flatlay") {
    if (!body.designUrl || !body.designUrl.startsWith(designsBase)) {
      return NextResponse.json({ ok: false, error: "designUrl must be a My Designs asset URL" }, { status: 400 });
    }
    if (body.bgUrl && !body.bgUrl.startsWith(designsBase)) {
      return NextResponse.json({ ok: false, error: "bgUrl must be a My Designs asset URL" }, { status: 400 });
    }
    // Size+timeout-capped fetch of an allowlisted designs-bucket asset (OOM/SSRF guard).
    const fetchAsset = async (url: string): Promise<Buffer | null> => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25_000);
      try {
        const res = await fetch(url, { redirect: "manual", signal: ctrl.signal });
        if (!res.ok) return null;
        if (Number(res.headers.get("content-length") ?? "0") > 60 * 1024 * 1024) return null;
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 60 * 1024 * 1024) return null;
        return Buffer.from(ab);
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    };
    const designBuf = await fetchAsset(body.designUrl);
    if (!designBuf) return NextResponse.json({ ok: false, error: "design_fetch_failed" }, { status: 502 });
    const bgImageBuffer = body.bgUrl ? (await fetchAsset(body.bgUrl)) ?? undefined : undefined;
    const bgColor = body.bgColor ? parseHexColor(body.bgColor) ?? undefined : undefined;
    const r = await composeFlatlay(designBuf, { bgColor, bgImageBuffer });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
    }
    const key = buildDesignKey("image/webp");
    if (!key) return NextResponse.json({ ok: false, error: "unsupported_image_mime" }, { status: 500 });
    const put = await putDesignObject(key, r.buffer, "image/webp");
    if (!put.ok) {
      return NextResponse.json({ ok: false, error: (put as { ok: false; error: string }).error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, flatlayUrl: put.publicUrl, byteSize: put.byteSize });
  }

  // ── Step 1c: AI product copy (SEO + GEO + AEO + RankMath) ───────────────────
  if (body.action === "copy") {
    const r = await generateProductCopy({
      designPrompt: body.designPrompt,
      subject: body.subject,
      productType: body.productType,
      theme: body.theme,
      brand: body.brand,
      focusKeywordHint: body.focusKeywordHint,
      siteDomain: (() => {
        try {
          return process.env.WPBRIDGE_BASE_URL ? new URL(process.env.WPBRIDGE_BASE_URL).host : undefined;
        } catch {
          return undefined;
        }
      })(),
    });
    if (!r.ok) {
      const code = (r as { ok: false; error: string }).error;
      let friendly = `文案生成失敗：${code}`;
      if (code === "missing_anthropic_key") friendly = "伺服器未設定 ANTHROPIC_API_KEY。";
      if (code === "anthropic_auth_error") friendly = "Anthropic 金鑰錯誤（401/403）。";
      if (code === "anthropic_rate_limit") friendly = "Anthropic 流量限制，請稍後重試。";
      if (code === "anthropic_overloaded") friendly = "Anthropic 服務忙碌，請稍後重試。";
      return NextResponse.json({ ok: false, error: friendly, code });
    }
    return NextResponse.json({ ok: true, copy: r.copy, rankMath: r.rankMath });
  }

  // ── Step 2: create draft Woo product via wp-bridge ─────────────────────────
  if (body.action === "create") {
    if (!isBridgeConfigured()) {
      return NextResponse.json(
        { ok: false, error: "bridge_not_configured", hint: "Set WPBRIDGE_BASE_URL / WPBRIDGE_KEY_ID / WPBRIDGE_PRIVATE_KEY." },
        { status: 503 },
      );
    }
    if (!body.title || body.title.trim().length < 3) {
      return NextResponse.json({ ok: false, error: "title is required (min 3 chars)" }, { status: 400 });
    }
    if (!body.retailPrice || !PRICE_RE.test(body.retailPrice)) {
      return NextResponse.json({ ok: false, error: "retailPrice must look like 24.99" }, { status: 400 });
    }
    if (body.plusPrice !== undefined && !PRICE_RE.test(body.plusPrice)) {
      return NextResponse.json({ ok: false, error: "plusPrice must look like 26.99" }, { status: 400 });
    }
    const mockupUrls = (body.mockupUrls ?? []).filter((u) => typeof u === "string" && u.startsWith(designsBase));
    const params = {
      title: body.title.trim(),
      retailPrice: body.retailPrice,
      plusPrice: body.plusPrice,
      sizes: body.sizes,
      shortDescription: body.shortDescription,
      bullets: Array.isArray(body.bullets) ? body.bullets.filter((b) => typeof b === "string") : undefined,
      seo: body.seo && typeof body.seo === "object" ? body.seo : undefined,
      mockupUrls,
    };
    // Always a real write (plugin has no /product dry-run) — payload is draft-status.
    const payload = buildPodProductPayload(params);
    const r = await createWooProduct(payload);
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
    }
    const value = r.value;
    // Pair returned variation_ids (creation order) with our deterministic plan order.
    const plan = buildVariantPlan(params);
    const variantMap =
      value.variation_ids && value.variation_ids.length === plan.length
        ? value.variation_ids.map((variationId, i) => ({
            variationId,
            color: plan[i].color,
            size: plan[i].size,
          }))
        : [];
    return NextResponse.json({ ok: true, ...value, variantMap });
  }

  // ── Step 3: has Printful synced the new Woo product? ───────────────────────
  if (body.action === "status") {
    if (!isPrintfulConfigured()) {
      return NextResponse.json({ ok: false, error: "printful_not_configured" }, { status: 503 });
    }
    if (!Number.isInteger(body.wooProductId) || (body.wooProductId as number) <= 0) {
      return NextResponse.json({ ok: false, error: "wooProductId (positive integer) is required" }, { status: 400 });
    }
    const list = await listSyncProducts();
    if (!list.ok) {
      return NextResponse.json({ ok: false, error: (list as { ok: false; error: string }).error }, { status: 502 });
    }
    const found = list.value.find((p) => p.externalId === String(body.wooProductId));
    return NextResponse.json({ ok: true, synced: Boolean(found), syncProduct: found ?? null });
  }

  // ── Step 4: link every synced variant → catalog variant + print file ───────
  if (body.action === "link") {
    if (!isPrintfulConfigured()) {
      return NextResponse.json({ ok: false, error: "printful_not_configured" }, { status: 503 });
    }
    if (!Number.isInteger(body.wooProductId) || (body.wooProductId as number) <= 0) {
      return NextResponse.json({ ok: false, error: "wooProductId (positive integer) is required" }, { status: 400 });
    }
    if (!body.printFileUrl || !body.printFileUrl.startsWith(designsBase)) {
      return NextResponse.json({ ok: false, error: "printFileUrl must be a My Designs asset URL" }, { status: 400 });
    }
    const list = await listSyncProducts();
    if (!list.ok) {
      return NextResponse.json({ ok: false, error: (list as { ok: false; error: string }).error }, { status: 502 });
    }
    const found = list.value.find((p) => p.externalId === String(body.wooProductId));
    if (!found) {
      return NextResponse.json({
        ok: false,
        error: "not_synced_yet — Printful 只同步「已發布」商品（draft 不同步，live 驗證 2026-06-11）。請先在 Woo 後台 review 後 publish（可先設為隱藏），同步後再回來綁定。",
      });
    }
    const detail = await getSyncProduct(found.id);
    if (!detail.ok) {
      return NextResponse.json({ ok: false, error: (detail as { ok: false; error: string }).error }, { status: 502 });
    }
    const catalog = await getCatalogVariants(71, ["White", "Black"]);
    if (!catalog.ok) {
      return NextResponse.json({ ok: false, error: (catalog as { ok: false; error: string }).error }, { status: 502 });
    }
    const catalogByKey = new Map(catalog.value.map((v) => [`${v.color.toLowerCase()}|${v.size.toLowerCase()}`, v.id]));
    const mapByVariation = new Map(
      (body.variantMap ?? []).map((m) => [String(m.variationId), { color: m.color, size: m.size }]),
    );

    const results: { syncVariantId: number; status: string }[] = [];
    for (const variant of detail.value.variants) {
      // Authoritative source = the Printful-side variant name ("Title - White / S").
      // The client-supplied variantMap is only a fallback, and when both exist they
      // must AGREE — a mismatched map mislinks catalog variants/prices (critic 2026-06-11).
      const m = /-\s*(White|Black)\s*\/\s*(\S+)\s*$/i.exec(variant.name);
      const parsed = m ? { color: m[1], size: m[2] } : undefined;
      const mapped = variant.externalId ? mapByVariation.get(variant.externalId) : undefined;
      let colorSize = parsed ?? mapped;
      if (
        parsed &&
        mapped &&
        (parsed.color.toLowerCase() !== mapped.color.toLowerCase() ||
          parsed.size.toLowerCase() !== mapped.size.toLowerCase())
      ) {
        results.push({ syncVariantId: variant.id, status: "skip_map_name_mismatch" });
        continue;
      }
      if (!colorSize) {
        results.push({ syncVariantId: variant.id, status: "skip_unmapped" });
        continue;
      }
      const catalogId = catalogByKey.get(`${colorSize.color.toLowerCase()}|${colorSize.size.toLowerCase()}`);
      if (!catalogId) {
        results.push({ syncVariantId: variant.id, status: `skip_no_catalog_${colorSize.color}_${colorSize.size}` });
        continue;
      }
      const price =
        body.retailPrice && PRICE_RE.test(body.retailPrice)
          ? priceForSize(colorSize.size, body.retailPrice, body.plusPrice)
          : undefined;
      const linked = await linkSyncVariant(variant.id, catalogId, body.printFileUrl, price);
      results.push({
        syncVariantId: variant.id,
        status: linked.ok ? "linked" : `error: ${(linked as { ok: false; error: string }).error}`,
      });
    }
    const linkedCount = results.filter((x) => x.status === "linked").length;
    return NextResponse.json({ ok: true, syncProductId: found.id, linkedCount, total: results.length, results });
  }

  // ── Step 3+4 (native): create the Printful product AND bind every variant + print file in ONE
  //    API call. Replaces the status/link dance, which only works for the Woo-platform store and
  //    is blocked there anyway (no API to import an externally-created Woo product). The native
  //    "Manual Order / API platform" store accepts POST /store/products → fully automatic.
  if (body.action === "pfcreate") {
    if (!isNativeStoreConfigured()) {
      return NextResponse.json(
        { ok: false, error: "printful_native_store_not_configured", hint: "Set PRINTFUL_NATIVE_STORE_ID." },
        { status: 503 },
      );
    }
    if (!Number.isInteger(body.wooProductId) || (body.wooProductId as number) <= 0) {
      return NextResponse.json({ ok: false, error: "wooProductId (positive integer) is required" }, { status: 400 });
    }
    if (!body.title || body.title.trim().length < 3) {
      return NextResponse.json({ ok: false, error: "title is required (min 3 chars)" }, { status: 400 });
    }
    if (!body.printFileUrl || !body.printFileUrl.startsWith(designsBase)) {
      return NextResponse.json({ ok: false, error: "printFileUrl must be a My Designs asset URL" }, { status: 400 });
    }
    if (!body.retailPrice || !PRICE_RE.test(body.retailPrice)) {
      return NextResponse.json({ ok: false, error: "retailPrice must look like 24.99" }, { status: 400 });
    }
    if (body.plusPrice !== undefined && !PRICE_RE.test(body.plusPrice)) {
      return NextResponse.json({ ok: false, error: "plusPrice must look like 26.99" }, { status: 400 });
    }
    const catalog = await getCatalogVariants(71, ["White", "Black"]);
    if (!catalog.ok) {
      return NextResponse.json({ ok: false, error: (catalog as { ok: false; error: string }).error }, { status: 502 });
    }
    const catalogByKey = new Map(catalog.value.map((v) => [`${v.color.toLowerCase()}|${v.size.toLowerCase()}`, v.id]));
    // Rebuild the SAME variant plan `create` used → SKUs match the Woo product (the P4 join key).
    const plan = buildVariantPlan({
      title: body.title.trim(),
      retailPrice: body.retailPrice,
      plusPrice: body.plusPrice,
      sizes: body.sizes,
      designName: body.designName,
    });
    const variants: { externalId: string; catalogVariantId: number; retailPrice: string; printFileUrl: string }[] = [];
    const skipped: { sku: string; reason: string }[] = [];
    for (const p of plan) {
      const catalogId = catalogByKey.get(`${p.color.toLowerCase()}|${p.size.toLowerCase()}`);
      if (!catalogId) {
        skipped.push({ sku: p.sku, reason: `no_catalog_${p.color}_${p.size}` });
        continue;
      }
      variants.push({ externalId: p.sku, catalogVariantId: catalogId, retailPrice: p.price, printFileUrl: body.printFileUrl });
    }
    if (variants.length === 0) {
      return NextResponse.json({ ok: false, error: "no_catalog_variants_resolved", skipped }, { status: 502 });
    }
    const thumb = (body.mockupUrls ?? []).find((u) => typeof u === "string" && u.startsWith(designsBase));
    const created = await createSyncProductOnNative({
      name: body.title.trim(),
      externalId: String(body.wooProductId),
      thumbnailUrl: thumb,
      variants,
    });
    if (!created.ok) {
      return NextResponse.json({ ok: false, error: (created as { ok: false; error: string }).error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      syncProductId: created.value.id,
      variantCount: created.value.variantCount,
      linkedVariants: created.value.variants,
      skipped,
    });
  }

  return NextResponse.json({ ok: false, error: "action must be upscale|productimage|flatlay|copy|create|status|link|pfcreate" }, { status: 400 });
}

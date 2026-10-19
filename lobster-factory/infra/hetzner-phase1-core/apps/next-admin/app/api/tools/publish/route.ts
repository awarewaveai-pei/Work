import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { buildDesignKey, getDesignsPublicBase, isDesignsAsset, putDesignObject } from "../../../../lib/storage/r2";
import { upscaleToPrintFile } from "../../../../lib/studio/upscaler";
import { buildFaithfulPrintFile } from "../../../../lib/studio/print-file";
import { toProductImage } from "../../../../lib/studio/to-product-image";
import { normalizeManyForWp } from "../../../../lib/studio/wp-web-image";
import { composeFlatlay, parseHexColor } from "../../../../lib/studio/flatlay";
import { generateProductCopy } from "../../../../lib/studio/product-copy";
import { createWooProduct, isBridgeConfigured, listBridgeClients, bridgeSiteOrg, bridgeBaseUrl } from "../../../../lib/payments/woo";
import { blockedChangeResponse } from "../../../../lib/system-modes/blocked-change";
import { checkProductionChangeAllowed } from "../../../../lib/system-modes/production-change-gate";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { markPodOrderDoneIfPresent } from "../../../../lib/studio/pod-order-inbox";
import { buildPodProductPayload, buildVariantPlan, priceForSize } from "../../../../lib/studio/pod-product";
import { podModelById } from "../../../../lib/studio/pod-catalog-config";
import { fetchProductTierPricing, fetchProductSizeGuide } from "../../../../lib/studio/printful-catalog";
import {
  createDraftOrderOnNative,
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
  action?: "upscale" | "productimage" | "flatlay" | "copy" | "create" | "status" | "link" | "pfcreate" | "pforder" | "pricing" | "clients";
  /** Which configured bridge client to publish to: "" = default site, "1".."10" = an extra client
   *  (wp-bridge-client.ts WPBRIDGE_SITE_<i>_*). Absent → default → original single-site behaviour. */
  clientId?: string;
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
  /** Free-text operator copy instructions (tone / language / brand voice / emphasis). Publish UI「文案指示／品牌語氣」. */
  instructions?: string;
  // copy fix re-generation: failed-check hints fed back to regenerate compliant copy
  fixHints?: string[];
  // create
  title?: string;
  designName?: string; // reserved — SKUs are owned by `create` and echoed via variantMap; pfcreate consumes them
  retailPrice?: string;
  plusPrice?: string;
  sizes?: string[];
  shortDescription?: string;
  bullets?: string[];
  seo?: { focus_keyword?: string; title?: string; description?: string };
  mockupUrls?: string[];
  /** POD model selection (pod-catalog-config catalogProductId). Drives colours + Printful binding.
   *  Absent → legacy single product 71 (Bella 3001) White/Black. */
  catalogProductId?: number;
  /** Per-colour mockup URLs (Printful colour name → My Designs URL) → each colour's variation image. */
  colorMockups?: Record<string, string>;
  // status / link
  wooProductId?: number;
  printFileUrl?: string;
  variantMap?: { variationId: number; color: string; printfulColor?: string; colorHex?: string; size: string; sku?: string; price?: string }[];
  // pforder (P4 draft fulfillment — Woo order → Printful DRAFT print order, no confirm)
  wooOrderId?: number;
  recipient?: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state_code?: string;
    country_code?: string;
    zip?: string;
    email?: string;
    phone?: string;
  };
  items?: { sku?: string; quantity?: number }[];
}

const PRICE_RE = /^\d+(\.\d{1,2})?$/;

// Sanitize the caller's bridge-client selector → "" (default) or "1".."10". Anything else (incl. a
// stray slug or injection attempt) collapses to "" so a bad value can never select a wrong/no site
// silently — it just uses the default, which isBridgeConfigured then validates.
function normalizeClientId(raw: unknown): string {
  return typeof raw === "string" && /^([1-9]|10)$/.test(raw) ? raw : "";
}

// Transient = safe to retry (the read-before-write idempotency guard means a retry never duplicates).
// STRUCTURED tokens only: pf() (print-provider.ts:103) emits `printful_timeout` / `printful_network_error`
// for real transport failures, but on a clean HTTP error (line 117) it slices the upstream Printful body
// message verbatim — a 4xx whose text merely contains "timeout"/"network_error" must NOT be misread as
// 503-retryable. `idempotency_precheck_failed:*` stays a prefix match (its inner reason is itself transient).
const isTransientPfError = (e: string): boolean =>
  e.startsWith("idempotency_precheck_failed") || e === "printful_timeout" || e === "printful_network_error";

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
      printFilePdfUrl: r.printFilePdfUrl,
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
      instructions: body.instructions,
      improveHints: Array.isArray(body.fixHints)
        ? body.fixHints.filter((h) => typeof h === "string")
        : undefined,
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

  // ── Pricing helper: Printful wholesale cost per tier so the UI shows profit BEFORE publishing ──
  if (body.action === "pricing") {
    if (!isPrintfulConfigured()) {
      return NextResponse.json({ ok: false, error: "printful_not_configured" }, { status: 503 });
    }
    const pid = Number.isInteger(body.catalogProductId) ? (body.catalogProductId as number) : 71;
    // Tier pricing only exists for our known POD models (legacy 71 has no pod-catalog-config entry).
    if (!podModelById(pid)) {
      return NextResponse.json({ ok: false, error: "unknown_catalogProductId" }, { status: 400 });
    }
    const pricing = await fetchProductTierPricing(pid);
    if (!pricing) {
      return NextResponse.json({ ok: false, error: "pricing_unavailable" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, pricing });
  }

  // ── Multi-client: list the configured bridge clients (default + WPBRIDGE_SITE_1..10) for the UI ──
  if (body.action === "clients") {
    // Non-secret fields only (id / display name / public base URL). Empty list = bridge not configured.
    return NextResponse.json({ ok: true, clients: listBridgeClients() });
  }

  // ── Step 2: create draft Woo product via wp-bridge ─────────────────────────
  if (body.action === "create") {
    const clientId = normalizeClientId(body.clientId);
    if (!isBridgeConfigured(clientId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bridge_not_configured",
          clientId,
          hint: clientId
            ? `Set WPBRIDGE_SITE_${clientId}_BASE_URL / _KEY_ID / _PRIVATE_KEY for this client.`
            : "Set WPBRIDGE_BASE_URL / WPBRIDGE_KEY_ID / WPBRIDGE_PRIVATE_KEY.",
        },
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
    const rawMockupUrls = (body.mockupUrls ?? []).filter((u): u is string => isDesignsAsset(u));
    const rawColorMockups: Record<string, string> =
      body.colorMockups && typeof body.colorMockups === "object"
        ? Object.fromEntries(Object.entries(body.colorMockups).filter(([, u]) => isDesignsAsset(u)))
        : {};

    // Operator invariant: every storefront image (gallery + colour-variation) is WebP ≤150KB. Bake a
    // small DISPLAY derivative for each (on our sharp infra — host-independent) before handing URLs to
    // the wp-bridge. The R2 designs/ MASTERS stay full-res (re-editing) and the print file → Printful
    // path is untouched (printing needs full res). Bounded-concurrency + dedup; a per-image failure
    // falls back to the original URL (logged) so one bad image never aborts the whole product.
    const wpImageMap = await normalizeManyForWp([...rawMockupUrls, ...Object.values(rawColorMockups)]);
    const mockupUrls = rawMockupUrls.map((u) => wpImageMap.get(u) ?? u);
    const colorMockups = Object.keys(rawColorMockups).length
      ? Object.fromEntries(
          Object.entries(rawColorMockups).map(([k, u]) => [k, wpImageMap.get(u) ?? u] as [string, string]),
        )
      : undefined;

    // Resolve the POD model (colours + display name + Printful catalog id). Absent → legacy White/Black.
    const model = Number.isInteger(body.catalogProductId) ? podModelById(body.catalogProductId as number) : undefined;
    // Validate sizes to strings at the boundary (body is an unchecked JSON cast). A non-string element
    // would throw in size.toUpperCase() downstream (size-guide reduce / priceForSize) — and in the
    // size-guide path that throw 1-min-poisons the cache for EVERY publish of this product. Mirrors the
    // bullets guard below (critic 2026-06-24).
    const safeSizes = (body.sizes ?? model?.sizes ?? []).filter((s): s is string => typeof s === "string");
    // Best-effort size chart from Printful → a table block in the product body. A fetch failure (null)
    // simply omits the block; it must NEVER block the publish.
    const sizeChart =
      Number.isInteger(body.catalogProductId) && safeSizes.length > 0
        ? await fetchProductSizeGuide(body.catalogProductId as number, safeSizes)
        : null;
    const params = {
      title: body.title.trim(),
      retailPrice: body.retailPrice,
      plusPrice: body.plusPrice,
      sizes: safeSizes.length > 0 ? safeSizes : undefined,
      shortDescription: body.shortDescription,
      bullets: Array.isArray(body.bullets) ? body.bullets.filter((b) => typeof b === "string") : undefined,
      seo: body.seo && typeof body.seo === "object" ? body.seo : undefined,
      mockupUrls,
      model,
      colorMockups,
      sizeChart: sizeChart ?? undefined,
    };
    // Always a real write (plugin has no /product dry-run) — payload is draft-status.
    const payload = buildPodProductPayload(params);
    const r = await createWooProduct(payload, clientId);
    if (!r.ok) {
      const failed = r as { ok: false; error: string; blockedMode?: string };
      if (failed.blockedMode !== undefined) {
        return blockedChangeResponse(failed.blockedMode);
      }
      return NextResponse.json({ ok: false, error: failed.error }, { status: 502 });
    }
    const value = r.value;
    // Pair returned variation_ids (creation order) with our deterministic plan order.
    const plan = buildVariantPlan(params);
    const variantMapComplete = Boolean(value.variation_ids && value.variation_ids.length === plan.length);
    const variantMap = variantMapComplete
      ? value.variation_ids!.map((variationId, i) => ({
          variationId,
          color: plan[i].color,
          printfulColor: plan[i].printfulColor,
          colorHex: plan[i].colorHex,
          size: plan[i].size,
          sku: plan[i].sku,
          price: plan[i].price,
        }))
      : [];
    // m5: when Woo returns a different count of variation_ids than our plan, the SKU map is dropped.
    // Surface that AT THE SOURCE (not two steps later as a pfcreate 422) so it's attributable here.
    return NextResponse.json({
      ok: true,
      ...value,
      clientId,
      variantMap,
      ...(variantMapComplete
        ? {}
        : { variantMapDropped: true, expectedVariantCount: plan.length, gotVariationIds: value.variation_ids?.length ?? 0 }),
    });
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
  // LEGACY (demoted) path — the Woo-platform store manual sync dance. Binds White/Black against Bella
  // 3001 (71) ONLY; it is NOT model-aware (ignores catalogProductId + multi-colour vmap). The native
  // `pfcreate` path supersedes it. A model product (57/456/438) must NOT be run through this — it would
  // bind only 2 of 4 colours against the wrong catalog. Kept solely for the old single-product fallback.
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
    // Legacy path predates the multi-client clientId (no site selector here) -- no bridge host to
    // resolve, so this is a global-mode-only write (same as pforder / printful/sync PUT below).
    const linkGate = await checkProductionChangeAllowed(getSupabaseWriteClient(), null);
    if (!linkGate.allowed) return blockedChangeResponse(linkGate.mode);
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
    // SKUs are owned by the `create` step (the P4 join key) and echoed back in its variantMap.
    // pfcreate CONSUMES that map verbatim — it must NOT rebuild the plan, because a rebuild keyed on
    // a different designName/sizes would silently diverge from the Woo product's SKUs (critic
    // 2026-06-15 #4). No usable variantMap = caller skipped `create` → fail loud.
    const vmap = (body.variantMap ?? []).filter(
      (m) =>
        typeof m?.sku === "string" &&
        m.sku.length > 0 &&
        typeof m?.price === "string" &&
        PRICE_RE.test(m.price) &&
        typeof m?.color === "string" &&
        typeof m?.size === "string",
    );
    if (vmap.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "variantMap_required — call `create` first and pass back its variantMap (carries the authoritative SKUs + prices).",
        },
        { status: 400 },
      );
    }
    // SKUs are the P4 join key AND the native faithfulness check's identity (print-provider.ts:320
    // tests input ⊆ existing — sound as set-equality ONLY when input SKUs are distinct). A duplicate
    // SKU in the map would let a partial bind pass the completeness gate, so reject it at the source.
    const seenSkus = new Set<string>();
    const dupSku = vmap.find((m) => {
      const s = m.sku as string;
      if (seenSkus.has(s)) return true;
      seenSkus.add(s);
      return false;
    });
    if (dupSku) {
      return NextResponse.json(
        { ok: false, error: "duplicate_sku", sku: dupSku.sku, hint: "variantMap must carry one row per SKU." },
        { status: 422 },
      );
    }
    // Which Printful product to bind to. Validate against the KNOWN model set (not just >0) so `create`
    // and `pfcreate` can't disagree on the product; absent → legacy 71 (Bella 3001).
    let pfCatalogProductId = 71;
    if (Number.isInteger(body.catalogProductId)) {
      const pid = body.catalogProductId as number;
      if (podModelById(pid)) pfCatalogProductId = pid;
      else if (pid !== 71) {
        return NextResponse.json(
          { ok: false, error: "unknown_catalogProductId", hint: "Must be a pod-catalog-config model id (or omit for legacy 71)." },
          { status: 400 },
        );
      }
    }
    // Namespace the Printful externalId by client so two different client sites can each have a Woo
    // product with the same numeric id without colliding in the ONE shared native store. Resolved here
    // (not just before createSyncProductOnNative) because it also drives the gate's org below.
    const pfClientId = normalizeClientId(body.clientId);
    // clientId identifies the bridge site whose Woo catalog this product will be linked to -- resolve
    // its org the same way bridgePost does (bridgeSiteOrg). No clientId, or no bridge configured for
    // it, means there is no site host to resolve -> global mode gate (mirrors bridgePost's own
    // "no DB client -> null" short-circuit: checkProductionChangeAllowed fails closed on a null client
    // regardless of orgId, so a missing db here still blocks rather than silently passing).
    const pfBridgeBase = bridgeBaseUrl(pfClientId);
    const pfDb = getSupabaseWriteClient();
    const pfOrgId = pfBridgeBase && pfDb ? await bridgeSiteOrg(pfDb, pfBridgeBase) : null;
    if (pfOrgId === undefined) return blockedChangeResponse("unavailable");
    const pfcreateGate = await checkProductionChangeAllowed(pfDb, pfOrgId);
    if (!pfcreateGate.allowed) return blockedChangeResponse(pfcreateGate.mode);
    // Bind on HEX — the SSOT join key (pod-catalog-config), immune to Printful colour renames. Legacy
    // rows without a hex (White/Black, colorHex="") fall back to NAME. getCatalogVariants' dual match
    // resolves either; we then look each vmap row up by its hex (model) or name (legacy).
    const wantColors = [...new Set(vmap.map((m) => (m.colorHex || m.printfulColor || m.color) as string))];
    const catalog = await getCatalogVariants(pfCatalogProductId, wantColors);
    if (!catalog.ok) {
      return NextResponse.json({ ok: false, error: (catalog as { ok: false; error: string }).error }, { status: 502 });
    }
    // Index by BOTH name|size and hex|size. Fail loud on a duplicate NAME key (two variants colliding on
    // name+size) rather than silently keeping the last — a mis-bind guard. (hex+size is unique by build.)
    const catalogByKey = new Map<string, number>();
    for (const v of catalog.value) {
      const nameKey = `name:${v.color.toLowerCase()}|${v.size.toLowerCase()}`;
      if (catalogByKey.has(nameKey)) {
        return NextResponse.json({ ok: false, error: "catalog_duplicate_key", key: nameKey }, { status: 502 });
      }
      catalogByKey.set(nameKey, v.id);
      if (v.colorHex) catalogByKey.set(`hex:${v.colorHex}|${v.size.toLowerCase()}`, v.id);
    }
    const variants: { externalId: string; catalogVariantId: number; retailPrice: string; printFileUrl: string }[] = [];
    const skipped: { sku: string; reason: string }[] = [];
    for (const m of vmap) {
      // Prefer hex bind (model path, rename-immune); legacy rows (no hex) bind by name.
      const catalogId = m.colorHex
        ? catalogByKey.get(`hex:${m.colorHex.toLowerCase()}|${m.size.toLowerCase()}`)
        : catalogByKey.get(`name:${((m.printfulColor ?? m.color) as string).toLowerCase()}|${m.size.toLowerCase()}`);
      if (!catalogId) {
        skipped.push({ sku: m.sku as string, reason: `no_catalog_${m.colorHex || m.printfulColor || m.color}_${m.size}` });
        continue;
      }
      variants.push({
        externalId: m.sku as string,
        catalogVariantId: catalogId,
        retailPrice: m.price as string,
        printFileUrl: body.printFileUrl,
      });
    }
    // Fail loud on ANY unresolved variant — a partial native product can't fulfill every Woo SKU,
    // and a silent skip would only surface when a customer's paid order has no Printful counterpart.
    if (skipped.length > 0) {
      return NextResponse.json(
        { ok: false, error: "catalog_resolution_incomplete", skipped, resolved: variants.length },
        { status: 422 },
      );
    }
    // Printful's sync_product.thumbnail only accepts jpg/jpeg/png/pdf. Our gallery mockups are saved as
    // WebP (storefront display optimisation), which Printful rejects with a 400 ("content type: webp")
    // that surfaced HERE as a generic 502 — silently blocking EVERY native publish (browser-reproduced
    // 2026-06-23: upscale/copy/create all 200, pfcreate 502). Pick the first Printful-acceptable image;
    // if the gallery is all-WebP, omit the thumbnail (Printful renders its own preview from the mockup).
    const thumb = (body.mockupUrls ?? []).find(
      (u) => typeof u === "string" && u.startsWith(designsBase) && /\.(png|jpe?g)$/i.test(u.split("?")[0]),
    );
    // pfClientId resolved above (drives the gate's org too). Default site (clientId="") keeps the bare
    // numeric id → existing sync products are untouched (idempotent).
    const created = await createSyncProductOnNative({
      name: body.title.trim(),
      externalId: pfClientId ? `${pfClientId}-${body.wooProductId}` : String(body.wooProductId),
      thumbnailUrl: thumb,
      variants,
    });
    if (!created.ok) {
      const e = (created as { ok: false; error: string }).error;
      // Idempotency-precheck / timeout / network failures are transient and safe to retry — same class
      // as reReadFailed below. Surface 503 retryable so the operator retries instead of giving up.
      const transient = isTransientPfError(e);
      return NextResponse.json(
        { ok: false, error: e, ...(transient ? { retryable: true } : {}) },
        { status: transient ? 503 : 502 },
      );
    }
    if (created.value.reReadFailed) {
      // Product WAS created on Printful but the variant read-back failed — do NOT report success.
      // A retry hits the idempotency pre-check (external_id already exists) and recovers the ids.
      return NextResponse.json(
        {
          ok: false,
          error: "created_but_readback_failed",
          syncProductId: created.value.id,
          retryable: true,
          hint: "Product exists on Printful; re-run pfcreate to fetch its variant ids (idempotent).",
        },
        { status: 503 },
      );
    }
    // M1/M3: pfcreate OWNS the completeness assertion — the native product must bind exactly as many
    // variants as we sent (every Woo SKU). A shortfall means some paid SKU would have no Printful
    // counterpart at P4 fulfillment, so fail loud rather than report a false success.
    if (created.value.incompleteVariants) {
      return NextResponse.json(
        {
          ok: false,
          error: "native_product_incomplete",
          syncProductId: created.value.id,
          expected: variants.length,
          got: created.value.variantCount,
          linkedVariants: created.value.variants,
          hint: "Printful bound fewer variants than sent — inspect the product on Printful before fulfillment.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({
      ok: true,
      syncProductId: created.value.id,
      alreadyExisted: created.value.alreadyExisted,
      variantCount: created.value.variantCount,
      linkedVariants: created.value.variants,
    });
  }

  // ── P4 (native): forward a (paid) Woo order to Printful as a DRAFT print order. NO confirm — the
  //    draft sits in the dashboard, is NOT charged, and is NOT printed. This is the fulfillment seam.
  //    CONTRACT: the caller passes ONLY Printful-fulfillable lines in `items` — it must drop shipping /
  //    fee / discount / non-POD product lines from the Woo order BEFORE calling. This handler does NOT
  //    silently skip lines: any unrecognised/malformed item fail-louds the WHOLE request (so an order is
  //    never partially fulfilled). A future Woo-order webhook reuses createDraftOrderOnNative unchanged.
  if (body.action === "pforder") {
    if (!isNativeStoreConfigured()) {
      return NextResponse.json(
        { ok: false, error: "printful_native_store_not_configured", hint: "Set PRINTFUL_NATIVE_STORE_ID." },
        { status: 503 },
      );
    }
    // Defensive caps — a malformed/hostile payload must not make us build an unbounded POST.
    const MAX_ITEMS = 100;
    const MAX_QTY = 1000;
    const MAX_FIELD = 200;
    if (!Number.isInteger(body.wooOrderId) || (body.wooOrderId as number) <= 0) {
      return NextResponse.json({ ok: false, error: "wooOrderId (positive integer) is required" }, { status: 400 });
    }
    const r = body.recipient;
    if (!r) {
      return NextResponse.json(
        { ok: false, error: "recipient_incomplete", missing: ["name", "address1", "city", "country_code", "zip"] },
        { status: 400 },
      );
    }
    const requiredRecipient = ["name", "address1", "city", "country_code", "zip"] as const;
    const missing = requiredRecipient.filter((k) => typeof r[k] !== "string" || (r[k] as string).trim().length === 0);
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, error: "recipient_incomplete", missing }, { status: 400 });
    }
    const country = (r.country_code as string).trim().toUpperCase();
    // Printful rejects US / CA / AU orders without a state/province code — fail loud here rather than
    // after the order POST (a rejected POST would leave the operator guessing why no draft appeared).
    if (["US", "CA", "AU"].includes(country) && (typeof r.state_code !== "string" || r.state_code.trim().length === 0)) {
      return NextResponse.json({ ok: false, error: "state_code_required_for_country", country }, { status: 400 });
    }
    // Recipient field bounds + email shape — reject an oversized field or a malformed email here, so a
    // downstream Printful rejection can't be misread as "no draft was needed".
    const recipientFields = [
      "name", "address1", "address2", "city", "state_code", "country_code", "zip", "email", "phone",
    ] as const;
    for (const k of recipientFields) {
      const v = r[k];
      if (typeof v === "string" && v.length > MAX_FIELD) {
        return NextResponse.json({ ok: false, error: "recipient_field_too_long", field: k }, { status: 400 });
      }
    }
    if (typeof r.email === "string" && r.email.trim().length > 0 && !r.email.includes("@")) {
      return NextResponse.json({ ok: false, error: "recipient_email_invalid" }, { status: 400 });
    }
    // Every line must resolve to {non-empty sku, positive-int quantity}. A silently dropped line would
    // under-fill the print order, so reject the whole request if ANY item is malformed (fail loud).
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length > MAX_ITEMS) {
      return NextResponse.json({ ok: false, error: "too_many_items", max: MAX_ITEMS, got: rawItems.length }, { status: 400 });
    }
    const items: { sku: string; quantity: number }[] = [];
    for (const it of rawItems) {
      if (typeof it?.sku !== "string" || it.sku.trim().length === 0 || it.sku.length > MAX_FIELD) continue;
      if (!Number.isInteger(it?.quantity) || (it.quantity as number) <= 0 || (it.quantity as number) > MAX_QTY) continue;
      items.push({ sku: it.sku.trim(), quantity: it.quantity as number });
    }
    if (items.length === 0 || items.length !== rawItems.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "items_required — each item needs a non-empty sku and a positive integer quantity",
          got: rawItems.length,
          valid: items.length,
        },
        { status: 400 },
      );
    }
    const recipient = {
      name: (r.name as string).trim(),
      address1: (r.address1 as string).trim(),
      city: (r.city as string).trim(),
      country_code: country,
      zip: (r.zip as string).trim(),
      ...(typeof r.state_code === "string" && r.state_code.trim() ? { state_code: r.state_code.trim() } : {}),
      ...(typeof r.address2 === "string" && r.address2.trim() ? { address2: r.address2.trim() } : {}),
      ...(typeof r.email === "string" && r.email.trim() ? { email: r.email.trim() } : {}),
      ...(typeof r.phone === "string" && r.phone.trim() ? { phone: r.phone.trim() } : {}),
    };
    // No clientId here (operator-initiated one-off order forward) -- the native store is a single
    // shared resource (PRINTFUL_NATIVE_STORE_ID), not tied to one bridge site host -> global mode gate.
    // (The Woo-webhook path that also calls createDraftOrderOnNative has its own gate + durable inbox --
    // app/api/webhooks/woo-order/route.ts.)
    const pforderGate = await checkProductionChangeAllowed(getSupabaseWriteClient(), null);
    if (!pforderGate.allowed) return blockedChangeResponse(pforderGate.mode);
    const order = await createDraftOrderOnNative({ externalId: String(body.wooOrderId), recipient, items });
    if (!order.ok) {
      const e = (order as { ok: false; error: string }).error;
      // Idempotency-precheck / timeout / network failures are transient and safe to retry (the read-
      // before-write guard means a retry never duplicates a draft). Surface 503 retryable.
      const transient = isTransientPfError(e);
      return NextResponse.json(
        { ok: false, error: e, ...(transient ? { retryable: true } : {}) },
        { status: transient ? 503 : 502 },
      );
    }
    // The manual forward of a Woo order the webhook could not fulfil: close its inbox row.
    const pforderDb = getSupabaseWriteClient();
    if (pforderDb) await markPodOrderDoneIfPresent(pforderDb, String(body.wooOrderId));
    return NextResponse.json({
      ok: true,
      draft: true,
      printfulOrderId: order.value.printfulOrderId,
      status: order.value.status,
      alreadyExisted: order.value.alreadyExisted,
    });
  }

  return NextResponse.json({ ok: false, error: "action must be upscale|productimage|flatlay|copy|pricing|create|status|link|pfcreate|pforder" }, { status: 400 });
}

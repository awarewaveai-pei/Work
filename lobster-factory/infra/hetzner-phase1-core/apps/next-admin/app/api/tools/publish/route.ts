import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { getDesignsPublicBase } from "../../../../lib/storage/r2";
import { upscaleToPrintFile } from "../../../../lib/studio/upscaler";
import { createWooProduct, isBridgeConfigured } from "../../../../lib/studio/wp-bridge-client";
import { buildPodProductPayload, buildVariantPlan, priceForSize } from "../../../../lib/studio/pod-product";
import {
  getCatalogVariants,
  getSyncProduct,
  isPrintfulConfigured,
  linkSyncVariant,
  listSyncProducts,
} from "../../../../lib/studio/print-provider";

export const runtime = "nodejs";
export const maxDuration = 120; // upscale step can take ~1-2 min

/**
 * One-click publish chain, split into bounded steps (each < nginx timeout):
 *   upscale → Real-ESRGAN print file into the designs bucket
 *   create  → wp-bridge draft Woo product (Color×Size variations, mockup images)
 *   status  → has the Printful plugin synced the Woo product yet?
 *   link    → bind every synced variant to its Bella 3001 catalog variant + print file
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
  action?: "upscale" | "create" | "status" | "link";
  // upscale
  designUrl?: string;
  longEdgePx?: number;
  // create
  title?: string;
  retailPrice?: string;
  plusPrice?: string;
  sizes?: string[];
  shortDescription?: string;
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

  // ── Step 1: upscale design → 300DPI print file ─────────────────────────────
  if (body.action === "upscale") {
    if (!body.designUrl || !body.designUrl.startsWith(designsBase)) {
      return NextResponse.json(
        { ok: false, error: "designUrl must be a My Designs asset URL" },
        { status: 400 },
      );
    }
    const r = await upscaleToPrintFile(body.designUrl, body.longEdgePx ?? null);
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, printFileUrl: r.printFileUrl, byteSize: r.byteSize, scaleUsed: r.scaleUsed });
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
    if (!Number.isInteger(body.wooProductId)) {
      return NextResponse.json({ ok: false, error: "wooProductId is required" }, { status: 400 });
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
    if (!Number.isInteger(body.wooProductId)) {
      return NextResponse.json({ ok: false, error: "wooProductId is required" }, { status: 400 });
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
      // Resolve color/size: prefer the deterministic variantMap from the create step;
      // fall back to parsing the Printful-side name ("Title - White / S").
      let colorSize = variant.externalId ? mapByVariation.get(variant.externalId) : undefined;
      if (!colorSize) {
        const m = /-\s*(White|Black)\s*\/\s*(\S+)\s*$/i.exec(variant.name);
        if (m) colorSize = { color: m[1], size: m[2] };
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

  return NextResponse.json({ ok: false, error: "action must be upscale|create|status|link" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import {
  getCatalogVariants,
  getSyncProduct,
  isPrintfulConfigured,
  linkSyncVariant,
  listSyncProducts,
} from "../../../../../lib/studio/print-provider";
import { getDesignsPublicBase } from "../../../../../lib/storage/r2";
import { checkProductionChangeAllowed } from "../../../../../lib/system-modes/production-change-gate";
import { blockedChangeResponse } from "../../../../../lib/system-modes/blocked-change";
import { getSupabaseWriteClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

function gate(request: Request): NextResponse | null {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  if (!isPrintfulConfigured()) {
    return NextResponse.json(
      { ok: false, error: "printful_not_configured", hint: "Set PRINTFUL_API_KEY and PRINTFUL_STORE_ID." },
      { status: 503 },
    );
  }
  return null;
}

/**
 * GET /api/tools/printful/sync               → list synced store products
 * GET /api/tools/printful/sync?id=438286779  → one product with variants
 * GET /api/tools/printful/sync?catalog=71&colors=White,Black → catalog variants
 */
export async function GET(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const catalog = url.searchParams.get("catalog");

  if (catalog) {
    const colors = (url.searchParams.get("colors") ?? "White,Black").split(",").map((s) => s.trim());
    const catalogId = Number(catalog);
    if (!Number.isInteger(catalogId) || catalogId <= 0) {
      return NextResponse.json({ ok: false, error: "catalog must be a positive integer" }, { status: 400 });
    }
    const r = await getCatalogVariants(catalogId, colors);
    if (!r.ok) return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
    return NextResponse.json({ ok: true, variants: r.value });
  }

  if (id) {
    const productId = Number(id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ ok: false, error: "id must be a positive integer" }, { status: 400 });
    }
    const r = await getSyncProduct(productId);
    if (!r.ok) return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
    return NextResponse.json({ ok: true, ...r.value });
  }

  const r = await listSyncProducts();
  if (!r.ok) return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
  return NextResponse.json({ ok: true, products: r.value });
}

interface LinkBody {
  syncVariantId?: number;
  catalogVariantId?: number;
  printFileUrl?: string;
  retailPrice?: string;
}

/**
 * PUT — link one synced Woo variant to a Printful catalog variant + print file.
 * This is the write operation that makes a product fulfillable; the print file
 * must come from our own designs bucket (no arbitrary URLs).
 */
export async function PUT(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;

  let body: LinkBody;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!Number.isInteger(body.syncVariantId) || (body.syncVariantId as number) <= 0) {
    return NextResponse.json({ ok: false, error: "syncVariantId (positive integer) is required" }, { status: 400 });
  }
  if (!Number.isInteger(body.catalogVariantId) || (body.catalogVariantId as number) <= 0) {
    return NextResponse.json({ ok: false, error: "catalogVariantId (positive integer) is required" }, { status: 400 });
  }
  const designsBase = getDesignsPublicBase() + "/";
  if (!body.printFileUrl || !body.printFileUrl.startsWith(designsBase)) {
    return NextResponse.json(
      { ok: false, error: "printFileUrl must be a My Designs asset URL (designs bucket)" },
      { status: 400 },
    );
  }
  if (body.retailPrice !== undefined && !/^\d+(\.\d{1,2})?$/.test(body.retailPrice)) {
    return NextResponse.json({ ok: false, error: "retailPrice must look like 24.99" }, { status: 400 });
  }

  // No per-client selector on this legacy Woo-platform sync route (single shared PRINTFUL_STORE_ID) --
  // no site host to resolve, so this is a global-mode-only write (same as publish/route.ts's `link`).
  const modeGate = await checkProductionChangeAllowed(getSupabaseWriteClient(), null);
  if (!modeGate.allowed) return blockedChangeResponse(modeGate.mode);

  const r = await linkSyncVariant(
    body.syncVariantId as number,
    body.catalogVariantId as number,
    body.printFileUrl,
    body.retailPrice,
  );
  if (!r.ok) return NextResponse.json({ ok: false, error: (r as { ok: false; error: string }).error }, { status: 502 });
  return NextResponse.json({ ok: true, result: r.value });
}

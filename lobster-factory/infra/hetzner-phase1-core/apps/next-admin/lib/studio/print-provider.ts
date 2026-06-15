/**
 * Studio PrintProvider — Printful behind a provider-neutral seam.
 *
 * PLATFORM CONSTRAINT (verified live 2026-06-11): this Printful store (18314943)
 * is WooCommerce-platform, so the v1 "Products API" (POST /store/products) is
 * REJECTED by Printful ("Manual Order / API platform" only). The automatable
 * chain for Woo-platform stores is:
 *
 *   1. create the product in WooCommerce (wp-bridge does this — not here)
 *   2. Printful's plugin auto-syncs it  → GET  /sync/products
 *   3. link each synced variant to a catalog variant + print file
 *                                       → PUT  /sync/variants/{id}
 *   4. fulfillment is then native (plugin auto-imports paid orders)
 *
 * Golden sample: sync product 438286779 "Soulful Expression Bloom T-Shirt"
 * (external_id = Woo post id, files type front_large/back/preview).
 */

const API_BASE = "https://api.printful.com";

export interface CatalogVariant {
  id: number;
  color: string;
  size: string;
  inStock: boolean;
}

export interface SyncProductSummary {
  id: number;
  externalId: string | null;
  name: string;
  syncedCount: number;
  variantCount: number;
  thumbnailUrl: string | null;
}

export interface SyncVariantDetail {
  id: number;
  externalId: string | null;
  name: string;
  catalogVariantId: number | null;
  retailPrice: string | null;
  synced: boolean;
  files: { type: string; url: string | null; previewUrl: string | null }[];
}

export type PrintfulResult<T> = { ok: true; value: T } | { ok: false; error: string };

function getConfig(): { token: string; storeId: string } | null {
  const token = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!token || !storeId) return null;
  return { token, storeId };
}

export function isPrintfulConfigured(): boolean {
  return getConfig() !== null;
}

/** The native "Manual Order / API platform" store id, or null if not configured. */
export function nativeStoreId(): string | null {
  return process.env.PRINTFUL_NATIVE_STORE_ID || null;
}

/**
 * Native store usable for API product creation (POST /store/products) and order forwarding.
 * The Woo-platform store rejects both; the native store is what makes publishing full-auto.
 */
export function isNativeStoreConfigured(): boolean {
  return Boolean(process.env.PRINTFUL_API_KEY && process.env.PRINTFUL_NATIVE_STORE_ID);
}

async function pf<T>(
  path: string,
  init?: { method?: string; body?: unknown; storeId?: string; timeoutMs?: number },
): Promise<PrintfulResult<T>> {
  const token = process.env.PRINTFUL_API_KEY;
  // Default store = PRINTFUL_STORE_ID (the Woo-platform store). A `storeId` override targets a
  // different store — e.g. the native "Manual Order / API platform" store, the only one that
  // accepts API product creation (POST /store/products) for full-auto publishing.
  const storeId = init?.storeId ?? process.env.PRINTFUL_STORE_ID;
  if (!token || !storeId) return { ok: false, error: "printful_not_configured" };
  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 25_000);
  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-PF-Store-Id": storeId,
          ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: controller.signal.aborted ? "printful_timeout" : "printful_network_error" };
    }
    let json: { code?: number; result?: T; error?: { message?: string } };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return { ok: false, error: `printful_bad_json_${res.status}` };
    }
    if (!res.ok || (json.code !== undefined && json.code >= 400)) {
      const message = json.error?.message ?? `printful_${res.status}`;
      return { ok: false, error: String(message).slice(0, 200) };
    }
    return { ok: true, value: json.result as T };
  } finally {
    clearTimeout(killer);
  }
}

/** Catalog variants of a product (default 71 = Bella+Canvas 3001), filtered to colors. */
export async function getCatalogVariants(
  catalogProductId: number,
  colors: string[],
): Promise<PrintfulResult<CatalogVariant[]>> {
  const r = await pf<{ variants: { id: number; color: string; size: string; in_stock?: boolean }[] }>(
    `/products/${catalogProductId}`,
  );
  // tsconfig here does not narrow `!r.ok` — same cast convention as the tarot/designs routes.
  if (!r.ok) return { ok: false, error: (r as { ok: false; error: string }).error };
  const wanted = new Set(colors.map((c) => c.toLowerCase()));
  return {
    ok: true,
    value: r.value.variants
      .filter((v) => wanted.has(v.color.toLowerCase()))
      .map((v) => ({ id: v.id, color: v.color, size: v.size, inStock: Boolean(v.in_stock) })),
  };
}

export async function listSyncProducts(): Promise<PrintfulResult<SyncProductSummary[]>> {
  const r = await pf<
    { id: number; external_id?: string; name: string; synced?: number; variants?: number; thumbnail_url?: string }[]
  >(`/sync/products?limit=100`);
  if (!r.ok) return { ok: false, error: (r as { ok: false; error: string }).error };
  return {
    ok: true,
    value: r.value.map((p) => ({
      id: p.id,
      externalId: p.external_id ?? null,
      name: p.name,
      syncedCount: p.synced ?? 0,
      variantCount: p.variants ?? 0,
      thumbnailUrl: p.thumbnail_url ?? null,
    })),
  };
}

export async function getSyncProduct(
  id: number,
  storeId?: string,
): Promise<PrintfulResult<{ product: SyncProductSummary; variants: SyncVariantDetail[] }>> {
  interface Raw {
    sync_product: { id: number; external_id?: string; name: string; synced?: number; thumbnail_url?: string };
    sync_variants: {
      id: number;
      external_id?: string;
      name?: string;
      variant_id?: number;
      retail_price?: string;
      synced?: boolean;
      files?: { type?: string; url?: string; preview_url?: string }[];
    }[];
  }
  const r = await pf<Raw>(`/sync/products/${id}`, storeId ? { storeId } : undefined);
  if (!r.ok) return { ok: false, error: (r as { ok: false; error: string }).error };
  const sp = r.value.sync_product;
  return {
    ok: true,
    value: {
      product: {
        id: sp.id,
        externalId: sp.external_id ?? null,
        name: sp.name,
        syncedCount: sp.synced ?? 0,
        variantCount: r.value.sync_variants.length,
        thumbnailUrl: sp.thumbnail_url ?? null,
      },
      variants: r.value.sync_variants.map((v) => ({
        id: v.id,
        externalId: v.external_id ?? null,
        name: v.name ?? "",
        catalogVariantId: v.variant_id ?? null,
        retailPrice: v.retail_price ?? null,
        synced: Boolean(v.synced),
        files: (v.files ?? []).map((f) => ({
          type: f.type ?? "default",
          url: f.url ?? null,
          previewUrl: f.preview_url ?? null,
        })),
      })),
    },
  };
}

/**
 * Link one synced variant to a Printful catalog variant + front print file.
 * This is the step that makes an existing Woo product Printful-fulfillable.
 * printFileUrl must be publicly fetchable (our R2 designs bucket qualifies).
 */
export async function linkSyncVariant(
  syncVariantId: number,
  catalogVariantId: number,
  printFileUrl: string,
  retailPrice?: string,
): Promise<PrintfulResult<{ id: number }>> {
  const body: Record<string, unknown> = {
    variant_id: catalogVariantId,
    files: [{ type: "front", url: printFileUrl }],
  };
  if (retailPrice) body.retail_price = retailPrice;
  return pf<{ id: number }>(`/sync/variants/${syncVariantId}`, { method: "PUT", body });
}

export interface CreateNativeVariantInput {
  /** Woo SKU — the fulfillment lookup key (becomes the sync variant external_id). */
  externalId: string;
  /** Printful catalog variant id (Bella 3001 White/M etc.). */
  catalogVariantId: number;
  retailPrice: string;
  printFileUrl: string;
}

/**
 * Full-auto product creation on the NATIVE ("Manual Order / API platform") store.
 *
 * Unlike the Woo-platform store — which has NO API to import an externally-created Woo product
 * and forces a human into the Printful dashboard — the native store accepts POST /store/products,
 * creating the sync product AND binding every catalog variant + front print file in ONE call.
 * No dashboard, no "import", fully automatic.
 *
 * external_id mapping (the link back to the Woo storefront, used by P4 order fulfillment):
 *   sync_product.external_id = Woo product id   ·   sync_variant.external_id = Woo SKU
 *
 * The POST response does not reliably carry the created sync_variant ids, so we re-read the
 * product to return SKU → sync_variant_id, which P4 needs to resolve a paid Woo order line into
 * a Printful POST /orders item.
 */
export async function createSyncProductOnNative(input: {
  name: string;
  externalId: string;
  thumbnailUrl?: string;
  variants: CreateNativeVariantInput[];
}): Promise<
  PrintfulResult<{
    id: number;
    variantCount: number;
    variants: { id: number; externalId: string | null; catalogVariantId: number | null }[];
  }>
> {
  const storeId = process.env.PRINTFUL_NATIVE_STORE_ID;
  if (!storeId) return { ok: false, error: "printful_native_store_not_configured" };
  if (input.variants.length === 0) return { ok: false, error: "no_variants" };
  const body = {
    sync_product: {
      name: input.name,
      external_id: input.externalId,
      ...(input.thumbnailUrl ? { thumbnail: input.thumbnailUrl } : {}),
    },
    sync_variants: input.variants.map((v) => ({
      external_id: v.externalId,
      variant_id: v.catalogVariantId,
      retail_price: v.retailPrice,
      files: [{ type: "front", url: v.printFileUrl }],
    })),
  };
  const created = await pf<{ id: number }>(`/store/products`, { method: "POST", body, storeId });
  if (!created.ok) return { ok: false, error: (created as { ok: false; error: string }).error };
  // Re-read to obtain authoritative sync_variant ids + external_ids for P4 fulfillment lookup.
  const detail = await getSyncProduct(created.value.id, storeId);
  if (!detail.ok) {
    // The product WAS created — surface its id so the caller can recover instead of double-creating.
    return { ok: true, value: { id: created.value.id, variantCount: 0, variants: [] } };
  }
  return {
    ok: true,
    value: {
      id: created.value.id,
      variantCount: detail.value.variants.length,
      variants: detail.value.variants.map((v) => ({
        id: v.id,
        externalId: v.externalId,
        catalogVariantId: v.catalogVariantId,
      })),
    },
  };
}

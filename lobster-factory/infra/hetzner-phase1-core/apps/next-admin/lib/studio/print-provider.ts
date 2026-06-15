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

export type PrintfulResult<T> =
  | { ok: true; value: T }
  // `status` = HTTP status; `code` = Printful's JSON body code (ONLY set when the body parsed as
  // JSON). `code === 404` therefore uniquely identifies a genuine app-level 404 (vs a gateway 404).
  | { ok: false; error: string; status?: number; code?: number };

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
      // Non-JSON body (e.g. a gateway/proxy error page). status is known, but there is NO Printful
      // `code` — which is exactly how callers tell an upstream 404 apart from a real "product absent".
      return { ok: false, error: `printful_bad_json_${res.status}`, status: res.status };
    }
    if (!res.ok || (json.code !== undefined && json.code >= 400)) {
      const message = json.error?.message ?? `printful_${res.status}`;
      // Thread structured signals out: HTTP status + Printful body `code`. Because `code` is only
      // populated from a parsed JSON body, `code === 404` uniquely means a genuine app-level 404.
      return { ok: false, error: String(message).slice(0, 200), status: res.status, code: json.code };
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

export async function listSyncProducts(storeId?: string): Promise<PrintfulResult<SyncProductSummary[]>> {
  const r = await pf<
    { id: number; external_id?: string; name: string; synced?: number; variants?: number; thumbnail_url?: string }[]
  >(`/sync/products?limit=100`, storeId ? { storeId } : undefined);
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

interface RawSyncProductDetail {
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

/** Shared mapper — both the numeric and @external_id sync-product reads return this exact shape. */
function mapSyncProductDetail(raw: RawSyncProductDetail): { product: SyncProductSummary; variants: SyncVariantDetail[] } {
  const sp = raw.sync_product;
  return {
    product: {
      id: sp.id,
      externalId: sp.external_id ?? null,
      name: sp.name,
      syncedCount: sp.synced ?? 0,
      variantCount: raw.sync_variants.length,
      thumbnailUrl: sp.thumbnail_url ?? null,
    },
    variants: raw.sync_variants.map((v) => ({
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
  };
}

export async function getSyncProduct(
  id: number,
  storeId?: string,
): Promise<PrintfulResult<{ product: SyncProductSummary; variants: SyncVariantDetail[] }>> {
  const r = await pf<RawSyncProductDetail>(`/sync/products/${id}`, storeId ? { storeId } : undefined);
  if (!r.ok) return { ok: false, error: (r as { ok: false; error: string }).error };
  return { ok: true, value: mapSyncProductDetail(r.value) };
}

/**
 * Idempotency lookup: find a sync product by its external_id on a given store.
 *
 * Tri-state result:
 *   { ok: true, value: {…} } — found
 *   { ok: true, value: null } — definitively absent (a clean 404 — safe to create)
 *   { ok: false, error }      — the lookup itself failed (network/timeout/auth); absence is
 *                               NOT proven, so the caller MUST NOT create (would risk a duplicate).
 *
 * `GET /sync/products/@{external_id}` mirrors the numeric form but keys on external_id; a missing
 * product comes back as a 404 whose message contains "not found".
 */
export async function findSyncProductByExternalId(
  externalId: string,
  storeId?: string,
): Promise<PrintfulResult<{ product: SyncProductSummary; variants: SyncVariantDetail[] } | null>> {
  const r = await pf<RawSyncProductDetail>(
    `/sync/products/@${encodeURIComponent(externalId)}`,
    storeId ? { storeId } : undefined,
  );
  if (!r.ok) {
    const e = r as { ok: false; error: string; status?: number; code?: number };
    // Definitively absent ONLY on a genuine Printful application 404 (JSON body code === 404). A
    // gateway/proxy 404 (non-JSON → no code) or "not found" inside a 5xx message is NOT proof of
    // absence — returning error there makes createSyncProductOnNative refuse rather than risk a duplicate.
    if (e.code === 404) return { ok: true, value: null };
    return { ok: false, error: e.error };
  }
  return { ok: true, value: mapSyncProductDetail(r.value) };
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
    alreadyExisted: boolean;
    reReadFailed: boolean;
    /** Printful bound FEWER variants than requested — the product is missing SKUs (fail loud upstream). */
    incompleteVariants: boolean;
    variantCount: number;
    variants: { id: number; externalId: string | null; catalogVariantId: number | null }[];
  }>
> {
  const storeId = process.env.PRINTFUL_NATIVE_STORE_ID;
  if (!storeId) return { ok: false, error: "printful_native_store_not_configured" };
  if (input.variants.length === 0) return { ok: false, error: "no_variants" };

  // Idempotency pre-check. A retried publish for the same Woo product must NOT create a second
  // native product — a duplicate corrupts the SKU→sync_variant join P4 fulfillment depends on.
  // If the external_id already exists, return the existing product. If the lookup itself errs
  // (network/timeout — NOT a clean 404), absence is unproven, so we refuse to create.
  const existing = await findSyncProductByExternalId(input.externalId, storeId);
  if (!existing.ok) {
    return { ok: false, error: `idempotency_precheck_failed:${(existing as { ok: false; error: string }).error}` };
  }
  if (existing.value) {
    // Faithfulness check on an idempotent hit. Count alone is insufficient: re-sending the same Woo
    // product after a title change reseeds different SKUs, so a same-count product would silently
    // return the FIRST run's SKUs and corrupt the P4 join. Flag incomplete unless every incoming SKU
    // is bound on the existing product (external_id = Woo SKU, per the mapping above).
    const existingSkus = new Set(existing.value.variants.map((v) => v.externalId));
    const skuMismatch = input.variants.some((v) => !existingSkus.has(v.externalId));
    return {
      ok: true,
      value: {
        id: existing.value.product.id,
        alreadyExisted: true,
        reReadFailed: false,
        incompleteVariants: existing.value.variants.length !== input.variants.length || skuMismatch,
        variantCount: existing.value.variants.length,
        variants: existing.value.variants.map((v) => ({
          id: v.id,
          externalId: v.externalId,
          catalogVariantId: v.catalogVariantId,
        })),
      },
    };
  }

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
  // Creation binds N variants + uploads N print files server-side — allow more time than a read.
  const created = await pf<{ id: number }>(`/store/products`, { method: "POST", body, storeId, timeoutMs: 60_000 });
  if (!created.ok) return { ok: false, error: (created as { ok: false; error: string }).error };

  // Re-read to obtain authoritative sync_variant ids + external_ids for P4 fulfillment lookup.
  const detail = await getSyncProduct(created.value.id, storeId);
  if (!detail.ok) {
    // The product WAS created — surface its id AND reReadFailed so the caller does NOT mistake a
    // zero-variant read for success. A retry hits the idempotency pre-check and recovers cleanly.
    return {
      ok: true,
      value: { id: created.value.id, alreadyExisted: false, reReadFailed: true, incompleteVariants: false, variantCount: 0, variants: [] },
    };
  }
  if (detail.value.product.externalId !== input.externalId) {
    // POST returned an id whose product's external_id does NOT match what we sent — an untrusted /
    // recycled id would silently mismatch the SKU join. Force the retryable path so the idempotency
    // pre-check re-resolves the product by external_id instead.
    return {
      ok: true,
      value: { id: created.value.id, alreadyExisted: false, reReadFailed: true, incompleteVariants: false, variantCount: 0, variants: [] },
    };
  }
  return {
    ok: true,
    value: {
      id: created.value.id,
      alreadyExisted: false,
      reReadFailed: false,
      // Printful accepted the POST but may bind FEWER variants than sent (out-of-stock / rejected
      // print file). Flag the shortfall so the caller fails loud instead of shipping a partial product.
      incompleteVariants: detail.value.variants.length !== input.variants.length,
      variantCount: detail.value.variants.length,
      variants: detail.value.variants.map((v) => ({
        id: v.id,
        externalId: v.externalId,
        catalogVariantId: v.catalogVariantId,
      })),
    },
  };
}

/** Recipient address for a Printful order. Printful requires name/address1/city/country_code/zip;
 *  state_code is additionally required for US / CA / AU. Forwarded verbatim — validated upstream. */
export interface DraftOrderRecipient {
  name: string;
  address1: string;
  city: string;
  country_code: string;
  zip: string;
  state_code?: string;
  address2?: string;
  email?: string;
  phone?: string;
}

export interface DraftOrderItem {
  /** Woo SKU. Sent as the order item's external_variant_id; Printful resolves it to the native
   *  sync_variant whose external_id we set to this SKU at creation — so one order can span multiple
   *  sync products with no local lookup, and an unknown SKU makes Printful reject the whole POST. */
  sku: string;
  quantity: number;
}

interface RawOrder {
  id: number;
  external_id?: string;
  status?: string;
}

/**
 * Create a DRAFT fulfillment order on the NATIVE store from a (paid) Woo order — P4 fulfillment.
 *
 * ⚠ DRAFT-ONLY BY DESIGN (money-path safety): this calls POST /orders with NO `confirm`, so Printful
 * creates the order as a *draft* — it sits in the dashboard, is NOT charged, and is NOT sent to
 * production. The confirmation step (which charges + prints) is deliberately absent here and must
 * stay a separate, explicit action. DO NOT append `?confirm=1` to this call or add a confirm path.
 *
 * Idempotency: a retried/duplicate fulfillment for the same Woo order must NOT create a second draft.
 * We read GET /orders/@{externalId} first (external_id = Woo order id); a clean Printful 404 proves
 * absence (safe to create), while any other lookup failure leaves absence UNPROVEN, so we refuse to
 * create (no duplicate-draft risk). Same tri-state contract as findSyncProductByExternalId.
 *
 * Item resolution: each item carries the Woo SKU as external_variant_id; an unknown SKU makes
 * Printful reject the POST and create NO order (fail loud — never a partial order).
 */
export async function createDraftOrderOnNative(input: {
  /** Woo order id — the idempotency key (becomes the Printful order external_id). */
  externalId: string;
  recipient: DraftOrderRecipient;
  items: DraftOrderItem[];
}): Promise<
  PrintfulResult<{
    printfulOrderId: number;
    status: string;
    alreadyExisted: boolean;
  }>
> {
  const storeId = process.env.PRINTFUL_NATIVE_STORE_ID;
  if (!storeId) return { ok: false, error: "printful_native_store_not_configured" };
  if (input.items.length === 0) return { ok: false, error: "no_items" };
  // Defense-in-depth: every caller (the pforder route today, a Woo webhook tomorrow) must pass a
  // complete recipient. Re-assert a required-field floor here so a future caller that skips the
  // route's validation can't post a half-addressed order whose Printful rejection would be opaque.
  const rcp = input.recipient;
  if (!rcp || [rcp.name, rcp.address1, rcp.city, rcp.country_code, rcp.zip].some((v) => typeof v !== "string" || v.trim().length === 0)) {
    return { ok: false, error: "recipient_incomplete" };
  }

  // Idempotency pre-check — read the order by external_id (= Woo order id) on the native store.
  const existing = await pf<RawOrder>(`/orders/@${encodeURIComponent(input.externalId)}`, { storeId });
  if (existing.ok) {
    // Trust the "already exists" verdict ONLY if the body is a real order (numeric id) and — when
    // Printful echoes it — its external_id matches. A 200 with an empty/null/mismatched result (proxy
    // cache, API quirk, recycled id) must NOT fabricate a false alreadyExisted, which would silently
    // DROP this paid order's draft. When ambiguous, refuse with a retryable error (the route classifies
    // the `idempotency_precheck_failed:` prefix as transient) rather than guessing.
    if (
      typeof existing.value?.id === "number" &&
      (existing.value.external_id === undefined || existing.value.external_id === input.externalId)
    ) {
      return {
        ok: true,
        value: { printfulOrderId: existing.value.id, status: existing.value.status ?? "unknown", alreadyExisted: true },
      };
    }
    return { ok: false, error: "idempotency_precheck_failed:ambiguous_existing_order" };
  }
  // Lookup failed. Only a genuine Printful application 404 (JSON body code === 404) proves the order
  // is absent and safe to create. Any other failure (network/timeout/gateway/auth) leaves absence
  // unproven → refuse, so a transient blip can never spawn a duplicate draft.
  const lookupErr = existing as { ok: false; error: string; status?: number; code?: number };
  if (lookupErr.code !== 404) {
    return { ok: false, error: `idempotency_precheck_failed:${lookupErr.error}` };
  }

  const body = {
    external_id: input.externalId,
    recipient: input.recipient,
    items: input.items.map((it) => ({ external_variant_id: it.sku, quantity: it.quantity })),
  };
  // POST /orders with NO confirm → Printful creates a DRAFT. Never append ?confirm here (see ⚠ above).
  const created = await pf<RawOrder>(`/orders`, { method: "POST", body, storeId, timeoutMs: 45_000 });
  if (!created.ok) return { ok: false, error: (created as { ok: false; error: string }).error };
  return {
    ok: true,
    value: { printfulOrderId: created.value.id, status: created.value.status ?? "draft", alreadyExisted: false },
  };
}

/**
 * Printful product catalog — fetches the fixed set of POD products we sell (SSOT:
 * pod-catalog-config) with images + printfile specs. All results are cached in-memory
 * (1 h TTL) to avoid hammering the API.
 */

import { POD_PRODUCT_MODELS } from "./pod-catalog-config";

const PRINTFUL_API = "https://api.printful.com";
const TTL_MS = 60 * 60 * 1000; // 1 hour — successful results
// Failures (null spec) cache for only 1 min. A transient Printful timeout/blip must NOT
// lock a product out of the mockup generator for a full hour (root cause of the
// "無法取得 Printful 產品規格" error on productId=837, a fully-supported MUG).
const NULL_TTL_MS = 60 * 1000; // 1 minute — failed results

export interface CatalogProduct {
  id: number;
  title: string;
  /** Printful CDN thumbnail URL */
  image: string;
  typeName: string;
  typeCode: string;
}

export interface ProductSpec {
  productId: number;
  variantId: number;
  placement: string;
  areaWidth: number;
  areaHeight: number;
}

/** Shirt colours the mockup UI offers. Maps to a real Printful variant per product. */
export type GarmentColorChoice = "white" | "grey" | "black";

interface Variant { id: number; color: string; size: string }

// In-memory caches
let catalogCache: { items: CatalogProduct[]; ts: number } | null = null;
// null means "known to fail/unsupported" — also cached to prevent retry storms.
// Keyed by `${productId}:${color}` because each colour resolves to a different variant.
const specCache = new Map<string, { spec: ProductSpec | null; ts: number }>();
// Full variant list per product (paginated once, reused for every colour pick).
const variantsCache = new Map<number, { variants: Variant[]; ts: number }>();

/** Printful v2 caps limit at 100; popular tees have 500-600 variants (84 colours × sizes) and
 *  "White"/"Black" sort alphabetically LAST, so a single limit=100 page misses them entirely
 *  (the bug that made every shirt come out "Aqua"). Paginate the whole list, cache 1 h. */
async function fetchAllVariants(productId: number, apiKey: string): Promise<Variant[]> {
  const hit = variantsCache.get(productId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.variants;
  const all: Variant[] = [];
  let complete = false;
  // `paging.total` lets us stop exactly (no fixed ceiling that could truncate a future
  // >N-variant product). The 2000 guard is only a runaway backstop.
  for (let offset = 0; offset < 2000; offset += 100) {
    const r = await timedFetch(
      `${PRINTFUL_API}/v2/catalog-products/${productId}/catalog-variants?limit=100&offset=${offset}`,
      apiKey,
    );
    if (!r.ok) break; // transient (429/5xx/timeout) — leave `complete` false so we don't cache
    const j = (await r.json()) as { data?: Variant[]; paging?: { total?: number } };
    const vs = j.data ?? [];
    all.push(...vs);
    const total = j.paging?.total;
    if (vs.length < 100 || (typeof total === "number" && all.length >= total)) { complete = true; break; }
  }
  // Cache ONLY a complete list. A partial list (early error break) is returned for this one
  // call but never cached, so the next call re-paginates instead of locking a wrong colour in
  // for an hour (the original "everything comes out Aqua" failure mode).
  if (complete && all.length) variantsCache.set(productId, { variants: all, ts: Date.now() });
  return all;
}

// Greys that are actually grey (Printful also has "Heather Aqua/Forest/…" which are NOT grey).
const GREY_RE = /^(athletic heather|dark grey heather|dark grey|deep heather|black heather|heather slate|heather dust|ash|asphalt|grey|gray|graphite heather|storm)$/i;

/** Pick the real variant id for the requested colour, preferring size M. Falls back to the
 *  first variant of that colour, then to the very first variant (so a mockup always renders). */
function pickVariantByColor(variants: Variant[], color: GarmentColorChoice): number | undefined {
  let pool: Variant[];
  if (color === "grey") {
    pool = variants.filter((v) => /^athletic heather$/i.test(v.color));
    if (!pool.length) pool = variants.filter((v) => GREY_RE.test(v.color));
  } else {
    const exact = color === "black" ? /^black$/i : /^white$/i;
    pool = variants.filter((v) => exact.test(v.color));
    // last resort for products with no pure white (e.g. only "Heather Natural" / "Natural")
    if (!pool.length && color === "white") pool = variants.filter((v) => /^(heather )?natural$/i.test(v.color));
  }
  return (pool.find((v) => /^m$/i.test(v.size)) ?? pool[0] ?? variants[0])?.id;
}

function timedFetch(url: string, apiKey: string, storeId?: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(storeId ? { "X-PF-Store-Id": storeId } : {}),
    },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));
}

/**
 * Fetch a single catalog product by id → CatalogProduct, or null on any failure.
 * NEVER throws (full try/catch + `!res.ok` guard) — required by the `Promise.all` caller in
 * fetchCatalogProducts, which must not short-circuit when one product fails.
 * A missing `image` is treated as failure so a broken-image product cannot pass the
 * completeness check and get cached for 1 h.
 */
async function fetchCatalogProductById(id: number, apiKey: string): Promise<CatalogProduct | null> {
  try {
    const res = await timedFetch(`${PRINTFUL_API}/v2/catalog-products/${id}`, apiKey);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { id: number; name: string; image: string; type: string };
    };
    const p = json.data;
    if (!p || !p.image) return null;
    return { id: p.id, title: p.name, image: p.image, typeName: p.type, typeCode: p.type };
  } catch {
    return null;
  }
}

/**
 * Return the catalog product list (cached 1 h) — the fixed POD set from pod-catalog-config,
 * fetched by id. We deliberately do NOT use the /v2/catalog-products LIST endpoint: it caps at
 * limit=100 sorted by id, and our products 438 (Gildan 5000) & 456 (STTU169) sort past the first
 * 100 (verified 2026-06-20: list limit=100 → max id 373, has438=false, has456=false), so a
 * list+filter approach silently drops them. By-id fetch returns exactly our models, order preserved.
 */
export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) return [];

  if (catalogCache && Date.now() - catalogCache.ts < TTL_MS) return catalogCache.items;

  const ids = POD_PRODUCT_MODELS.map((m) => m.catalogProductId);
  const resolved = await Promise.all(ids.map((id) => fetchCatalogProductById(id, apiKey)));
  const items = resolved.filter((p): p is CatalogProduct => p !== null);

  // Cache ONLY a complete fetch (every model resolved). A partial result (transient API blip on
  // one product) is served this once but not cached, so the next call retries instead of locking
  // a missing product out of the picker for an hour.
  if (items.length === ids.length) {
    catalogCache = { items, ts: Date.now() };
    return items;
  }
  return catalogCache?.items ?? items;
}

/** Return printfile spec for a product in the requested colour (cached 1 h per product+colour). */
export async function fetchProductSpec(
  productId: number,
  color: GarmentColorChoice = "white",
): Promise<ProductSpec | null> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!apiKey || !storeId) return null;

  const key = `${productId}:${color}`;
  const hit = specCache.get(key);
  // Successes cache 1 h; failures only 1 min so a transient error self-heals on retry.
  if (hit && Date.now() - hit.ts < (hit.spec === null ? NULL_TTL_MS : TTL_MS)) return hit.spec;

  try {
    // 1. Full variant list (paginated) → pick the variant matching the requested colour.
    const variants = await fetchAllVariants(productId, apiKey);
    if (!variants.length) {
      specCache.set(key, { spec: null, ts: Date.now() });
      return null;
    }
    const variantId = pickVariantByColor(variants, color);
    if (!variantId) {
      specCache.set(key, { spec: null, ts: Date.now() });
      return null;
    }

    // 2. Get printfile area dimensions
    const pfRes = await timedFetch(
      `${PRINTFUL_API}/mockup-generator/printfiles/${productId}`,
      apiKey,
      storeId,
    );
    let areaWidth = 1800;
    let areaHeight = 2400;
    let placement = "front";

    if (pfRes.ok) {
      const pfJson = (await pfRes.json()) as {
        result: {
          available_placements: Record<string, string>;
          printfiles: Array<{ printfile_id: number; width: number; height: number }>;
          variant_printfiles: Array<{ variant_id: number; placements: Record<string, number> }>;
        };
      };
      const avail = pfJson.result?.available_placements ?? {};
      placement = "front" in avail ? "front" : (Object.keys(avail)[0] ?? "front");
      const vpf = pfJson.result?.variant_printfiles?.find((v) => v.variant_id === variantId);
      const pfId = vpf?.placements[placement];
      const pf = pfJson.result?.printfiles?.find((p) => p.printfile_id === pfId);
      if (pf) { areaWidth = pf.width; areaHeight = pf.height; }
    }

    const spec: ProductSpec = { productId, variantId, placement, areaWidth, areaHeight };
    specCache.set(key, { spec, ts: Date.now() });
    return spec;
  } catch {
    specCache.set(key, { spec: null, ts: Date.now() });
    return null;
  }
}

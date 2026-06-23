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

/** Per-tier seller cost for a POD product (what Printful charges to fulfil one DTG unit). */
export interface ProductTierPricing {
  currency: string;
  /** Wholesale cost of a standard (S–XL) size — single-front DTG, all-in. */
  standardCost: number;
  /** Wholesale cost of a plus (2XL) size — DTG plus-size garments cost more. */
  plusCost: number;
  /** Size whose price was sampled for standardCost (for the UI to be honest about the source). */
  standardSize: string;
  /** Size whose price was sampled for plusCost. */
  plusSize: string;
}

/** A product's size chart → a table (first row = header, e.g. ["尺寸","Length","Chest"]). */
export interface SizeChart {
  /** Measurement unit, e.g. "inches". */
  unit: string;
  /** rows[0] = header; rows[1..] = one row per size. */
  rows: string[][];
}

// In-memory caches
let catalogCache: { items: CatalogProduct[]; ts: number } | null = null;
// Per-product tier pricing (standard + plus cost). Same 1 h success / 1 min failure TTL discipline.
const pricingCache = new Map<number, { pricing: ProductTierPricing | null; ts: number }>();
// Per-product size chart (keyed by productId). Same TTL discipline.
const sizeGuideCache = new Map<number, { chart: SizeChart | null; ts: number }>();
// Per-variant raw cost (single-front DTG, all-in), so the two tier samples reuse across products.
const variantCostCache = new Map<number, { cost: number; currency: string; ts: number }>();
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

/**
 * Seller's wholesale cost for ONE variant, single-front DTG, all-in (blank + the default front print).
 * Source: GET /v2/catalog-variants/{id}/prices → data.variant.techniques[dtg].price (developers.
 * printful.com/docs/v2-beta). We use the variant technique price (all-in for a single front placement)
 * and do NOT add data.product.placements[].price — that is the cost to add EXTRA placements beyond the
 * first, which a single-front design never incurs. ⚠ Verify against live Printful at deploy (the publish
 * SOP smoke step) before trusting the margin for real pricing — the API key isn't available locally.
 * Returns null on any failure (never throws — the caller degrades to "cost unavailable").
 */
async function fetchVariantCost(variantId: number, apiKey: string): Promise<{ cost: number; currency: string } | null> {
  const hit = variantCostCache.get(variantId);
  if (hit && Date.now() - hit.ts < TTL_MS) return { cost: hit.cost, currency: hit.currency };
  try {
    const r = await timedFetch(`${PRINTFUL_API}/v2/catalog-variants/${variantId}/prices`, apiKey);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { currency?: string; variant?: { techniques?: Array<{ technique_key?: string; price?: string }> } };
    };
    const techniques = j.data?.variant?.techniques ?? [];
    const dtg = techniques.find((t) => /dtg/i.test(t.technique_key ?? "")) ?? techniques[0];
    const cost = Number(dtg?.price);
    if (!Number.isFinite(cost) || cost <= 0) return null;
    const currency = j.data?.currency ?? "USD";
    variantCostCache.set(variantId, { cost, currency, ts: Date.now() });
    return { cost, currency };
  } catch {
    return null;
  }
}

/**
 * Tier pricing for a POD product: the wholesale cost of a STANDARD (M) and a PLUS (2XL) variant, so the
 * publish UI can show profit against its two price inputs (retail S–XL / plus 2XL+). Picks the first
 * colour's M and 2XL variants (cost is colour-independent, size-dependent). Cached 1 h (success) /
 * 1 min (failure), matching fetchProductSpec. Returns null if either tier can't be priced.
 */
export async function fetchProductTierPricing(catalogProductId: number): Promise<ProductTierPricing | null> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) return null;

  const hit = pricingCache.get(catalogProductId);
  if (hit && Date.now() - hit.ts < (hit.pricing === null ? NULL_TTL_MS : TTL_MS)) return hit.pricing;

  const fail = (): null => {
    pricingCache.set(catalogProductId, { pricing: null, ts: Date.now() });
    return null;
  };
  try {
    const variants = await fetchAllVariants(catalogProductId, apiKey);
    if (!variants.length) return fail();
    const stdVariant = variants.find((v) => /^m$/i.test(v.size)) ?? variants.find((v) => /^(s|l|xl)$/i.test(v.size));
    const plusVariant = variants.find((v) => /^2xl$/i.test(v.size));
    if (!stdVariant || !plusVariant) return fail();
    const [std, plus] = await Promise.all([
      fetchVariantCost(stdVariant.id, apiKey),
      fetchVariantCost(plusVariant.id, apiKey),
    ]);
    if (!std || !plus) return fail();
    const pricing: ProductTierPricing = {
      currency: std.currency,
      standardCost: std.cost,
      plusCost: plus.cost,
      standardSize: stdVariant.size,
      plusSize: plusVariant.size,
    };
    pricingCache.set(catalogProductId, { pricing, ts: Date.now() });
    return pricing;
  } catch {
    return fail();
  }
}

/**
 * Fetch a product's size chart (Printful GET /products/{id}/sizes?unit=inches) reduced to a table for
 * the publish flow: header row + one row per requested size, columns = the garment measurements. Prefers
 * the `product_measure` table (actual garment dims); falls back to the first available table. Returns
 * null on any failure (never throws — the publish just omits the size-guide block). Cached 1h/1min.
 */
export async function fetchProductSizeGuide(catalogProductId: number, sizes: string[]): Promise<SizeChart | null> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey || !Array.isArray(sizes) || sizes.length === 0) return null;

  const hit = sizeGuideCache.get(catalogProductId);
  if (hit && Date.now() - hit.ts < (hit.chart === null ? NULL_TTL_MS : TTL_MS)) return hit.chart;

  const fail = (): null => {
    sizeGuideCache.set(catalogProductId, { chart: null, ts: Date.now() });
    return null;
  };
  try {
    const r = await timedFetch(`${PRINTFUL_API}/products/${catalogProductId}/sizes?unit=inches`, apiKey);
    if (!r.ok) return fail();
    const j = (await r.json()) as {
      result?: {
        size_tables?: Array<{
          type?: string;
          unit?: string;
          measurements?: Array<{
            type_label?: string;
            values?: Array<{ size?: string; value?: string; min_value?: string; max_value?: string }>;
          }>;
        }>;
      };
    };
    const tables = j.result?.size_tables ?? [];
    const table = tables.find((t) => t.type === "product_measure") ?? tables[0];
    const measurements = (table?.measurements ?? []).filter((m) => (m.type_label ?? "").trim().length > 0);
    if (!table || measurements.length === 0) return fail();

    // These strings (labels + measurement values) are UNTRUSTED Printful API output and flow into the
    // wp-bridge Kadence `table` block, which emits cells into post_content WITHOUT escaping. Escape the
    // 4 HTML-significant chars here so a future/tampered label can't inject markup (critic 2026-06-24,
    // trust-boundary defense-in-depth). Today they're numeric strings + fixed labels — this keeps it safe.
    const esc = (s: string): string =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fmt = (v?: { value?: string; min_value?: string; max_value?: string }): string => {
      if (!v) return "-";
      if (v.value && v.value.trim()) return esc(v.value.trim());
      if (v.min_value && v.max_value) return `${esc(v.min_value.trim())}–${esc(v.max_value.trim())}`;
      return "-";
    };
    const header = ["尺寸 / Size", ...measurements.map((m) => esc((m.type_label ?? "").trim()))];
    const rows: string[][] = [header];
    for (const size of sizes) {
      const su = size.toUpperCase();
      const cells = measurements.map((m) => fmt(m.values?.find((val) => (val.size ?? "").toUpperCase() === su)));
      // Only include a size row that resolved at least one real measurement (avoid an all-"-" row for a
      // size Printful doesn't list). `size` is operator/config-controlled (S/M/L…) but escape anyway.
      if (cells.some((c) => c !== "-")) rows.push([esc(size), ...cells]);
    }
    if (rows.length < 2) return fail();
    // A non-product_measure fallback table can carry unit "none" — coerce to the inches we requested so
    // the body heading never reads "Size guide (none)" (critic 2026-06-24).
    const unit = table.unit && table.unit !== "none" ? table.unit : "inches";
    const chart: SizeChart = { unit, rows };
    sizeGuideCache.set(catalogProductId, { chart, ts: Date.now() });
    return chart;
  } catch {
    return fail();
  }
}

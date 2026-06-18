/**
 * Printful product catalog — fetches available products with images + printfile specs.
 * All results are cached in-memory (1 h TTL) to avoid hammering the API.
 */

const PRINTFUL_API = "https://api.printful.com";
const TTL_MS = 60 * 60 * 1000; // 1 hour

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

// Only include printable product types (skip embroidery, packaging, labels, etc.)
// Note: Printful v2 API uses PHONE-CASE (hyphen) and DRINKWARE
const WANTED_TYPES = new Set([
  "T-SHIRT", "SHIRT", "HOODIE", "SWEATSHIRT", "LONGSLEEVE",
  "TANK_TOP", "JACKET", "SHORTS", "LEGGINGS", "DRESS",
  "MUG", "DRINKWARE", "TOTE", "BACKPACK",
  "POSTER", "CANVAS", "STICKER",
  "PILLOW", "PHONE_CASE", "PHONE-CASE", "FACE_MASK",
  "SUBLIMATION",
]);

// In-memory caches
let catalogCache: { items: CatalogProduct[]; ts: number } | null = null;
// null means "known to fail/unsupported" — also cached to prevent retry storms
const specCache = new Map<number, { spec: ProductSpec | null; ts: number }>();

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

/** Return catalog product list (cached 1 h). Uses v2 catalog API (all Printful products, not store sync). */
export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) return [];

  if (catalogCache && Date.now() - catalogCache.ts < TTL_MS) return catalogCache.items;

  try {
    // /v2/catalog-products returns the full Printful product catalog (not store-synced products)
    const res = await timedFetch(`${PRINTFUL_API}/v2/catalog-products?limit=100`, apiKey);
    if (!res.ok) return catalogCache?.items ?? [];
    const json = (await res.json()) as {
      data: Array<{ id: number; name: string; image: string; type: string }>;
    };
    const items: CatalogProduct[] = (json.data ?? [])
      .filter((p) => WANTED_TYPES.has(p.type))
      .map((p) => ({ id: p.id, title: p.name, image: p.image, typeName: p.type, typeCode: p.type }));
    catalogCache = { items, ts: Date.now() };
    return items;
  } catch {
    return catalogCache?.items ?? [];
  }
}

/** Return printfile spec for a product (cached 1 h). */
export async function fetchProductSpec(productId: number): Promise<ProductSpec | null> {
  const apiKey = process.env.PRINTFUL_API_KEY;
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (!apiKey || !storeId) return null;

  const hit = specCache.get(productId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.spec;

  try {
    // 1. Get variants from v2 catalog API (not store-sync) — pick white/M or first
    const vRes = await timedFetch(
      `${PRINTFUL_API}/v2/catalog-products/${productId}/catalog-variants?limit=200`,
      apiKey,
    );
    if (!vRes.ok) {
      specCache.set(productId, { spec: null, ts: Date.now() });
      return null;
    }
    const vJson = (await vRes.json()) as {
      data: Array<{ id: number; color: string; size: string }>;
    };
    const variants = vJson.data ?? [];
    const variantId = (
      variants.find((v) => /white/i.test(v.color) && /^m$/i.test(v.size)) ??
      variants.find((v) => /white/i.test(v.color)) ??
      variants[0]
    )?.id;
    if (!variantId) {
      specCache.set(productId, { spec: null, ts: Date.now() });
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
    specCache.set(productId, { spec, ts: Date.now() });
    return spec;
  } catch {
    specCache.set(productId, { spec: null, ts: Date.now() });
    return null;
  }
}

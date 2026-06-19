/**
 * POD product + colour catalog — SSOT for the one-click auto-publish flow.
 *
 * Replaces two hardcoded sites:
 *   - `getCatalogVariants(71, ["White","Black"])` in app/api/tools/publish/route.ts (single product)
 *   - `POD_COLORS = ["White","Black"]` in lib/studio/pod-product.ts (two colours)
 *
 * Colours are keyed by Printful **hex** (`color_code`), NOT colour name, because the same name maps
 * to different hex across products (e.g. "Sport Grey" = #9b969c on Gildan 2400 but #c4c0be on Gildan
 * 5000), and each product's grey is named differently (Sport Grey vs Heather Grey). Name matching is
 * unsafe; hex is the stable join key to a catalog variant.
 *
 * VERIFIED against the Printful catalog API on 2026-06-20 (SSH SG → container `node` fetch):
 * all 3 catalogProductIds resolve, and every hex below matched an actual variant's `color_code`,
 * with sizes S/M/L/XL/2XL present on all three. See
 * docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md §4.1.
 */

/** A sellable colour for a POD product. `hex` is the join key to the Printful catalog variant. */
export interface PodColor {
  /** Printful `color_code` (hex, lowercase #rrggbb) — the variant join key. */
  hex: string;
  /** Printful colour name — reference/debug only; NEVER used for matching (varies per product). */
  printfulName: string;
  /** Display label for the Woo colour attribute + UI. */
  label: string;
}

/** A T-shirt model sold through the one-click flow. */
export interface PodProductModel {
  /** Printful catalog product id (the `/v2/catalog-products/{id}` key). */
  catalogProductId: number;
  /** Stable slug for Woo product handle / SKU prefix / filenames. */
  slug: string;
  /** Human label (mirrors the Printful catalog product name). */
  displayName: string;
  /** Sleeve length — drives the model-mockup prompt (long vs short sleeve). */
  sleeve: "long" | "short";
  /** Colours to sell for THIS product (each keyed by Printful hex). */
  colors: PodColor[];
  /** Sizes to sell (must exist on the Printful product). */
  sizes: string[];
}

/** Sizes sold across all POD models. Printful stocks S–5XL on all three; we sell S–2XL. */
export const POD_SIZES = ["S", "M", "L", "XL", "2XL"] as const;

/**
 * The 3 T-shirt models the operator sells. Edit this array to add/remove products or colours —
 * the publish flow (Woo build + Printful binding) reads everything from here.
 */
export const POD_PRODUCT_MODELS: PodProductModel[] = [
  {
    catalogProductId: 57,
    slug: "gildan-2400-long-sleeve",
    displayName: "Unisex Long Sleeve Shirt | Gildan 2400",
    sleeve: "long",
    sizes: [...POD_SIZES],
    colors: [
      { hex: "#ffffff", printfulName: "White", label: "白 White" },
      { hex: "#9b969c", printfulName: "Sport Grey", label: "運動灰 Sport Grey" },
      { hex: "#080808", printfulName: "Black", label: "黑 Black" },
      { hex: "#213b21", printfulName: "Forest Green", label: "森林綠 Forest Green" },
    ],
  },
  {
    catalogProductId: 456,
    slug: "stanley-stella-sttu169",
    displayName: "Unisex Organic Cotton Creator 2.0 T-Shirt | Stanley/Stella STTU169",
    sleeve: "short",
    sizes: [...POD_SIZES],
    colors: [
      { hex: "#ffffff", printfulName: "White", label: "白 White" },
      { hex: "#cfcbc8", printfulName: "Heather Grey", label: "麻灰 Heather Grey" },
      { hex: "#111111", printfulName: "Black", label: "黑 Black" },
      { hex: "#112537", printfulName: "French Navy", label: "海軍藍 French Navy" },
    ],
  },
  {
    catalogProductId: 438,
    slug: "gildan-5000-classic",
    displayName: "Unisex Classic Tee | Gildan 5000",
    sleeve: "short",
    sizes: [...POD_SIZES],
    colors: [
      { hex: "#fffefa", printfulName: "White", label: "白 White" },
      { hex: "#c4c0be", printfulName: "Sport Grey", label: "運動灰 Sport Grey" },
      { hex: "#141313", printfulName: "Black", label: "黑 Black" },
      { hex: "#1a2330", printfulName: "Navy", label: "海軍藍 Navy" },
    ],
  },
];

/** Normalize a hex to lowercase `#rrggbb` for matching against Printful `color_code`. */
export function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

/** Look up a model by its Printful catalog product id. */
export function podModelById(catalogProductId: number): PodProductModel | undefined {
  return POD_PRODUCT_MODELS.find((m) => m.catalogProductId === catalogProductId);
}

/** All (catalogProductId, hex) pairs — used by the Phase 0 REALTEST to verify every colour resolves. */
export function allPodVariantKeys(): { catalogProductId: number; hex: string; printfulName: string }[] {
  return POD_PRODUCT_MODELS.flatMap((m) =>
    m.colors.map((c) => ({ catalogProductId: m.catalogProductId, hex: normalizeHex(c.hex), printfulName: c.printfulName })),
  );
}

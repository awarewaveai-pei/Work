/**
 * POD product payload builder — pure function from publish-form fields to the
 * wp-bridge /product payload (template: agency-os/docs/wp-bridge-product-template.md,
 * verified live on soulful product 7117).
 *
 * Colours come from the selected `model` (pod-catalog-config, hex-keyed). When no model is supplied
 * (legacy single-product callers) it falls back to White/Black, matched by NAME via getCatalogVariants'
 * dual name/hex match. Plus sizes (2XL+) carry the higher price (Printful wholesale is $2–3 more).
 */

import type { PodColor, PodProductModel } from "./pod-catalog-config";

export const POD_SIZES_DEFAULT = ["S", "M", "L", "XL", "2XL"];
export const POD_PLUS_SIZES = new Set(["2XL", "3XL", "4XL", "5XL"]);
// Legacy default when no model is passed. Hex is empty → getCatalogVariants matches these by NAME
// (its dual match accepts a name OR a hex), so the legacy White/Black path keeps working unchanged.
export const POD_COLORS = ["White", "Black"] as const;
const LEGACY_COLORS: PodColor[] = [
  { hex: "", printfulName: "White", label: "White" },
  { hex: "", printfulName: "Black", label: "Black" },
];

export interface PodProductParams {
  title: string;
  slug?: string;
  retailPrice: string; // "24.99"
  plusPrice?: string; // "26.99" — falls back to retailPrice
  sizes?: string[];
  shortDescription?: string; // HTML; AI copy fills this (answer capsule + bullets)
  mockupUrls?: string[]; // first = main image
  designName?: string; // for SKU seed
  /** AI-generated benefit/feature bullets (Phase 4) — used when shortDescription is absent. */
  bullets?: string[];
  /** RankMath SEO meta — wp-bridge ProductCreator.applySeo writes these to the product. */
  seo?: { focus_keyword?: string; title?: string; description?: string };
  /** POD model (pod-catalog-config) — its hex-keyed colours + displayName drive variants & copy.
   *  Absent (legacy callers) → White/Black via LEGACY_COLORS. */
  model?: PodProductModel;
  /** Per-colour mockup URLs keyed by Printful colour NAME (e.g. "Sport Grey" → My Designs URL). Each
   *  becomes that colour's variation image so WooCommerce shows the right colour when a swatch is picked. */
  colorMockups?: Record<string, string>;
}

export interface PodVariantPlan {
  /** Woo Color attribute value (display label, e.g. "運動灰 Sport Grey"). */
  color: string;
  /** Printful catalog colour NAME (e.g. "Sport Grey") — the pfcreate join key (unique within a product). */
  printfulColor: string;
  /** Printful `color_code` (hex) — carried for reference / future hex-keyed binding ("" for legacy). */
  colorHex: string;
  size: string;
  sku: string;
  price: string;
}

function skuSlug(text: string): string {
  return (
    text
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 18) || "POD"
  );
}

/** A short, unique-per-product SKU token from the Printful colour name (e.g. "Sport Grey" → "SPORT-GREY").
 *  Replaces the old first-initial scheme (W/B), which collided across 4 colours (e.g. Forest Green vs
 *  French Navy both → F). */
function colorToken(printfulName: string): string {
  return skuSlug(printfulName).slice(0, 12);
}

/** Resolve the colours to build: the model's hex-keyed set, or legacy White/Black. */
function colorsFor(params: PodProductParams): PodColor[] {
  return params.model?.colors && params.model.colors.length > 0 ? params.model.colors : LEGACY_COLORS;
}

export function priceForSize(size: string, retailPrice: string, plusPrice?: string): string {
  return POD_PLUS_SIZES.has(size.toUpperCase()) ? (plusPrice ?? retailPrice) : retailPrice;
}

export function buildVariantPlan(params: PodProductParams): PodVariantPlan[] {
  const sizes = params.sizes && params.sizes.length > 0 ? params.sizes : params.model?.sizes ?? POD_SIZES_DEFAULT;
  const seed = skuSlug(params.designName ?? params.title);
  const colors = colorsFor(params);
  // Per-product SKU prefix keeps SKUs distinct across models when one design is published to several
  // products (Phase 3 loop) — each colour×size still unique within a product.
  const modelTag = params.model ? `${params.model.catalogProductId}-` : "";
  const plan: PodVariantPlan[] = [];
  for (const c of colors) {
    for (const size of sizes) {
      plan.push({
        color: c.label,
        printfulColor: c.printfulName,
        colorHex: c.hex,
        size,
        // model path: per-product tag + colour-name token (collision-free across 4 colours, e.g.
        // Forest Green vs French Navy). legacy path (no model): keep the original first-initial
        // scheme (W/B) for full back-compat with already-built products + existing tests.
        sku: params.model
          ? `POD-${seed}-${modelTag}${colorToken(c.printfulName)}-${size}`
          : `POD-${seed}-${c.printfulName[0]}-${size}`,
        price: priceForSize(size, params.retailPrice, params.plusPrice),
      });
    }
  }
  return plan;
}

export function buildPodProductPayload(params: PodProductParams): Record<string, unknown> {
  const sizes = params.sizes && params.sizes.length > 0 ? params.sizes : params.model?.sizes ?? POD_SIZES_DEFAULT;
  const colors = colorsFor(params);
  const plan = buildVariantPlan(params);
  const colorLabels = colors.map((c) => c.label);
  const colorsPhrase = colorLabels.join(" / ");
  const productLine = params.model?.displayName ?? "Bella+Canvas 3001 unisex tee";
  // AI bullets (Phase 4) drive the icon_list + short_description fallback; otherwise fall back to
  // boilerplate (now colour-aware so it never says "white/black" for a 4-colour product).
  const bullets =
    params.bullets && params.bullets.length > 0
      ? params.bullets
      : ["100% ring-spun cotton", "Unisex regular fit", colorsPhrase, "Printed to order — less waste"];
  const shortDescription =
    params.shortDescription ??
    `<p>${params.title} — premium unisex tee (${colorsPhrase}).</p><ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;
  return {
    type: "variable",
    name: params.title,
    ...(params.slug ? { slug: params.slug } : {}),
    status: "draft", // human review before publish — never auto-publish (template §4)
    catalog_visibility: "visible",
    short_description: shortDescription,
    // RankMath SEO meta — written by wp-bridge ProductCreator.applySeo (v0.9.0+, live-verified).
    ...(params.seo && (params.seo.focus_keyword || params.seo.title || params.seo.description)
      ? { seo: params.seo }
      : {}),
    blocks: [
      { type: "heading", text: params.title, level: 2 },
      {
        type: "paragraph",
        text: `Soft, breathable ${productLine} printed on demand with water-based inks.`,
      },
      { type: "icon_list", items: bullets },
      { type: "heading", text: "Care", level: 3 },
      { type: "list", items: ["Machine wash cold, inside out", "Hang dry", "Do not iron the print"] },
    ],
    categories: ["Apparel", "T-Shirts"],
    tags: ["pod", "soulful-expression"],
    images: (params.mockupUrls ?? []).map((src, i) => ({ src, alt: `${params.title} ${i + 1}` })),
    attributes: [
      { name: "Color", options: colorLabels, visible: true, variation: true, position: 0 },
      { name: "Size", options: sizes, visible: true, variation: true, position: 1 },
    ],
    default_attributes: [
      { name: "Color", option: colorLabels[0] },
      { name: "Size", option: sizes.includes("M") ? "M" : sizes[0] },
    ],
    variations: plan.map((v, i) => ({
      attributes: { Color: v.color, Size: v.size },
      sku: v.sku,
      regular_price: v.price,
      status: "publish", // variations must be publish to be selectable; parent stays draft
      menu_order: i,
      // Per-colour variation image (Printful mockup of that colour) → the swatch shows the right colour
      // garment when the customer picks it (ProductCreator.php:459 set_image_id on the variation).
      ...(params.colorMockups?.[v.printfulColor] ? { image: { src: params.colorMockups[v.printfulColor] } } : {}),
    })),
  };
}

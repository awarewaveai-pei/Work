/**
 * POD product payload builder — pure function from publish-form fields to the
 * wp-bridge /product payload (template: agency-os/docs/wp-bridge-product-template.md,
 * verified live on soulful product 7117). Bella 3001 white/black per the POD plan;
 * plus sizes (2XL+) carry the higher price (Printful wholesale is $2–3 more).
 */

export const POD_SIZES_DEFAULT = ["S", "M", "L", "XL", "2XL"];
export const POD_PLUS_SIZES = new Set(["2XL", "3XL", "4XL", "5XL"]);
export const POD_COLORS = ["White", "Black"] as const;

export interface PodProductParams {
  title: string;
  slug?: string;
  retailPrice: string; // "24.99"
  plusPrice?: string; // "26.99" — falls back to retailPrice
  sizes?: string[];
  shortDescription?: string;
  mockupUrls?: string[]; // first = main image
  designName?: string; // for SKU seed
}

export interface PodVariantPlan {
  color: (typeof POD_COLORS)[number];
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

export function priceForSize(size: string, retailPrice: string, plusPrice?: string): string {
  return POD_PLUS_SIZES.has(size.toUpperCase()) ? (plusPrice ?? retailPrice) : retailPrice;
}

export function buildVariantPlan(params: PodProductParams): PodVariantPlan[] {
  const sizes = params.sizes && params.sizes.length > 0 ? params.sizes : POD_SIZES_DEFAULT;
  const seed = skuSlug(params.designName ?? params.title);
  const plan: PodVariantPlan[] = [];
  for (const color of POD_COLORS) {
    for (const size of sizes) {
      plan.push({
        color,
        size,
        sku: `POD-${seed}-${color[0]}-${size}`,
        price: priceForSize(size, params.retailPrice, params.plusPrice),
      });
    }
  }
  return plan;
}

export function buildPodProductPayload(params: PodProductParams): Record<string, unknown> {
  const sizes = params.sizes && params.sizes.length > 0 ? params.sizes : POD_SIZES_DEFAULT;
  const plan = buildVariantPlan(params);
  return {
    type: "variable",
    name: params.title,
    ...(params.slug ? { slug: params.slug } : {}),
    status: "draft", // human review before publish — never auto-publish (template §4)
    catalog_visibility: "visible",
    short_description: params.shortDescription ?? `<p>${params.title} — premium unisex tee, white/black.</p>`,
    blocks: [
      { type: "heading", text: params.title, level: 2 },
      {
        type: "paragraph",
        text: "Soft, breathable Bella+Canvas 3001 unisex tee printed on demand with water-based inks.",
      },
      {
        type: "icon_list",
        items: ["100% ring-spun cotton", "Unisex regular fit", "White / Black", "Printed to order — less waste"],
      },
      { type: "heading", text: "Care", level: 3 },
      { type: "list", items: ["Machine wash cold, inside out", "Hang dry", "Do not iron the print"] },
    ],
    categories: ["Apparel", "T-Shirts"],
    tags: ["pod", "soulful-expression"],
    images: (params.mockupUrls ?? []).map((src, i) => ({ src, alt: `${params.title} ${i + 1}` })),
    attributes: [
      { name: "Color", options: [...POD_COLORS], visible: true, variation: true, position: 0 },
      { name: "Size", options: sizes, visible: true, variation: true, position: 1 },
    ],
    default_attributes: [
      { name: "Color", option: "White" },
      { name: "Size", option: sizes.includes("M") ? "M" : sizes[0] },
    ],
    variations: plan.map((v, i) => ({
      attributes: { Color: v.color, Size: v.size },
      sku: v.sku,
      regular_price: v.price,
      status: "publish", // variations must be publish to be selectable; parent stays draft
      menu_order: i,
    })),
  };
}

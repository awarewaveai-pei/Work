import { describe, expect, it } from "vitest";
import { buildPodProductPayload, buildVariantPlan, priceForSize } from "../pod-product";

describe("priceForSize", () => {
  it("uses plus price for 2XL+ and retail otherwise", () => {
    expect(priceForSize("M", "24.99", "26.99")).toBe("24.99");
    expect(priceForSize("2XL", "24.99", "26.99")).toBe("26.99");
    expect(priceForSize("3xl", "24.99", "26.99")).toBe("26.99");
    expect(priceForSize("2XL", "24.99")).toBe("24.99"); // fallback
  });
});

describe("buildVariantPlan", () => {
  it("builds White+Black × sizes with unique SKUs", () => {
    const plan = buildVariantPlan({ title: "Bloom Tee", retailPrice: "24.99", sizes: ["S", "M"] });
    expect(plan).toHaveLength(4);
    const skus = new Set(plan.map((p) => p.sku));
    expect(skus.size).toBe(4);
    expect(plan[0].sku).toMatch(/^POD-BLOOM-TEE-W-S$/);
  });
});

describe("buildPodProductPayload", () => {
  const payload = buildPodProductPayload({
    title: "Soulful Bloom Tee",
    retailPrice: "24.99",
    plusPrice: "26.99",
    sizes: ["S", "M", "L", "XL", "2XL"],
    mockupUrls: ["https://example.com/a.png", "https://example.com/b.png"],
  });

  it("is a draft variable product (never auto-publish)", () => {
    expect(payload.type).toBe("variable");
    expect(payload.status).toBe("draft");
  });

  it("has Color/Size attributes matching variations", () => {
    const variations = payload.variations as { attributes: { Color: string; Size: string }; regular_price: string }[];
    expect(variations).toHaveLength(10);
    expect(variations.find((v) => v.attributes.Size === "2XL")!.regular_price).toBe("26.99");
    expect(variations.find((v) => v.attributes.Size === "M")!.regular_price).toBe("24.99");
  });

  it("maps mockups to images with first as main", () => {
    const images = payload.images as { src: string }[];
    expect(images[0].src).toContain("/a.png");
  });
});

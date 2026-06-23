import { describe, expect, it } from "vitest";
import { buildPodProductPayload, buildVariantPlan, priceForSize } from "../pod-product";
import { podModelById } from "../pod-catalog-config";

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

// ── Phase 1b: multi-colour via pod-catalog-config model ──────────────────────────────────────────
describe("buildVariantPlan — multi-colour via model", () => {
  const gildan2400 = podModelById(57)!;

  it("model → 4 colours × 5 sizes = 20 variants", () => {
    const plan = buildVariantPlan({ title: "Test", retailPrice: "24.99", model: gildan2400 });
    expect(plan).toHaveLength(20);
    expect([...new Set(plan.map((v) => v.printfulColor))].sort()).toEqual([
      "Black",
      "Forest Green",
      "Sport Grey",
      "White",
    ]);
  });

  it("model SKUs unique + carry per-product tag (57) + colour-name token", () => {
    const plan = buildVariantPlan({ title: "Bloom", retailPrice: "24.99", model: gildan2400 });
    const skus = plan.map((v) => v.sku);
    expect(new Set(skus).size).toBe(skus.length);
    expect(skus.every((s) => s.includes("-57-"))).toBe(true);
    expect(plan.find((v) => v.printfulColor === "Sport Grey")!.sku).toContain("SPORT-GREY");
  });

  it("carries printfulColor + colorHex from the model's hex-keyed colours", () => {
    const plan = buildVariantPlan({ title: "T", retailPrice: "24.99", model: gildan2400 });
    const grey = plan.find((v) => v.printfulColor === "Sport Grey")!;
    expect(grey.colorHex).toBe("#9b969c");
    expect(grey.color).toContain("Sport Grey"); // Woo label
  });

  it("legacy (no model) stays White/Black × 5 = 10 with empty hex (name-match path)", () => {
    const plan = buildVariantPlan({ title: "Legacy", retailPrice: "24.99" });
    expect(plan).toHaveLength(10);
    expect([...new Set(plan.map((v) => v.printfulColor))].sort()).toEqual(["Black", "White"]);
    expect(plan.every((v) => v.colorHex === "")).toBe(true);
  });
});

describe("buildPodProductPayload — multi-colour via model", () => {
  const sttu = podModelById(456)!;

  it("Color attribute = model's 4 labels; 20 variations; default = first colour", () => {
    const p = buildPodProductPayload({ title: "Test", retailPrice: "24.99", model: sttu }) as {
      attributes: { name: string; options: string[] }[];
      variations: unknown[];
      default_attributes: { name: string; option: string }[];
    };
    const colorAttr = p.attributes.find((a) => a.name === "Color")!;
    expect(colorAttr.options).toHaveLength(4);
    expect(p.variations).toHaveLength(20);
    expect(p.default_attributes.find((a) => a.name === "Color")!.option).toBe(colorAttr.options[0]);
  });
});

describe("buildPodProductPayload size chart", () => {
  const chart = { unit: "inches", rows: [["尺寸 / Size", "Length", "Width"], ["S", "28", "18"], ["M", "29", "20"]] };

  it("inserts a Kadence table block + Size guide heading when sizeChart present", () => {
    const p = buildPodProductPayload({ title: "Tee", retailPrice: "24.99", sizeChart: chart }) as {
      blocks: Array<Record<string, unknown>>;
    };
    const table = p.blocks.find((b) => b.type === "table");
    expect(table).toBeTruthy();
    expect(table!.rows).toEqual(chart.rows);
    const headings = p.blocks.filter((b) => b.type === "heading").map((b) => String(b.text));
    expect(headings.some((t) => t.includes("Size guide"))).toBe(true);
    expect(headings.some((t) => t.includes("inches"))).toBe(true);
  });

  it("omits the table block when sizeChart is absent or header-only", () => {
    const none = buildPodProductPayload({ title: "Tee", retailPrice: "24.99" }) as { blocks: Array<Record<string, unknown>> };
    expect(none.blocks.find((b) => b.type === "table")).toBeUndefined();
    const headerOnly = buildPodProductPayload({
      title: "Tee",
      retailPrice: "24.99",
      sizeChart: { unit: "inches", rows: [["尺寸 / Size", "Length"]] },
    }) as { blocks: Array<Record<string, unknown>> };
    expect(headerOnly.blocks.find((b) => b.type === "table")).toBeUndefined();
  });
});

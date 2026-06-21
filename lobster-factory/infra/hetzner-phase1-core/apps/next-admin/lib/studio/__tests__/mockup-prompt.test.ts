import { describe, expect, it } from "vitest";
import {
  buildFlatMockupPrompt,
  buildModelMockupPrompt,
  isChestOccludingPose,
  productCategoryFromType,
} from "../mockup-prompt";

describe("buildModelMockupPrompt", () => {
  const base = {
    garmentPhrase: "Bella Canvas 3001 unisex crewneck t-shirt",
    ageGroup: "adult" as const,
    modelDescription: "blonde Asian woman, 20s, slim",
    pose: "standing",
    scene: "coffee-shop",
    lighting: "window",
  };

  it("locks colors on black garments (iron rule #1)", () => {
    const black = buildModelMockupPrompt({ ...base, color: "black" });
    expect(black).toContain("CRITICAL COLOR FIDELITY");
    expect(black).toContain("do NOT lighten");
    const white = buildModelMockupPrompt({ ...base, color: "white" });
    expect(white).not.toContain("CRITICAL COLOR FIDELITY");
  });

  it("demands unobstructed chest for non-occluding poses (iron rule #2)", () => {
    const standing = buildModelMockupPrompt({ ...base, color: "white" });
    expect(standing).toContain("full chest area is visible and unobstructed");
    const crossed = buildModelMockupPrompt({ ...base, color: "white", pose: "arms-crossed" });
    expect(crossed).not.toContain("full chest area is visible");
    expect(crossed).toContain("arms crossed");
  });

  it("always demands exact design reproduction", () => {
    const p = buildModelMockupPrompt({ ...base, color: "white" });
    expect(p).toContain("Reproduce the reference design EXACTLY");
    expect(p).toContain("wrinkles");
  });

  it("forbids the pasted-sticker look (fusion)", () => {
    const p = buildModelMockupPrompt({ ...base, color: "white" });
    expect(p).toContain("must NOT look like a flat sticker");
    expect(p).toContain("embedded INTO the material");
  });

  it("places the design where placement says (default center chest)", () => {
    const def = buildModelMockupPrompt({ ...base, color: "white" });
    expect(def).toContain("center chest print area");
    const left = buildModelMockupPrompt({ ...base, color: "white", placement: "left-chest" });
    expect(left).toContain("left chest");
    expect(left).not.toContain("center chest print area");
    const full = buildModelMockupPrompt({ ...base, color: "white", placement: "full-front" });
    expect(full).toContain("full front of the garment");
  });

  it("uses qualitative size buckets the AI can follow, not an exact %", () => {
    const small = buildModelMockupPrompt({ ...base, color: "white", designSizePct: 45 });
    const full = buildModelMockupPrompt({ ...base, color: "white", designSizePct: 100 });
    expect(small).toContain("small, understated");
    expect(full).toContain("oversized, dominant");
    expect(full).toContain("covering most of it");
    expect(small).not.toMatch(/\d+%/); // no raw percentage leaks into the AI prompt
  });

  it("includes model description, scene and props", () => {
    const p = buildModelMockupPrompt({
      ...base,
      color: "white",
      props: ["bookshelves", "leather chair"],
    });
    expect(p).toContain("blonde Asian woman");
    expect(p).toContain("coffee shop");
    expect(p).toContain("bookshelves");
    expect(p).toContain("leather chair");
  });
});

describe("buildFlatMockupPrompt", () => {
  it("builds a flat-lay prompt with surface, arrangement, lighting and props", () => {
    const p = buildFlatMockupPrompt({
      garmentPhrase: "Bella Canvas 3001 unisex crewneck t-shirt",
      color: "white",
      surface: "white-marble",
      arrangement: "centered-hero",
      lighting: "north-window",
      props: ["bubble tea", "tarot cards"],
    });
    expect(p).toContain("flat-lay");
    expect(p).toContain("marble");
    expect(p).toContain("centered hero");
    expect(p).toContain("bubble tea");
    expect(p).toContain("tarot cards");
    expect(p).toContain("Shot from directly above");
  });

  it("locks colors on black flat-lay too", () => {
    const p = buildFlatMockupPrompt({
      garmentPhrase: "unisex pullover hoodie",
      color: "black",
      surface: "light-oak",
      arrangement: "scatter",
      lighting: "hard-side-rim",
    });
    expect(p).toContain("CRITICAL COLOR FIDELITY");
    expect(p).toContain("hoodie");
  });

  it("shoots drinkware UPRIGHT (立拍), not a top-down flat-lay", () => {
    const p = buildFlatMockupPrompt({
      garmentPhrase: "Latte Mug",
      color: "white",
      surface: "white-marble",
      arrangement: "centered-hero",
      lighting: "north-window",
      productCategory: "drinkware",
    });
    expect(p.toLowerCase()).toContain("mug"); // real product name flows into the prompt
    expect(p).toContain("upright");
    expect(p).not.toContain("flat-lay");
    expect(p).not.toContain("Shot from directly above");
    expect(p).not.toContain("chest area");
  });

  it("keeps jewelry as a top-down flat-lay", () => {
    const p = buildFlatMockupPrompt({
      garmentPhrase: "pendant",
      color: "white",
      surface: "white-marble",
      arrangement: "centered-hero",
      lighting: "north-window",
      productCategory: "jewelry",
    });
    expect(p).toContain("jewelry");
    expect(p).toContain("Shot from directly above");
    expect(p).not.toContain("chest area");
  });
});

describe("isChestOccludingPose", () => {
  it("flags arms-crossed, passes standing", () => {
    expect(isChestOccludingPose("arms-crossed")).toBe(true);
    expect(isChestOccludingPose("standing")).toBe(false);
    expect(isChestOccludingPose("unknown")).toBe(false);
  });
});

describe("productCategoryFromType", () => {
  it("maps Printful typeNames to model-interaction categories", () => {
    expect(productCategoryFromType("MUG")).toBe("drinkware");
    expect(productCategoryFromType("DRINKWARE")).toBe("drinkware");
    expect(productCategoryFromType("POSTER")).toBe("wall-art");
    expect(productCategoryFromType("CANVAS")).toBe("wall-art");
    expect(productCategoryFromType("TOTE")).toBe("bag");
    expect(productCategoryFromType("PHONE-CASE")).toBe("phone");
    expect(productCategoryFromType("PILLOW")).toBe("pillow");
    expect(productCategoryFromType("NECKLACE")).toBe("jewelry");
  });
  it("defaults unknown / apparel types to apparel", () => {
    expect(productCategoryFromType("T-SHIRT")).toBe("apparel");
    expect(productCategoryFromType("HOODIE")).toBe("apparel");
    expect(productCategoryFromType("")).toBe("apparel");
    expect(productCategoryFromType(null)).toBe("apparel");
    expect(productCategoryFromType("SOME_NEW_THING")).toBe("apparel");
  });
});

describe("buildModelMockupPrompt — framing + product category", () => {
  const base = {
    garmentPhrase: "Bella Canvas 3001 unisex crewneck t-shirt",
    color: "white" as const,
    ageGroup: "adult" as const,
    modelDescription: "",
    pose: "standing",
    scene: "studio-white",
    lighting: "window",
  };

  it("always demands the head is not cropped", () => {
    const p = buildModelMockupPrompt(base);
    expect(p).toContain("must NOT be cropped");
  });

  it("full-body framing asks for head to feet", () => {
    const full = buildModelMockupPrompt({ ...base, framing: "full-body" });
    expect(full).toContain("full-body shot");
    expect(full).toContain("top of head to bottom of feet");
    expect(full).toMatch(/^COMPOSITION RULE/); // framing must appear at start of prompt
    const portrait = buildModelMockupPrompt({ ...base, framing: "portrait" });
    expect(portrait).toContain("shoulders up");
  });

  it("apparel (default) keeps the wear-on-chest behavior", () => {
    const p = buildModelMockupPrompt(base);
    expect(p).toContain("wear a plain white");
    expect(p).toContain("chest print area");
  });

  it("drinkware makes the model hold a mug, not wear it", () => {
    const p = buildModelMockupPrompt({ ...base, productCategory: "drinkware" });
    expect(p).toContain("mug");
    expect(p).toContain("hold");
    expect(p).not.toContain("wear a plain");
    expect(p).not.toContain("chest print area");
  });

  it("jewelry presents the worn piece, no chest print", () => {
    const p = buildModelMockupPrompt({ ...base, productCategory: "jewelry" });
    expect(p).toContain("jewelry");
    expect(p).not.toContain("chest print area");
  });

  it("product-photo mode reproduces the real product, not a printed design", () => {
    const design = buildModelMockupPrompt({ ...base, productCategory: "jewelry", referenceKind: "design" });
    expect(design).not.toContain("ACTUAL finished product");

    const product = buildModelMockupPrompt({ ...base, productCategory: "jewelry", referenceKind: "product" });
    expect(product).toContain("exact piece of jewelry shown in the reference image");
    expect(product).toContain("ACTUAL finished product");
    expect(product).toContain("Do NOT add any printed graphics");
    expect(product).not.toContain("printed large on"); // no design-print fidelity block
  });
});

describe("buildFlatMockupPrompt — product-photo mode", () => {
  it("reproduces the exact product instead of printing a design", () => {
    const p = buildFlatMockupPrompt({
      garmentPhrase: "gold pendant necklace",
      color: "white",
      surface: "white-marble",
      arrangement: "centered-hero",
      lighting: "north-window",
      productCategory: "jewelry",
      referenceKind: "product",
    });
    expect(p).toContain("exact product shown in the reference image");
    expect(p).toContain("ACTUAL finished product");
    expect(p).not.toContain("printed large on");
  });
});

describe("mockup quality + appeal upgrades", () => {
  const flatBase = {
    garmentPhrase: "Latte Mug",
    color: "white" as const,
    surface: "white-marble",
    arrangement: "centered-hero",
    lighting: "north-window",
  };
  const modelBase = {
    garmentPhrase: "Bella Canvas 3001 unisex crewneck t-shirt",
    color: "white" as const,
    ageGroup: "adult" as const,
    modelDescription: "",
    pose: "standing",
    scene: "studio-white",
    lighting: "window",
  };

  it("appends the pro-quality directive to flat and model prompts", () => {
    expect(buildFlatMockupPrompt(flatBase)).toContain("professional commercial product photography");
    expect(buildModelMockupPrompt(modelBase)).toContain("professional commercial product photography");
  });

  it("drinkware shows the mug handle and is not shot too close", () => {
    const p = buildFlatMockupPrompt({ ...flatBase, productCategory: "drinkware" });
    expect(p).toContain("handle");
    expect(p).toContain("not too close");
    expect(p).toContain("negative space");
  });

  it("corner-decor adds four-corner props only when enabled", () => {
    const off = buildFlatMockupPrompt(flatBase);
    expect(off).not.toContain("four corners");
    const on = buildFlatMockupPrompt({ ...flatBase, cornerDecor: true });
    expect(on).toContain("four corners");
  });

  it("injects the model's emotion when chosen", () => {
    const none = buildModelMockupPrompt(modelBase);
    expect(none).not.toContain("facial expression shows");
    const happy = buildModelMockupPrompt({ ...modelBase, emotion: "big-laugh" });
    expect(happy).toContain("facial expression shows");
    expect(happy).toContain("laughing");
  });
});

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
    expect(full).toContain("head to feet");
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
});

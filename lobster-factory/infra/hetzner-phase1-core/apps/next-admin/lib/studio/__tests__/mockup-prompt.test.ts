import { describe, expect, it } from "vitest";
import {
  buildFlatMockupPrompt,
  buildModelMockupPrompt,
  isChestOccludingPose,
} from "../mockup-prompt";

describe("buildModelMockupPrompt", () => {
  const base = {
    garment: "tshirt",
    ageGroup: "adult" as const,
    modelDescription: "blonde Asian woman, 20s, slim",
    pose: "standing",
    environment: "cafe interior with coffee cups",
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

  it("includes model description, environment and props", () => {
    const p = buildModelMockupPrompt({
      ...base,
      color: "white",
      propTopRight: "bookshelves",
      propBottomLeft: "leather chair",
    });
    expect(p).toContain("blonde Asian woman");
    expect(p).toContain("cafe interior");
    expect(p).toContain("bookshelves in the top-right");
    expect(p).toContain("leather chair in the bottom-left");
  });
});

describe("buildFlatMockupPrompt", () => {
  it("builds a flat-lay prompt with surface, style, lighting and corner props", () => {
    const p = buildFlatMockupPrompt({
      garment: "tshirt",
      color: "white",
      surface: "light wooden table",
      style: "female-scrunched",
      lighting: "soft-top",
      propBottomLeft: "bubble tea",
      propTopRight: "Taiwan flag",
      propBottomRight: "travel map",
    });
    expect(p).toContain("flat-lay");
    expect(p).toContain("light wooden table");
    expect(p).toContain("scrunched");
    expect(p).toContain("bubble tea in the bottom-left");
    expect(p).toContain("Taiwan flag in the top-right");
    expect(p).toContain("travel map in the bottom-right");
    expect(p).toContain("Shot from directly above");
  });

  it("locks colors on black flat-lay too", () => {
    const p = buildFlatMockupPrompt({
      garment: "hoodie",
      color: "black",
      surface: "",
      style: "male-relaxed",
      lighting: "side-angle",
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

// R4-B (named tests): each model's ratios come from its catalog row; 21:9 is Nano Banana 2's only, and the "nearest
// ratio" rule of the edit / fill / print routes never picks it.
import { describe, expect, it } from "vitest";
import { STUDIO_MODEL_OPTIONS, VALID_ASPECT_RATIOS, isAspectRatio, modelTakesRatio, nearestAspectRatio, ratiosFor } from "../model-options";

describe("每個模型自己的比例", () => {
  it("nano-banana-2 takes the common ratios plus 21:9; every other model only the common ones", () => {
    expect(ratiosFor("nano-banana-2")).toEqual([...VALID_ASPECT_RATIOS, "21:9"]);
    for (const m of STUDIO_MODEL_OPTIONS.filter((o) => o.value !== "nano-banana-2")) {
      expect(ratiosFor(m.value), m.value).toEqual(VALID_ASPECT_RATIOS);
      expect(modelTakesRatio(m.value, "21:9"), m.value).toBe(false);
    }
    expect(modelTakesRatio("nano-banana-2", "21:9")).toBe(true);
    expect(modelTakesRatio("nano-banana-2", "16:9")).toBe(true);
  });

  it("an unknown model takes no ratio; the common check (tarot, content) still refuses 21:9", () => {
    expect(ratiosFor("no-such-model")).toEqual([]);
    expect(modelTakesRatio("no-such-model", "1:1")).toBe(false);
    expect(isAspectRatio("21:9")).toBe(false);
  });
});

describe("nearestAspectRatio 不選 21:9", () => {
  it("a very wide picture still maps to 16:9, so fabric-print / genfill / ai-edit keep their old ratios", () => {
    for (const [w, h] of [[2100, 900], [3168, 1344], [3000, 1000], [4000, 1000], [1920, 1080]]) expect(nearestAspectRatio(w, h)).toBe("16:9");
  });
});

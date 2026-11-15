import { describe, expect, it } from "vitest";
import { DELIVERY_RATIOS, RATIO_FALLBACK, RATIO_LABEL, RATIO_PREFERENCE, ratioFor, ratioOfAsset } from "../platform-ratio";

describe("ratioOfAsset", () => {
  it("takes the recorded metadata ratio first (workbench url has no ratio), falls back to the file name, ignores a bad value", () => {
    const wb = "https://v.example/video/workbench/org/abc.mp4";
    expect(ratioOfAsset({ object_url: wb, metadata: { ratio: "9x16" } })).toBe("9x16");
    expect(ratioOfAsset({ object_url: wb, metadata: { ratio: "1x1" } })).toBe("1x1");
    expect(ratioOfAsset({ object_url: wb, metadata: { ratio: "4x3" } })).toBe("4x3");
    expect(ratioOfAsset({ object_url: "https://v.example/video/t/16x9.mp4", metadata: {} })).toBe("16x9");
    expect(ratioOfAsset({ object_url: wb, metadata: { ratio: "21x9" } })).toBeUndefined();
  });
});

describe("RATIO_PREFERENCE", () => {
  it("every destination list holds every deliverable ratio once, so a single-ratio video reaches every destination", () => {
    for (const list of [...Object.values(RATIO_PREFERENCE), RATIO_FALLBACK]) expect([...list].sort()).toEqual([...DELIVERY_RATIOS].sort());
    for (const r of DELIVERY_RATIOS) {
      expect(RATIO_LABEL[r]).toBeTruthy();
      for (const platform of [...Object.keys(RATIO_PREFERENCE), "unknown-platform"]) expect(ratioFor(platform, [r])).toBe(r);
    }
  });
});

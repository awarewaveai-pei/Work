import { describe, expect, it } from "vitest";
import { ratioOfAsset } from "../platform-ratio";

describe("ratioOfAsset", () => {
  it("takes the recorded metadata ratio first (workbench url has no ratio), falls back to the file name, ignores a bad value", () => {
    const wb = "https://v.example/video/workbench/org/abc.mp4";
    expect(ratioOfAsset({ object_url: wb, metadata: { ratio: "9x16" } })).toBe("9x16");
    expect(ratioOfAsset({ object_url: "https://v.example/video/t/16x9.mp4", metadata: {} })).toBe("16x9");
    expect(ratioOfAsset({ object_url: wb, metadata: { ratio: "1x1" } })).toBeUndefined();
  });
});

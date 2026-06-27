import { describe, it, expect } from "vitest";
import { fitDisplayScale } from "@/lib/studio/canvas-fit";

describe("fitDisplayScale", () => {
  it("fits a wide doc by width when width is the binding constraint", () => {
    // 1920x1080 into 960x1080 → width binds: 960/1920 = 0.5
    expect(fitDisplayScale(1920, 1080, 960, 1080)).toBeCloseTo(0.5, 5);
  });

  it("fits a tall doc by height when height is the binding constraint", () => {
    // 1080x1920 into 1080x480 → height binds: 480/1920 = 0.25
    expect(fitDisplayScale(1080, 1920, 1080, 480)).toBeCloseTo(0.25, 5);
  });

  it("takes the smaller of the two axis ratios", () => {
    // 1000x1000 into 500x800 → min(0.5, 0.8) = 0.5
    expect(fitDisplayScale(1000, 1000, 500, 800)).toBeCloseTo(0.5, 5);
  });

  it("caps at 8x so a tiny document can fill the workspace but not blow up", () => {
    // 10x10 into 1000x1000 → 100x, clamped to 8
    expect(fitDisplayScale(10, 10, 1000, 1000)).toBe(8);
  });

  it("floors at 0.02 so a degenerate/zero available size never yields a non-positive scale", () => {
    expect(fitDisplayScale(4000, 4000, 0, 0)).toBe(0.02);
    expect(fitDisplayScale(4000, 4000, 10, 10)).toBe(0.02); // 10/4000 = 0.0025 < floor
  });

  it("guards against zero real dimensions (no Infinity/NaN)", () => {
    const s = fitDisplayScale(0, 0, 800, 600);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBe(8); // 800/1, 600/1 → min 600 → capped 8
  });

  it("export-size invariant: realW * scale never exceeds availW (within rounding)", () => {
    const realW = 2657, realH = 1500, availW = 900, availH = 700;
    const s = fitDisplayScale(realW, realH, availW, availH);
    expect(realW * s).toBeLessThanOrEqual(availW + 1e-6);
    expect(realH * s).toBeLessThanOrEqual(availH + 1e-6);
  });
});

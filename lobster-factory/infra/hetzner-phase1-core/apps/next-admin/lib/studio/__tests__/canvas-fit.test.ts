import { describe, it, expect } from "vitest";
import { fitDisplayScale, convertUnit } from "@/lib/studio/canvas-fit";

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

describe("convertUnit", () => {
  it("is identity for same unit", () => {
    expect(convertUnit(1234, "px", "px", 300)).toBe(1234);
    expect(convertUnit(9, "cm", "cm", 300)).toBe(9);
  });

  it("px ↔ cm round-trips at DPI (no catastrophic blow-up — the footgun this fixes)", () => {
    // 1234px @300dpi → cm, then back → ~1234px (not 1234cm = 145748px)
    const cm = convertUnit(1234, "px", "cm", 300);
    expect(cm).toBeCloseTo((1234 / 300) * 2.54, 1); // ~10.45cm
    const backPx = convertUnit(cm, "cm", "px", 300);
    expect(Math.abs(backPx - 1234)).toBeLessThanOrEqual(2); // round-trip within rounding
  });

  it("cm ↔ mm is ×10 (fixes the pre-existing silent cm/mm bug)", () => {
    expect(convertUnit(9, "cm", "mm", 300)).toBe(90);
    expect(convertUnit(90, "mm", "cm", 300)).toBe(9);
  });

  it("cm → px uses DPI", () => {
    // 2.54cm @300dpi = 300px
    expect(convertUnit(2.54, "cm", "px", 300)).toBe(300);
  });

  it("guards non-finite input", () => {
    expect(convertUnit(NaN, "px", "cm", 300)).toBeNaN();
  });
});

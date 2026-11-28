// R4-E (named tests): the 16:9 master frame puts the measured product at x 75% / y 57% / 45% tall; every size's crop
// holds the whole product, stays on the picture, and puts the product where the operator's numbers say.
import { describe, expect, it } from "vitest";
import { PRESETS, type PresetKey } from "./banner-state";
import { MASTER_TARGET, WIDE_PRODUCT_X, frameMaster, masterCrop, masterCrops } from "./master-crop";

// the R4-E run-2 master: 5097 x 2867, product at 75% / 56.9% / 45.1%
const W = 5097, H = 2867;
const p = { x: 0.75 * W - 131, y: 0.569 * H - 0.451 * H / 2, w: 262, h: 0.451 * H };
const ALL = Object.keys(PRESETS) as PresetKey[];

describe("R4-E 底圖框到 75% / 57% / 45%", () => {
  it("frameMaster puts the measured product at the target; a too-big product reaches outside (outpaint)", () => {
    const big = { x: 1800, y: 225, w: 360, h: 1280 }; // run 2: the AI drew it 84% tall on 2752 x 1536
    const { frame, outside } = frameMaster(2752, 1536, big)!;
    expect(big.h / frame.h).toBeCloseTo(MASTER_TARGET.h, 5);
    expect((big.x + big.w / 2 - frame.x) / frame.w).toBeCloseTo(MASTER_TARGET.cx, 5);
    expect((big.y + big.h / 2 - frame.y) / frame.h).toBeCloseTo(MASTER_TARGET.cy, 5);
    expect(frame.w / frame.h).toBeCloseTo(16 / 9, 5);
    expect(outside).toBe(true);
    // a small product: the frame sits inside the picture, no outpaint
    expect(frameMaster(2752, 1536, { x: 1950, y: 700, w: 120, h: 400 })!.outside).toBe(false);
  });
});

describe("R4-E 每個尺寸的裁切", () => {
  it("every size holds the whole product and stays on the picture (no 1 px overrun)", () => {
    for (const c of masterCrops(ALL, W, H, p)) {
      expect(c.ok).toBe(true);
      if (!c.ok) continue;
      expect(c.crop.x).toBeGreaterThanOrEqual(0);
      expect(c.crop.y).toBeGreaterThanOrEqual(0);
      expect(c.crop.x + c.crop.w).toBeLessThanOrEqual(W);
      expect(c.crop.y + c.crop.h).toBeLessThanOrEqual(H);
      expect(c.crop.x).toBeLessThanOrEqual(p.x);
      expect(c.crop.x + c.crop.w).toBeGreaterThanOrEqual(p.x + p.w);
      expect(c.crop.y).toBeLessThanOrEqual(p.y);
      expect(c.crop.y + c.crop.h).toBeGreaterThanOrEqual(p.y + p.h);
      expect(c.crop.w / c.crop.h).toBeCloseTo(PRESETS[c.key].w / PRESETS[c.key].h, 2);
    }
  });
  it("wide sizes put the product centre at the operator's share (16:9 75%, 3:2 73%, 4:3 70%); tall ones centre it", () => {
    for (const [k, want] of Object.entries(WIDE_PRODUCT_X) as [PresetKey, number][]) {
      const c = masterCrop(k, W, H, p);
      if (!c.ok) throw new Error(k);
      expect((p.x + p.w / 2 - c.crop.x) / c.crop.w).toBeCloseTo(want, 2);
    }
    const t = masterCrop("r9x16", W, H, p);
    if (!t.ok) throw new Error("r9x16");
    expect((p.x + p.w / 2 - t.crop.x) / t.crop.w).toBeCloseTo(0.5, 2);
  });
  it("a product taller than a size's crop is refused for that size (drawn on its own), not cut", () => {
    expect(masterCrop("r3x1", 2752, 1536, { x: 1800, y: 225, w: 360, h: 1050 })).toMatchObject({ ok: false, reason: "product_too_tall" });
  });
});

describe("R4-E critic m2/m3/m4 -- 不是真的框就不裁；差幾 px 不付費擴圖", () => {
  it("zero / NaN / partly-off-picture boxes and an unloaded picture are refused, never cropped", () => {
    expect(frameMaster(2752, 1536, { x: 0, y: 0, w: 0, h: 0 })).toBeNull();
    expect(frameMaster(2752, 1536, { x: NaN, y: 0, w: 10, h: NaN })).toBeNull();
    expect(masterCrop("r1x1", 5097, 2867, { x: NaN, y: 100, w: 100, h: 100 })).toMatchObject({ ok: false, reason: "bad_box" });
    expect(masterCrop("r1x1", 0, 0, { x: 0, y: 0, w: 0, h: 0 })).toMatchObject({ ok: false, reason: "bad_box" });
    expect(masterCrop("r9x16", 5097, 2867, { x: 5000, y: 500, w: 300, h: 1000 })).toMatchObject({ ok: false, reason: "bad_box" });
  });
  it("a frame passing the edge by a few px is pulled inside (no paid outpaint); a real overrun still outpaints", () => {
    const near = frameMaster(1920, 1080, { x: 1340, y: 372, w: 200, h: 487 })!; // 487 vs 486 target: ~3 px over
    expect(near.outside).toBe(false);
    expect(near.frame.x).toBeGreaterThanOrEqual(0);
    expect(near.frame.y).toBeGreaterThanOrEqual(0);
    expect(near.frame.x + near.frame.w).toBeLessThanOrEqual(1920);
    expect(near.frame.y + near.frame.h).toBeLessThanOrEqual(1080);
    expect(frameMaster(1920, 1080, { x: 1300, y: 300, w: 200, h: 560 })!.outside).toBe(true);
  });
});

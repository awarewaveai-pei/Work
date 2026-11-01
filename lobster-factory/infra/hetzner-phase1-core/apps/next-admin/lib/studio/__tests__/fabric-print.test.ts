import { describe, expect, it } from "vitest";
import { compositeOnFabric, isPrintBox, layoutPrint, type RgbaImage } from "../fabric-print";

function solid(w: number, h: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}
const px = (img: RgbaImage, x: number, y: number) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];

describe("layoutPrint", () => {
  it("fits the design inside the box keeping its aspect, centred horizontally and hung from the top", () => {
    const r = layoutPrint({ width: 1000, height: 2000 }, { width: 100, height: 200 }, { x: 0.2, y: 0.3, w: 0.6, h: 0.5 });
    // box = 600 x 1000 px at (200, 600); design 1:2 → 500 x 1000, centred in 600 → x 250
    expect(r).toEqual({ x: 250, y: 600, w: 500, h: 1000 });
  });

  it("designScale shrinks inside the box and is clamped to 0.4..1", () => {
    const box = { x: 0, y: 0, w: 1, h: 1 };
    expect(layoutPrint({ width: 100, height: 100 }, { width: 10, height: 10 }, box, 0.5).w).toBe(50);
    expect(layoutPrint({ width: 100, height: 100 }, { width: 10, height: 10 }, box, 0.1).w).toBe(40);
    expect(layoutPrint({ width: 100, height: 100 }, { width: 10, height: 10 }, box, 3).w).toBe(100);
  });
});

describe("isPrintBox", () => {
  it("accepts a box inside the photo and refuses one that leaves it or is degenerate", () => {
    expect(isPrintBox({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 })).toBe(true);
    expect(isPrintBox({ x: 0.8, y: 0.3, w: 0.4, h: 0.4 })).toBe(false);
    expect(isPrintBox({ x: 0.3, y: 0.3, w: 0, h: 0.4 })).toBe(false);
    expect(isPrintBox({ x: "0.3", y: 0.3, w: 0.4, h: 0.4 })).toBe(false);
  });
});

describe("compositeOnFabric", () => {
  it("on flat white fabric the ink is the design's own colour and nothing outside the print changes", () => {
    const photo = solid(80, 80, [255, 255, 255, 255]);
    const out = compositeOnFabric(photo, solid(40, 40, [200, 40, 40, 255]), { x: 20, y: 20 });
    const [r, g, b] = px(out, 40, 40);
    expect(Math.abs(r - 202)).toBeLessThanOrEqual(3); // 0.97 ink over white
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    expect(px(out, 5, 5)).toEqual([255, 255, 255]);
    expect(px(out, 70, 40)).toEqual([255, 255, 255]);
  });

  it("a fold shadow in the fabric darkens the print inside it (the print follows the shirt)", () => {
    const photo = solid(120, 120, [240, 240, 240, 255]);
    for (let y = 0; y < 120; y++) for (let x = 55; x < 65; x++) photo.data.set([120, 120, 120, 255], (y * 120 + x) * 4);
    const out = compositeOnFabric(photo, solid(80, 80, [230, 230, 60, 255]), { x: 20, y: 20 });
    const inFold = px(out, 60, 60)[0];
    const flat = px(out, 30, 60)[0];
    expect(inFold).toBeLessThan(flat - 40);
  });

  it("transparent design pixels leave the photo as it was", () => {
    const photo = solid(40, 40, [10, 120, 200, 255]);
    const out = compositeOnFabric(photo, solid(20, 20, [255, 0, 0, 0]), { x: 10, y: 10 });
    expect(px(out, 20, 20)).toEqual([10, 120, 200]);
  });

  it("a design hanging past the photo edge is clipped instead of throwing", () => {
    const photo = solid(30, 30, [255, 255, 255, 255]);
    const out = compositeOnFabric(photo, solid(20, 20, [0, 0, 0, 255]), { x: 20, y: 20 });
    expect(px(out, 25, 25)[0]).toBeLessThan(30);
    expect(px(out, 5, 5)).toEqual([255, 255, 255]);
  });
});

import { describe, expect, it } from "vitest";
import { compositeOnFabric, isPrintBox, printCorners, type Point, type RgbaImage } from "../fabric-print";

function solid(w: number, h: number, rgba: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}
const px = (img: RgbaImage, x: number, y: number) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
const rect = (x: number, y: number, w: number, h: number): [Point, Point, Point, Point] =>
  [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

describe("printCorners", () => {
  it("fits the design inside a box keeping its aspect, centred across and hung from the top", () => {
    const c = printCorners({ width: 1000, height: 2000 }, { width: 100, height: 200 }, { x: 0.2, y: 0.3, w: 0.6, h: 0.5 });
    // box = 600 x 1000 px at (200, 600); design 1:2 → 500 x 1000, centred in 600 → x 250
    expect(c).toEqual(rect(250, 600, 500, 1000));
  });

  it("designScale shrinks inside the box and is clamped to 0.4..1", () => {
    const box = { x: 0, y: 0, w: 1, h: 1 };
    const width = (s: number) => printCorners({ width: 100, height: 100 }, { width: 10, height: 10 }, box, s)[1].x
      - printCorners({ width: 100, height: 100 }, { width: 10, height: 10 }, box, s)[0].x;
    expect(width(0.5)).toBeCloseTo(50);
    expect(width(0.1)).toBeCloseTo(40);
    expect(width(3)).toBeCloseTo(100);
  });

  it("a dragged quad tilts the design with it", () => {
    const quad: [Point, Point, Point, Point] = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.3 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.7 }];
    const c = printCorners({ width: 100, height: 100 }, { width: 80, height: 60 }, { x: 0.1, y: 0.1, w: 0.8, h: 0.8, quad });
    expect(c[1].y).toBeGreaterThan(c[0].y + 10); // right side lower, like the quad
  });
});

describe("isPrintBox", () => {
  it("accepts a box inside the photo and refuses one that leaves it or is degenerate", () => {
    expect(isPrintBox({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 })).toBe(true);
    expect(isPrintBox({ x: 0.8, y: 0.3, w: 0.4, h: 0.4 })).toBe(false);
    expect(isPrintBox({ x: 0.3, y: 0.3, w: 0, h: 0.4 })).toBe(false);
    expect(isPrintBox({ x: "0.3", y: 0.3, w: 0.4, h: 0.4 })).toBe(false);
  });

  it("a quad must be convex and inside its rectangle (the route caps work by the rectangle)", () => {
    const box = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const ok = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.3 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.7 }];
    expect(isPrintBox({ ...box, quad: ok })).toBe(true);
    expect(isPrintBox({ ...box, quad: [ok[0], ok[2], ok[1], ok[3]] })).toBe(false); // self-crossing
    expect(isPrintBox({ ...box, quad: [ok[0], ok[1], { x: 0.95, y: 0.95 }, ok[3]] })).toBe(false); // outside the rect
    expect(isPrintBox({ ...box, quad: ok.slice(0, 3) })).toBe(false);
  });
});

describe("compositeOnFabric", () => {
  it("on flat white fabric the ink is the design's own colour and nothing outside the print changes", () => {
    const photo = solid(80, 80, [255, 255, 255, 255]);
    const out = compositeOnFabric(photo, solid(40, 40, [200, 40, 40, 255]), rect(20, 20, 40, 40));
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
    const out = compositeOnFabric(photo, solid(80, 80, [230, 230, 60, 255]), rect(20, 20, 80, 80));
    expect(px(out, 60, 60)[0]).toBeLessThan(px(out, 30, 60)[0] - 40);
  });

  it("a tilted outline lands where its corners are: inside is ink, a corner the rectangle would cover stays photo", () => {
    const photo = solid(100, 100, [255, 255, 255, 255]);
    const tilted: [Point, Point, Point, Point] = [{ x: 20, y: 20 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 20, y: 60 }];
    const out = compositeOnFabric(photo, solid(30, 20, [0, 0, 200, 255]), tilted);
    expect(px(out, 50, 50)[0]).toBeLessThan(40);            // centre of the quad
    expect(px(out, 75, 24)).toEqual([255, 255, 255]);       // above the slanted top edge
    expect(px(out, 24, 75)).toEqual([255, 255, 255]);       // below the slanted bottom edge
  });

  it("transparent design pixels leave the photo as it was", () => {
    const photo = solid(40, 40, [10, 120, 200, 255]);
    const out = compositeOnFabric(photo, solid(20, 20, [255, 0, 0, 0]), rect(10, 10, 20, 20));
    expect(px(out, 20, 20)).toEqual([10, 120, 200]);
  });

  it("a design hanging past the photo edge is clipped instead of throwing", () => {
    const photo = solid(30, 30, [255, 255, 255, 255]);
    const out = compositeOnFabric(photo, solid(20, 20, [0, 0, 0, 255]), rect(20, 20, 20, 20));
    expect(px(out, 25, 25)[0]).toBeLessThan(30);
    expect(px(out, 5, 5)).toEqual([255, 255, 255]);
  });
});

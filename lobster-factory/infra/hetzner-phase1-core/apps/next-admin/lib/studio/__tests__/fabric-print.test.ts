import { describe, expect, it } from "vitest";
import { compositeOnFabric, foldPush, isPrintBox, printCorners, type Point, type RgbaImage } from "../fabric-print";

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

  it("smooth fabric does not move the print: soft uneven lighting leaves the whole outline where it was placed", () => {
    // +-6 of 255 in slow waves: the shading of an uncreased shirt, not a fold
    const photo = solid(120, 120, [232, 232, 232, 255]);
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      const v = Math.round(232 + 6 * Math.sin(x / 9) * Math.cos(y / 11));
      photo.data.set([v, v, v, 255], (y * 120 + x) * 4);
    }
    const out = compositeOnFabric(photo, solid(80, 80, [200, 30, 30, 255]), rect(20, 20, 80, 80));
    let inkOutside = 0;
    let fabricInside = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      const isInk = px(out, x, y)[1] < 100;
      const outside = x < 18 || x >= 102 || y < 18 || y >= 102;   // 2 px beyond the placed outline
      const inside = x >= 22 && x < 98 && y >= 22 && y < 98;      // 2 px within it
      if (outside && isInk) inkOutside++;
      if (inside && !isInk) fabricInside++;
    }
    expect(inkOutside).toBe(0);
    expect(fabricInside).toBe(0);
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

// The push field itself (pixels each spot of the print is moved by the fabric's folds), on synthetic luminance maps.
describe("foldPush", () => {
  const map = (w: number, h: number, at: (x: number, y: number) => number) => {
    const m = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = at(x, y);
    return m;
  };
  const dip = (y: number, centre: number, depth: number, width = 18) => 1 - depth * Math.exp(-((y - centre) ** 2) / (2 * width * width));
  const largest = (f: { x: Float32Array; y: Float32Array }) => f.x.reduce((m, v, i) => Math.max(m, Math.hypot(v, f.y[i])), 0);
  // How hard the map p -> p + push squeezes the print at its worst spot: 0 = not at all, 1 = flattened to a line,
  // above 1 = folded over itself. (Largest negative eigenvalue of the field's symmetric gradient.)
  const squeeze = (f: { x: Float32Array; y: Float32Array }, w: number, h: number) => {
    let worst = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = (f.x[i + 1] - f.x[i - 1]) / 2;
      const d = (f.y[i + w] - f.y[i - w]) / 2;
      const b = ((f.x[i + w] - f.x[i - w]) / 2 + (f.y[i + 1] - f.y[i - 1]) / 2) / 2;
      worst = Math.max(worst, Math.hypot((a - d) / 2, b) - (a + d) / 2);
    }
    return worst;
  };
  const W = 240;
  const H = 400;

  it("follows the fold's depth relative to the fabric: a tenth of the fold, a tenth of the push; dark like light", () => {
    const fold = (base: number, depth: number) => foldPush(map(W, H, (_x, y) => base * dip(y, 120, depth)), W, H, 1);
    const deep = largest(fold(0.9, 0.1));
    expect(deep).toBeGreaterThan(2);
    expect(largest(fold(0.9, 0.01)) / deep).toBeGreaterThan(0.07);
    expect(largest(fold(0.9, 0.01)) / deep).toBeLessThan(0.13);
    // a dark shirt: within a tenth (the noise floor added before the log weighs a little more on it)
    expect(Math.abs(largest(fold(0.25, 0.1)) / deep - 1)).toBeLessThan(0.1);
  });

  it("depends on nothing else in the photo: a deeper fold or a bright area elsewhere leaves this fold's push alone", () => {
    const base = (_x: number, y: number) => 0.25 * dip(y, 80, 0.06);
    const plain = foldPush(map(W, H, base), W, H, 1);
    const deeper = foldPush(map(W, H, (x, y) => base(x, y) * dip(y, 320, 0.25)), W, H, 1);
    const bright = foldPush(map(W, H, (x, y) => (y > 280 ? 0.98 : base(x, y))), W, H, 1);
    let moved = 0;
    for (let y = 20; y < 140; y++) {
      const i = y * W + 120;
      moved = Math.max(moved, Math.abs(plain.y[i]));
      expect(deeper.y[i]).toBeCloseTo(plain.y[i], 5);
      expect(bright.y[i]).toBeCloseTo(plain.y[i], 5);
    }
    expect(moved).toBeGreaterThan(1);
  });

  it("never folds the print over itself, however deep or sharp the folds: squeezed to 0.35 of its size at most", () => {
    const fields: Array<[string, Float32Array]> = [
      ["crossing folds", map(W, H, (x, y) => 0.5 * (1 + 0.33 * Math.sin(x / 40) * Math.cos(y / 47)))],
      ["deep crossing folds", map(W, H, (x, y) => 0.5 * (1 + 0.9 * Math.sin(x / 40) * Math.cos(y / 47)))],
      ["tight crossing folds", map(W, H, (x, y) => 0.5 * (1 + 0.6 * Math.sin(x / 14) * Math.cos(y / 17)))],
      ["hard crease", map(W, H, (_x, y) => (y > 190 && y < 210 ? 0.25 : 0.94))],
      ["hard corner", map(W, H, (x, y) => (x > 120 && y > 200 ? 0.2 : 0.9))],
    ];
    for (const [name, lum] of fields) {
      const f = foldPush(lum, W, H, 1);
      expect(largest(f), name).toBeGreaterThan(3);              // the folds do move the print
      expect(squeeze(f, W, H), name).toBeLessThanOrEqual(0.65 + 1e-4);
    }
  });

  it("crushed black shows no folds: one-level banding at 2/255 or 4/255 does not move the print", () => {
    for (const level of [2, 4]) {
      const banded = map(W, H, (x, y) => (level + (level / 2) * Math.sign(Math.sin(x / 23) * Math.cos(y / 29))) / 255);
      expect(largest(foldPush(banded, W, H, 1)), `level ${level}`).toBeLessThan(2);
    }
  });

  it("is the same push, in print widths, at any resolution", () => {
    const at = (s: number) => {
      const f = foldPush(map(W * s, H * s, (_x, y) => 0.9 * dip(y / s, 120, 0.1)), W * s, H * s, s);
      return largest(f) / s;
    };
    expect(Math.abs(at(2) / at(1) - 1)).toBeLessThan(0.08);
  });
});

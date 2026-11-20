/**
 * Print a design onto a plain-garment photo so it follows the fabric: the outline follows the torso's angle (a
 * perspective map onto four corners), the shirt's own folds displace the design -- edges included -- and its own light
 * and shadow shade the ink (the Photoshop "displacement map + multiply" mockup technique). No AI: the design's pixels
 * are never redrawn, the result is deterministic, and it costs nothing.
 *
 * Why not AI: nano-banana-2 and nano-banana-pro both pasted a flat, evenly lit rectangle in the 2026-11-01 trials
 * (agency-os/docs/operations/MOCKUP_FIXED_MODEL_PLAN.md). Pure functions over RGBA buffers; the route decodes and
 * encodes with sharp.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8Array | Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

/** Where the print may sit, as fractions of the photo (0..1). x/y/w/h is the bounding rectangle; `quad` (TL, TR, BR,
 *  BL) is set when the corners were dragged to follow a turned or tilted torso -- an upright rectangle on a leaning
 *  body read as a sticker (operator, 2026-11-01). The design is fitted inside, keeping its aspect. */
export interface PrintBox {
  x: number;
  y: number;
  w: number;
  h: number;
  quad?: [Point, Point, Point, Point];
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function isPrintBox(v: unknown): v is PrintBox {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  if (!finite(b.x) || !finite(b.y) || !finite(b.w) || !finite(b.h)) return false;
  const { x, y, w, h } = b as unknown as PrintBox;
  if (!(x >= 0 && y >= 0 && w > 0.02 && h > 0.02 && x + w <= 1.0001 && y + h <= 1.0001)) return false;
  if (b.quad === undefined) return true;
  const q = b.quad;
  if (!Array.isArray(q) || q.length !== 4) return false;
  for (const pt of q) {
    if (!pt || typeof pt !== "object") return false;
    const { x: px, y: py } = pt as Record<string, unknown>;
    if (!finite(px) || !finite(py) || px < 0 || px > 1 || py < 0 || py > 1) return false;
    // The rectangle bounds the quad: the route caps the work by the rectangle's area.
    const e = 1e-4;
    if (px < x - e || px > x + w + e || py < y - e || py > y + h + e) return false;
  }
  return isConvex(q as Point[]);
}

/** A non-degenerate convex quad, corners in order (either winding): what a dragged print outline can be. */
function isConvex(q: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The design's four corners on the photo, in pixels (TL, TR, BR, BL): as large as fits inside the box keeping the
 *  design's aspect, centred across, hung from the top edge (a chest print starts just below the collar).
 *  designScale 0.4–1 shrinks it inside the box. */
export function printCorners(
  photo: { width: number; height: number },
  design: { width: number; height: number },
  box: PrintBox,
  designScale = 1,
): [Point, Point, Point, Point] {
  const px = (p: Point): Point => ({ x: p.x * photo.width, y: p.y * photo.height });
  const q = (box.quad ?? [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ]).map(px) as [Point, Point, Point, Point];
  const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const s = Math.min(qw / design.width, qh / design.height) * Math.min(1, Math.max(0.4, designScale));
  const fu = (design.width * s) / qw;
  const fv = (design.height * s) / qh;
  const u0 = (1 - fu) / 2;
  const at = (u: number, v: number) => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
  return [at(u0, 0), at(u0 + fu, 0), at(u0 + fu, fv), at(u0, fv)];
}

/** 3x3 homography taking the unit square (0,0) (1,0) (1,1) (0,1) to the four corners (Heckbert closed form). */
function squareToQuad(c: [Point, Point, Point, Point]): number[] {
  const [p0, p1, p2, p3] = c;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

/** Gaussian blur approximated by three box blurs (running sums): cost per pixel does not grow with sigma, so a large
 *  print cannot stall the event loop (a true 201-tap kernel took 8.6 s on a 3000 px box, 2026-11-01 review). */
function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0.3) return src.slice();
  const r = boxRadius(sigma); // 3 boxes of 2r+1 ≈ variance sigma²
  const a = src.slice();
  const b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  return a;
}

/** One horizontal or vertical box blur of radius r with edge clamping, O(1) per pixel. */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const at = (line: number, i: number) => (horizontal ? line * w + i : i * w + line);
  const n = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[at(line, Math.min(len - 1, Math.max(0, i)))];
    for (let i = 0; i < len; i++) {
      dst[at(line, i)] = sum / n;
      sum += src[at(line, Math.min(len - 1, i + r + 1))] - src[at(line, Math.max(0, i - r))];
    }
  }
}

function percentile(values: Float32Array, p: number): number {
  const step = Math.max(1, Math.floor(values.length / 20000));
  const sample: number[] = [];
  for (let i = 0; i < values.length; i += step) sample.push(values[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor((p / 100) * sample.length))] ?? 0;
}

// DISPLACE = the push, in pixels of a 540 px wide print, that a fold of steepness FOLD_REF earns (and the cap).
// SHADE_GAMMA: the operator asked for stronger shading than the first cut (1.6), 2026-11-01.
const DISPLACE = 28;
const SHADE_GAMMA = 2.1;
// Fold steepness = relative luminance change (gradient of log luminance) per 1/540 of the print's width.
// FOLD_REF is the p99 steepness in the 2026-11-01 tuning photo (casual-plain.png, 0.0063). The push is proportional
// to the steepness at that spot: dividing by the photo's own p99 gave a smooth shirt the same 28 px as a creased one
// (a smooth plate measures 0.0021) and tore small type on the plates that needed no displacement. Log, so the same
// fold counts the same on a dark shirt, a white one, or beside a bright background.
const FOLD_REF = 0.0063;
// Added to the luminance before the log, so the log stays finite on black.
const FOLD_FLOOR = 0.02;
// Below FOLD_DARK[0] (4/255) a step of one 8-bit level is half the signal: banding in a crushed black shirt read as
// folds and moved small type by ~10 units (2026-11-20 review). Folds count for nothing there, fully from [1] (13/255).
const FOLD_DARK: [number, number] = [0.016, 0.05];
// A fold may squeeze the print locally to this fraction of its size, never past it. Below 0 the map folds over and
// the print overlaps itself -- the "torn" look (6.5 % of the tuning photo's print did before, 2026-11-20 review).
// It is what holds the tuning photo's creases to about 11 units of push, not DISPLACE: a crease that sharp cannot
// carry more without tearing. A stronger fold look needs a wider fold map (the 11 * unit blur), not a larger push.
const MIN_STRETCH = 0.35;

/** Largest value within about `r` pixels of every pixel: block maxima over r x r cells, then each pixel takes the
 *  maximum of its 3 x 3 cells. O(1) per pixel, and never smaller than the true maximum within r. */
function nearMax(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const cw = Math.ceil(w / r);
  const ch = Math.ceil(h / r);
  const cells = new Float32Array(cw * ch).fill(-Infinity);
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(y / r) * cw;
    for (let x = 0; x < w; x++) {
      const c = cy + Math.floor(x / r);
      if (src[y * w + x] > cells[c]) cells[c] = src[y * w + x];
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(y / r);
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / r);
      let m = -Infinity;
      for (let j = Math.max(0, cy - 1); j <= Math.min(ch - 1, cy + 1); j++) {
        for (let i = Math.max(0, cx - 1); i <= Math.min(cw - 1, cx + 1); i++) m = Math.max(m, cells[j * cw + i]);
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Smallest value within about `r` pixels of every pixel (never larger than the true minimum within r). */
function nearMin(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = nearMax(src.map((v) => -v), w, h, r);
  for (let i = 0; i < out.length; i++) out[i] = -out[i];
  return out;
}

/** Radius of each of the three box blurs gaussianBlur runs for this sigma; the blur reaches 3 * this far. */
const boxRadius = (sigma: number) => Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));

/**
 * How far the fabric's folds push each pixel of the print, in pixels: (x[i], y[i]) for a `w` x `h` luminance map
 * (0..1), `unit` = print width / 540. Exported for the tests, which check the field itself: it follows the relative
 * depth of the fold at that spot, and the map p -> p + push never squeezes the print past MIN_STRETCH (so it cannot
 * fold over itself). One exception to "that spot only": when the local limit alone does not keep the whole field
 * inside MIN_STRETCH (strong folds crossing each other), the whole field is scaled down together -- measured: a
 * patch of such folds 300 px away lowered a soft fold's push by a third. A single hard crease does not trigger it.
 */
export function foldPush(lum: Float32Array, w: number, h: number, unit: number): { x: Float32Array; y: Float32Array } {
  // Only the large folds move the print: following fine texture tore its edges like paper (2026-11-01 render).
  const folds = gaussianBlur(lum, w, h, 11 * unit);
  // Fold height = log of the blurred luminance: its gradient is the relative change at that spot, whatever the
  // garment's colour and whatever else is in the photo.
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = Math.log(folds[i] + FOLD_FLOOR);
  const f = (x: number, y: number) => height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const curv = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gx[i] = (f(x + 1, y) - f(x - 1, y)) / 2;
      gy[i] = (f(x, y + 1) - f(x, y - 1)) / 2;
      const fxx = f(x + 1, y) - 2 * f(x, y) + f(x - 1, y);
      const fyy = f(x, y + 1) - 2 * f(x, y) + f(x, y - 1);
      const fxy = (f(x + 1, y + 1) - f(x - 1, y + 1) - f(x + 1, y - 1) + f(x - 1, y - 1)) / 4;
      curv[i] = Math.max(Math.abs(fxx) + Math.abs(fxy), Math.abs(fyy) + Math.abs(fxy)); // bounds the Hessian's eigenvalues
    }
  }
  // Pixels of push per unit of gradient. Wanted: steepness (gradient * unit) / FOLD_REF of the full DISPLACE * unit.
  // Near a sharp crease it is held to (1 - MIN_STRETCH) / curvature, so the map x -> x + strength * gradient does
  // not squeeze the print past MIN_STRETCH there. The limit is local -- a hard crease in one corner does not flatten
  // the folds elsewhere -- and smoothed so the strength does not jump; the smoothing reads `spread` pixels around, so
  // the limit is first lowered to its minimum over that distance and the smoothed value cannot exceed it anywhere.
  const wanted = (DISPLACE * unit * unit) / FOLD_REF;
  const reach = Math.max(2, Math.ceil(11 * unit));
  const sharpest = nearMax(curv, w, h, reach);
  const limit = new Float32Array(w * h);
  for (let i = 0; i < limit.length; i++) limit[i] = Math.min(wanted, (1 - MIN_STRETCH) / Math.max(1e-9, sharpest[i]));
  const spread = 3 * boxRadius(reach / 2);
  const strength = gaussianBlur(nearMin(limit, w, h, spread), w, h, reach / 2);
  const maxPush = Math.ceil(DISPLACE * unit) + 1;
  const pushX = new Float32Array(w * h);
  const pushY = new Float32Array(w * h);
  for (let i = 0; i < pushX.length; i++) {
    const t = Math.min(1, Math.max(0, (folds[i] - FOLD_DARK[0]) / (FOLD_DARK[1] - FOLD_DARK[0])));
    const seen = t * t * (3 - 2 * t); // 0 where the fabric is too dark to show a fold, 1 from FOLD_DARK[1]
    pushX[i] = gx[i] * strength[i] * seen;
    pushY[i] = gy[i] * strength[i] * seen;
    const push = Math.hypot(pushX[i], pushY[i]);
    if (push > maxPush) {
      pushX[i] *= maxPush / push;
      pushY[i] *= maxPush / push;
    }
  }
  // The guarantee itself, on the field that is applied (the strength's own slope and the clamp above are not in the
  // limit): the most any spot is squeezed is the largest negative eigenvalue of the push field's symmetric gradient.
  // If that exceeds 1 - MIN_STRETCH the whole field is scaled back; the gradient scales with it, so the bound holds.
  let squeeze = 0;
  const at = (a: Float32Array, x: number, y: number) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = (at(pushX, x + 1, y) - at(pushX, x - 1, y)) / 2;
      const d = (at(pushY, x, y + 1) - at(pushY, x, y - 1)) / 2;
      const b = ((at(pushX, x, y + 1) - at(pushX, x, y - 1)) / 2 + (at(pushY, x + 1, y) - at(pushY, x - 1, y)) / 2) / 2;
      squeeze = Math.max(squeeze, Math.hypot((a - d) / 2, b) - (a + d) / 2);
    }
  }
  if (squeeze > 1 - MIN_STRETCH) {
    const k = (1 - MIN_STRETCH) / squeeze;
    for (let i = 0; i < pushX.length; i++) {
      pushX[i] *= k;
      pushY[i] *= k;
    }
  }
  return { x: pushX, y: pushY };
}

/**
 * Composite `design` onto `photo` with its corners at `corners` (pixels, TL TR BR BL; see printCorners): a perspective
 * map, then the shirt's folds displace it -- the outline too, so its edges ripple with the fabric -- and its light and
 * shadow shade it. Returns a new image; pixels outside the displaced outline are untouched. Strengths scale with the
 * print's width so a 2K and a 1K photo look alike. For a sharp result pass the design already resized to about the
 * outline's size.
 */
export function compositeOnFabric(photo: RgbaImage, design: RgbaImage, corners: [Point, Point, Point, Point]): RgbaImage {
  const W = photo.width;
  const H = photo.height;
  const dw = design.width;
  const dh = design.height;
  const out = new Uint8ClampedArray(photo.data);
  const unit = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2 / 540;
  // The outline moves with the folds, so the work area reaches past it by the largest displacement.
  const pad = Math.ceil(DISPLACE * unit) + 2;
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))) - pad);
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))) - pad);
  const x1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => c.x))) + pad);
  const y1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => c.y))) + pad);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return { width: W, height: H, data: out };
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = invert3(squareToQuad(corners));

  const lum = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const p = ((y0 + y) * W + (x0 + x)) * 4;
      lum[y * rw + x] = (0.299 * photo.data[p] + 0.587 * photo.data[p + 1] + 0.114 * photo.data[p + 2]) / 255;
    }
  }
  const shadeSrc = gaussianBlur(lum, rw, rh, 1.2 * unit);
  const grainBase = gaussianBlur(lum, rw, rh, 2 * unit);

  const { x: pushX, y: pushY } = foldPush(lum, rw, rh, unit);
  const ref = Math.max(1e-3, percentile(lum, 92)); // the garment's lit brightness, for the shading below

  const sample = (sx: number, sy: number, c: number): number => {
    const cx = Math.min(dw - 1, Math.max(0, sx));
    const cy = Math.min(dh - 1, Math.max(0, sy));
    const ix = Math.floor(cx);
    const iy = Math.floor(cy);
    const fx = cx - ix;
    const fy = cy - iy;
    const ix1 = Math.min(dw - 1, ix + 1);
    const iy1 = Math.min(dh - 1, iy + 1);
    const d = design.data;
    const a = d[(iy * dw + ix) * 4 + c];
    const b = d[(iy * dw + ix1) * 4 + c];
    const e = d[(iy1 * dw + ix) * 4 + c];
    const f = d[(iy1 * dw + ix1) * 4 + c];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
  };

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      // Pixel centre, pushed along the fold, back through the perspective into design pixels.
      const X = x0 + x + 0.5 + pushX[i];
      const Y = y0 + y + 0.5 + pushY[i];
      const z = m6 * X + m7 * Y + m8;
      const u = ((m0 * X + m1 * Y + m2) / z) * dw;
      const v = ((m3 * X + m4 * Y + m5) / z) * dh;
      // One-pixel antialiased edge; outside the (displaced) outline the photo stays as it was.
      const cover = Math.min(1, Math.max(0, Math.min(u + 0.5, dw - u + 0.5, v + 0.5, dh - v + 0.5)));
      if (cover <= 0) continue;
      const alpha = (sample(u - 0.5, v - 0.5, 3) / 255) * 0.97 * cover;
      if (alpha <= 0) continue;
      const shade = Math.pow(Math.min(1.08, Math.max(0, shadeSrc[i] / ref)), SHADE_GAMMA);
      const grain = (lum[i] - grainBase[i]) * 0.7;
      const p = ((y0 + y) * W + (x0 + x)) * 4;
      for (let c = 0; c < 3; c++) {
        const ink = Math.min(1, Math.max(0, (sample(u - 0.5, v - 0.5, c) / 255) * shade + grain));
        out[p + c] = Math.round((photo.data[p + c] / 255) * (1 - alpha) * 255 + ink * alpha * 255);
      }
    }
  }
  return { width: W, height: H, data: out };
}

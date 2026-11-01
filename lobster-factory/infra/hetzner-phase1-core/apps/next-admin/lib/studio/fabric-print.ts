/**
 * Print a design onto a plain-garment photo so it follows the fabric: the shirt's own folds displace the design and
 * its own light and shadow shade the ink (the Photoshop "displacement map + multiply" mockup technique). No AI: the
 * design's pixels are never redrawn, the result is deterministic, and it costs nothing.
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

/** Where the print may sit, as fractions of the photo (0..1). The design is fitted inside, keeping its aspect. */
export interface PrintBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isPrintBox(v: unknown): v is PrintBox {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  if (!ok(b.x) || !ok(b.y) || !ok(b.w) || !ok(b.h)) return false;
  const { x, y, w, h } = b as unknown as PrintBox;
  return x >= 0 && y >= 0 && w > 0.02 && h > 0.02 && x + w <= 1.0001 && y + h <= 1.0001;
}

/** Pixel rectangle of the design inside the box: as large as fits, centred horizontally, top-aligned
 *  (a chest print hangs from just below the collar). designScale 0.4–1 shrinks it inside the box. */
export function layoutPrint(
  photo: { width: number; height: number },
  design: { width: number; height: number },
  box: PrintBox,
  designScale = 1,
): { x: number; y: number; w: number; h: number } {
  const bw = box.w * photo.width;
  const bh = box.h * photo.height;
  const s = Math.min(bw / design.width, bh / design.height) * Math.min(1, Math.max(0.4, designScale));
  const w = Math.max(1, Math.round(design.width * s));
  const h = Math.max(1, Math.round(design.height * s));
  const x = Math.round(box.x * photo.width + (bw - w) / 2);
  const y = Math.round(box.y * photo.height);
  return { x, y, w, h };
}

/** Gaussian blur approximated by three box blurs (running sums): cost per pixel does not grow with sigma, so a large
 *  print cannot stall the event loop (a true 201-tap kernel took 8.6 s on a 3000 px box, 2026-11-01 review). */
function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0.3) return src.slice();
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2)); // 3 boxes of 2r+1 ≈ variance sigma²
  let a = src.slice();
  let b = new Float32Array(w * h);
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

/**
 * Composite `design` (already resized to its final pixel size) onto `photo` at (at.x, at.y). Returns a new image;
 * pixels outside the design's rectangle are untouched. Strengths scale with the print's width so a 2K and a 1K
 * photo look alike.
 */
export function compositeOnFabric(photo: RgbaImage, design: RgbaImage, at: { x: number; y: number }): RgbaImage {
  const W = photo.width;
  const w = design.width;
  const h = design.height;
  const out = new Uint8ClampedArray(photo.data);
  // Region of the photo under the design (clipped to the photo).
  const x0 = Math.max(0, at.x);
  const y0 = Math.max(0, at.y);
  const x1 = Math.min(W, at.x + w);
  const y1 = Math.min(photo.height, at.y + h);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return { width: W, height: photo.height, data: out };

  const lum = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const p = ((y0 + y) * W + (x0 + x)) * 4;
      lum[y * rw + x] = (0.299 * photo.data[p] + 0.587 * photo.data[p + 1] + 0.114 * photo.data[p + 2]) / 255;
    }
  }
  const unit = w / 540; // the tuned prototype printed 540 px wide on a 1696 px photo
  const folds = gaussianBlur(lum, rw, rh, 6 * unit);
  const shadeSrc = gaussianBlur(lum, rw, rh, 1.2 * unit);
  const grainBase = gaussianBlur(lum, rw, rh, 2 * unit);

  const gx = new Float32Array(rw * rh);
  const gy = new Float32Array(rw * rh);
  const mag = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      gx[i] = (folds[y * rw + Math.min(rw - 1, x + 1)] - folds[y * rw + Math.max(0, x - 1)]) / 2;
      gy[i] = (folds[Math.min(rh - 1, y + 1) * rw + x] - folds[Math.max(0, y - 1) * rw + x]) / 2;
      mag[i] = Math.hypot(gx[i], gy[i]);
    }
  }
  const p99 = percentile(mag, 99);
  // A flat (fold-free) region has no gradient: no displacement rather than amplifying noise.
  const strength = p99 > 1e-4 ? (22 * unit) / p99 : 0;
  const ref = Math.max(1e-3, percentile(lum, 92));

  const sample = (sx: number, sy: number, c: number): number => {
    const cx = Math.min(w - 1, Math.max(0, sx));
    const cy = Math.min(h - 1, Math.max(0, sy));
    const ix = Math.floor(cx);
    const iy = Math.floor(cy);
    const fx = cx - ix;
    const fy = cy - iy;
    const ix1 = Math.min(w - 1, ix + 1);
    const iy1 = Math.min(h - 1, iy + 1);
    const d = design.data;
    const a = d[(iy * w + ix) * 4 + c];
    const b = d[(iy * w + ix1) * 4 + c];
    const e = d[(iy1 * w + ix) * 4 + c];
    const f = d[(iy1 * w + ix1) * 4 + c];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
  };

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const dx = x0 - at.x + x + gx[i] * strength;
      const dy = y0 - at.y + y + gy[i] * strength;
      const alpha = (sample(dx, dy, 3) / 255) * 0.97;
      if (alpha <= 0) continue;
      const shade = Math.pow(Math.min(1.08, Math.max(0, shadeSrc[i] / ref)), 1.6);
      const grain = (lum[i] - grainBase[i]) * 0.6;
      const p = ((y0 + y) * W + (x0 + x)) * 4;
      for (let c = 0; c < 3; c++) {
        const ink = Math.min(1, Math.max(0, (sample(dx, dy, c) / 255) * shade + grain));
        out[p + c] = Math.round((photo.data[p + c] / 255) * (1 - alpha) * 255 + ink * alpha * 255);
      }
    }
  }
  return { width: W, height: photo.height, data: out };
}

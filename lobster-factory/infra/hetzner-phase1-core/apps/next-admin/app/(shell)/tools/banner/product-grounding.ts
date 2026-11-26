// Card C7: make a cut-out product sit on the banner -- contact shadow, floor reflection, tone match. Pure canvas 2D,
// no dependency, no AI. Every output is a full-canvas layer (banner-layers stacks them: shadow, reflection, product).
// All options off = `product` is exactly ctx.drawImage(product, box) on an empty canvas and nothing else is returned.
// Pixel reads (shadow contour, tone) need an untainted image: a cross-origin product without CORS falls back to the
// box's bottom edge and skips tone, listed in `skipped`.

export type Box = { x: number; y: number; w: number; h: number };

export type GroundingOpts = {
  /** Contact shadow from the product's alpha footprint (not a box shadow). */
  shadow?: { enabled: boolean; /** 0-1, default 0.5 */ opacity?: number; /** 0-1 blur relative to width, default 0.35 */ softness?: number; /** px below the contact line, default 0 */ distance?: number };
  /** Mirror below the contact line, faded out. */
  reflection?: { enabled: boolean; /** 0-1 of product height, default 0.35 */ height?: number; /** 0-1 opacity at the contact line, default 0.3 */ fade?: number; /** px gap, default 0 */ gap?: number };
  /** Light colour balance toward the background around the product; shape and alpha untouched, gains capped ±12%. */
  tone?: { enabled: boolean; /** 0-1, default 0.4 */ strength?: number };
};

export type GroundInput = {
  product: HTMLImageElement | ImageBitmap | HTMLCanvasElement;
  box: Box;
  canvasW: number;
  canvasH: number;
  /** Drawn at 0,0,canvasW,canvasH to sample the colour around the product (tone only). */
  background?: CanvasImageSource;
  opts?: GroundingOpts;
};

export type GroundResult = {
  product: HTMLCanvasElement;
  shadow?: HTMLCanvasElement;
  reflection?: HTMLCanvasElement;
  /** Options that could not run (e.g. "tone: product image is cross-origin"). */
  skipped: string[];
};

const ALPHA_MIN = 8;          // alpha at or below this is "not product" when finding the contact line
const TONE_CAP = 0.12;        // max per-channel gain change
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("canvas 2d unavailable");
  return g;
}

/** Cross-browser blur (Safari has no ctx.filter): shrink then grow twice, smoothing on. radius in px. */
function softBlur(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius < 0.5) return src;
  let cur = src;
  for (let pass = 0; pass < 2; pass++) {
    const f = clamp(1 / (radius / (pass + 1.5)), 0.02, 1);
    const small = makeCanvas(src.width * f, src.height * f);
    const s = ctx2d(small);
    s.imageSmoothingEnabled = true;
    s.imageSmoothingQuality = "high";
    s.drawImage(cur, 0, 0, small.width, small.height);
    const big = makeCanvas(src.width, src.height);
    const b = ctx2d(big);
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = "high";
    b.drawImage(small, 0, 0, big.width, big.height);
    cur = big;
  }
  return cur;
}

/** The product at box size, in its own canvas. */
function productAtBoxSize(product: GroundInput["product"], box: Box): HTMLCanvasElement {
  const c = makeCanvas(box.w, box.h);
  ctx2d(c).drawImage(product, 0, 0, c.width, c.height);
  return c;
}

/** Lowest row (box space) with an opaque pixel, or null when pixels cannot be read. */
function contactRow(local: HTMLCanvasElement): number | null {
  let data: Uint8ClampedArray;
  try { data = ctx2d(local).getImageData(0, 0, local.width, local.height).data; } catch { return null; }
  for (let y = local.height - 1; y >= 0; y--) {
    const row = y * local.width * 4;
    for (let x = 0; x < local.width; x++) if (data[row + x * 4 + 3] > ALPHA_MIN) return y;
  }
  return null;
}

/** Mean RGB (0-255) of opaque pixels; null if none or unreadable. */
function meanRgb(data: Uint8ClampedArray, include: (i: number) => boolean): [number, number, number] | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= ALPHA_MIN || !include(i)) continue;
    const a = data[i + 3] / 255;
    r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a; n += a;
  }
  return n > 0 ? [r / n, g / n, b / n] : null;
}
const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Background around the box: a ring 25% of the box size wide, the box itself left out. */
function backgroundMean(bg: CanvasImageSource, box: Box, W: number, H: number): [number, number, number] | null {
  const pad = Math.max(box.w, box.h) * 0.25;
  const x0 = Math.floor(clamp(box.x - pad, 0, W)), y0 = Math.floor(clamp(box.y - pad, 0, H));
  const x1 = Math.ceil(clamp(box.x + box.w + pad, 0, W)), y1 = Math.ceil(clamp(box.y + box.h + pad, 0, H));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const c = makeCanvas(x1 - x0, y1 - y0);
  const g = ctx2d(c);
  g.drawImage(bg, -x0, -y0, W, H);
  let data: Uint8ClampedArray;
  try { data = g.getImageData(0, 0, c.width, c.height).data; } catch { return null; }
  const w = c.width;
  return meanRgb(data, (i) => {
    const px = (i / 4) % w + x0, py = Math.floor(i / 4 / w) + y0;
    return !(px >= box.x && px < box.x + box.w && py >= box.y && py < box.y + box.h);
  });
}

/** Tone-match `local` in place. false when its pixels or the background's cannot be read. */
function toneMatch(local: HTMLCanvasElement, bg: CanvasImageSource, box: Box, W: number, H: number, strength: number): boolean {
  const bgMean = backgroundMean(bg, box, W, H);
  const g = ctx2d(local);
  let img: ImageData;
  try { img = g.getImageData(0, 0, local.width, local.height); } catch { return false; }
  const prodMean = meanRgb(img.data, () => true);
  if (!bgMean || !prodMean) return false;
  const bgL = Math.max(1, luma(bgMean)), prL = Math.max(1, luma(prodMean));
  const s = clamp(strength, 0, 1) * 0.5;
  // colour cast of the background relative to neutral grey, and the light level, each pulled part way
  const lum = 1 + s * (bgL / prL - 1);
  const gains = bgMean.map((c) => clamp((1 + s * (c / bgL - 1)) * lum, 1 - TONE_CAP, 1 + TONE_CAP));
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = d[i] * gains[0]; d[i + 1] = d[i + 1] * gains[1]; d[i + 2] = d[i + 2] * gains[2];
  }
  g.putImageData(img, 0, 0);
  return true;
}

export function groundProduct(input: GroundInput): GroundResult {
  const { product, box, canvasW: W, canvasH: H, background, opts = {} } = input;
  const skipped: string[] = [];
  const out = makeCanvas(W, H);
  const outCtx = ctx2d(out);
  const wantTone = !!opts.tone?.enabled;
  const wantShadow = !!opts.shadow?.enabled;
  const wantReflection = !!opts.reflection?.enabled;

  if (!wantTone && !wantShadow && !wantReflection) {
    outCtx.drawImage(product, box.x, box.y, box.w, box.h);
    return { product: out, skipped };
  }

  const local = productAtBoxSize(product, box);
  if (wantTone) {
    if (!background) skipped.push("tone: no background given");
    else if (!toneMatch(local, background, box, W, H, opts.tone?.strength ?? 0.4)) skipped.push("tone: pixels unreadable (cross-origin image?)");
  }
  // The toned copy only when tone ran; otherwise the original draw, so untouched pixels stay byte-identical.
  if (wantTone && !skipped.some((s) => s.startsWith("tone"))) outCtx.drawImage(local, box.x, box.y, box.w, box.h);
  else outCtx.drawImage(product, box.x, box.y, box.w, box.h);

  const row = wantShadow || wantReflection ? contactRow(local) : null;
  if ((wantShadow || wantReflection) && row === null) skipped.push("contour: pixels unreadable, using the box bottom");
  const sy = box.h / local.height;
  const contactY = box.y + ((row ?? local.height - 1) + 1) * sy;   // canvas y where the product touches the floor

  let shadow: HTMLCanvasElement | undefined;
  if (wantShadow) {
    const o = opts.shadow!;
    const opacity = clamp(o.opacity ?? 0.5, 0, 1);
    const soft = clamp(o.softness ?? 0.35, 0, 1);
    // silhouette of the bottom band (the footprint), black
    const bandRows = Math.max(1, Math.round(local.height * 0.18));
    const bandTop = Math.max(0, (row ?? local.height - 1) + 1 - bandRows);
    const sil = makeCanvas(local.width, bandRows);
    const sg = ctx2d(sil);
    sg.drawImage(local, 0, bandTop, local.width, bandRows, 0, 0, sil.width, sil.height);
    sg.globalCompositeOperation = "source-in";
    sg.fillStyle = "#000";
    sg.fillRect(0, 0, sil.width, sil.height);

    const layer = makeCanvas(W, H);
    const lg = ctx2d(layer);
    const cy = contactY + (o.distance ?? 0);
    const pad = Math.ceil(box.w * 0.3);
    // two passes: a tight dark core where it touches, a wide soft ambient spread
    for (const pass of [{ squash: 0.05, blur: 0.02 + 0.06 * soft, alpha: 0.9 }, { squash: 0.14, blur: 0.06 + 0.2 * soft, alpha: 0.45 }]) {
      const hh = Math.max(2, box.w * pass.squash);
      const tile = makeCanvas(box.w + pad * 2, hh + pad * 2);
      ctx2d(tile).drawImage(sil, pad, pad, box.w, hh);
      const blurred = softBlur(tile, box.w * pass.blur);
      lg.globalAlpha = opacity * pass.alpha;
      lg.drawImage(blurred, box.x - pad, cy - hh / 2 - pad);
    }
    lg.globalAlpha = 1;
    shadow = layer;
  }

  let reflection: HTMLCanvasElement | undefined;
  if (wantReflection) {
    const o = opts.reflection!;
    const frac = clamp(o.height ?? 0.35, 0, 1);
    const fade = clamp(o.fade ?? 0.3, 0, 1);
    if (frac > 0 && fade > 0) {
      const reflH = box.h * frac;
      const top = contactY + (o.gap ?? 0);
      const tile = makeCanvas(box.w, reflH);
      const tg = ctx2d(tile);
      // mirror around the contact line: the product's lowest rows come first
      const srcSource = wantTone && !skipped.some((s) => s.startsWith("tone")) ? local : null;
      tg.save();
      tg.translate(0, contactY - box.y);
      tg.scale(1, -1);
      if (srcSource) tg.drawImage(srcSource, 0, 0, box.w, box.h);
      else tg.drawImage(product, 0, 0, box.w, box.h);
      tg.restore();
      tg.globalCompositeOperation = "destination-in";
      const grad = tg.createLinearGradient(0, 0, 0, tile.height);
      grad.addColorStop(0, `rgba(0,0,0,${fade})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      tg.fillStyle = grad;
      tg.fillRect(0, 0, tile.width, tile.height);
      const layer = makeCanvas(W, H);
      ctx2d(layer).drawImage(tile, box.x, top, box.w, reflH);
      reflection = layer;
    }
  }

  return { product: out, ...(shadow ? { shadow } : {}), ...(reflection ? { reflection } : {}), skipped };
}

/**
 * Edge-mask blocks — turn a hard rectangular design into an organic-edged transparent PNG.
 *
 * WHY: Studio / Tarot image models always output a rectangle with hard straight edges. For
 * apparel prints that reads as a sticker slapped on the shirt. Compositing the artwork through
 * a brush/grunge mask (`globalCompositeOperation='destination-in'`) turns that into an organic
 * brush edge. The output keeps its alpha channel, so the soft edge prints correctly on coloured
 * garments (the faithful print file re-encodes PNG losslessly; Printful prints transparency as
 * no-ink).
 *
 * TWO mask sources, same destination-in pipeline:
 *  - ASSET styles (`maskUrl`): real vector/scanned brush masks pre-rasterised to white-on-
 *    transparent PNGs under /public/edge-masks/ — the authentic brush feel. Mask COLOUR is
 *    irrelevant to destination-in (only alpha matters); white just makes the chip preview show.
 *  - PROCEDURAL styles (`build`): SVG roundedRect + feTurbulence displacement (the rectangular
 *    dry-brush family). Lightweight, always-available fallbacks.
 *
 * ⚠️ CLIENT-ONLY runtime: `applyEdgeMask` uses document/Image/<canvas>; call in the browser only.
 * The pure data layer (EDGE_MASK_STYLES, buildMaskSvg) touches no DOM and is import-safe.
 */

export type EdgeMaskId =
  | "mask-01"
  | "mask-02"
  | "mask-03"
  | "mask-04"
  | "mask-05"
  | "mask-06"
  | "mask-07"
  | "mask-08"
  | "mask-09"
  | "mask-10"
  | "mask-11"
  | "mask-12"
  | "mask-13"
  | "mask-14"
  | "mask-15"
  | "mask-16"
  | "dry-brush"
  | "soft-brush"
  | "flat-brush"
  | "comb-brush"
  | "calligraphy-brush"
  | "chalk-brush"
  | "stipple-brush"
  | "scratch-brush";

export interface EdgeMaskParams {
  /** 0–100. Higher = (procedural) edge eats further in + rougher displacement. */
  amount: number;
  /** Variation seed (procedural styles). Integer ≥ 1. */
  seed: number;
  /**
   * Opacity override for asset (pre-rasterised PNG) masks only. 0–1.
   * Omit (or pass undefined) to keep the mask at full opacity — backward-compatible default.
   * Procedural SVG masks use `amount` for shape control; this field has no effect on them.
   */
  assetOpacity?: number;
}

export interface EdgeMaskStyle {
  id: EdgeMaskId;
  /** zh label (UI). */
  label: string;
  /** English label (tooltip / aria). */
  labelEn: string;
  kind: "texture" | "asset";
  /** Procedural styles only — returns the INNER svg markup (white shape on transparent). */
  build?: (w: number, h: number, p: EdgeMaskParams) => string;
  /** Asset styles only — same-origin white-on-transparent PNG alpha mask. */
  maskUrl?: string;
}

export const DEFAULT_EDGE_PARAMS: EdgeMaskParams = { amount: 55, seed: 7 };

/* ─────────────────────────── pure geometry helpers ─────────────────────────── */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** amount(0–100) → fractional inset (margin) from the box edge: 5%…18%. */
const insetFrom = (amount: number): number => 0.05 + (clamp(amount, 0, 100) / 100) * 0.13;

const f1 = (n: number): string => n.toFixed(1);

/** Rounded-rect path inset into the box (base shape for the procedural dry-brush family). */
function roundedRect(w: number, h: number, inset: number): string {
  const m = Math.min(w, h) * inset;
  const r = Math.min(w, h) * 0.06;
  const x0 = m;
  const y0 = m;
  const x1 = w - m;
  const y1 = h - m;
  return (
    `M${f1(x0 + r)} ${f1(y0)} L${f1(x1 - r)} ${f1(y0)} Q${f1(x1)} ${f1(y0)} ${f1(x1)} ${f1(y0 + r)} ` +
    `L${f1(x1)} ${f1(y1 - r)} Q${f1(x1)} ${f1(y1)} ${f1(x1 - r)} ${f1(y1)} ` +
    `L${f1(x0 + r)} ${f1(y1)} Q${f1(x0)} ${f1(y1)} ${f1(x0)} ${f1(y1 - r)} ` +
    `L${f1(x0)} ${f1(y0 + r)} Q${f1(x0)} ${f1(y0)} ${f1(x0 + r)} ${f1(y0)} Z`
  );
}

/** A feTurbulence + feDisplacementMap filter that roughens a shape's edge (dry-brush). */
function turbFilter(
  uid: string,
  baseFrequency: string,
  numOctaves: number,
  scale: number,
  seed: number,
  blur: number,
  threshold: boolean,
): string {
  const gb = blur > 0 ? `<feGaussianBlur stdDeviation="${f1(blur)}"/>` : "";
  const ct = threshold
    ? `<feComponentTransfer><feFuncA type="discrete" tableValues="0 0 1 1"/></feComponentTransfer>`
    : "";
  return (
    `<filter id="${uid}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="${numOctaves}" seed="${seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${f1(scale)}" xChannelSelector="R" yChannelSelector="G"/>` +
    gb +
    ct +
    `</filter>`
  );
}

/** Brush-family edge filter — generalised turbulence displacement with optional blur / alpha steps. */
function brushFilter(
  uid: string,
  baseFrequency: string,
  numOctaves: number,
  scale: number,
  seed: number,
  opts: { turbType?: "fractalNoise" | "turbulence"; blur?: number; alphaTable?: string } = {},
): string {
  const turbType = opts.turbType ?? "fractalNoise";
  const gb = opts.blur && opts.blur > 0 ? `<feGaussianBlur stdDeviation="${f1(opts.blur)}"/>` : "";
  const ct = opts.alphaTable
    ? `<feComponentTransfer><feFuncA type="discrete" tableValues="${opts.alphaTable}"/></feComponentTransfer>`
    : "";
  return (
    `<filter id="${uid}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="${turbType}" baseFrequency="${baseFrequency}" numOctaves="${numOctaves}" seed="${seed}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${f1(scale)}" xChannelSelector="R" yChannelSelector="G"/>` +
    gb +
    ct +
    `</filter>`
  );
}

/* ─────────────────────────── style registry (積木) ─────────────────────────── */

export const EDGE_MASK_STYLES: readonly EdgeMaskStyle[] = [
  // 16 real brush masks (pre-rasterised vector brushes → white-on-transparent PNG alpha masks).
  ...Array.from({ length: 16 }, (_, i) => {
    const n = i + 1;
    const id = `mask-${String(n).padStart(2, "0")}` as EdgeMaskId;
    return {
      id,
      label: `筆刷 ${n}`,
      labelEn: `Brush ${n}`,
      kind: "asset" as const,
      maskUrl: `/edge-masks/${id}.png`,
    };
  }),
  // Procedural rectangular dry-brush family (lightweight fallbacks).
  {
    id: "dry-brush",
    label: "乾毛筆筆刷",
    labelEn: "Dry Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-brush-${p.seed}`;
      const path = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      const scale = Math.min(w, h) * (0.04 + p.amount / 1400);
      const filter = turbFilter(uid, "0.006 0.12", 2, scale, p.seed % 90, 0, true);
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/></g>`;
    },
  },
  {
    id: "soft-brush",
    label: "柔筆刷",
    labelEn: "Soft Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-soft-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      const filter = brushFilter(uid, "0.01 0.02", 2, md * (0.04 + p.amount / 1300), p.seed % 90, { blur: md * 0.012 });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "flat-brush",
    label: "平頭刷",
    labelEn: "Flat Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-flat-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      // anisotropic displacement → broad flat-brush drag streaks
      const filter = brushFilter(uid, "0.004 0.09", 2, md * (0.05 + p.amount / 1100), p.seed % 90, { alphaTable: "0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "comb-brush",
    label: "排刷",
    labelEn: "Comb Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-comb-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.02);
      const filter = brushFilter(uid, "0.003 0.26", 2, md * 0.05, p.seed % 90, { alphaTable: "0 0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "calligraphy-brush",
    label: "書法毛筆",
    labelEn: "Calligraphy Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-calli-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.05);
      const filter = brushFilter(uid, "0.006 0.05", 2, md * (0.06 + p.amount / 1000), p.seed % 90, { alphaTable: "0 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "chalk-brush",
    label: "粉筆",
    labelEn: "Chalk",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-chalk-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      const filter = brushFilter(uid, "0.05 0.05", 3, md * 0.04, p.seed % 90, { turbType: "turbulence", alphaTable: "0 0 0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "stipple-brush",
    label: "點刷",
    labelEn: "Stipple",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-stipple-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      const filter = brushFilter(uid, "0.09 0.09", 2, md * 0.03, p.seed % 90, { turbType: "turbulence", alphaTable: "0 0 0 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "scratch-brush",
    label: "刮刷",
    labelEn: "Scratch Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-scratch-${p.seed}`;
      const md = Math.min(w, h);
      const shape = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      const filter = brushFilter(uid, "0.004 0.2", 2, md * (0.06 + p.amount / 1000), p.seed % 90, { alphaTable: "0 1 0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
];

export function getEdgeMaskStyle(id: EdgeMaskId): EdgeMaskStyle | undefined {
  return EDGE_MASK_STYLES.find((s) => s.id === id);
}

/** Assemble a complete SVG mask string for a PROCEDURAL style (white shape on transparent) at w×h.
 *  Returns "" for asset styles (those use `maskUrl` directly). */
export function buildMaskSvg(id: EdgeMaskId, w: number, h: number, params: EdgeMaskParams): string {
  const style = getEdgeMaskStyle(id);
  if (!style || !style.build) return "";
  const p: EdgeMaskParams = {
    amount: clamp(Math.round(params?.amount ?? DEFAULT_EDGE_PARAMS.amount), 0, 100),
    seed: Math.max(1, Math.floor(params?.seed ?? DEFAULT_EDGE_PARAMS.seed)),
  };
  const inner = style.build(w, h, p);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${inner}</svg>`
  );
}

export type EdgeMaskResult = { ok: true; image: string } | { ok: false; error: string };

/* ─────────────────────────── browser-only compositing ─────────────────────────── */

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

/** Guard against pathological canvases (model output is ≪ this; R2 art could be larger). */
const MAX_EDGE_LONG_EDGE = 4096;

/**
 * Apply an edge mask to a source image → transparent PNG data URL.
 * Browser-only (uses <canvas>). `sourceUrl` may be a data URL (no taint) or a CORS-enabled /
 * same-origin remote URL (the gallery routes R2 art through a same-origin proxy). The mask is a
 * same-origin asset PNG (`maskUrl`) or a procedural SVG data URL — neither taints the canvas.
 */
export async function applyEdgeMask(
  sourceUrl: string,
  id: EdgeMaskId,
  params: EdgeMaskParams,
): Promise<EdgeMaskResult> {
  const style = getEdgeMaskStyle(id);
  if (!style) return { ok: false, error: "unknown_style" };
  if (typeof document === "undefined") return { ok: false, error: "not_in_browser" };
  try {
    const src = await loadImage(sourceUrl, true);
    const natW = src.naturalWidth || src.width;
    const natH = src.naturalHeight || src.height;
    if (!natW || !natH) return { ok: false, error: "image_dimensions_unknown" };

    const longest = Math.max(natW, natH);
    const scale = longest > MAX_EDGE_LONG_EDGE ? MAX_EDGE_LONG_EDGE / longest : 1;
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "no_canvas_context" };

    ctx.drawImage(src, 0, 0, w, h);

    // Asset styles use their pre-rasterised PNG mask; procedural styles build an SVG mask.
    const maskSrc = style.maskUrl
      ? style.maskUrl
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMaskSvg(id, w, h, params))}`;
    const mask = await loadImage(maskSrc, false);

    // Asset brushes: opt-in opacity via assetOpacity param (0–1). Defaults to 1 (backward-compatible).
    if (style.maskUrl && params.assetOpacity != null) ctx.globalAlpha = params.assetOpacity;
    ctx.globalCompositeOperation = "destination-in"; // keep source only where mask is opaque
    ctx.drawImage(mask, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    try {
      return { ok: true, image: canvas.toDataURL("image/png") };
    } catch {
      return { ok: false, error: "canvas_tainted" };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "edge_mask_failed" };
  }
}

// ✂️ 邊緣遮罩 SSOT — turn a hard rectangular design into an organic-edged transparent PNG. One plain ES module (like color-grade.js),
// used by /tools/canvas, Studio and My Designs (typed door lib/studio/edge-mask.ts) and the editor-shared dock blocks.
// drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts
//
// WHY: Studio / Tarot image models always output a rectangle with hard straight edges. For apparel prints that reads as a sticker
// slapped on the shirt. Compositing the artwork through a brush/grunge mask (`globalCompositeOperation='destination-in'`) turns that
// into an organic brush edge. The output keeps its alpha channel, so the soft edge prints correctly on coloured garments.
//
// TWO mask sources, same destination-in pipeline:
//  - ASSET styles (`maskUrl`): real brush masks pre-rasterised to white-on-transparent PNGs under /public/edge-masks/. Mask COLOUR is
//    irrelevant to destination-in (only alpha matters); the white fill below is mask data, not UI colour.
//  - PROCEDURAL styles (`build`): SVG roundedRect + feTurbulence displacement (the rectangular dry-brush family).
// ⚠️ CLIENT-ONLY runtime: `applyEdgeMask` uses document/Image/<canvas>. The data layer (EDGE_MASK_STYLES, buildMaskSvg) touches no DOM.

export const DEFAULT_EDGE_PARAMS = { amount: 55, seed: 7 };

/* ─────────────────────────── pure geometry helpers ─────────────────────────── */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** amount(0–100) → fractional inset (margin) from the box edge: 5%…18%. */
const insetFrom = (amount) => 0.05 + (clamp(amount, 0, 100) / 100) * 0.13;

const f1 = (n) => n.toFixed(1);

/** Rounded-rect path inset into the box (base shape for the procedural dry-brush family). */
function roundedRect(w, h, inset) {
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
function turbFilter(uid, baseFrequency, numOctaves, scale, seed, blur, threshold) {
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
function brushFilter(uid, baseFrequency, numOctaves, scale, seed, opts = {}) {
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

/** Mask fill: white shape on transparent (only its alpha matters to destination-in). */
const MASK_FILL = "#fff";

/* ─────────────────────────── style registry (積木) ─────────────────────────── */

export const EDGE_MASK_STYLES = [
  // 16 real brush masks (pre-rasterised vector brushes → white-on-transparent PNG alpha masks).
  ...Array.from({ length: 16 }, (_, i) => {
    const n = i + 1;
    const id = `mask-${String(n).padStart(2, "0")}`;
    return {
      id,
      label: `筆刷 ${n}`,
      labelEn: `Brush ${n}`,
      kind: "asset",
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${path}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
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
      return `${filter}<g filter="url(#${uid})" fill="${MASK_FILL}"><path d="${shape}"/></g>`;
    },
  },
];

export function getEdgeMaskStyle(id) {
  return EDGE_MASK_STYLES.find((s) => s.id === id);
}

/** Assemble a complete SVG mask string for a PROCEDURAL style (white shape on transparent) at w×h.
 *  Returns "" for asset styles (those use `maskUrl` directly). */
export function buildMaskSvg(id, w, h, params) {
  const style = getEdgeMaskStyle(id);
  if (!style || !style.build) return "";
  const p = {
    amount: clamp(Math.round(params?.amount ?? DEFAULT_EDGE_PARAMS.amount), 0, 100),
    seed: Math.max(1, Math.floor(params?.seed ?? DEFAULT_EDGE_PARAMS.seed)),
  };
  const inner = style.build(w, h, p);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${inner}</svg>`
  );
}

/* ─────────────────────────── browser-only compositing ─────────────────────────── */

function loadImage(src, cors) {
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
 * Apply an edge mask to a source image → { ok:true, image: transparent PNG data URL } | { ok:false, error }.
 * Browser-only (uses <canvas>). `sourceUrl` may be a data URL (no taint) or a CORS-enabled / same-origin remote URL (the gallery routes
 * R2 art through a same-origin proxy). The mask is a same-origin asset PNG (`maskUrl`) or a procedural SVG data URL — neither taints.
 */
export async function applyEdgeMask(sourceUrl, id, params) {
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

    ctx.globalCompositeOperation = "destination-in"; // keep source only where mask is opaque
    if (style.maskUrl) {
      // amount=10 → scale 0.97 (barely touches edge, ~1.5% each side); amount=90 → scale 0.75 (~12.5% each side).
      // Scale is always ≤ 1.0 so the mask never overflows the canvas and brush strokes stay complete
      // (a scale > 1 clipped the brush PNG edges at the canvas boundary → incomplete stroke shapes).
      const scale = 1.0 - (params.amount / 100) * 0.28;
      const mx = (w * (1 - scale)) / 2;
      const my = (h * (1 - scale)) / 2;
      ctx.drawImage(mask, mx, my, w * scale, h * scale);
    } else {
      ctx.drawImage(mask, 0, 0, w, h);
    }
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

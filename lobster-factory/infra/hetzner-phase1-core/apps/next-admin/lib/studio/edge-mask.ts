/**
 * Edge-mask blocks — turn a hard rectangular design into an organic-edged transparent PNG.
 *
 * WHY: Studio / Tarot image models always output a rectangle with hard straight edges.
 * For apparel prints that reads as a sticker slapped on the shirt. An alpha "brush mask"
 * (compositing the artwork through a shape via `globalCompositeOperation='destination-in'`)
 * turns that into a watercolour / torn / brush / splash edge. The output keeps its alpha
 * channel, so the soft edge prints correctly on coloured garments (the faithful print file
 * — print-file.ts — re-encodes PNG losslessly and Printful prints transparency as no-ink).
 *
 * ARCHITECTURE (積木 registry, same ethos as color-grade.ts / the vector-editor blocks):
 * every style is one entry in EDGE_MASK_STYLES with a pure `build(w,h,params) → svg-inner`
 * generator. Adding a style = append one entry. No other file changes. Smooth shapes are
 * procedural bézier blobs; textured shapes (ink / splash / smoke / dry-brush) use an SVG
 * feTurbulence displacement filter — all code, zero raster assets, offline, free.
 *
 * ⚠️ CLIENT-ONLY runtime: `applyEdgeMask` uses `document`/`Image`/`<canvas>`. It must only
 * be CALLED in the browser. The pure data layer (EDGE_MASK_STYLES, buildMaskSvg) touches no
 * DOM and is import-safe from server components / tests. Keep all DOM access inside functions.
 */

export type EdgeMaskId =
  | "organic-blob"
  | "amoeba"
  | "ink-splash"
  | "paint-splash"
  | "water-splash"
  | "smoke-edge"
  | "cloud-edge"
  | "liquid-shape"
  | "melted-edge"
  | "lava-shape"
  | "dry-brush"
  | "soft-brush"
  | "rough-brush"
  | "flat-brush"
  | "comb-brush"
  | "calligraphy-brush"
  | "chalk-brush"
  | "charcoal-brush"
  | "stipple-brush"
  | "scratch-brush"
  | "wet-brush";

export interface EdgeMaskParams {
  /** 0–100. Higher = edge eats further in + (textured styles) rougher displacement. */
  amount: number;
  /** Variation seed so the same style does not look identical every time. Integer ≥ 1. */
  seed: number;
}

export interface EdgeMaskStyle {
  id: EdgeMaskId;
  /** zh label (UI). */
  label: string;
  /** English label (bilingual — shown as tooltip / aria). */
  labelEn: string;
  kind: "shape" | "texture";
  /** Pure generator: returns the INNER svg markup (white shape on transparent) for a w×h box. */
  build: (w: number, h: number, p: EdgeMaskParams) => string;
}

export const DEFAULT_EDGE_PARAMS: EdgeMaskParams = { amount: 55, seed: 7 };

/* ─────────────────────────── pure geometry helpers ─────────────────────────── */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Deterministic PRNG (mulberry32) — same seed → same mask (reproducible + variable). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** amount(0–100) → fractional inset (margin) from the box edge: 5%…18%. */
const insetFrom = (amount: number): number => 0.05 + (clamp(amount, 0, 100) / 100) * 0.13;

const f1 = (n: number): string => n.toFixed(1);

/** Points around an ellipse with per-vertex radius wobble — the raw blob skeleton. */
function blobPoints(
  w: number,
  h: number,
  lobes: number,
  irregularity: number,
  inset: number,
  rnd: () => number,
): Array<[number, number]> {
  const cx = w / 2;
  const cy = h / 2;
  const rx = (w / 2) * (1 - inset);
  const ry = (h / 2) * (1 - inset);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const k = 1 - irregularity * rnd();
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/** Closed Catmull-Rom → cubic-bézier path through the points (smooth organic outline). */
function closedSmoothPath(pts: Array<[number, number]>): string {
  const n = pts.length;
  if (n < 3) return "";
  const d: string[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (i === 0) d.push(`M${f1(p1[0])} ${f1(p1[1])}`);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`);
  }
  d.push("Z");
  return d.join(" ");
}

/** Scattered droplets near the perimeter (ink / splash satellites). Filtered with the body. */
function droplets(w: number, h: number, n: number, rnd: () => number): string {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2;
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const dist = R * (0.74 + rnd() * 0.5);
    const r = R * (0.025 + rnd() * 0.075);
    s += `<circle cx="${f1(cx + Math.cos(a) * dist)}" cy="${f1(cy + Math.sin(a) * dist)}" r="${f1(r)}"/>`;
  }
  return s;
}

/** A feTurbulence + feDisplacementMap filter that roughens a shape's edge. */
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
  // discrete alpha steps → broken, streaky edge (dry brush).
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

/** Rounded-rect path inset into the box (base shape for dry-brush / smoke rectangles). */
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

/* ─────────────────────────── style registry (積木) ─────────────────────────── */

export const EDGE_MASK_STYLES: readonly EdgeMaskStyle[] = [
  {
    id: "organic-blob",
    label: "有機水滴",
    labelEn: "Organic Blob",
    kind: "shape",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 131 + 7);
      const path = closedSmoothPath(blobPoints(w, h, 8, 0.17, insetFrom(p.amount), rnd));
      return `<g fill="#fff"><path d="${path}"/></g>`;
    },
  },
  {
    id: "amoeba",
    label: "變形蟲輪廓",
    labelEn: "Amoeba Shape",
    kind: "shape",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 197 + 11);
      const path = closedSmoothPath(blobPoints(w, h, 7, 0.46, insetFrom(p.amount), rnd));
      return `<g fill="#fff"><path d="${path}"/></g>`;
    },
  },
  {
    id: "ink-splash",
    label: "墨漬",
    labelEn: "Ink Splash",
    kind: "texture",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 211 + 1);
      const uid = `em-ink-${p.seed}`;
      const path = closedSmoothPath(blobPoints(w, h, 9, 0.22, insetFrom(p.amount) + 0.04, rnd));
      const scale = Math.min(w, h) * (0.05 + p.amount / 1100);
      const filter = turbFilter(uid, "0.012 0.012", 3, scale, p.seed % 90, 0, false);
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/>${droplets(w, h, 7, rnd)}</g>`;
    },
  },
  {
    id: "paint-splash",
    label: "油漆飛濺",
    labelEn: "Paint Splash",
    kind: "texture",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 233 + 17);
      const uid = `em-paint-${p.seed}`;
      const path = closedSmoothPath(blobPoints(w, h, 8, 0.3, insetFrom(p.amount) + 0.05, rnd));
      const scale = Math.min(w, h) * (0.07 + p.amount / 900);
      const filter = turbFilter(uid, "0.009 0.014", 3, scale, p.seed % 90, 0, false);
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/>${droplets(w, h, 10, rnd)}</g>`;
    },
  },
  {
    id: "water-splash",
    label: "水花",
    labelEn: "Water Splash",
    kind: "texture",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 251 + 5);
      const uid = `em-water-${p.seed}`;
      const path = closedSmoothPath(blobPoints(w, h, 10, 0.18, insetFrom(p.amount) + 0.03, rnd));
      const scale = Math.min(w, h) * 0.045;
      const filter = turbFilter(uid, "0.014 0.014", 2, scale, p.seed % 90, Math.min(w, h) * 0.004, false);
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/>${droplets(w, h, 13, rnd)}</g>`;
    },
  },
  {
    id: "smoke-edge",
    label: "煙霧",
    labelEn: "Smoke Edge",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-smoke-${p.seed}`;
      const inset = insetFrom(p.amount) + 0.06;
      const cx = w / 2;
      const cy = h / 2;
      const rx = (w / 2) * (1 - inset);
      const ry = (h / 2) * (1 - inset);
      const scale = Math.min(w, h) * 0.06;
      const filter = turbFilter(uid, "0.006 0.01", 4, scale, p.seed % 90, Math.min(w, h) * 0.02, false);
      return `${filter}<g filter="url(#${uid})" fill="#fff"><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}"/></g>`;
    },
  },
  {
    id: "cloud-edge",
    label: "雲朵",
    labelEn: "Cloud Edge",
    kind: "shape",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 53 + 9);
      const inset = insetFrom(p.amount);
      const cx = w / 2;
      const cy = h / 2;
      const rx = (w / 2) * (1 - inset);
      const ry = (h / 2) * (1 - inset);
      const n = 11;
      let puffs = "";
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const pr = Math.min(rx, ry) * (0.3 + rnd() * 0.12);
        puffs += `<circle cx="${f1(cx + Math.cos(a) * rx * 0.72)}" cy="${f1(cy + Math.sin(a) * ry * 0.72)}" r="${f1(pr)}"/>`;
      }
      return `<g fill="#fff"><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx * 0.74)}" ry="${f1(ry * 0.74)}"/>${puffs}</g>`;
    },
  },
  {
    id: "liquid-shape",
    label: "液體輪廓",
    labelEn: "Liquid Shape",
    kind: "shape",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 167 + 23);
      const path = closedSmoothPath(blobPoints(w, h, 6, 0.2, insetFrom(p.amount), rnd));
      return `<g fill="#fff"><path d="${path}"/></g>`;
    },
  },
  {
    id: "melted-edge",
    label: "融化邊",
    labelEn: "Melted Edge",
    kind: "shape",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 71 + 3);
      const m = Math.min(w, h) * insetFrom(p.amount);
      const bodyBot = h * 0.55;
      const drips = 7;
      const seg = (w - 2 * m) / drips;
      let d = `M${f1(m)} ${f1(m)} L${f1(w - m)} ${f1(m)} L${f1(w - m)} ${f1(bodyBot)} `;
      for (let i = 0; i < drips; i++) {
        const x1 = w - m - i * seg;
        const x2 = x1 - seg;
        const ctrl = (x1 + x2) / 2;
        const depth = bodyBot + (h - bodyBot) * (0.3 + rnd() * 0.62);
        d += `Q${f1(ctrl)} ${f1(depth)} ${f1(x2)} ${f1(bodyBot)} `;
      }
      d += "Z";
      return `<g fill="#fff"><path d="${d}"/></g>`;
    },
  },
  {
    id: "lava-shape",
    label: "熔岩輪廓",
    labelEn: "Lava Shape",
    kind: "shape",
    build: (w, h, p) => {
      const rnd = mulberry32(p.seed * 89 + 5);
      const inset = insetFrom(p.amount);
      const path = closedSmoothPath(blobPoints(w, h, 9, 0.29, inset, rnd));
      const ry = (h / 2) * (1 - inset);
      let drips = "";
      for (let i = 0; i < 3; i++) {
        const x = w * (0.28 + rnd() * 0.44);
        const top = h / 2 + ry * 0.55;
        const dr = Math.min(w, h) * (0.05 + rnd() * 0.05);
        const cy = Math.min(h, top + dr * 2 * rnd()); // keep drip inside the box (critic 2026-06-20)
        drips += `<circle cx="${f1(x)}" cy="${f1(cy)}" r="${f1(dr)}"/>`;
      }
      return `<g fill="#fff"><path d="${path}"/>${drips}</g>`;
    },
  },
  {
    id: "dry-brush",
    label: "乾毛筆筆刷",
    labelEn: "Dry Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-brush-${p.seed}`;
      const path = roundedRect(w, h, insetFrom(p.amount) + 0.03);
      const scale = Math.min(w, h) * (0.04 + p.amount / 1400);
      // anisotropic high-frequency turbulence + alpha threshold → streaky dry-brush edge.
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
    id: "rough-brush",
    label: "粗筆刷",
    labelEn: "Rough Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-rough-${p.seed}`;
      const md = Math.min(w, h);
      const rnd = mulberry32(p.seed * 311 + 7);
      const path = closedSmoothPath(blobPoints(w, h, 8, 0.2, insetFrom(p.amount) + 0.04, rnd));
      const filter = brushFilter(uid, "0.008 0.018", 3, md * (0.07 + p.amount / 800), p.seed % 90, {});
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/></g>`;
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
      // very fine parallel streaks → comb / bristle separation
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
      // crisp ink threshold → sharp brushed-ink edge
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
      // high-frequency turbulence + broken alpha steps → grainy chalk edge
      const filter = brushFilter(uid, "0.05 0.05", 3, md * 0.04, p.seed % 90, { turbType: "turbulence", alphaTable: "0 0 0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "charcoal-brush",
    label: "炭筆",
    labelEn: "Charcoal",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-charcoal-${p.seed}`;
      const md = Math.min(w, h);
      const rnd = mulberry32(p.seed * 373 + 13);
      const path = closedSmoothPath(blobPoints(w, h, 7, 0.18, insetFrom(p.amount) + 0.04, rnd));
      // displacement + slight blur + alpha steps → smudgy charcoal
      const filter = brushFilter(uid, "0.02 0.02", 3, md * 0.05, p.seed % 90, { blur: md * 0.005, alphaTable: "0 0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/></g>`;
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
      // very high-frequency turbulence + hard alpha cut → speckled sponge/stipple edge
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
      // strong anisotropic streaks + gappy alpha → scraped / scratched edge
      const filter = brushFilter(uid, "0.004 0.2", 2, md * (0.06 + p.amount / 1000), p.seed % 90, { alphaTable: "0 1 0 1 1" });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${shape}"/></g>`;
    },
  },
  {
    id: "wet-brush",
    label: "濕筆",
    labelEn: "Wet Brush",
    kind: "texture",
    build: (w, h, p) => {
      const uid = `em-wet-${p.seed}`;
      const md = Math.min(w, h);
      const rnd = mulberry32(p.seed * 431 + 19);
      const path = closedSmoothPath(blobPoints(w, h, 10, 0.16, insetFrom(p.amount) + 0.02, rnd));
      // soft displacement + blur → wet, flowing brush bleed
      const filter = brushFilter(uid, "0.012 0.012", 2, md * (0.05 + p.amount / 1100), p.seed % 90, { blur: md * 0.01 });
      return `${filter}<g filter="url(#${uid})" fill="#fff"><path d="${path}"/></g>`;
    },
  },
] as const;

export function getEdgeMaskStyle(id: EdgeMaskId): EdgeMaskStyle | undefined {
  return EDGE_MASK_STYLES.find((s) => s.id === id);
}

/** Assemble a complete, standalone SVG mask string (white shape on transparent) at w×h. */
export function buildMaskSvg(id: EdgeMaskId, w: number, h: number, params: EdgeMaskParams): string {
  const style = getEdgeMaskStyle(id);
  if (!style) return "";
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
 * Browser-only (uses <canvas>). `sourceUrl` may be a data URL (no taint) or a CORS-enabled
 * remote URL (R2 designs bucket must send Access-Control-Allow-Origin, else toDataURL throws
 * SecurityError → returns { ok:false, error:"canvas_tainted" }).
 */
export async function applyEdgeMask(
  sourceUrl: string,
  id: EdgeMaskId,
  params: EdgeMaskParams,
): Promise<EdgeMaskResult> {
  if (!getEdgeMaskStyle(id)) return { ok: false, error: "unknown_style" };
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

    const svg = buildMaskSvg(id, w, h, params);
    const mask = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, false);

    ctx.globalCompositeOperation = "destination-in"; // keep source only where mask is opaque
    ctx.drawImage(mask, 0, 0, w, h);
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

// Card C12: AI 一鍵設計整張 colours. The page measures the background (free, in the browser) and sends it with the usable
// palette; the AI only assigns colour roles; resolveDesignColors() keeps the brand palette, never touches an uploaded /
// AI background, and enforces WCAG contrast (headline 3:1; subtext / small text / CTA text 4.5:1) on the background under
// the text boxes the layout engine drew (R2-C). Pure (node-testable).

export type BgMode = "color" | "gradient" | "upload" | "ai";
export type TextPos = "top" | "center" | "bottom";
export type TextAlignH = "left" | "center" | "right";

/** Relative luminance (WCAG 2.x, 0..1) of #rrggbb. */
export function relLum(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const lin = (v: string) => { const c = parseInt(v, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
}
const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** WCAG contrast ratio of two colours (1..21). */
export const contrastRatio = (a: string, b: string): number => ratioOf(relLum(a), relLum(b));

/** What is behind the text: a luminance range (lo..hi, relative luminance, checked as greys) and, when known, the actual
 *  colours there (a flat colour, gradient samples, a picture's measured main colours). The text must stand out on all. */
export interface Zone { lo: number; hi: number; colors?: string[] }

// ── sRGB channels 0..1: the canvas blends translucent paint per channel in sRGB, so contrast is taken after that mix ──
type Rgb = [number, number, number];
const dec = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const enc = (l: number) => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
const rgbOf = (hex: string): Rgb => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
};
const hexOf = (c: Rgb) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const lumRgb = (c: Rgb) => 0.2126 * dec(c[0]) + 0.7152 * dec(c[1]) + 0.0722 * dec(c[2]);
const greyOf = (l: number): Rgb => { const v = enc(Math.max(0, Math.min(1, l))); return [v, v, v]; };
const mix = (top: Rgb, under: Rgb, a: number): Rgb => [0, 1, 2].map((i) => a * top[i] + (1 - a) * under[i]) as Rgb;
/** A picture background drawn small at one size: relative luminance per cell, row by row (w x h cells over the canvas). */
export interface LumGrid { w: number; h: number; lum: ArrayLike<number> }
/** What the page measured of the background, before any AI call. zones = per text position / alignment (the prompt's
 *  rough description; the guard measures under the real text boxes in `grids`). */
export interface BgInfo {
  mode: BgMode;
  colors: string[];          // 4-6 main colours
  meanLum: number;           // 0..1
  zones: Record<TextPos, Record<TextAlignH, Zone & { busy: number }>>;
  /** A picture only: one grid per size measured, in the order measured (measureBackground: the sizes given, in order). */
  grids?: LumGrid[];
}

const POS: readonly TextPos[] = ["top", "center", "bottom"];
const ALIGN: readonly TextAlignH[] = ["left", "center", "right"];
/** The band the text stack roughly sits in, as shares of the canvas: only for describing the background to the AI before
 *  there is a layout (the guard measures the real boxes). */
const BAND_Y: Record<TextPos, [number, number]> = { top: [0, 0.45], center: [0.28, 0.72], bottom: [0.55, 1] };
const BAND_X: Record<TextAlignH, [number, number]> = { left: [0, 0.62], center: [0.15, 0.85], right: [0.38, 1] };

/** Background stats from RGBA pixels (a downscaled draw of the background as the canvas shows it). busy = luminance spread. */
export function bgStatsFromPixels(data: ArrayLike<number>, w: number, h: number, colors: string[], mode: BgMode): BgInfo {
  const lum = new Float64Array(w * h);
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.2126 * lin(data[i * 4]) + 0.7152 * lin(data[i * 4 + 1]) + 0.0722 * lin(data[i * 4 + 2]); sum += lum[i];
  }
  const grid: LumGrid = { w, h, lum };
  const zone = (pos: TextPos, al: TextAlignH) => {
    const [y0, y1] = BAND_Y[pos], [x0, x1] = BAND_X[al];
    return gridStats(grid, [{ x: x0 * w, y: y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h }]);
  };
  const zones = Object.fromEntries(POS.map((p) => [p, Object.fromEntries(ALIGN.map((a) => [a, zone(p, a)]))])) as BgInfo["zones"];
  return { mode, colors, meanLum: sum / (w * h), zones, grids: [grid] };
}

/** A box in canvas pixels (the layout engine's ElemBox). */
export interface PxBox { x: number; y: number; w: number; h: number }
/** Luminance range / busyness of the grid cells under `boxes` (grid-cell units; each box covers at least one cell). */
function gridStats(g: LumGrid, boxes: readonly PxBox[]): { lo: number; hi: number; busy: number } {
  const vals: number[] = [];
  const seen = new Set<number>();
  let s = 0, s2 = 0;
  for (const b of boxes) {
    const x0 = Math.max(0, Math.min(g.w - 1, Math.floor(b.x))), y0 = Math.max(0, Math.min(g.h - 1, Math.floor(b.y)));
    const x1 = Math.max(x0 + 1, Math.min(g.w, Math.ceil(b.x + b.w))), y1 = Math.max(y0 + 1, Math.min(g.h, Math.ceil(b.y + b.h)));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * g.w + x;
      if (seen.has(i)) continue;
      seen.add(i);
      const v = g.lum[i]; vals.push(v); s += v; s2 += v * v;
    }
  }
  const n = vals.length, mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  // range = 2nd..98th percentile: a small bright / dark patch counts (mean +- sd hid it), a few stray pixels do not
  vals.sort((a, b) => a - b);
  const pct = (q: number) => vals[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
  return { lo: pct(0.02), hi: pct(0.98), busy: sd };
}
/** The background under the text boxes drawn at one size (canvas `w` x `h` pixels), from that size's grid. */
export function zoneUnder(g: LumGrid, boxes: readonly PxBox[], w: number, h: number): Zone {
  const sx = g.w / w, sy = g.h / h;
  const { lo, hi } = gridStats(g, boxes.map((b) => ({ x: b.x * sx, y: b.y * sy, w: b.w * sx, h: b.h * sy })));
  return { lo, hi };
}

/** One picture measured at several sizes (each crops it differently): every zone spans what any size has there. */
export function mergeBgInfo(infos: readonly BgInfo[]): BgInfo {
  const [first, ...rest] = infos;
  if (!rest.length) return first;
  const zones = Object.fromEntries(POS.map((p) => [p, Object.fromEntries(ALIGN.map((a) => {
    const zs = infos.map((i) => i.zones[p][a]);
    return [a, { lo: Math.min(...zs.map((z) => z.lo)), hi: Math.max(...zs.map((z) => z.hi)), busy: Math.max(...zs.map((z) => z.busy)) }];
  }))])) as BgInfo["zones"];
  return { ...first, meanLum: infos.reduce((s, i) => s + i.meanLum, 0) / infos.length, zones, grids: infos.flatMap((i) => i.grids ?? []) };
}

/** A flat colour / two-colour gradient background: the same zone everywhere (conservative: the gradient's whole range). */
export function bgStatsFromColors(mode: "color" | "gradient", c1: string, c2 = c1): BgInfo {
  const a = relLum(c1), b = relLum(mode === "color" ? c1 : c2);
  // the actual colours: the flat colour, or the gradient's ends and points between (the canvas interpolates in sRGB)
  const from = rgbOf(c1), to = rgbOf(c2);
  const colors = mode === "color" ? [c1] : [0, 0.25, 0.5, 0.75, 1].map((t) => hexOf(mix(to, from, t)));
  const z = { lo: Math.min(a, b), hi: Math.max(a, b), busy: Math.abs(a - b) / 2, colors };
  const zones = Object.fromEntries(POS.map((p) => [p, Object.fromEntries(ALIGN.map((al) => [al, z]))])) as BgInfo["zones"];
  return { mode, colors: mode === "color" ? [c1] : [c1, c2], meanLum: (a + b) / 2, zones };
}

/** The colour fields of the design this guard owns. */
export interface ColorFields {
  bgMode: BgMode; bgColor: string; gradFrom: string; gradTo: string;
  textColor: string; accentColor: string; accentHighlight: boolean; ctaBg: string; ctaTextColor: string; badgeColor: string;
  textScrim: boolean; textScrimOpacity: number; textOutline: boolean;
  dimOverlay: boolean; dimOverlayOpacity: number;
}
/** Where the text is drawn at one size made (main + others; the colours are shared, so all must pass): the boxes of the
 *  elements drawn in textColor (canvas px) and that size's background grid (a picture; absent = not measured). */
export interface TextPlace { w: number; h: number; boxes: PxBox[]; grid?: LumGrid }
/** Which text-coloured elements the design shows (each has its own size and opacity in the renderer). */
export interface TextContent { subtext: boolean; priceNow: boolean; priceWas: boolean; trust: boolean }

export const MIN_HEADLINE = 3;
export const MIN_SMALL = 4.5;
/** The renderer's opacity for text drawn in textColor (banner-layers.ts: 副標 globalAlpha 0.95, 原價 0.7, 信任說明 0.92).
 *  Change them together. */
export const TEXT_ALPHA = { subtext: 0.95, priceWas: 0.7, trust: 0.92 } as const;
/** The text on an accent highlight plate (banner-layers.ts 標題 color(): plate -> #1a1a1a). */
export const PLATE_TEXT = "#1a1a1a";
/** Last resort scrim opacity (the slider's max): white text then always reads, whatever the picture. */
const SCRIM_MAX = 0.9;
const NEUTRALS = ["#ffffff", "#111111"];
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sat = (hex: string) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => parseInt(v, 16)), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/** The roles a brand kit owns (operator 2026-11-27: the kit does not set text or background colours). */
export const BRAND_ROLES = ["accentColor", "ctaBg", "badgeColor"] as const;
type BrandRole = (typeof BRAND_ROLES)[number];
const isBrandRole = (r: string): r is BrandRole => (BRAND_ROLES as readonly string[]).includes(r);

/** Role assignment with no usable AI answer: the brand kit's own mapping for the brand roles (as 套用到這張), else nothing. */
export function defaultRoles(kit: readonly string[] | null): Partial<ColorFields> {
  if (!kit?.length) return {};
  const [main, , accent] = kit;
  const loud = [...kit].sort((a, b) => sat(b) - sat(a))[0];
  return { accentColor: accent ?? loud, ctaBg: loud, badgeColor: main };
}

/** The AI's colour answer as a patch: a palette index or a #hex. With a brand kit, a brand role (accent / CTA / badge)
 *  outside the kit is dropped for the kit's default; text and background colours are free. The background colours / mode
 *  only when the background is a colour or gradient. */
export function pickColorRoles(raw: Record<string, unknown>, bgMode: BgMode, palette: readonly string[], kit: readonly string[] | null): Partial<ColorFields> {
  const pick = (v: unknown, brand: boolean): string | undefined => {
    const hex = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < palette.length ? palette[v] : isHex(v) ? v : undefined;
    if (!hex || (brand && kit && !kit.some((k) => sameHex(k, hex)))) return undefined;
    return hex;
  };
  const roles = ["textColor", "accentColor", "ctaBg", "ctaTextColor", "badgeColor"] as const;
  const fallback = defaultRoles(kit);
  const out: Partial<ColorFields> = {};
  for (const r of roles) { const v = pick(raw[r], isBrandRole(r)) ?? (isBrandRole(r) ? fallback[r] : undefined); if (v) out[r] = v; }
  // an uploaded / AI picture is the user's background: mode and colours stay as they are, whatever the answer says
  if (bgMode === "color" || bgMode === "gradient") {
    if (raw.bgMode === "color" || raw.bgMode === "gradient") out.bgMode = raw.bgMode;
    for (const k of ["bgColor", "gradFrom", "gradTo"] as const) { const v = pick(raw[k], false); if (v) out[k] = v; }
  }
  return out;
}

/** Black over the background at `alpha` (dim overlay, text scrim): every channel times (1 - alpha), greys and colours alike. */
const darken = (z: Zone, alpha: number): Zone => {
  const d = (c: Rgb): Rgb => c.map((v) => v * (1 - alpha)) as Rgb;
  return { lo: lumRgb(d(greyOf(z.lo))), hi: lumRgb(d(greyOf(z.hi))), colors: z.colors?.map((h) => hexOf(d(rgbOf(h)))) };
};
/**
 * Worst contrast of text colour `hex`, drawn at opacity `alpha`, over what is behind it: greys across the luminance range
 * (the point nearest the text's own luminance included: inside the range = 1:1 for opaque text) and every known colour.
 * Translucent text is mixed with each background per sRGB channel first, as the canvas paints it.
 */
export function zoneRatio(hex: string, z: Zone, alpha = 1): number {
  const t = rgbOf(hex), lt = lumRgb(t);
  const lo = Math.min(z.lo, z.hi), hi = Math.max(z.lo, z.hi);
  const greys = [lo, hi, Math.min(hi, Math.max(lo, lt)), ...Array.from({ length: 17 }, (_, i) => lo + ((hi - lo) * i) / 16)].map(greyOf);
  const unders = [...greys, ...(z.colors ?? []).map(rgbOf)];
  return Math.min(...unders.map((b) => ratioOf(lumRgb(alpha >= 1 ? t : mix(t, b, alpha)), lumRgb(b))));
}

export interface GuardResult { patch: Partial<ColorFields>; fixes: string[]; unmet: string[] }

/**
 * Enforce contrast on the final colours. Every text-coloured element against the zone behind it at every size made (after
 * dim overlay and scrim, at its renderer opacity); the accent against the background, or the plate text against the accent
 * when highlighted; CTA text against ctaBg; badge (white text) against badgeColor. Too little -> 1) another palette colour
 * that passes, 2) for the text the scrim (darker step by step, up to the slider max) plus outline, 3) white / near-black.
 * An uploaded / AI background is never changed; with a kit the brand roles (accent, CTA, badge) take only kit colours
 * before step 3, text colours are free.
 */
export function guardContrast(
  c: ColorFields, bg: BgInfo, places: readonly TextPlace[], palette: readonly string[], kit: readonly string[] | null,
  content: TextContent,
): GuardResult {
  const patch: Partial<ColorFields> = {};
  const fixes: string[] = [], unmet: string[] = [];
  const cur = () => ({ ...c, ...patch });
  // a picture: what is under the drawn text boxes at each size; a size not measured / without boxes = the whole picture
  const whole: Zone = {
    lo: Math.min(...POS.flatMap((p) => ALIGN.map((a) => bg.zones[p][a].lo))), hi: Math.max(...POS.flatMap((p) => ALIGN.map((a) => bg.zones[p][a].hi))),
  };
  // the picture's main colours: under measured boxes only those whose luminance is in the range found there (one outside
  // it is not under the text); unmeasured = all of them
  const main = bg.colors.filter(isHex);
  const pictureZones = (places.length ? places : [null]).map((p): Zone => {
    if (!p?.grid || !p.boxes.length) return { ...whole, colors: main };
    const z = zoneUnder(p.grid, p.boxes, p.w, p.h);
    return { ...z, colors: main.filter((h) => { const l = relLum(h); return l >= z.lo - 0.02 && l <= z.hi + 0.02; }) };
  });
  // zone behind the text: the background the design now has (a colour / gradient the AI chose replaces the measured one)
  const baseZone = (): Zone => {
    const s = cur();
    const zs = s.bgMode === "color" || s.bgMode === "gradient"
      ? [bgStatsFromColors(s.bgMode, s.bgMode === "color" ? s.bgColor : s.gradFrom, s.gradTo).zones.center.center]
      : pictureZones;
    const colors = [...new Set(zs.flatMap((q) => q.colors ?? []))];
    let z: Zone = { lo: Math.min(...zs.map((q) => q.lo)), hi: Math.max(...zs.map((q) => q.hi)), colors };
    if (s.dimOverlay) z = darken(z, s.dimOverlayOpacity);
    return z;
  };
  const textZone = () => { const s = cur(); return s.textScrim ? darken(baseZone(), s.textScrimOpacity) : baseZone(); };
  // text colours come from the palette / background (white / near-black only as the last resort below); the brand roles
  // (accent, CTA, badge) from the kit when the client has one
  const choices = [...new Set([...palette, ...bg.colors].filter(isHex))];
  const brandChoices = (kit ? [...kit] : choices).filter(isHex);
  const best = (cands: string[], score: (h: string) => number, need: number) =>
    cands.filter((h) => score(h) >= need).sort((a, b) => score(b) - score(a))[0];

  // 1) the text colour: every element drawn in it (headline, price now at headline weight; subtext, old price, trust line
  //    small and translucent). Score = the worst margin over them (>= 1 = all pass).
  const reqs: { alpha: number; need: number }[] = [
    { alpha: 1, need: MIN_HEADLINE },
    ...(content.priceNow ? [{ alpha: 1, need: MIN_HEADLINE }] : []),
    ...(content.subtext ? [{ alpha: TEXT_ALPHA.subtext, need: MIN_SMALL }] : []),
    ...(content.priceWas ? [{ alpha: TEXT_ALPHA.priceWas, need: MIN_SMALL }] : []),
    ...(content.trust ? [{ alpha: TEXT_ALPHA.trust, need: MIN_SMALL }] : []),
  ];
  const textScore = (h: string) => Math.min(...reqs.map((r) => zoneRatio(h, textZone(), r.alpha) / r.need));
  if (textScore(c.textColor) < 1) {
    const alt = best(choices, textScore, 1);
    if (alt) { patch.textColor = alt; fixes.push(`textColor→${alt}`); }
    else {
      // 2) the scrim, darker step by step, with the best colour for it; outline on
      patch.textScrim = true; patch.textOutline = true;
      let op = Math.min(SCRIM_MAX, Math.max(c.textScrim ? c.textScrimOpacity : 0, 0.5));
      for (;;) {
        patch.textScrimOpacity = op;
        const pick = best(choices, textScore, 1) ?? best(NEUTRALS, textScore, 1);
        if (pick) { if (!sameHex(pick, c.textColor)) patch.textColor = pick; break; }
        if (op >= SCRIM_MAX) {
          // cannot happen (white over a 90% black scrim passes every requirement); kept so the loop always ends
          patch.textColor = "#ffffff"; if (textScore("#ffffff") < 1) unmet.push("textColor"); break;
        }
        op = Math.min(SCRIM_MAX, Math.round((op + 0.1) * 100) / 100);
      }
      fixes.push(`textScrim ${patch.textScrimOpacity}`);
    }
  }
  // the accent (**字** inside the headline), headline size 3:1. Highlighted: the plate is the accent colour and the word on
  // it is PLATE_TEXT, so that pair is what must read; else the accent word against the background.
  if (cur().accentHighlight) {
    if (contrastRatio(PLATE_TEXT, cur().accentColor) < MIN_HEADLINE) {
      const alt = best(brandChoices, (h) => contrastRatio(PLATE_TEXT, h), MIN_HEADLINE) ?? "#ffffff";
      patch.accentColor = alt; fixes.push(`accentColor(plate)→${alt}`);
    }
  } else if (zoneRatio(cur().accentColor, textZone()) < MIN_HEADLINE) {
    const alt = best(brandChoices, (h) => zoneRatio(h, textZone()), MIN_HEADLINE) ?? cur().textColor;
    patch.accentColor = alt; fixes.push(`accentColor→${alt}`);
  }
  // CTA text on its button
  if (contrastRatio(cur().ctaTextColor, cur().ctaBg) < MIN_SMALL) {
    const bgc = cur().ctaBg;
    const alt = best(choices, (h) => contrastRatio(h, bgc), MIN_SMALL) ?? best(NEUTRALS, (h) => contrastRatio(h, bgc), MIN_SMALL);
    if (alt) { patch.ctaTextColor = alt; fixes.push(`ctaTextColor→${alt}`); }
    else {
      // no text colour reads on that button: the button takes a palette colour white / near-black reads on, else near-black
      const btn = best(brandChoices, (h) => Math.max(...NEUTRALS.map((n) => contrastRatio(n, h))), MIN_SMALL) ?? "#111111";
      patch.ctaBg = btn;
      patch.ctaTextColor = [...NEUTRALS].sort((a, b) => contrastRatio(b, btn) - contrastRatio(a, btn))[0];
      fixes.push(`ctaBg→${btn}`);
    }
  }
  // the badge's text is always white (renderer): its colour must carry white; no palette colour does -> near-black
  if (contrastRatio("#ffffff", cur().badgeColor) < MIN_SMALL) {
    const alt = best(brandChoices, (h) => contrastRatio("#ffffff", h), MIN_SMALL) ?? "#111111";
    patch.badgeColor = alt; fixes.push(`badgeColor→${alt}`);
  }
  return { patch, fixes, unmet };
}

/** The whole step after the AI answers: roles from the answer (palette / kit kept, background kept for a picture), then the
 *  contrast guard. Returns the colour patch to merge into the design. */
export function resolveDesignColors(
  raw: Record<string, unknown>, current: ColorFields, bg: BgInfo, places: readonly TextPlace[],
  palette: readonly string[], kit: readonly string[] | null, content: TextContent,
): GuardResult {
  const roles = pickColorRoles(raw, current.bgMode, palette, kit);
  for (const k of ["textScrim", "textOutline"] as const) if (typeof raw[k] === "boolean") (roles as Record<string, unknown>)[k] = raw[k];
  const merged = { ...current, ...roles };
  const g = guardContrast(merged, bg, places, palette, kit, content);
  return { patch: { ...roles, ...g.patch }, fixes: g.fixes, unmet: g.unmet };
}

/** The palette the AI may assign from: the kit's colours (brand roles) first, then the background's colours plus white /
 *  near-black (text and background colours are free of the kit). */
export const usablePalette = (bg: BgInfo, kit: readonly string[] | null): string[] =>
  [...new Set([...(kit ?? []), ...bg.colors, ...NEUTRALS].filter(isHex).map((h) => h.toLowerCase()))].slice(0, 10);

/** What the prompt gets (kept short): the background, each text band's brightness / busyness, and the palette. */
export function bgForPrompt(bg: BgInfo): { mode: BgMode; colors: string[]; meanLum: number; zones: Record<TextPos, { lum: number; busy: number }> } {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const zones = Object.fromEntries(POS.map((p) => {
    const z = bg.zones[p].center;
    return [p, { lum: r2((z.lo + z.hi) / 2), busy: r2(z.busy) }];
  })) as Record<TextPos, { lum: number; busy: number }>;
  return { mode: bg.mode, colors: bg.colors.slice(0, 6), meanLum: r2(bg.meanLum), zones };
}

/** The design fields the guard reads: the colours and which text-coloured elements it shows. */
export type DrawnFields = ColorFields & { subtext: string; trustType: string; showPrice: boolean; priceNow: string; priceWas: string };
/** One size as the renderer drew it: the canvas and the boxes of the elements drawn in textColor. */
export interface DrawnSize { w: number; h: number; boxes: PxBox[] }

/**
 * Contrast on what is drawn now (R2-C): `drawn[i]` is size i as rendered from the design, `bg` the background measured from
 * that same design (bg.grids[i] = size i). With `roles` (an AI answer and the palette its indices refer to) the colour
 * roles are taken from the answer first; without, the design's own colours are only guarded (a word set swapped in).
 */
export function guardDrawn(
  st: DrawnFields, bg: BgInfo, drawn: readonly DrawnSize[], kit: readonly string[] | null,
  roles?: { raw: Record<string, unknown>; palette: readonly string[] },
): GuardResult {
  const places: TextPlace[] = drawn.map((d, i) => ({ ...d, grid: bg.grids?.[i] }));
  const content: TextContent = {
    subtext: !!st.subtext.trim(), trust: st.trustType !== "none",
    priceNow: st.showPrice && !!st.priceNow, priceWas: st.showPrice && !!st.priceWas,
  };
  const palette = roles?.palette ?? usablePalette(bg, kit);
  return roles
    ? resolveDesignColors(roles.raw, st, bg, places, palette, kit, content)
    : guardContrast(st, bg, places, palette, kit, content);
}

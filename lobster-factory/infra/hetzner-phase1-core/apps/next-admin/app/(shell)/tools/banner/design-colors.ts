// Card C12: AI 一鍵設計整張 colours. The page measures the background (free, in the browser) and sends it with the usable
// palette; the AI only assigns colour roles; resolveDesignColors() keeps the brand palette, never touches an uploaded /
// AI background, and enforces WCAG contrast (headline 3:1; subtext / small text / CTA text 4.5:1). Pure (node-testable).

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

/** The luminance range behind the text (lo..hi, relative luminance): the text must stand out against both ends. */
export interface Zone { lo: number; hi: number }
/** What the page measured of the background, before any AI call. zones = per text position / alignment. */
export interface BgInfo {
  mode: BgMode;
  colors: string[];          // 4-6 main colours
  meanLum: number;           // 0..1
  zones: Record<TextPos, Record<TextAlignH, Zone & { busy: number }>>;
}

const POS: readonly TextPos[] = ["top", "center", "bottom"];
const ALIGN: readonly TextAlignH[] = ["left", "center", "right"];
/** The band the text stack sits in, as shares of the canvas (renderer: stack top / centred / bottom, aligned left / centre / right). */
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
  const zone = (pos: TextPos, al: TextAlignH) => {
    const [y0, y1] = BAND_Y[pos], [x0, x1] = BAND_X[al];
    let n = 0, s = 0, s2 = 0;
    for (let y = Math.floor(y0 * h); y < Math.max(Math.floor(y0 * h) + 1, Math.ceil(y1 * h)); y++)
      for (let x = Math.floor(x0 * w); x < Math.max(Math.floor(x0 * w) + 1, Math.ceil(x1 * w)); x++) {
        const v = lum[Math.min(h - 1, y) * w + Math.min(w - 1, x)]; n++; s += v; s2 += v * v;
      }
    const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    return { lo: Math.max(0, mean - sd), hi: Math.min(1, mean + sd), busy: sd };
  };
  const zones = Object.fromEntries(POS.map((p) => [p, Object.fromEntries(ALIGN.map((a) => [a, zone(p, a)]))])) as BgInfo["zones"];
  return { mode, colors, meanLum: sum / (w * h), zones };
}

/** One picture measured at several sizes (each crops it differently): every zone spans what any size has there. */
export function mergeBgInfo(infos: readonly BgInfo[]): BgInfo {
  const [first, ...rest] = infos;
  if (!rest.length) return first;
  const zones = Object.fromEntries(POS.map((p) => [p, Object.fromEntries(ALIGN.map((a) => {
    const zs = infos.map((i) => i.zones[p][a]);
    return [a, { lo: Math.min(...zs.map((z) => z.lo)), hi: Math.max(...zs.map((z) => z.hi)), busy: Math.max(...zs.map((z) => z.busy)) }];
  }))])) as BgInfo["zones"];
  return { ...first, meanLum: infos.reduce((s, i) => s + i.meanLum, 0) / infos.length, zones };
}

/** A flat colour / two-colour gradient background: the same zone everywhere (conservative: the gradient's whole range). */
export function bgStatsFromColors(mode: "color" | "gradient", c1: string, c2 = c1): BgInfo {
  const a = relLum(c1), b = relLum(mode === "color" ? c1 : c2);
  const z = { lo: Math.min(a, b), hi: Math.max(a, b), busy: Math.abs(a - b) / 2 };
  const zones = Object.fromEntries(POS.map((p) => [p, Object.fromEntries(ALIGN.map((al) => [al, z]))])) as BgInfo["zones"];
  return { mode, colors: mode === "color" ? [c1] : [c1, c2], meanLum: (a + b) / 2, zones };
}

/** The colour fields of the design this guard owns. */
export interface ColorFields {
  bgMode: BgMode; bgColor: string; gradFrom: string; gradTo: string;
  textColor: string; accentColor: string; ctaBg: string; ctaTextColor: string; badgeColor: string;
  textScrim: boolean; textScrimOpacity: number; textOutline: boolean;
  dimOverlay: boolean; dimOverlayOpacity: number;
}
/** Where the text sits at each size made (main + others): the colours are shared, so all must pass. */
export interface TextPlace { pos: TextPos; align: TextAlignH }

export const MIN_HEADLINE = 3;
export const MIN_SMALL = 4.5;
const NEUTRALS = ["#ffffff", "#111111"];
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sat = (hex: string) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => parseInt(v, 16)), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/** Role assignment with no usable AI answer: the brand kit's own mapping (main / accent / text, as 套用品牌), else nothing. */
export function defaultRoles(kit: readonly string[] | null): Partial<ColorFields> {
  if (!kit?.length) return {};
  const [main, , accent, text] = kit;
  const loud = [...kit].sort((a, b) => sat(b) - sat(a))[0];
  return { textColor: text ?? main, accentColor: accent ?? loud, ctaBg: loud, badgeColor: main };
}

/** The AI's colour answer as a patch: a palette index or a #hex; with a brand kit a hex outside the kit is dropped (that
 *  role then gets the kit's default). The background colours / mode only when the background is a colour or gradient. */
export function pickColorRoles(raw: Record<string, unknown>, bgMode: BgMode, palette: readonly string[], kit: readonly string[] | null): Partial<ColorFields> {
  const pick = (v: unknown): string | undefined => {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < palette.length) return palette[v];
    if (!isHex(v)) return undefined;
    if (kit && !kit.some((k) => sameHex(k, v))) return undefined;
    return v;
  };
  const roles = ["textColor", "accentColor", "ctaBg", "ctaTextColor", "badgeColor"] as const;
  const fallback = defaultRoles(kit);
  const out: Partial<ColorFields> = {};
  for (const r of roles) { const v = pick(raw[r]) ?? fallback[r]; if (v) out[r] = v; }
  // an uploaded / AI picture is the user's background: mode and colours stay as they are, whatever the answer says
  if (bgMode === "color" || bgMode === "gradient") {
    if (raw.bgMode === "color" || raw.bgMode === "gradient") out.bgMode = raw.bgMode;
    for (const k of ["bgColor", "gradFrom", "gradTo"] as const) { const v = pick(raw[k]); if (v) out[k] = v; }
  }
  return out;
}

/** Black over the background at `alpha` (dim overlay, text scrim) scales luminance about by (1 - alpha)^2.2. */
const darken = (z: Zone, alpha: number): Zone => { const f = (1 - alpha) ** 2.2; return { lo: z.lo * f, hi: z.hi * f }; };
const zoneRatio = (hex: string, z: Zone) => { const l = relLum(hex); return Math.min(ratioOf(l, z.lo), ratioOf(l, z.hi)); };

export interface GuardResult { patch: Partial<ColorFields>; fixes: string[]; unmet: string[] }

/**
 * Enforce contrast on the final colours. Text against the zone behind it at every size made (after dim overlay and
 * scrim); CTA text against ctaBg; badge (white text) against badgeColor. Too little -> 1) another palette colour that
 * passes, 2) the text scrim (darker step by step) plus outline. An uploaded / AI background is never changed; with a kit
 * only kit colours are picked (white / near-black only when no kit colour can pass).
 */
export function guardContrast(
  c: ColorFields, bg: BgInfo, places: readonly TextPlace[], palette: readonly string[], kit: readonly string[] | null,
  opts: { smallText: boolean },
): GuardResult {
  const patch: Partial<ColorFields> = {};
  const fixes: string[] = [], unmet: string[] = [];
  const cur = () => ({ ...c, ...patch });
  // zone behind the text: the background the design now has (a colour / gradient the AI chose replaces the measured one)
  const baseZone = (): Zone => {
    const s = cur();
    const zs = s.bgMode === "color" || s.bgMode === "gradient"
      ? [bgStatsFromColors(s.bgMode, s.bgMode === "color" ? s.bgColor : s.gradFrom, s.gradTo).zones.center.center]
      : (places.length ? places : [{ pos: "center", align: "center" } as TextPlace]).map((p) => bg.zones[p.pos][p.align]);
    let z: Zone = { lo: Math.min(...zs.map((q) => q.lo)), hi: Math.max(...zs.map((q) => q.hi)) };
    if (s.dimOverlay) z = darken(z, s.dimOverlayOpacity);
    return z;
  };
  const textZone = () => { const s = cur(); return s.textScrim ? darken(baseZone(), s.textScrimOpacity) : baseZone(); };
  const choices = (kit ? [...kit] : [...palette, ...bg.colors]).filter(isHex);
  const best = (cands: string[], score: (h: string) => number, need: number) => {
    const ok = cands.filter((h) => score(h) >= need).sort((a, b) => score(b) - score(a));
    return ok[0];
  };

  // 1) the text colour (headline + subtext share it): 4.5 when there is small text, else 3
  const needText = opts.smallText ? MIN_SMALL : MIN_HEADLINE;
  if (zoneRatio(c.textColor, textZone()) < needText) {
    const alt = best(choices, (h) => zoneRatio(h, textZone()), needText);
    if (alt) { patch.textColor = alt; fixes.push(`textColor→${alt}`); }
    else {
      // 2) the scrim, darker step by step, with the best colour for it; outline on
      patch.textScrim = true; patch.textOutline = true;
      let op = Math.max(c.textScrim ? c.textScrimOpacity : 0, 0.5);
      for (;;) {
        patch.textScrimOpacity = op;
        const pick = best(choices, (h) => zoneRatio(h, textZone()), needText) ?? best(NEUTRALS, (h) => zoneRatio(h, textZone()), needText);
        if (pick) { if (!sameHex(pick, c.textColor)) patch.textColor = pick; break; }
        if (op >= 0.85) {
          const any = [...choices, ...NEUTRALS].sort((a, b) => zoneRatio(b, textZone()) - zoneRatio(a, textZone()))[0];
          patch.textColor = any; unmet.push("textColor"); break;
        }
        op = Math.min(0.85, Math.round((op + 0.1) * 100) / 100);
      }
      fixes.push(`textScrim ${patch.textScrimOpacity}`);
    }
  }
  // the accent (**字** inside the headline): headline size, 3:1
  if (zoneRatio(cur().accentColor, textZone()) < MIN_HEADLINE) {
    const alt = best(choices, (h) => zoneRatio(h, textZone()), MIN_HEADLINE) ?? cur().textColor;
    patch.accentColor = alt; fixes.push(`accentColor→${alt}`);
  }
  // CTA text on its button
  if (contrastRatio(cur().ctaTextColor, cur().ctaBg) < MIN_SMALL) {
    const bgc = cur().ctaBg;
    const alt = best(choices, (h) => contrastRatio(h, bgc), MIN_SMALL) ?? best(NEUTRALS, (h) => contrastRatio(h, bgc), MIN_SMALL);
    if (alt) { patch.ctaTextColor = alt; fixes.push(`ctaTextColor→${alt}`); }
    else {
      // no text colour reads on that button: the button takes a palette colour that white / near-black reads on
      const btn = best(choices, (h) => Math.max(...NEUTRALS.map((n) => contrastRatio(n, h))), MIN_SMALL);
      if (btn) {
        patch.ctaBg = btn;
        patch.ctaTextColor = [...NEUTRALS].sort((a, b) => contrastRatio(b, btn) - contrastRatio(a, btn))[0];
        fixes.push(`ctaBg→${btn}`);
      } else unmet.push("ctaTextColor");
    }
  }
  // the badge's text is always white (renderer): its colour must carry white
  if (contrastRatio("#ffffff", cur().badgeColor) < MIN_SMALL) {
    const alt = best(choices, (h) => contrastRatio("#ffffff", h), MIN_SMALL);
    if (alt) { patch.badgeColor = alt; fixes.push(`badgeColor→${alt}`); } else unmet.push("badgeColor");
  }
  return { patch, fixes, unmet };
}

/** The whole step after the AI answers: roles from the answer (palette / kit kept, background kept for a picture), then the
 *  contrast guard. Returns the colour patch to merge into the design. */
export function resolveDesignColors(
  raw: Record<string, unknown>, current: ColorFields, bg: BgInfo, places: readonly TextPlace[],
  palette: readonly string[], kit: readonly string[] | null, opts: { smallText: boolean },
): GuardResult {
  const roles = pickColorRoles(raw, current.bgMode, palette, kit);
  for (const k of ["textScrim", "textOutline"] as const) if (typeof raw[k] === "boolean") (roles as Record<string, unknown>)[k] = raw[k];
  const merged = { ...current, ...roles };
  const g = guardContrast(merged, bg, places, palette, kit, opts);
  return { patch: { ...roles, ...g.patch }, fixes: g.fixes, unmet: g.unmet };
}

/** The palette the AI may assign from: the kit's colours; no kit = the background's colours plus white / near-black. */
export const usablePalette = (bg: BgInfo, kit: readonly string[] | null): string[] =>
  kit?.length ? kit.filter(isHex) : [...new Set([...bg.colors.filter(isHex), ...NEUTRALS].map((h) => h.toLowerCase()))].slice(0, 8);

/** What the prompt gets (kept short): the background, each text band's brightness / busyness, and the palette. */
export function bgForPrompt(bg: BgInfo): { mode: BgMode; colors: string[]; meanLum: number; zones: Record<TextPos, { lum: number; busy: number }> } {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const zones = Object.fromEntries(POS.map((p) => {
    const z = bg.zones[p].center;
    return [p, { lum: r2((z.lo + z.hi) / 2), busy: r2(z.busy) }];
  })) as Record<TextPos, { lum: number; busy: number }>;
  return { mode: bg.mode, colors: bg.colors.slice(0, 6), meanLum: r2(bg.meanLum), zones };
}

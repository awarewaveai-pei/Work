// Card R2-A: the banner's layout engine. Pure (node-testable): given the design fields, the canvas size and a way to
// measure text / pictures, it returns every element's box and the title's lines. renderBannerLayers only draws these
// boxes. Invariants: in the automatic layout no two element boxes overlap and all are inside the canvas (corners for the
// badge / logo are reserved first, the product next, the text stack gets what is left); an element the user dragged
// (`positions`) sits where it was dropped and takes no part in the avoidance; a position button / template clears the
// drag of the elements it moves (applySemantic), so a button always shows its effect.

import { clampField, FIELD_RANGES, SUB_RATIO, titleRange } from "./field-ranges";
import { COMPOSITION, TEXT_SHARE_MAX, safeBand, type LayoutSize } from "./composition";
import type { BannerFields, ElemBox, ElemKey, ElemPositions } from "./banner-layers";

// ── CJK typesetting (moved here from banner-layers.ts) ──
/** May not start a line (closing punctuation) / may not end one (opening brackets). */
const NO_START = new Set(Array.from("，。、；：！？）」』】〉》〕…‥・％,.;:!?)]}%"));
const NO_END = new Set(Array.from("（「『【〈《〔([{"));
/** Greedy wrap of characters with 避頭尾 (`rules`): a closing mark that does not fit takes the character before it to the
 *  next line (追い出し; no ぶら下げ -- a hung full-width mark is one em past the column, and centred it pushed the line past
 *  both canvas edges, R3 一3); an opening bracket never ends a line. When no character is left to go down with the marks,
 *  the mark starts the next line (the width wins over 避頭尾; kinsokuBroken tells the layout, which shrinks the type
 *  first). Only a single item wider than `fits` makes a wider line. Spaces at the edges of a wrapped line are dropped (a
 *  中英間距 space must not indent or shift a line). Rules off = the plain greedy wrap. */
export function wrapChars<T>(items: T[], ch: (t: T) => string, fits: (line: T[]) => boolean, rules: boolean): T[][] {
  const lines: T[][] = [];
  let line: T[] = [];
  for (const it of items) {
    const next = [...line, it];
    if (!line.length || fits(next)) { line = next; continue; }
    let carry: T[] = [];
    if (rules) {
      if (NO_START.has(ch(it))) {
        let k = line.length;
        while (k > 0 && NO_START.has(ch(line[k - 1]))) k--;
        if (k >= 2) carry = line.splice(k - 1); // else nothing to take down without emptying the line: break before it
      }
      while (line.length > 1 && NO_END.has(ch(line[line.length - 1]))) carry.unshift(line.pop()!);
    }
    lines.push(line);
    line = [...carry, it];
  }
  if (line.length) lines.push(line);
  const blank = (t: T) => ch(t) === " ";
  return lines
    .map((l) => { let a = 0, b = l.length; while (a < b && blank(l[a])) a++; while (b > a && blank(l[b - 1])) b--; return l.slice(a, b); })
    .filter((l) => l.length);
}
const CJK_CHAR = /[぀-ヿ㄀-ㄯ㐀-䶿一-鿿豈-﫿]/;
const LATIN_CHAR = /[A-Za-z0-9]/;
/** 中英間距: a half-width space between a CJK character and a Latin letter / digit (either order), unless one is there. */
export function autospace(text: string): string {
  const cs = Array.from(text);
  let out = "";
  cs.forEach((c, i) => {
    const prev = cs[i - 1];
    if (prev && ((CJK_CHAR.test(prev) && LATIN_CHAR.test(c)) || (LATIN_CHAR.test(prev) && CJK_CHAR.test(c)))) out += " ";
    out += c;
  });
  return out;
}

/** A wrapped line (after the first) that starts with a closing mark: 避頭尾 gave way to the column width. */
export const kinsokuBroken = (lines: string[]): boolean => lines.slice(1).some((l) => NO_START.has(Array.from(l)[0] ?? ""));

// `**字**` → accent runs.
export type AccentRun = { text: string; accent: boolean };
export function parseAccentRuns(text: string): AccentRun[] {
  const out: AccentRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), accent: false });
    out.push({ text: m[1], accent: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false });
  return out.length ? out : [{ text, accent: false }];
}

/** autospace over accent runs (a space between an accent and a plain run is plain). */
export function autospaceRuns(runs: AccentRun[]): AccentRun[] {
  const chars = runs.flatMap((r) => Array.from(r.text).map((ch) => ({ ch, accent: r.accent })));
  const out: AccentRun[] = [];
  chars.forEach((c, i) => {
    const prev = chars[i - 1];
    const gap = prev && ((CJK_CHAR.test(prev.ch) && LATIN_CHAR.test(c.ch)) || (LATIN_CHAR.test(prev.ch) && CJK_CHAR.test(c.ch)));
    for (const [ch, accent] of gap ? [[" ", prev.accent && c.accent], [c.ch, c.accent]] as const : [[c.ch, c.accent]] as const) {
      const last = out[out.length - 1];
      if (last && last.accent === accent) last.text += ch; else out.push({ text: ch, accent });
    }
  });
  return out.length ? out : runs;
}

// ── the engine ──

/** Text is measured once per font at this size and scaled (advance widths are linear in the font size). */
export const REF_PX = 100;
export interface LayoutMeasure {
  /** Advance width of `text` set in `font` (a CSS font shorthand at REF_PX), no letter spacing. Measure = draw: the
   *  layout measures each drawn run whole (kerning) with the drawn weight, family, letter spacing and 中英間距. */
  text(font: string, text: string): number;
  /** Natural size of a loaded picture; null = none / not loaded. */
  image(src: string): { w: number; h: number } | null;
}

export type LogoPos = NonNullable<BannerFields["logoPos"]>;
export interface HeadlineLayout { box: ElemBox; size: number; lineH: number; lines: AccentRun[][]; runW: number[][]; lineWs: number[] }
export interface SubtextLayout { box: ElemBox; size: number; lineH: number; lines: string[] }
export interface PriceLayout { box: ElemBox; nowSize: number; wasSize: number; nowW: number; wasW: number; gap: number }
export interface CtaLayout { box: ElemBox; size: number; text: string }
export interface TrustLayout { box: ElemBox; size: number; stars: string; label: string; starW: number; gap: number }
export interface BadgeLayout { box: ElemBox; size: number; text: string; textW: number; onLeft: boolean }
/** `reflection`: the mirrored part below the product, inside the canvas (null = reflection off). `drawn` false = the
 *  product is baked into the AI background: the area stays reserved (text keeps clear of it), only the picture is not drawn. */
export interface ProductLayout { box: ElemBox; reflection: ElemBox | null; drawn: boolean }
export interface BannerLayout {
  w: number; h: number;
  align: BannerFields["textAlignH"];
  /** The canvas margins of the text (the brand bar sits in the left one). */
  padX: number; padY: number;
  /** The sizes drawn (the automatic ones when typeAuto). */
  headlineSize: number; subtextSize: number;
  headline?: HeadlineLayout; subtext?: SubtextLayout; price?: PriceLayout; cta?: CtaLayout; trust?: TrustLayout;
  badge?: BadgeLayout; product?: ProductLayout; logo?: { box: ElemBox };
  /** The text blocks still in the automatic stack (scrim, brand bar); null = none left. */
  stack: ElemBox | null;
  /** Every element's drawn box (preview hit-testing). */
  boxes: Partial<Record<ElemKey, ElemBox>>;
  /** The text's share of the width beside a product (the composition's, widened up to TEXT_SHARE_MAX for long words). */
  textShare: number;
  /** below_min: the automatic title was shrunk under its size's range (words too long) -> the range's floor, else null. */
  belowMin: number | null;
}

const STACK_KEYS = ["headline", "subtext", "price", "cta", "trust"] as const;
type StackKey = (typeof STACK_KEYS)[number];

/** Whether the product picture is drawn: not when the active AI background already has it baked in (keyed off
 *  bgImageHasProduct set at generation time, not the live toggle, so flipping it can't double-draw the product). */
const bgHasProduct = (f: BannerFields) => f.bgImageHasProduct && f.bgMode === "ai" && !!f.bgImage;
export const productDrawn = (f: BannerFields) => !!f.productImage && !bgHasProduct(f);

/** The product the layout reserves room for -- the one place that decides it (Codex hit this class three times).
 *  Invariant: reserved iff the product is drawn or baked into the background (bgImageHasProduct), never by productImage
 *  alone. Its box, in order: the baked area mapped onto the canvas (`area`; null = dragged out of view) -> a box of the
 *  product picture's proportions at productPos (`shape`) -> a box of the composition's productFrame at productPos. */
export function reservedProduct(f: BannerFields, measure: LayoutMeasure, size: LayoutSize):
  { area: ElemBox | null } | { shape: { w: number; h: number } } | null {
  const baked = bgHasProduct(f);
  if (!baked && !productDrawn(f)) return null;
  const pic = baked && f.bgProductArea ? picture(measure, f.bgImage!) : null;
  if (pic) return { area: areaOnCanvas(f.bgProductArea!, pic, f, size.w, size.h) };
  const own = f.productImage ? picture(measure, f.productImage) : null;
  if (own) return { shape: own };
  return baked ? { shape: COMPOSITION[size.group].productFrame } : null;
}
/** The text sits beside the product (left / right; bottom-right off the phone group): only then does widening the text
 *  share help long words -- under the text it would only shrink the product. */
const besideText = (f: BannerFields, size: LayoutSize) => !f.positions?.product &&
  (f.productPos === "left" || f.productPos === "right" || (f.productPos === "bottom-right" && size.group !== "phone"));

/** R3-E: a baked-in product's box on the canvas -- `area` (shares of the background picture, natural size `pic`) through
 *  the background's cover fit and its bgImgScale / X / Y, as renderBannerLayers draws it; clipped to the canvas (null =
 *  dragged out of view). */
export function areaOnCanvas(area: { x0: number; y0: number; x1: number; y1: number }, pic: { w: number; h: number },
  f: Pick<BannerFields, "bgImgScale" | "bgImgX" | "bgImgY">, W: number, H: number): ElemBox | null {
  const scale = Math.max(W / pic.w, H / pic.h) * (f.bgImgScale || 1);
  const sw = pic.w * scale, sh = pic.h * scale;
  const left = (W - sw) / 2 + (f.bgImgX || 0) * W, top = (H - sh) / 2 + (f.bgImgY || 0) * H;
  const x0 = Math.max(0, left + area.x0 * sw), x1 = Math.min(W, left + area.x1 * sw);
  const y0 = Math.max(0, top + area.y0 * sh), y1 = Math.min(H, top + area.y1 * sh);
  return x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The areas a generated picture is asked to keep: the text stack's box and the product's (canvas px; null = none).
 *  Scene / 合成進場景 prompts and the reservation the layout keeps after baking are this one box (R3-D 三3). */
export function reservedAreas(L: BannerLayout): { text: ElemBox | null; product: ElemBox | null } {
  return { text: union(STACK_KEYS.flatMap((k) => (L.boxes[k] ? [L.boxes[k]!] : []))), product: L.product?.box ?? null };
}

/** Logo rule (R3 二): height = the short side x LOGO_AUTO, at most the title's font size x LOGO_TITLE (logoAuto, the
 *  default); set by hand = the short side x logoScale. Clear space LOGO_CLEAR x its height on every side; a wide logo is
 *  held to LOGO_MAX_W of the width. */
export const LOGO_AUTO = 0.1, LOGO_TITLE = 1.5, LOGO_CLEAR = 0.25;
const LOGO_MAX_W = 0.4;
/** The logo's height (px) by the rule, before a corner's room or the width cap limits it. */
export function logoHeight(f: Pick<BannerFields, "logoAuto" | "logoScale" | "headline">, W: number, H: number, titlePx: number): number {
  const short = Math.min(W, H);
  if (f.logoAuto === false) return Math.round(short * (clampField("logoScale", f.logoScale) ?? LOGO_AUTO));
  return Math.round(Math.min(short * LOGO_AUTO, f.headline ? titlePx * LOGO_TITLE : Infinity));
}
/** A picture's size, or null when it has none (an SVG without width / height reads 0x0 in some browsers). */
const picture = (m: LayoutMeasure, src: string) => { const n = m.image(src); return n && n.w > 0 && n.h > 0 ? n : null; };
const overlapX =(a: ElemBox, x0: number, x1: number) => a.x < x1 && a.x + a.w > x0;
const union = (bs: ElemBox[]): ElemBox | null => {
  if (!bs.length) return null;
  const l = Math.min(...bs.map((b) => b.x)), t = Math.min(...bs.map((b) => b.y));
  return { x: l, y: t, w: Math.max(...bs.map((b) => b.x + b.w)) - l, h: Math.max(...bs.map((b) => b.y + b.h)) - t };
};
/** A dragged box: its centre at the stored share of the canvas, kept inside (a box larger than the canvas is centred). */
function dropAt(want: { x: number; y: number }, w: number, h: number, W: number, H: number): ElemBox {
  const fit = (pos: number, size: number, room: number) => (size >= room ? (room - size) / 2 : Math.max(0, Math.min(room - size, pos)));
  return { x: fit(want.x * W - w / 2, w, W), y: fit(want.y * H - h / 2, h, H), w, h };
}

export function layoutBanner(f: BannerFields, size: LayoutSize, measure: LayoutMeasure): BannerLayout {
  const W = size.w, baseShare = COMPOSITION[size.group].textShare;
  const fixed = (k: "headlineSize" | "subtextSize") => clampField(k, f[k]) ?? (k === "headlineSize" ? 64 : 32);
  /** The largest title size <= hs (the subtitle, price, button and trust row scaled with it) at which every text block
   *  is inside its room (compose's inRoom) -- a size set by hand too; the layout returns the sizes drawn. */
  const settle = (hs: number, ss: number, balance: boolean, share = baseShare) => {
    const minH: number = FIELD_RANGES.headlineSize.min;
    const at = (h: number) => compose(f, size, measure, h, Math.max(FIELD_RANGES.subtextSize.min, Math.round((ss * h) / hs)), balance, share);
    const full = at(hs);
    if (full.inRoom || hs <= minH) return full.layout;
    let lo = minH, hi = hs; // at(hi) does not fit; at(lo) is the floor whether or not it fits
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid).inRoom) lo = mid; else hi = mid; }
    return at(lo).layout;
  };
  if (!f.typeAuto) return settle(fixed("headlineSize"), fixed("subtextSize"), f.balanceTitle);
  // automatic type (R4): within the size's title range (titleRange: 36-57 px as shown), the largest title that fits
  // (lines, height), then smaller until no line is a lone character; the subtitle = title / SUB_RATIO. The floor wins
  // over the layout's proportions: words that do not fit at it first widen the text beside a product (up to
  // TEXT_SHARE_MAX); still too long -> settle shrinks them below it (inside the canvas) and belowMin tells the page.
  const range = titleRange(W, size.displayW);
  const subFor = (hs: number) => Math.round(hs / SUB_RATIO);
  const shares: number[] = [baseShare];
  if (besideText(f, size)) {
    for (let sh = baseShare + 0.05; sh < TEXT_SHARE_MAX - 1e-9; sh += 0.05) shares.push(sh);
    shares.push(Math.max(baseShare, TEXT_SHARE_MAX));
  }
  const share = shares.find((sh) => compose(f, size, measure, range.min, subFor(range.min), true, sh).fits);
  if (share === undefined) {
    const L = settle(range.min, subFor(range.min), true, shares[shares.length - 1]);
    return { ...L, belowMin: L.headlineSize < range.min ? range.min : null };
  }
  const at = (hs: number) => compose(f, size, measure, hs, subFor(hs), true, share);
  let lo = range.min, hi = range.max;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid).fits) lo = mid; else hi = mid; }
  if (at(hi).fits) lo = hi;
  for (let hs = lo; hs >= range.min; hs = Math.min(hs - 1, Math.floor(hs * 0.97))) {
    const c = at(hs);
    if (c.fits && !c.orphan) return c.layout;
  }
  return settle(lo, subFor(lo), true);
}

/** `inRoom`: every text block inside its room -- each title / subtitle line within the column (避頭尾 kept), each block
 *  within the column (a dragged one within the canvas), the title / subtitle within the height between the margins, the
 *  stack within its free span. `fits` (automatic type) = inRoom and the look: few title lines, room for the product. */
function compose(f: BannerFields, size: LayoutSize, measure: LayoutMeasure, hs: number, ss: number, balance: boolean, share: number):
  { layout: BannerLayout; fits: boolean; inRoom: boolean; orphan: boolean } {
  const W = size.w, H = size.h, short = Math.min(W, H), tall = H / W > 1.1;
  const comp = COMPOSITION[size.group];
  const pos: ElemPositions = f.positions ?? {};
  const padX = Math.round(W * 0.06), padY = Math.round(Math.min(W * 0.06, H * 0.08));
  const margin = Math.round(W * 0.035);
  // the text and the product keep inside the size's safe band (9:16: Meta Reels' top 14% / bottom 35%)
  const { top: safeT, bottom: safeB } = safeBand(size, padY);
  const gapV = Math.round(ss * 0.62);
  // gaps around reserved areas are at least the scrim's padding, so the scrim never runs under a badge / logo / product
  const gapY = Math.max(Math.round(short * 0.02), Math.round(ss * 0.75));
  const gapX = Math.max(Math.round(W * 0.03), Math.round(ss * 0.95));
  const font = f.fontFamily, hFont = f.headlineFont || font;
  const hW = f.headlineWeight || 700, bW = f.bodyWeight || 400;
  const sp = (t: string) => (f.cjkSpacing ? autospace(t) : t);
  const memo = new Map<string, number>();
  const width = (weight: number, family: string, px: number, text: string, ls = 0) => {
    const k = `${weight}|${family}|${text}`;
    let v = memo.get(k);
    if (v === undefined) { v = measure.text(`${weight} ${REF_PX}px ${family}`, text); memo.set(k, v); }
    return (v * px) / REF_PX + ls * Array.from(text).length;
  };
  const boxes: Partial<Record<ElemKey, ElemBox>> = {};
  const obstacles: ElemBox[] = []; // automatic boxes the text stack must keep clear of

  // badge (top corner)
  let badge: BadgeLayout | undefined;
  if (f.badgeText) {
    const text = sp(f.badgeText);
    const bf = Math.round(ss * 0.95 * (clampField("badgeScale", f.badgeScale) ?? 1));
    const tw = width(700, font, bf, text);
    const onLeft = f.badgePos === "tl";
    let bw: number, bh: number;
    if (f.badgeStyle === "burst") { const r = Math.max(bf * 1.9, tw * 0.62 + bf * 0.4); bw = bh = r * 2; }
    else if (f.badgeStyle === "ribbon") { bh = bf * 1.9; bw = tw + bf * 1.4 + bh * 0.45; }
    else { bh = bf * 1.9; bw = tw + bf * 1.6; }
    const box = pos.badge ? dropAt(pos.badge, bw, bh, W, H) : { x: onLeft ? margin : W - margin - bw, y: safeBand(size, margin).top, w: bw, h: bh };
    if (!pos.badge) obstacles.push(box);
    badge = { box, size: bf, text, textW: tw, onLeft };
    boxes.badge = box;
  }

  // logo (a corner, bottom-left unless logoPos says otherwise)
  let logo: { box: ElemBox } | undefined;
  const logoNat = f.logoImage ? picture(measure, f.logoImage) : null;
  if (logoNat) {
    const lp: LogoPos = f.logoPos ?? "bl";
    const aspect = logoNat.w / logoNat.h;
    const hOf = (maxH: number) => Math.min(logoHeight(f, W, H, hs), maxH, (W * LOGO_MAX_W) / aspect);
    let lh = hOf(Infinity);
    // the canvas edge is kept at least the clear space away too
    const inset = (h: number) => Math.max(margin, h * LOGO_CLEAR);
    const xAt = (h: number) => (lp[1] === "l" ? inset(h) : W - inset(h) - h * aspect);
    // a top corner the badge already holds: the logo goes under the badge (and shrinks to the room left there)
    const under = badge && !pos.badge && lp[0] === "t" &&
      overlapX(badge.box, xAt(lh) - lh * LOGO_CLEAR, xAt(lh) + lh * aspect + lh * LOGO_CLEAR)
      ? badge.box.y + badge.box.h + Math.max(gapY, lh * LOGO_CLEAR) : safeBand(size, inset(lh)).top;
    if (lp[0] === "t" && !pos.logo) lh = hOf(Math.max(1, safeBand(size, inset(lh)).bottom - under));
    const lw = lh * aspect;
    const box = pos.logo ? dropAt(pos.logo, lw, lh, W, H) : { x: xAt(lh), y: lp[0] === "t" ? under : safeBand(size, inset(lh)).bottom - lh, w: lw, h: lh };
    // the rest keeps clear of the logo's clear space (a dragged logo takes no part, like every dragged element)
    const c = lh * LOGO_CLEAR;
    if (!pos.logo) obstacles.push({ x: box.x - c, y: box.y - c, w: lw + 2 * c, h: lh + 2 * c });
    logo = { box };
    boxes.logo = box;
  }

  /** The free vertical span for something spanning x0..x1: the margins, minus every obstacle over that span. */
  const band = (x0: number, x1: number, extra: ElemBox[] = []) => {
    let t = safeT, b = safeB;
    for (const o of [...obstacles, ...extra]) {
      if (!overlapX(o, x0, x1)) continue;
      if (o.y + o.h / 2 < H / 2) t = Math.max(t, o.y + o.h + gapY);
      else b = Math.min(b, o.y - gapY);
    }
    return { t, b };
  };

  // product: its size and, beside the text, its place; centred, it shares the column with the stack (placed below).
  // What is reserved and its box come from reservedProduct only (`baked` = a known baked area, null = out of view).
  const drawn = productDrawn(f);
  const reserve = reservedProduct(f, measure, size);
  const baked = reserve && "area" in reserve ? reserve.area : undefined;
  const nat = reserve && "shape" in reserve ? reserve.shape : null;
  const g = f.grounding?.reflection;
  const refl = g?.enabled && (g.fade ?? 0.3) > 0 ? Math.max(0, Math.min(1, g.height ?? 0.35)) : 0;
  const reflGap = refl ? Math.max(0, g?.gap ?? 0) : 0;
  const pScale = clampField("productScale", f.productScale) ?? 0.6;
  const pCentre = f.productPos === "center";
  // phone group: under the text, centred on the composition's crossing (comp.productAt); else beside it
  const pBelow = f.productPos === "bottom-right" && size.group === "phone";
  const pPad = W * 0.05;
  const pMaxW = W * pScale * (pCentre ? 0.7 : 1 - share);
  const aim = pBelow ? comp.productAt : null;
  /** The product's left edge at width sw: centred on the aim when there is one (kept inside the padding), else right. */
  const belowX = (sw: number) => (aim ? Math.max(pPad, Math.min(W - pPad - sw, aim.x * W - sw / 2)) : W - pPad - sw);
  const productAt = (maxH: number, x: (sw: number) => number, top: (gh: number) => number): ProductLayout | undefined => {
    if (!nat) return undefined;
    const k = Math.max(0, Math.min(pMaxW / nat.w, Math.min(H * 0.85, maxH) / nat.h));
    const sw = nat.w * k, sh = nat.h * k, gh = sh * (1 + refl) + reflGap;
    const at = pos.product ? dropAt(pos.product, sw, gh, W, H) : { x: x(sw), y: top(gh), w: sw, h: gh };
    return { box: { x: at.x, y: at.y, w: sw, h: sh }, reflection: refl ? { x: at.x, y: at.y + sh + reflGap, w: sw, h: sh * refl } : null, drawn };
  };
  const groupBox = (p: ProductLayout) => union([p.box, ...(p.reflection ? [p.reflection] : [])])!;
  let product: ProductLayout | undefined;
  // centred, or under the text on a tall card: the product shares the column with the stack and is sized after it
  const shares = !!nat && !pos.product && (pCentre || pBelow);
  if (nat && !shares) {
    const left = f.productPos === "left";
    const x0 = left ? pPad : W - pPad - pMaxW, x1 = left ? pPad + pMaxW : W - pPad;
    const { t, b } = band(x0, x1);
    const room = pos.product ? H : (b - t - reflGap) / (1 + refl);
    product = productAt(room, (sw) => (left ? pPad : W - pPad - sw),
      (gh) => (f.productPos === "bottom-right" ? b - gh : t + (b - t - gh) / 2));
    if (product?.drawn) boxes.product = product.box;
  }

  // the text column: the margins, minus a product beside the text
  let cx0 = padX, cx1 = W - padX;
  if (baked) {
    // the text takes the larger free room: beside the product (a narrower column, full height) or above / below it
    product = { box: baked, reflection: null, drawn: false };
    const left = baked.x - gapX - padX, right = W - padX - (baked.x + baked.w + gapX);
    const above = baked.y - gapY - safeT, below = safeB - (baked.y + baked.h + gapY);
    if (Math.max(left, right) * (safeB - safeT) >= (W - 2 * padX) * Math.max(above, below)) {
      if (left >= right) cx1 = Math.min(cx1, baked.x - gapX); else cx0 = Math.max(cx0, baked.x + baked.w + gapX);
    } else obstacles.push(baked);
  } else if (product && !pos.product && !pBelow) {
    const pb = groupBox(product);
    // the text keeps to its share of the width; the product's column is the rest
    if (f.productPos === "left") cx0 = Math.max(cx0, pb.x + pb.w + gapX, W * (1 - share));
    else cx1 = Math.min(cx1, pb.x - gapX, W * share);
  }
  const colW = Math.max(1, cx1 - cx0);
  const align = f.textAlignH;
  const anchorX = align === "left" ? cx0 : align === "right" ? cx1 : (cx0 + cx1) / 2;
  const leftOf = (w: number) => (align === "left" ? anchorX : align === "right" ? anchorX - w : anchorX - w / 2);

  // ── the stack's blocks, measured at the column width ──
  type Block = { key: StackKey; w: number; h: number };
  const blocks: Block[] = [];
  let headline: Omit<HeadlineLayout, "box"> | undefined, subtext: Omit<SubtextLayout, "box"> | undefined;
  let price: Omit<PriceLayout, "box"> | undefined, cta: Omit<CtaLayout, "box"> | undefined, trust: Omit<TrustLayout, "box"> | undefined;
  let orphan = false;
  let linesIn = true; // every title / subtitle line within the column, 避頭尾 kept, the blocks within the height
  if (f.headline) {
    const parsed = parseAccentRuns(f.headline);
    const runs = f.cjkSpacing ? autospaceRuns(parsed) : parsed;
    const items = runs.flatMap((r) => Array.from(r.text).map((ch) => ({ ch, accent: r.accent, w: width(hW, hFont, hs, ch, f.letterSpacing) })));
    const wrap = (maxW: number) => wrapChars(items, (i) => i.ch, (l) => l.reduce((sum, i) => sum + i.w, 0) <= maxW, f.kinsoku);
    let lines = wrap(colW);
    // even lines: the narrowest width that still gives this many lines
    if (balance && lines.length > 1) {
      let lo = colW / lines.length, hi = colW;
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (wrap(mid).length > lines.length) lo = mid; else hi = mid; }
      lines = wrap(hi);
    }
    if (!lines.length) lines = [[]];
    const runLines = lines.map((ln) => ln.reduce<AccentRun[]>((acc, c) => {
      const last = acc[acc.length - 1];
      if (last && last.accent === c.accent) last.text += c.ch; else acc.push({ text: c.ch, accent: c.accent });
      return acc;
    }, []));
    // measure = draw: each run as fillText draws it (whole, so kerning counts), not the sum of its characters
    const runW = runLines.map((ln) => ln.map((r) => width(hW, hFont, hs, r.text, f.letterSpacing)));
    const lineWs = runW.map((ws) => ws.reduce((a, b) => a + b, 0));
    const lineH = hs * (f.headlineLineHeight || 1.16);
    const solid = (ln: { ch: string }[]) => ln.filter((c) => c.ch.trim() && !NO_START.has(c.ch) && !NO_END.has(c.ch)).length;
    orphan = lines.length > 1 && lines.some((ln) => solid(ln) < 2);
    headline = { size: hs, lineH, lines: runLines, runW, lineWs };
    linesIn &&= Math.max(...lineWs) <= colW + 0.5 && lines.length * lineH <= safeB - safeT + 0.5 &&
      !(f.kinsoku && kinsokuBroken(lines.map((ln) => ln.map((c) => c.ch).join(""))));
    blocks.push({ key: "headline", w: Math.max(1, ...lineWs), h: lines.length * lineH });
  }
  if (f.subtext) {
    const text = sp(f.subtext), ls = f.bodyLetterSpacing || 0;
    const w = (t: string) => width(bW, font, ss, t, ls);
    let lines: string[];
    if (/[　-鿿豈-﫿]/.test(text)) {
      lines = wrapChars(Array.from(text), (c) => c, (l) => w(l.join("")) <= colW, f.kinsoku).map((l) => l.join(""));
    } else {
      lines = [];
      let cur = "";
      for (const tok of text.split(" ")) {
        const test = cur ? `${cur} ${tok}` : tok;
        if (w(test) <= colW) { cur = test; continue; }
        if (cur) lines.push(cur);
        if (w(tok) <= colW) { cur = tok; continue; }
        // a word wider than the column (a long URL): broken between characters, as no smaller size may help
        const parts = wrapChars(Array.from(tok), (c) => c, (l) => w(l.join("")) <= colW, false).map((l) => l.join(""));
        lines.push(...parts.slice(0, -1));
        cur = parts[parts.length - 1] ?? "";
      }
      if (cur) lines.push(cur);
    }
    if (!lines.length) lines = [text];
    const lineH = ss * (f.bodyLineHeight || 1.32);
    subtext = { size: ss, lineH, lines };
    linesIn &&= Math.max(...lines.map(w)) <= colW + 0.5 && lines.length * lineH <= safeB - safeT + 0.5 && !(f.kinsoku && kinsokuBroken(lines));
    blocks.push({ key: "subtext", w: Math.max(1, ...lines.map(w)), h: lines.length * lineH });
  }
  if (f.showPrice && (f.priceNow || f.priceWas)) {
    const nowSize = Math.round(hs * 0.78), wasSize = Math.round(ss * 0.9);
    const nowW = f.priceNow ? width(700, font, nowSize, f.priceNow) : 0;
    const wasW = f.priceWas ? width(bW, font, wasSize, f.priceWas) : 0;
    const gap = f.priceNow && f.priceWas ? Math.round(nowSize * 0.35) : 0;
    price = { nowSize, wasSize, nowW, wasW, gap };
    blocks.push({ key: "price", w: nowW + gap + wasW, h: nowSize * 1.1 });
  }
  if (f.ctaText) {
    const text = sp(f.ctaText), bf = Math.round(ss * 1.02);
    const tw = width(700, font, bf, text);
    cta = { size: bf, text };
    blocks.push({ key: "cta", w: tw + Math.round(bf * 0.95) * 2, h: bf + Math.round(bf * 0.56) * 2 });
  }
  if (f.trustType !== "none") {
    const tSize = Math.round(ss * 0.88);
    let stars = "", label = "";
    if (f.trustType === "stars" || f.trustType === "reviews") {
      const n = Math.max(0, Math.min(5, Math.round(f.trustStars)));
      stars = "★".repeat(n) + "☆".repeat(5 - n);
      if (f.trustType === "reviews") label = f.trustText || "12,000+ 則好評";
    } else label = "✓ " + (f.trustText || "30 天滿意保證");
    label = sp(label);
    const starW = stars ? width(bW, font, tSize, stars) : 0;
    const labW = label ? width(bW, font, tSize, label) : 0;
    const gap = stars && label ? Math.round(tSize * 0.45) : 0;
    trust = { size: tSize, stars, label, starW, gap };
    blocks.push({ key: "trust", w: starW + gap + labW, h: tSize * 1.1 });
  }

  // ── the stack: the blocks not dragged, top-down, in the free span of the column ──
  const inStack = blocks.filter((b) => !pos[b.key]);
  const stackH = inStack.reduce((sum, b) => sum + b.h, 0) + gapV * Math.max(0, inStack.length - 1);
  const stackW = Math.max(0, ...inStack.map((b) => b.w));
  const sx0 = Math.min(...inStack.map((b) => leftOf(b.w)), anchorX), sx1 = Math.max(...inStack.map((b) => leftOf(b.w) + b.w), anchorX);
  // the product shares the column: centred = above / below the stack by textPos; tall bottom-right = under it, right
  const pX0 = pCentre ? (W - pMaxW) / 2 : belowX(pMaxW), pX1 = pX0 + pMaxW;
  const { t, b } = shares ? band(Math.min(sx0, pX0), Math.max(sx1, pX1)) : band(sx0, sx1);
  const span = b - t;
  let stackTop: number;
  if (shares) {
    const gap = stackH ? gapY : 0;
    const room = (span - stackH - gap - reflGap) / (1 + refl);
    const k = Math.max(0, Math.min(pMaxW / nat!.w, Math.min(H * 0.85, room) / nat!.h));
    const gh = nat!.h * k * (1 + refl) + reflGap;
    let pTop: number;
    if (pBelow) {
      // on the aim's height when that leaves room above for the stack, never past the band's bottom
      pTop = aim ? Math.max(t + stackH + gap, Math.min(b - gh, aim.y * H - gh / 2)) : b - gh;
      const free = pTop - gap - t;
      stackTop = f.textPos === "top" ? t : f.textPos === "bottom" ? pTop - gap - stackH : t + (free - stackH) / 2;
    } else if (f.textPos === "top") { stackTop = t; pTop = t + stackH + gap + (span - stackH - gap - gh) / 2; }
    else if (f.textPos === "bottom") { stackTop = b - stackH; pTop = t + (span - stackH - gap - gh) / 2; }
    else { stackTop = t + (span - stackH - gap - gh) / 2; pTop = stackTop + stackH + gap; }
    product = productAt(room, (sw) => (pCentre ? (W - sw) / 2 : belowX(sw)), () => pTop);
    if (product?.drawn) boxes.product = product.box;
  } else {
    stackTop = f.textPos === "top" ? t : f.textPos === "bottom" ? b - stackH : t + (span - stackH) / 2;
  }
  stackTop = Math.max(t, stackTop);
  const placed: Partial<Record<StackKey, ElemBox>> = {};
  let y = stackTop;
  for (const bl of blocks) {
    const want = pos[bl.key];
    if (want) { placed[bl.key] = dropAt(want, bl.w, bl.h, W, H); continue; }
    placed[bl.key] = { x: leftOf(bl.w), y, w: bl.w, h: bl.h };
    y += bl.h + gapV;
  }
  for (const k of STACK_KEYS) if (placed[k]) boxes[k] = placed[k];
  const stack = inStack.length ? { x: leftOf(stackW), y: stackTop, w: stackW, h: stackH } : null;

  const maxLines = tall ? 3 : 2;
  // price / button / trust rows do not wrap: their width counts like a line's (a dragged block: the canvas width)
  const inRoom = linesIn && stackH <= span + 0.5 && blocks.every((bl) => bl.w <= (pos[bl.key] ? W : colW) + 0.5);
  const fits = inRoom &&
    (headline?.lines.length ?? 0) <= maxLines &&
    (!shares || (stackH <= span * 0.6 && !!product && product.box.h >= H * 0.12));

  const layout: BannerLayout = {
    w: W, h: H, align, padX, padY, headlineSize: hs, subtextSize: ss,
    ...(headline ? { headline: { ...headline, box: placed.headline! } } : {}),
    ...(subtext ? { subtext: { ...subtext, box: placed.subtext! } } : {}),
    ...(price ? { price: { ...price, box: placed.price! } } : {}),
    ...(cta ? { cta: { ...cta, box: placed.cta! } } : {}),
    ...(trust ? { trust: { ...trust, box: placed.trust! } } : {}),
    ...(badge ? { badge } : {}), ...(product ? { product } : {}), ...(logo ? { logo } : {}),
    stack, boxes, textShare: share, belowMin: null,
  };
  return { layout, fits, inRoom, orphan };
}

// ── semantic controls ──

/** The fields that say where an element goes, and the elements each one moves. */
const SEMANTIC: Record<string, readonly ElemKey[]> = {
  textPos: STACK_KEYS, textAlignH: STACK_KEYS, productPos: ["product"], badgePos: ["badge"], logoPos: ["logo"],
};
/** The elements a patch moves (position fields present in it -- pressing the current value counts too). */
export function semanticElems(patch: object): ElemKey[] {
  return [...new Set(Object.keys(patch).flatMap((k) => SEMANTIC[k] ?? []))];
}
/** `positions` without the drags of `elems`. */
export function dropPositions(positions: ElemPositions | undefined, elems: readonly ElemKey[]): ElemPositions {
  const out: ElemPositions = { ...(positions ?? {}) };
  for (const k of elems) delete out[k];
  return out;
}
/** A position button or a template applied: the patch, and the elements it moves lose their drag (else the drag wins
 *  and the button does nothing). Multi-size wiring (R2-B2): apply this to the state being edited (the main size, or the
 *  size being tweaked); when that is the main size, also drop `semanticElems(patch)` from `positions` of every
 *  sizeOverrides[k] that does not set the field itself (those sizes inherit the new value, so their drags must go too). */
export function applySemantic<T extends { positions?: ElemPositions }>(st: T, patch: Partial<T>): T {
  return { ...st, ...patch, positions: dropPositions(patch.positions ?? st.positions, semanticElems(patch)) };
}

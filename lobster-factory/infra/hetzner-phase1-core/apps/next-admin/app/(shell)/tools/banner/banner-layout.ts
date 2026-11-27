// Card R2-A: the banner's layout engine. Pure (node-testable): given the design fields, the canvas size and a way to
// measure text / pictures, it returns every element's box and the title's lines. renderBannerLayers only draws these
// boxes. Invariants: in the automatic layout no two element boxes overlap and all are inside the canvas (corners for the
// badge / logo are reserved first, the product next, the text stack gets what is left); an element the user dragged
// (`positions`) sits where it was dropped and takes no part in the avoidance; a position button / template clears the
// drag of the elements it moves (applySemantic), so a button always shows its effect.

import { clampField, FIELD_RANGES } from "./field-ranges";
import type { BannerFields, ElemBox, ElemKey, ElemPositions } from "./banner-layers";

// ── CJK typesetting (moved here from banner-layers.ts) ──
/** May not start a line (closing punctuation) / may not end one (opening brackets). */
const NO_START = new Set(Array.from("，。、；：！？）」』】〉》〕…‥・％,.;:!?)]}%"));
const NO_END = new Set(Array.from("（「『【〈《〔([{"));
/** Greedy wrap of characters with 避頭尾 (`rules`): a closing mark that does not fit takes the character before it to the
 *  next line (追い出し; no ぶら下げ -- a hung full-width mark is one em past the column, and centred it pushed the line past
 *  both canvas edges, R3 一3); an opening bracket never ends a line. Only when no character is left to go down with the
 *  marks does a line stay wider than `fits` -- the layout measures every line and shrinks the type then. Spaces at the
 *  edges of a wrapped line are dropped (a 中英間距 space must not indent or shift a line). Rules off = the plain greedy wrap. */
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
        if (k < 2) { line = next; continue; } // nothing to take down without emptying the line
        carry = line.splice(k - 1);
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
/** `reflection`: the mirrored part below the product, inside the canvas (null = reflection off). */
export interface ProductLayout { box: ElemBox; reflection: ElemBox | null }
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
}

const STACK_KEYS = ["headline", "subtext", "price", "cta", "trust"] as const;
type StackKey = (typeof STACK_KEYS)[number];

/** Whether the product picture is drawn: not when the active AI background already has it baked in (keyed off
 *  bgImageHasProduct set at generation time, not the live toggle, so flipping it can't double-draw the product). */
export function productShown(f: BannerFields): boolean {
  return !!f.productImage && !(f.bgImageHasProduct && f.bgMode === "ai" && !!f.bgImage);
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

export function layoutBanner(f: BannerFields, size: { w: number; h: number }, measure: LayoutMeasure): BannerLayout {
  const W = size.w, H = size.h, short = Math.min(W, H);
  const fixed = (k: "headlineSize" | "subtextSize") => clampField(k, f[k]) ?? (k === "headlineSize" ? 64 : 32);
  /** The largest title size <= hs (the subtitle scaled with it) at which the title / subtitle fit the column and the
   *  text stack its span -- a size set by hand too; the layout returns the sizes drawn. */
  const settle = (hs: number, ss: number, balance: boolean) => {
    const minH: number = FIELD_RANGES.headlineSize.min;
    const at = (h: number) => compose(f, W, H, measure, h, Math.max(FIELD_RANGES.subtextSize.min, Math.round((ss * h) / hs)), balance);
    const ok = (c: ReturnType<typeof at>) => Math.max(c.over.headline, c.over.subtext, c.over.stack) <= 1;
    const full = at(hs);
    if (ok(full) || hs <= minH) return full.layout;
    let lo = minH, hi = hs; // at(hi) does not fit; at(lo) is the floor whether or not it fits
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ok(at(mid))) lo = mid; else hi = mid; }
    return at(lo).layout;
  };
  if (!f.typeAuto) return settle(fixed("headlineSize"), fixed("subtextSize"), f.balanceTitle);
  // automatic type: the largest title that fits (lines, height), then smaller until no line is a lone character
  const subFor = (hs: number) => Math.max(Math.round(hs * 0.42), Math.round(short * 0.024));
  const at = (hs: number) => compose(f, W, H, measure, hs, subFor(hs), true);
  let lo = Math.max(16, Math.round(short * 0.03)), hi = Math.min(600, Math.round(H * 0.3));
  if (!at(lo).fits) return settle(lo, subFor(lo), true);
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid).fits) lo = mid; else hi = mid; }
  if (at(hi).fits) lo = hi;
  for (let hs = lo; hs >= 16; hs = Math.floor(hs * 0.97)) {
    const c = at(hs);
    if (c.fits && !c.orphan) return c.layout;
    if (hs < lo * 0.6) break;
  }
  return settle(lo, subFor(lo), true);
}

/** `over`: how far the title / subtitle overrun their room -- the widest line over the column width, or the block over
 *  the canvas height between the margins; `stack`: the text stack over its free span (> 1 = drawn past it). */
function compose(f: BannerFields, W: number, H: number, measure: LayoutMeasure, hs: number, ss: number, balance: boolean):
  { layout: BannerLayout; fits: boolean; orphan: boolean; over: { headline: number; subtext: number; stack: number } } {
  const short = Math.min(W, H), tall = H / W > 1.1;
  const pos: ElemPositions = f.positions ?? {};
  const padX = Math.round(W * 0.06), padY = Math.round(Math.min(W * 0.06, H * 0.08));
  const margin = Math.round(W * 0.035);
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
    const box = pos.badge ? dropAt(pos.badge, bw, bh, W, H) : { x: onLeft ? margin : W - margin - bw, y: margin, w: bw, h: bh };
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
      ? badge.box.y + badge.box.h + Math.max(gapY, lh * LOGO_CLEAR) : inset(lh);
    if (lp[0] === "t" && !pos.logo) lh = hOf(Math.max(1, H - inset(lh) - under));
    const lw = lh * aspect;
    const box = pos.logo ? dropAt(pos.logo, lw, lh, W, H) : { x: xAt(lh), y: lp[0] === "t" ? under : H - inset(lh) - lh, w: lw, h: lh };
    // the rest keeps clear of the logo's clear space (a dragged logo takes no part, like every dragged element)
    const c = lh * LOGO_CLEAR;
    if (!pos.logo) obstacles.push({ x: box.x - c, y: box.y - c, w: lw + 2 * c, h: lh + 2 * c });
    logo = { box };
    boxes.logo = box;
  }

  /** The free vertical span for something spanning x0..x1: the margins, minus every obstacle over that span. */
  const band = (x0: number, x1: number, extra: ElemBox[] = []) => {
    let t = padY, b = H - padY;
    for (const o of [...obstacles, ...extra]) {
      if (!overlapX(o, x0, x1)) continue;
      if (o.y + o.h / 2 < H / 2) t = Math.max(t, o.y + o.h + gapY);
      else b = Math.min(b, o.y - gapY);
    }
    return { t, b };
  };

  // product: its size and, beside the text, its place; centred, it shares the column with the stack (placed below)
  const nat = productShown(f) && f.productImage ? picture(measure, f.productImage) : null;
  const g = f.grounding?.reflection;
  const refl = g?.enabled && (g.fade ?? 0.3) > 0 ? Math.max(0, Math.min(1, g.height ?? 0.35)) : 0;
  const reflGap = refl ? Math.max(0, g?.gap ?? 0) : 0;
  const pScale = clampField("productScale", f.productScale) ?? 0.6;
  const pCentre = f.productPos === "center";
  const pBelow = f.productPos === "bottom-right" && tall; // tall: under the text; else beside it
  const pPad = W * 0.05;
  const pMaxW = W * pScale * (pCentre ? 0.7 : 0.45);
  const productAt = (maxH: number, x: (sw: number) => number, top: (gh: number) => number): ProductLayout | undefined => {
    if (!nat) return undefined;
    const k = Math.max(0, Math.min(pMaxW / nat.w, Math.min(H * 0.85, maxH) / nat.h));
    const sw = nat.w * k, sh = nat.h * k, gh = sh * (1 + refl) + reflGap;
    const at = pos.product ? dropAt(pos.product, sw, gh, W, H) : { x: x(sw), y: top(gh), w: sw, h: gh };
    return { box: { x: at.x, y: at.y, w: sw, h: sh }, reflection: refl ? { x: at.x, y: at.y + sh + reflGap, w: sw, h: sh * refl } : null };
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
    if (product) boxes.product = product.box;
  }

  // the text column: the margins, minus a product beside the text
  let cx0 = padX, cx1 = W - padX;
  if (product && !pos.product && !pBelow) {
    const pb = groupBox(product);
    if (f.productPos === "left") cx0 = Math.max(cx0, pb.x + pb.w + gapX); else cx1 = Math.min(cx1, pb.x - gapX);
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
  const over = { headline: 0, subtext: 0, stack: 0 };
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
    over.headline = Math.max(Math.max(...lineWs) / colW, (lines.length * lineH) / (H - 2 * padY));
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
        if (w(test) <= colW) cur = test; else { if (cur) lines.push(cur); cur = tok; }
      }
      if (cur) lines.push(cur);
    }
    if (!lines.length) lines = [text];
    const lineH = ss * (f.bodyLineHeight || 1.32);
    subtext = { size: ss, lineH, lines };
    over.subtext = Math.max(Math.max(...lines.map(w)) / colW, (lines.length * lineH) / (H - 2 * padY));
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
  const pX0 = pCentre ? (W - pMaxW) / 2 : W - pPad - pMaxW, pX1 = pCentre ? (W + pMaxW) / 2 : W - pPad;
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
      pTop = b - gh;
      const free = pTop - gap - t;
      stackTop = f.textPos === "top" ? t : f.textPos === "bottom" ? pTop - gap - stackH : t + (free - stackH) / 2;
    } else if (f.textPos === "top") { stackTop = t; pTop = t + stackH + gap + (span - stackH - gap - gh) / 2; }
    else if (f.textPos === "bottom") { stackTop = b - stackH; pTop = t + (span - stackH - gap - gh) / 2; }
    else { stackTop = t + (span - stackH - gap - gh) / 2; pTop = stackTop + stackH + gap; }
    product = productAt(room, (sw) => (pCentre ? (W - sw) / 2 : W - pPad - sw), () => pTop);
    if (product) boxes.product = product.box;
  } else {
    stackTop = f.textPos === "top" ? t : f.textPos === "bottom" ? b - stackH : t + (span - stackH) / 2;
  }
  stackTop = Math.max(t, stackTop);
  over.stack = stackH > 0 ? stackH / Math.max(1, span) : 0;
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
  // price / button / trust rows do not wrap: they must fit the column too
  const fits = stackH <= span + 0.5 && stackW <= colW + 0.5 && over.headline <= 1 && over.subtext <= 1 &&
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
    stack, boxes,
  };
  return { layout, fits, orphan, over };
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

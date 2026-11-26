// Banner as layers: one drawing (renderBannerLayers) feeds the preview / PNG (composited), the PSD and the SVG, so the three
// never drift. Each part draws on its own full-size canvas in the old single-canvas order; a text part also carries a
// TextSpec, enough to rebuild it as editable text (PSD type layer for PhotoCraft, SVG <text> for VectorCraft).
// Known difference from the pre-split single canvas: the 重點字 plates of ALL title lines now sit under ALL title text
// (before, line 2's plate could cover line 1's glow) -- only with 重點字底色 on and a wrapped title.

import { writePsd, type Psd, type Layer as PsdLayer, type TextStyle, type TextStyleRun } from "ag-psd";
import { groundProduct, type GroundingOpts } from "./product-grounding";

/** The design fields the drawing reads (BannerStudio's State has all of them). */
export interface BannerFields {
  bgMode: "color" | "gradient" | "upload" | "ai";
  bgColor: string; gradFrom: string; gradTo: string; gradAngle: string;
  bgImage: string | null; bgImageHasProduct: boolean;
  dimOverlay: boolean; dimOverlayOpacity: number;
  productImage: string | null; productPos: "center" | "left" | "right" | "bottom-right"; productScale: number;
  headline: string; subtext: string; textColor: string; fontFamily: string; headlineFont: string;
  accentColor: string; accentHighlight: boolean; letterSpacing: number; headlineSize: number; subtextSize: number;
  textPos: "top" | "center" | "bottom"; textAlignH: "left" | "center" | "right";
  textScrim: boolean; textScrimOpacity: number; textOutline: boolean; brandBar: boolean; balanceTitle: boolean;
  ctaText: string; ctaBg: string; ctaTextColor: string;
  badgeText: string; badgeStyle: "ribbon" | "pill" | "burst"; badgeColor: string; badgePos: "tl" | "tr"; badgeScale: number;
  showPrice: boolean; priceNow: string; priceWas: string;
  trustType: "none" | "stars" | "reviews" | "guarantee"; trustStars: number; trustText: string;
  /** Background picture (upload / AI): size as a multiple of "cover" and centre offset as a share of the canvas. */
  bgImgScale: number; bgImgX: number; bgImgY: number;
  /** 文字陰影 (all stack text), CTA 按鈕, 促銷徽章 (null = the style's own default: only the pill has one). */
  textShadow: ShadowSpec; ctaShadow: ShadowSpec; badgeShadow: ShadowSpec | null;
  /** C3 typography: weights (300/400/500/700/900), line height (x font size), body tracking (px), 避頭尾, 中英間距. */
  headlineWeight: number; bodyWeight: number; headlineLineHeight: number; bodyLineHeight: number; bodyLetterSpacing: number;
  kinsoku: boolean; cjkSpacing: boolean;
  /** C4: an element dragged on the preview -> its box centre as a share of the canvas; absent = the automatic layout. */
  positions?: ElemPositions;
  /** C8 (C7 module): contact shadow / reflection / tone match of the product; all off = the plain draw. */
  grounding?: GroundingOpts;
  /** C8 (C6 brand kit): a logo (same-origin data URL) and its width as a share of the canvas width. */
  logoImage?: string | null; logoScale?: number;
}

/** The elements that can be dragged (each moves with all of its layers). */
export const ELEM_KEYS = ["headline", "subtext", "price", "cta", "trust", "product", "badge", "logo"] as const;
export type ElemKey = (typeof ELEM_KEYS)[number];
export type ElemPositions = Partial<Record<ElemKey, { x: number; y: number }>>;
/** An element's drawn box in canvas pixels. */
export interface ElemBox { x: number; y: number; w: number; h: number }

// ── CJK typesetting ──
/** May not start a line (closing punctuation) / may not end one (opening brackets). */
const NO_START = new Set(Array.from("，。、；：！？）」』】〉》〕…‥・％,.;:!?)]}%"));
const NO_END = new Set(Array.from("（「『【〈《〔([{"));
/** Greedy wrap of characters with 避頭尾 (`rules`): a closing mark that no longer fits hangs past the edge (ぶら下げ, one
 *  mark at most); a second one pushes the marks and the character before them to the next line (追い出し); an opening
 *  bracket never ends a line. `fits(line)` = the line is within the width. Spaces at the edges of a wrapped line are
 *  dropped (a 中英間距 space must not indent or shift a line). Rules off = the plain greedy wrap. */
export function wrapChars<T>(items: T[], ch: (t: T) => string, fits: (line: T[]) => boolean, rules: boolean): T[][] {
  const lines: T[][] = [];
  let line: T[] = [];
  for (const it of items) {
    const next = [...line, it];
    if (!line.length || fits(next)) { line = next; continue; }
    const c = ch(it);
    if (rules && NO_START.has(c) && fits(line)) { line = next; continue; } // hang one closing mark
    const carry: T[] = [];
    if (rules) {
      if (NO_START.has(c)) {
        while (line.length > 1 && NO_START.has(ch(line[line.length - 1]))) carry.unshift(line.pop()!);
        if (line.length > 1) carry.unshift(line.pop()!);
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
const CJK_CHAR = /[\u3040-\u30ff\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
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

/** A drop shadow; blur / x / y are shares of the element's height (font size, button height, badge height), so the
 *  look stays the same at every banner size. */
export interface ShadowSpec { on: boolean; color: string; opacity: number; blur: number; x: number; y: number }
/** A shadow in pixels, as drawn. */
export interface LayerShadow { color: string; opacity: number; blur: number; x: number; y: number }

/** Defaults = the look before shadows were settable, so an untouched design draws exactly as before. */
export const DEFAULT_TEXT_SHADOW: ShadowSpec = { on: false, color: "#000000", opacity: 0.5, blur: 0.12, x: 0.03, y: 0.05 };
export const DEFAULT_CTA_SHADOW: ShadowSpec = { on: true, color: "#000000", opacity: 0.32, blur: 0.28, x: 0, y: 0.12 };
export function badgeShadowOf(style: BannerFields["badgeStyle"], spec: ShadowSpec | null): ShadowSpec {
  return spec ?? { on: style === "pill", color: "#000000", opacity: 0.28, blur: 0.25, x: 0, y: 0.1 };
}

function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  return `rgba(${r},${g},${b},${a})`;
}
function applyShadow(ctx: CanvasRenderingContext2D, sh: LayerShadow | undefined) {
  if (!sh) { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; return; }
  ctx.shadowColor = rgba(sh.color, sh.opacity); ctx.shadowBlur = sh.blur; ctx.shadowOffsetX = sh.x; ctx.shadowOffsetY = sh.y;
}

export interface TextRun { text: string; color: string }
/** Editable text as drawn: fixed line breaks, per-run colours, first-line alphabetic baseline at y. */
export interface TextSpec {
  lines: TextRun[][];
  /** The CSS font-family list the canvas used. */
  cssFamily: string;
  /** The family name both pro editors know (EDITOR_FONTS). */
  editorFont: string;
  /** CSS weight (300 細 … 900 特粗). */
  weight: number;
  size: number;
  align: "left" | "center" | "right";
  /** Anchor: left edge / centre / right edge of every line, by `align`. */
  x: number;
  /** Alphabetic baseline of the first line. */
  y: number;
  lineHeight: number;
  letterSpacing: number;
  opacity: number;
  /** Radians about (cx, cy); absent = 0. */
  rotate?: { angle: number; cx: number; cy: number };
}
/** `shadow`: drawn by whoever stacks the layer (composite, PSD effect, SVG filter) -- not in the layer's pixels. */
export interface BannerLayer { name: string; canvas: HTMLCanvasElement; text?: TextSpec; shadow?: LayerShadow }
export interface BannerLayers { w: number; h: number; layers: BannerLayer[]; boxes: Partial<Record<ElemKey, ElemBox>> }

/** Canvas family (first name in the CSS list) -> the family the pro editors ship (scripts/vectorcraft-pro/web-fonts.patch).
 *  楷書 (LXGW WenKai TC) and 圓體 (Huninn / jf-openhuninn) are not in the editors' list -> Noto Sans TC. */
export const EDITOR_FONTS: Record<string, string> = {
  "Noto Sans TC": "Noto Sans TC",
  "Noto Serif TC": "Noto Serif TC",
  "LXGW WenKai TC": "Noto Sans TC",
  "jf-openhuninn": "Noto Sans TC",
  "Huninn": "Noto Sans TC",
  "Inter": "Inter",
  "Montserrat": "Montserrat",
  "Playfair Display": "Playfair Display",
  "Oswald": "Oswald",
  "Bebas Neue": "Bebas Neue",
};
export function editorFont(cssFamily: string): string {
  const first = cssFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return EDITOR_FONTS[first] ?? "Noto Sans TC";
}

// ── drawing helpers (moved from BannerStudio.tsx unchanged) ──

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Decoded-image cache keyed by src -- the preview re-renders on every state change, so re-decoding a 2K bg each time
// would lag. LRU-bounded: a long "generate many AI backgrounds" session would otherwise pin every decoded image.
const _imgCache = new Map<string, HTMLImageElement>();
const _IMG_CACHE_MAX = 12;
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = _imgCache.get(src);
  if (cached?.complete) {
    _imgCache.delete(src); _imgCache.set(src, cached); // touch → most-recent
    return cached;
  }
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => {
      _imgCache.set(src, img);
      while (_imgCache.size > _IMG_CACHE_MAX) {
        const oldest = _imgCache.keys().next().value;
        if (oldest === undefined) break;
        _imgCache.delete(oldest);
      }
      res(img);
    };
    img.onerror = () => rej(new Error("image_load_failed"));
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, noBreakRules = false): string[] {
  const isCjk   = /[　-鿿豈-﫿]/.test(text);
  if (isCjk) {
    const lines = wrapChars(Array.from(text), (c) => c, (l) => ctx.measureText(l.join("")).width <= maxWidth, noBreakRules).map((l) => l.join(""));
    return lines.length ? lines : [text];
  }
  const tokens   = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const tok of tokens) {
    const test = current ? `${current} ${tok}` : tok;
    if (ctx.measureText(test).width <= maxWidth) { current = test; }
    else { if (current) lines.push(current); current = tok; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

// `**字**` → accent runs.
type AccentRun = { text: string; accent: boolean };
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

// Wrap accent runs into lines (char-level — robust for CJK + mixed digits). ctx.font + letterSpacing must be set first.
function layoutAccentLines(ctx: CanvasRenderingContext2D, runs: AccentRun[], maxWidth: number, noBreakRules = false): AccentRun[][] {
  const items = runs.flatMap((r) => Array.from(r.text).map((ch) => ({ ch, accent: r.accent, w: ctx.measureText(ch).width })));
  const lines = wrapChars(items, (i) => i.ch, (l) => l.reduce((sum, i) => sum + i.w, 0) <= maxWidth, noBreakRules)
    .map((ln) => ln.reduce<AccentRun[]>((acc, c) => {
      const last = acc[acc.length - 1];
      if (last && last.accent === c.accent) last.text += c.ch; else acc.push({ text: c.ch, accent: c.accent });
      return acc;
    }, []));
  return lines.length ? lines : [[{ text: "", accent: false }]];
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* unsupported browser — no-op */ }
}

/** How far below the `mode` line (ctx.font set) the alphabetic baseline sits. */
function baselineBelow(ctx: CanvasRenderingContext2D, mode: CanvasTextBaseline, size: number): number {
  const prev = ctx.textBaseline;
  ctx.textBaseline = "alphabetic";
  const a = ctx.measureText("Hg字").fontBoundingBoxAscent;
  ctx.textBaseline = mode;
  const b = ctx.measureText("Hg字").fontBoundingBoxAscent;
  ctx.textBaseline = prev;
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return mode === "top" ? size * 0.88 : mode === "middle" ? size * 0.35 : 0;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}

/** Load the font slices the design's text needs (a no-op where FontFace loading is unavailable, e.g. node tests). */
async function loadDesignFonts(state: BannerFields): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts?.load) return;
  const body = [state.subtext, state.ctaText, state.badgeText, state.priceNow, state.priceWas, state.trustText, "12,000+ 則好評 ✓ 30 天滿意保證 ★☆"].join("");
  const jobs = [
    fonts.load(`${state.headlineWeight || 700} 40px ${state.headlineFont || state.fontFamily}`, state.headline.replace(/\*\*/g, "") || "字"),
    fonts.load(`${state.bodyWeight || 400} 40px ${state.fontFamily}`, body || "字"),
    fonts.load(`700 40px ${state.fontFamily}`, body || "字"),
  ];
  await Promise.race([Promise.all(jobs).catch(() => undefined), new Promise((r) => setTimeout(r, 4000))]);
}

/** Every part of the banner on its own full-size canvas, bottom to top. `flat`: every part on ONE canvas instead (each
 *  part still starts from a fresh context state) -- the PNG / preview: stacking 8-bit layers re-rounds soft shadow edges
 *  (up to 2/255 on ~50 px, measured), and one canvas is also ~15x less memory per preview frame. */
export async function renderBannerLayers(state: BannerFields, size: { w: number; h: number }, opts: { flat?: boolean } = {}): Promise<BannerLayers> {
  await loadDesignFonts(state);
  const p = size;
  const layers: BannerLayer[] = [];
  let flat: CanvasRenderingContext2D | null = null;
  // `shadow`: flat -> drawn now (set on the fresh context); layered -> recorded on the layer, pixels stay shadow-free.
  let pending: { cv: HTMLCanvasElement; sh: LayerShadow } | null = null;
  let scratch: HTMLCanvasElement | null = null; // one reused canvas for flat-mode shadowed layers (one pending at a time)
  const scratchCtx = () => {
    if (!scratch) { scratch = newCanvas(p.w, p.h); scratch.getContext("2d")?.save(); }
    return scratch;
  };
  const flush = () => {
    if (!pending || !flat) return;
    flat.restore(); flat.save(); applyShadow(flat, pending.sh); flat.drawImage(pending.cv, 0, 0);
    pending = null;
  };
  // C4: the offset of the element being drawn (dragged on the preview); every layer made while it is set is translated.
  let shift = { dx: 0, dy: 0 };
  const moved = (c: CanvasRenderingContext2D) => { if (shift.dx || shift.dy) c.translate(shift.dx, shift.dy); return c; };
  // `whole`: the shadow is the shadow of the finished layer (text: glyphs + their outline glow), not of each draw call.
  const layer = (name: string, text?: TextSpec, shadow?: LayerShadow, whole = false): CanvasRenderingContext2D => {
    flush();
    if (flat && shadow && whole) {
      const cv = scratchCtx(), c = cv.getContext("2d");
      if (!c) throw new Error("canvas_unavailable");
      // restore() + save() = a fresh default state for this use (the scratch was saved once when made)
      c.restore(); c.save(); c.clearRect(0, 0, p.w, p.h);
      pending = { cv, sh: shadow };
      return moved(c);
    }
    if (flat) { flat.restore(); flat.save(); applyShadow(flat, shadow); return moved(flat); }
    const cv = newCanvas(p.w, p.h);
    const c = cv.getContext("2d");
    if (!c) throw new Error("canvas_unavailable");
    layers.push({ name, canvas: cv, ...(text ? { text } : {}), ...(shadow && !opts.flat ? { shadow } : {}) });
    if (opts.flat) { flat = c; c.save(); applyShadow(c, shadow); }
    return moved(c);
  };
  // Where a dragged element goes: its box centre at the stored share of the canvas, then kept inside the canvas (a box
  // larger than the canvas is centred). Records the drawn box of every element, dragged or not (preview hit-testing).
  const boxes: Partial<Record<ElemKey, ElemBox>> = {};
  const place = (key: ElemKey, r: ElemBox): { dx: number; dy: number } => {
    const want = state.positions?.[key];
    let dx = 0, dy = 0;
    if (want) {
      const fit = (pos: number, size: number, room: number) => (size >= room ? (room - size) / 2 : Math.max(0, Math.min(room - size, pos)));
      dx = fit(want.x * p.w - r.w / 2, r.w, p.w) - r.x;
      dy = fit(want.y * p.h - r.h / 2, r.h, p.h) - r.y;
    }
    boxes[key] = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
    return { dx, dy };
  };
  const px = (sp: ShadowSpec | null | undefined, unit: number): LayerShadow | undefined =>
    sp && sp.on ? { color: sp.color, opacity: sp.opacity, blur: sp.blur * unit, x: sp.x * unit, y: sp.y * unit } : undefined;
  const mctx = newCanvas(1, 1).getContext("2d"); // measuring only
  if (!mctx) throw new Error("canvas_unavailable");

  // 背景
  let bgSource: HTMLCanvasElement | null = null;
  {
    const ctx = layer("背景");
    bgSource = ctx.canvas;
    if (state.bgMode === "color") {
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, p.w, p.h);
    } else if (state.bgMode === "gradient") {
      const deg    = Number.isFinite(parseFloat(state.gradAngle)) ? parseFloat(state.gradAngle) : 135;
      const rad    = (deg * Math.PI) / 180;
      const cx     = p.w / 2;
      const cy     = p.h / 2;
      const half   = Math.sqrt(cx * cx + cy * cy);
      const grd    = ctx.createLinearGradient(
        cx - Math.cos(rad) * half, cy - Math.sin(rad) * half,
        cx + Math.cos(rad) * half, cy + Math.sin(rad) * half,
      );
      grd.addColorStop(0, state.gradFrom);
      grd.addColorStop(1, state.gradTo);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, p.w, p.h);
    } else if (state.bgImage) {
      const img   = await loadImage(state.bgImage);
      // moved / zoomed by the user (dragged on the preview): what the picture no longer covers shows the background colour
      const k = state.bgImgScale || 1, ox = (state.bgImgX || 0) * p.w, oy = (state.bgImgY || 0) * p.h;
      if (k !== 1 || ox || oy) { ctx.fillStyle = state.bgColor; ctx.fillRect(0, 0, p.w, p.h); }
      const scale = Math.max(p.w / img.width, p.h / img.height) * k;
      const sw    = img.width  * scale;
      const sh    = img.height * scale;
      ctx.drawImage(img, (p.w - sw) / 2 + ox, (p.h - sh) / 2 + oy, sw, sh);
    } else {
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, p.w, p.h);
    }
  }

  if (state.dimOverlay) {
    const ctx = layer("暗化");
    ctx.fillStyle = `rgba(0,0,0,${state.dimOverlayOpacity})`;
    ctx.fillRect(0, 0, p.w, p.h);
  }

  // Skip overlaying the product when the active AI background already has it baked in (keyed off bgImageHasProduct,
  // set at generation time, NOT the live toggle -- so flipping the toggle can't double-draw the product).
  const aiComposited = state.bgImageHasProduct && state.bgMode === "ai" && !!state.bgImage;
  if (state.productImage && !aiComposited) {
    const img  = await loadImage(state.productImage);
    const isCtr = state.productPos === "center";
    const maxW  = p.w * state.productScale * (isCtr ? 0.7 : 0.45);
    const maxH  = p.h * 0.85;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const sw    = img.width  * scale;
    const sh    = img.height * scale;
    const pad   = p.w * 0.05;
    let x: number, y: number;
    switch (state.productPos) {
      case "left":         x = pad;              y = (p.h - sh) / 2;  break;
      case "right":        x = p.w - sw - pad;   y = (p.h - sh) / 2;  break;
      case "bottom-right": x = p.w - sw - pad;   y = p.h - sh - pad;  break;
      default:             x = (p.w - sw) / 2;   y = (p.h - sh) / 2;
    }
    shift = place("product", { x, y, w: sw, h: sh });
    const g = state.grounding;
    if (g?.shadow?.enabled || g?.reflection?.enabled || g?.tone?.enabled) {
      // C7: shadow and reflection under the product, each its own layer (PSD / SVG keep them apart)
      const out = groundProduct({ product: img, box: { x, y, w: sw, h: sh }, canvasW: p.w, canvasH: p.h, background: bgSource ?? undefined, opts: g });
      if (out.shadow) layer("商品陰影").drawImage(out.shadow, 0, 0);
      if (out.reflection) layer("商品倒影").drawImage(out.reflection, 0, 0);
      layer("商品圖").drawImage(out.product, 0, 0);
    } else {
      layer("商品圖").drawImage(img, x, y, sw, sh);
    }
    shift = { dx: 0, dy: 0 };
  }

  // ── unified content stack: headline → subtext → price → CTA → trust ──
  const font     = state.fontFamily;
  const padding  = Math.round(p.w * 0.06);
  const maxWidth = p.w - padding * 2;
  const align    = state.textAlignH;
  const anchorX  = align === "left" ? padding : align === "right" ? p.w - padding : p.w / 2;
  const gapV     = Math.round(state.subtextSize * 0.62);
  const leftOf   = (w: number) => align === "left" ? anchorX : align === "right" ? anchorX - w : anchorX - w / 2;
  const sp = (t: string) => (state.cjkSpacing ? autospace(t) : t);
  const hW = state.headlineWeight || 700, bW = state.bodyWeight || 400;
  const spec = (cssFamily: string, weight: number, sz: number, lines: TextRun[][], al: TextSpec["align"], x: number, y: number,
    extra: Partial<TextSpec> = {}): TextSpec =>
    shifted({ lines, cssFamily, editorFont: editorFont(cssFamily), weight, size: sz, align: al, x, y, lineHeight: sz * 1.2, letterSpacing: 0, opacity: 1, ...extra });
  function shifted(t: TextSpec): TextSpec {
    if (!shift.dx && !shift.dy) return t;
    return { ...t, x: t.x + shift.dx, y: t.y + shift.dy, ...(t.rotate ? { rotate: { ...t.rotate, cx: t.rotate.cx + shift.dx, cy: t.rotate.cy + shift.dy } } : {}) };
  }

  type Block = { key: ElemKey; h: number; w: number; draw: (top: number) => void };
  const blocks: Block[] = [];

  // headline — own font, letter-spacing, accent words (**字**), outlined for legibility
  if (state.headline) {
    const hFont = state.headlineFont || font;
    const fontStr = `${hW} ${state.headlineSize}px ${hFont}`;
    mctx.font = fontStr;
    setLetterSpacing(mctx, state.letterSpacing);
    const parsed = parseAccentRuns(state.headline);
    const runs = state.cjkSpacing ? autospaceRuns(parsed) : parsed;
    let lines = layoutAccentLines(mctx, runs, maxWidth, state.kinsoku);
    // card R3: even lines -- the narrowest width that still gives this many lines (off = the wrap as before)
    if (state.balanceTitle && lines.length > 1) {
      let lo = maxWidth / lines.length, hi = maxWidth;
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (layoutAccentLines(mctx, runs, mid, state.kinsoku).length > lines.length) lo = mid; else hi = mid; }
      lines = layoutAccentLines(mctx, runs, hi, state.kinsoku);
    }
    const runW = lines.map((ln) => ln.map((r) => mctx.measureText(r.text).width));
    const lineWs = runW.map((ws) => ws.reduce((a, b) => a + b, 0));
    const lineH = state.headlineSize * (state.headlineLineHeight || 1.16);
    const w = Math.min(maxWidth, Math.max(1, ...lineWs));
    const below = baselineBelow(mctx, "top", state.headlineSize);
    setLetterSpacing(mctx, 0);
    const plate = (r: AccentRun) => r.accent && state.accentHighlight;
    blocks.push({ key: "headline",
      h: lines.length * lineH, w,
      draw: (top) => {
        const lineX = (i: number) => align === "left" ? anchorX : align === "right" ? anchorX - lineWs[i] : anchorX - lineWs[i] / 2;
        // accent highlight plates (behind the text)
        if (state.accentHighlight && lines.some((ln) => ln.some((r) => r.accent && r.text.trim()))) {
          const ctx = layer("標題重點字底色");
          ctx.fillStyle = state.accentColor;
          lines.forEach((ln, i) => {
            let hx = lineX(i);
            const y = top + i * lineH;
            ln.forEach((r, j) => {
              const rw = runW[i][j];
              if (r.accent && r.text.trim()) {
                roundRectPath(ctx, hx - state.headlineSize * 0.06, y - state.headlineSize * 0.08,
                  rw + state.headlineSize * 0.12, state.headlineSize * 1.22, state.headlineSize * 0.12);
                ctx.fill();
              }
              hx += rw;
            });
          });
        }
        const color = (r: AccentRun) => r.accent ? (plate(r) ? "#1a1a1a" : state.accentColor) : state.textColor;
        const ctx = layer("標題", spec(hFont, hW, state.headlineSize,
          lines.map((ln) => ln.map((r) => ({ text: r.text, color: color(r) }))), align, anchorX, top + below,
          { lineHeight: lineH, letterSpacing: state.letterSpacing }), px(state.textShadow, state.headlineSize), true);
        ctx.font = fontStr;
        setLetterSpacing(ctx, state.letterSpacing);
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        lines.forEach((ln, i) => {
          let x = lineX(i);
          const y = top + i * lineH;
          ln.forEach((r, j) => {
            ctx.fillStyle = color(r);
            if (state.textOutline && !plate(r)) {
              // Two-pass shadow halo: no strokeText (avoid per-stroke outline on CJK)
              ctx.shadowColor = "rgba(0,0,0,0.85)";
              ctx.shadowBlur = state.headlineSize * 0.22;
              ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
              ctx.fillText(r.text, x, y);
              ctx.shadowBlur = state.headlineSize * 0.08;
            }
            ctx.fillText(r.text, x, y);
            ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            x += runW[i][j];
          });
        });
      },
    });
  }

  // subtext
  if (state.subtext) {
    const fontStr = `${bW} ${state.subtextSize}px ${font}`;
    const bodyLs = state.bodyLetterSpacing || 0;
    mctx.font = fontStr;
    setLetterSpacing(mctx, bodyLs);
    const lines = wrapText(mctx, sp(state.subtext), maxWidth, state.kinsoku);
    const lineH = state.subtextSize * (state.bodyLineHeight || 1.32);
    const w = Math.min(maxWidth, Math.max(1, ...lines.map((l) => mctx.measureText(l).width)));
    setLetterSpacing(mctx, 0);
    const below = baselineBelow(mctx, "top", state.subtextSize);
    blocks.push({ key: "subtext",
      h: lines.length * lineH, w,
      draw: (top) => {
        const ctx = layer("副標", spec(font, bW, state.subtextSize, lines.map((l) => [{ text: l, color: state.textColor }]),
          align, anchorX, top + below, { lineHeight: lineH, opacity: 0.95, letterSpacing: bodyLs }), px(state.textShadow, state.subtextSize), true);
        ctx.font = fontStr;
        setLetterSpacing(ctx, bodyLs);
        ctx.textAlign = align; ctx.textBaseline = "top";
        let y = top;
        for (const line of lines) {
          if (state.textOutline) { ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = state.subtextSize * 0.18; }
          ctx.fillStyle = state.textColor;
          ctx.globalAlpha = 0.95;
          ctx.fillText(line, anchorX, y);
          ctx.globalAlpha = 1; ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
          y += lineH;
        }
      },
    });
  }

  // price row (now big bold + was struck-through)
  if (state.showPrice && (state.priceNow || state.priceWas)) {
    const nowSize = Math.round(state.headlineSize * 0.78);
    const wasSize = Math.round(state.subtextSize * 0.9);
    mctx.font = `bold ${nowSize}px ${font}`;
    const nowW = state.priceNow ? mctx.measureText(state.priceNow).width : 0;
    mctx.font = `${bW} ${wasSize}px ${font}`;
    const wasW = state.priceWas ? mctx.measureText(state.priceWas).width : 0;
    const gapP = state.priceNow && state.priceWas ? Math.round(nowSize * 0.35) : 0;
    const rowW = nowW + gapP + wasW;
    blocks.push({ key: "price",
      h: nowSize * 1.1, w: rowW,
      draw: (top) => {
        let x = leftOf(rowW);
        const baseY = top + nowSize;
        if (state.priceNow) {
          const ctx = layer("現價", spec(font, 700, nowSize, [[{ text: state.priceNow, color: state.textColor }]], "left", x, baseY), px(state.textShadow, nowSize), true);
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          ctx.font = `bold ${nowSize}px ${font}`;
          ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = nowSize * 0.12;
          ctx.fillStyle = state.textColor;
          ctx.fillText(state.priceNow, x, baseY);
          x += nowW + gapP;
        }
        if (state.priceWas) {
          const wy = baseY;
          const ctx = layer("原價", spec(font, bW, wasSize, [[{ text: state.priceWas, color: state.textColor }]], "left", x, wy, { opacity: 0.7 }), px(state.textShadow, wasSize), true);
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          ctx.font = `${bW} ${wasSize}px ${font}`;
          ctx.fillStyle = state.textColor; ctx.globalAlpha = 0.7;
          ctx.fillText(state.priceWas, x, wy);
          const st = layer("原價刪除線");
          st.globalAlpha = 0.7;
          st.strokeStyle = state.textColor;
          st.lineWidth = Math.max(2, wasSize * 0.08);
          st.beginPath();
          st.moveTo(x, wy - wasSize * 0.32);
          st.lineTo(x + wasW, wy - wasSize * 0.32);
          st.stroke();
        }
      },
    });
  }

  // CTA button (the conversion driver)
  if (state.ctaText) {
    const ctaText = sp(state.ctaText);
    const bf   = Math.round(state.subtextSize * 1.02);
    mctx.font = `bold ${bf}px ${font}`;
    const tw   = mctx.measureText(ctaText).width;
    const below = baselineBelow(mctx, "middle", bf);
    const padX = Math.round(bf * 0.95);
    const padY = Math.round(bf * 0.56);
    const bw   = tw + padX * 2;
    const bh   = bf + padY * 2;
    blocks.push({ key: "cta",
      h: bh, w: bw,
      draw: (top) => {
        const left = leftOf(bw);
        const bg = layer("按鈕底", undefined, px(state.ctaShadow ?? DEFAULT_CTA_SHADOW, bh));
        roundRectPath(bg, left, top, bw, bh, bh / 2);
        bg.fillStyle = state.ctaBg; bg.fill();
        const cx = left + bw / 2, my = top + bh / 2 + bf * 0.06;
        const ctx = layer("按鈕文字", spec(font, 700, bf, [[{ text: ctaText, color: state.ctaTextColor }]], "center", cx, my + below));
        ctx.fillStyle = state.ctaTextColor;
        ctx.font = `bold ${bf}px ${font}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(ctaText, cx, my);
      },
    });
  }

  // trust signals
  if (state.trustType !== "none") {
    const tSize = Math.round(state.subtextSize * 0.88);
    let starsStr = "";
    let label = "";
    if (state.trustType === "stars" || state.trustType === "reviews") {
      const n = Math.max(0, Math.min(5, Math.round(state.trustStars)));
      starsStr = "★".repeat(n) + "☆".repeat(5 - n);
      if (state.trustType === "reviews") label = state.trustText || "12,000+ 則好評";
    } else {
      label = "✓ " + (state.trustText || "30 天滿意保證");
    }
    label = sp(label);
    mctx.font = `${bW} ${tSize}px ${font}`;
    const starW = starsStr ? mctx.measureText(starsStr).width : 0;
    const labW  = label ? mctx.measureText(label).width : 0;
    const gapT  = starsStr && label ? Math.round(tSize * 0.45) : 0;
    const rowW  = starW + gapT + labW;
    blocks.push({ key: "trust",
      h: tSize * 1.1, w: rowW,
      draw: (top) => {
        let x = leftOf(rowW);
        const by = top + tSize;
        if (starsStr) {
          const ctx = layer("星星", spec(font, bW, tSize, [[{ text: starsStr, color: "#fbbf24" }]], "left", x, by), px(state.textShadow, tSize), true);
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = `${bW} ${tSize}px ${font}`;
          ctx.fillStyle = "#fbbf24"; ctx.fillText(starsStr, x, by); x += starW + gapT;
        }
        if (label) {
          const ctx = layer("信任說明", spec(font, bW, tSize, [[{ text: label, color: state.textColor }]], "left", x, by, { opacity: 0.92 }), px(state.textShadow, tSize), true);
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = `${bW} ${tSize}px ${font}`;
          ctx.fillStyle = state.textColor; ctx.globalAlpha = 0.92; ctx.fillText(label, x, by);
        }
      },
    });
  }

  // position the whole stack
  const stackH = blocks.reduce((sum, b) => sum + b.h, 0) + gapV * Math.max(0, blocks.length - 1);
  let stackTop = state.textPos === "top" ? padding
    : state.textPos === "bottom" ? p.h - padding - stackH
    : (p.h - stackH) / 2;
  stackTop = Math.max(padding, stackTop);
  // each block keeps its slot in the automatic stack (dragging one never moves the others) and is offset from there
  let slotY = stackTop;
  const placed = blocks.map((b) => {
    const top = slotY;
    slotY += b.h + gapV;
    return { b, top, off: place(b.key, { x: leftOf(b.w), y: top, w: b.w, h: b.h }) };
  });
  // The stack's box (scrim, brand bar): the automatic one; once something was dragged out, the union of the blocks still
  // in the stack (a dragged block leaves the stack and its backing behind); none left = no scrim / bar.
  let stackBox: ElemBox | null = blocks.length
    ? { x: leftOf(Math.max(...blocks.map((b) => b.w))), y: stackTop, w: Math.max(...blocks.map((b) => b.w)), h: stackH } : null;
  if (placed.some((q) => state.positions?.[q.b.key])) {
    const bs = placed.filter((q) => !state.positions?.[q.b.key]).map((q) => boxes[q.b.key]!);
    if (!bs.length) stackBox = null;
    else {
      const l = Math.min(...bs.map((b) => b.x)), t = Math.min(...bs.map((b) => b.y));
      stackBox = { x: l, y: t, w: Math.max(...bs.map((b) => b.x + b.w)) - l, h: Math.max(...bs.map((b) => b.y + b.h)) - t };
    }
  }

  // localized scrim behind the stack (cleaner than dimming the whole image)
  if (state.textScrim && stackBox) {
    const sPadX = Math.round(state.subtextSize * 0.95);
    const sPadY = Math.round(state.subtextSize * 0.75);
    const sx = Math.max(0, stackBox.x - sPadX);
    const sw = Math.min(p.w - sx, stackBox.w + sPadX * 2);
    const sy = Math.max(0, stackBox.y - sPadY);
    const sh = Math.min(p.h - sy, stackBox.h + sPadY * 2);
    const ctx = layer("文字底襯");
    ctx.fillStyle = `rgba(0,0,0,${state.textScrimOpacity})`;
    roundRectPath(ctx, sx, sy, sw, sh, Math.round(state.subtextSize * 0.6));
    ctx.fill();
  }

  // card R3: the brand colour bar beside a left-aligned stack, the stack's height, in the left margin
  if (state.brandBar && stackBox && align === "left") {
    const barW = Math.max(6, Math.round(state.headlineSize * 0.12));
    const ctx = layer("品牌色條");
    ctx.fillStyle = state.accentColor;
    roundRectPath(ctx, Math.round(padding * 0.55), stackBox.y, barW, stackBox.h, barW / 2);
    ctx.fill();
  }

  // draw stack top-down
  for (const q of placed) { shift = q.off; q.b.draw(q.top); shift = { dx: 0, dy: 0 }; }

  // C8: the brand logo (bottom-left by default; draggable like the rest)
  if (state.logoImage) {
    const img = await loadImage(state.logoImage);
    const lw = p.w * Math.max(0.04, Math.min(0.6, state.logoScale ?? 0.16)), lh = (lw * img.height) / Math.max(1, img.width);
    const m = Math.round(p.w * 0.035);
    const r = { x: m, y: p.h - m - lh, w: lw, h: lh };
    shift = place("logo", r);
    layer("Logo").drawImage(img, r.x, r.y, r.w, r.h);
    shift = { dx: 0, dy: 0 };
  }

  // corner offer badge (independent of the stack)
  if (state.badgeText) {
    const badgeText = sp(state.badgeText);
    const bf = Math.round(state.subtextSize * 0.95 * state.badgeScale);
    const margin = Math.round(p.w * 0.035);
    mctx.font = `bold ${bf}px ${font}`;
    const tw = mctx.measureText(badgeText).width;
    const onLeft = state.badgePos === "tl";
    const badgeSh = px(badgeShadowOf(state.badgeStyle, state.badgeShadow), bf * 1.9);
    const white = (fs: number, x: number, y: number, extra: Partial<TextSpec> = {}) => {
      mctx.font = `bold ${fs}px ${font}`;
      const below = baselineBelow(mctx, "middle", fs);
      const ctx = layer("角標文字", spec(font, 700, fs, [[{ text: badgeText, color: "#ffffff" }]], "center", x, y + below, extra));
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${fs}px ${font}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      return ctx;
    };
    if (state.badgeStyle === "burst") {
      const r = Math.max(bf * 1.9, tw * 0.62 + bf * 0.4);
      const cxb = onLeft ? margin + r : p.w - margin - r;
      const cyb = margin + r;
      const angle = (onLeft ? -1 : 1) * 0.18;
      shift = place("badge", { x: cxb - r, y: cyb - r, w: r * 2, h: r * 2 });
      const ctx = layer("角標底", undefined, badgeSh);
      ctx.translate(cxb, cyb);
      ctx.rotate(angle);
      ctx.beginPath();
      const spikes = 16;
      for (let i = 0; i < spikes * 2; i++) {
        const rr = i % 2 === 0 ? r : r * 0.84;
        const a = (Math.PI / spikes) * i - Math.PI / 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = state.badgeColor; ctx.fill();
      const fit = Math.round(Math.min(bf, (r * 1.5) / Math.max(1, tw / bf)));
      const t = white(fit, cxb, cyb, { rotate: { angle, cx: cxb, cy: cyb } });
      t.translate(cxb, cyb);
      t.rotate(angle);
      t.fillText(badgeText, 0, 0);
    } else if (state.badgeStyle === "ribbon") {
      const padX = bf * 0.7, bh = bf * 1.9, notch = bh * 0.45;
      const bw = tw + padX * 2 + notch;
      const x = onLeft ? margin : p.w - margin - bw;
      const y = margin;
      shift = place("badge", { x, y, w: bw, h: bh });
      const ctx = layer("角標底", undefined, badgeSh);
      ctx.fillStyle = state.badgeColor;
      ctx.beginPath();
      if (onLeft) {
        ctx.moveTo(x, y); ctx.lineTo(x + bw, y);
        ctx.lineTo(x + bw - notch, y + bh / 2); ctx.lineTo(x + bw, y + bh);
        ctx.lineTo(x, y + bh);
      } else {
        ctx.moveTo(x + bw, y); ctx.lineTo(x, y);
        ctx.lineTo(x + notch, y + bh / 2); ctx.lineTo(x, y + bh);
        ctx.lineTo(x + bw, y + bh);
      }
      ctx.closePath(); ctx.fill();
      const tx = onLeft ? x + (bw - notch) / 2 : x + notch + (bw - notch) / 2;
      white(bf, tx, y + bh / 2).fillText(badgeText, tx, y + bh / 2);
    } else {
      // pill
      const padX = bf * 0.8, bh = bf * 1.9, bw = tw + padX * 2;
      const x = onLeft ? margin : p.w - margin - bw;
      const y = margin;
      shift = place("badge", { x, y, w: bw, h: bh });
      const ctx = layer("角標底", undefined, badgeSh);
      roundRectPath(ctx, x, y, bw, bh, bh / 2);
      ctx.fillStyle = state.badgeColor; ctx.fill();
      white(bf, x + bw / 2, y + bh / 2).fillText(badgeText, x + bw / 2, y + bh / 2);
    }
  }

  shift = { dx: 0, dy: 0 };
  flush();
  if (flat) (flat as CanvasRenderingContext2D).restore();
  return { w: p.w, h: p.h, layers, boxes };
}

/** All layers stacked bottom to top on one canvas (source-over, as the old single canvas drew them). */
export function compositeLayers(doc: BannerLayers): HTMLCanvasElement {
  const cv = newCanvas(doc.w, doc.h);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  for (const l of doc.layers) { applyShadow(ctx, l.shadow); ctx.drawImage(l.canvas, 0, 0); }
  return cv;
}

// ── editable exports ──
// Pure over RGBA pixels (RasterDoc) so node tests can run them; rasterize() is the browser step.

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export interface RasterLayer { name: string; pixels: Pixels; text?: TextSpec; shadow?: LayerShadow }
export interface RasterDoc { w: number; h: number; layers: RasterLayer[]; composite: Pixels }
export interface Box { left: number; top: number; right: number; bottom: number }

function pixelsOf(cv: HTMLCanvasElement): Pixels {
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  const d = ctx.getImageData(0, 0, cv.width, cv.height);
  return { width: d.width, height: d.height, data: d.data };
}
export function rasterize(doc: BannerLayers): RasterDoc {
  return {
    w: doc.w, h: doc.h,
    layers: doc.layers.map((l) => ({ name: l.name, pixels: pixelsOf(l.canvas), ...(l.text ? { text: l.text } : {}), ...(l.shadow ? { shadow: l.shadow } : {}) })),
    composite: pixelsOf(compositeLayers(doc)),
  };
}

/** Bounds of the non-transparent pixels (right/bottom exclusive); null = fully transparent. */
export function opaqueBox(px: Pixels): Box | null {
  const { width: w, height: h, data } = px;
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}
export function cropPixels(px: Pixels, b: Box): Pixels {
  const w = b.right - b.left, h = b.bottom - b.top;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((b.top + y) * px.width + b.left) * 4;
    out.set(px.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

// XML 1.0 forbids most C0 controls (a Word soft return  pasted into a title would make the SVG unreadable): drop them.
const esc = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => String(Math.round(n * 100) / 100);
const GENERIC: Record<string, string> = { "Noto Serif TC": "serif", "Playfair Display": "serif" };

/** SVG text element for a TextSpec: one <tspan> per line (x, y), a nested <tspan fill> per differently coloured run. */
export function textToSvg(t: TextSpec): string {
  const base = t.lines[0]?.[0]?.color ?? "#000000";
  const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
  const attrs = [
    `font-family="${esc(`'${t.editorFont}', ${GENERIC[t.editorFont] ?? "sans-serif"}`)}"`,
    `font-size="${num(t.size)}"`, `font-weight="${t.weight}"`, `fill="${esc(base)}"`, `text-anchor="${anchor}"`,
    t.letterSpacing ? `letter-spacing="${num(t.letterSpacing)}"` : "",
    t.opacity < 1 ? `opacity="${num(t.opacity)}"` : "",
    t.rotate ? `transform="rotate(${num((t.rotate.angle * 180) / Math.PI)} ${num(t.rotate.cx)} ${num(t.rotate.cy)})"` : "",
    `xml:space="preserve"`,
  ].filter(Boolean).join(" ");
  const lines = t.lines.map((ln, i) => {
    const inner = ln.map((r) => (r.color === base ? esc(r.text) : `<tspan fill="${esc(r.color)}">${esc(r.text)}</tspan>`)).join("");
    return `<tspan x="${num(t.x)}" y="${num(t.y + i * t.lineHeight)}">${inner}</tspan>`;
  }).join("");
  return `<text ${attrs}>${lines}</text>`;
}

/** Layered SVG (Inkscape layers, which VectorCraft imports as layers): pixel parts = a cropped PNG <image>, text = <text>. */
export function buildBannerSvg(doc: RasterDoc, encodePng: (px: Pixels) => string): string {
  const groups = doc.layers.map((l, i) => {
    let body = "";
    if (l.text) body = textToSvg(l.text);
    else {
      const b = opaqueBox(l.pixels);
      if (b) body = `<image x="${b.left}" y="${b.top}" width="${b.right - b.left}" height="${b.bottom - b.top}" href="${encodePng(cropPixels(l.pixels, b))}"/>`;
    }
    const sh = l.shadow;
    const filter = sh
      ? `<filter id="shadow${i + 1}" filterUnits="userSpaceOnUse" x="0" y="0" width="${doc.w}" height="${doc.h}" color-interpolation-filters="sRGB">` +
        `<feDropShadow dx="${num(sh.x)}" dy="${num(sh.y)}" stdDeviation="${num(sh.blur / 2)}" flood-color="${esc(sh.color)}" flood-opacity="${num(sh.opacity)}"/></filter>`
      : "";
    return `${filter}<g id="layer${i + 1}" inkscape:groupmode="layer" inkscape:label="${esc(l.name)}"${sh ? ` filter="url(#shadow${i + 1})"` : ""}>${body}</g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${doc.w}" height="${doc.h}" viewBox="0 0 ${doc.w} ${doc.h}">\n${groups}\n</svg>\n`;
}

function rgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}

/** ag-psd text data for a TextSpec: point text whose origin (transform) is the first line's anchor on its baseline. */
export function textToPsd(t: TextSpec): NonNullable<PsdLayer["text"]> {
  const style = (color: string): TextStyle => ({
    font: { name: t.editorFont }, fontSize: t.size, fauxBold: t.weight >= 600, fillColor: rgb(color),
    tracking: Math.round((t.letterSpacing / t.size) * 1000), autoLeading: false, leading: t.lineHeight,
  });
  const runs: { length: number; color: string }[] = [];
  let text = "";
  t.lines.forEach((ln, i) => {
    const nl = i < t.lines.length - 1 ? "\n" : "";
    ln.forEach((r, j) => {
      const s = r.text + (j === ln.length - 1 ? nl : "");
      text += s;
      const last = runs[runs.length - 1];
      if (last && last.color === r.color) last.length += s.length;
      else runs.push({ length: s.length, color: r.color });
    });
  });
  const styleRuns: TextStyleRun[] = runs.map((r) => ({ length: r.length, style: style(r.color) }));
  const a = t.rotate?.angle ?? 0, cos = Math.cos(a), sin = Math.sin(a);
  let ox = t.x, oy = t.y;
  if (t.rotate) {
    const dx = t.x - t.rotate.cx, dy = t.y - t.rotate.cy;
    ox = t.rotate.cx + dx * cos - dy * sin; oy = t.rotate.cy + dx * sin + dy * cos;
  }
  return {
    text,
    transform: [cos, sin, -sin, cos, ox, oy],
    style: style(t.lines[0]?.[0]?.color ?? "#000000"),
    styleRuns,
    paragraphStyle: { justification: t.align },
  };
}

/** Layered PSD: pixel layers as they are (cropped), text layers = editable type + their pixels as the cached render. */
export function buildBannerPsd(doc: RasterDoc): ArrayBuffer {
  const children: PsdLayer[] = doc.layers.map((l) => {
    const b = opaqueBox(l.pixels);
    const out: PsdLayer = { name: l.name };
    if (b) {
      let px = cropPixels(l.pixels, b);
      // text opacity is the layer's in a PSD: take it out of the cached pixels so the cache is not dimmed twice
      if (l.text && l.text.opacity < 1) {
        const k = 1 / l.text.opacity, d = new Uint8ClampedArray(px.data);
        for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, Math.round(d[i] * k));
        px = { ...px, data: d };
      }
      Object.assign(out, { left: b.left, top: b.top, right: b.right, bottom: b.bottom, imageData: px });
    }
    if (l.text) { out.text = textToPsd(l.text); if (l.text.opacity < 1) out.opacity = l.text.opacity; }
    if (l.shadow) {
      const { x, y, blur, color, opacity } = l.shadow;
      out.effects = { dropShadow: [{
        enabled: true, present: true, showInDialog: true, blendMode: "normal", color: rgb(color), opacity,
        angle: Math.round((Math.atan2(y, -x) * 180) / Math.PI), useGlobalLight: false,
        distance: { units: "Pixels", value: Math.round(Math.hypot(x, y)) }, size: { units: "Pixels", value: Math.round(blur) },
      }] };
    }
    return out;
  });
  const psd: Psd = { width: doc.w, height: doc.h, imageData: doc.composite, children };
  return writePsd(psd, { noBackground: true });
}

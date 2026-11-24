// Article-cover layout B (K24): picture on top, a solid band below with a title (≤2 lines) and a subtitle (1 line).
// Pure: no I/O. Everything is a proportion of width/height, so 4:3 (1200×900) and portrait 4:5 use the same rules.
// Text width is ESTIMATED (no font metrics on the host): full-width 1em, half-width 0.55em, 8% spare, as make-image.ts
// estimated it; the real glyphs can differ a little per font, which the spare absorbs.

export interface Rect { x: number; y: number; width: number; height: number }
export interface TextLine { text: string; x: number; y: number }

export interface CoverLayout {
  width: number;
  height: number;
  image: Rect;
  band: Rect;
  title: { fontSize: number; lines: TextLine[] };
  subtitle: { fontSize: number; line: TextLine } | null;
}

const BAND_RATIO = 0.25;
const MARGIN_RATIO = 0.06;
const TITLE_MAX_RATIO = 0.05;
const TITLE_MIN_RATIO = 0.032;
const SUB_MIN_RATIO = 0.022;
const TITLE_LH = 1.2;
const SUB_LH = 1.25;
const SPARE = 0.92;
const ELLIPSIS = "…";

const FULL_WIDTH = /[ᄀ-ᅟ…⺀-〿぀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{10000}-\u{10FFFF}]/u;
/** Never the first character of a line (Chinese line-breaking rule; Latin closers included). */
const NO_LINE_START = /^[，。、．！？：；）」』】》〉〕｝’”…‧・·%,.!?:;)\]}]/;

const cps = (s: string) => Array.from(s);
const isFull = (ch: string) => FULL_WIDTH.test(ch);
export function estimateWidth(s: string, fontSize: number): number {
  return cps(s).reduce((w, ch) => w + (isFull(ch) ? 1 : 0.55), 0) * fontSize;
}
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

/** Break units: one per full-width character, one per Latin word, " " between words. */
function units(s: string): string[] {
  const out: string[] = [];
  let word = "";
  const flush = () => { if (word) { out.push(word); word = ""; } };
  for (const ch of cps(s)) {
    if (ch === " ") { flush(); out.push(" "); }
    else if (isFull(ch)) { flush(); out.push(ch); }
    else word += ch;
  }
  flush();
  return out;
}

/** Greedy wrap at `fontSize` into lines no wider than `maxWidth` (with the spare). */
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const budget = maxWidth * SPARE;
  const fits = (s: string) => estimateWidth(s.trimEnd(), fontSize) <= budget;
  const queue = units(normalize(text));
  const lines: string[][] = [];
  let cur: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === " ") { if (cur.length) cur.push(u); continue; }
    if (fits(cur.join("") + u)) { cur.push(u); continue; }
    if (!cur.length) {                       // one word wider than the line: break it by character
      const chars = cps(u);
      if (chars.length === 1) { cur.push(u); continue; }
      queue.unshift(...chars);
      continue;
    }
    while (cur.length && cur[cur.length - 1] === " ") cur.pop();
    const next = [u];
    // A closing mark may not open a line: carry the last unit of this line down with it.
    if (NO_LINE_START.test(u) && cur.length > 1) next.unshift(cur.pop()!);
    lines.push(cur);
    cur = next;
  }
  while (cur.length && cur[cur.length - 1] === " ") cur.pop();
  if (cur.length) lines.push(cur);
  return lines.map((l) => l.join(""));
}

/** Cut `text` to one line, ending in "…" when it had to be cut. */
export function truncateLine(text: string, fontSize: number, maxWidth: number): string {
  const budget = maxWidth * SPARE;
  const t = normalize(text);
  if (estimateWidth(t, fontSize) <= budget) return t;
  const chars = cps(t);
  while (chars.length) {
    chars.pop();
    while (chars.length && (chars[chars.length - 1] === " " || NO_LINE_START.test(chars[chars.length - 1]))) chars.pop();
    const s = chars.join("") + ELLIPSIS;
    if (estimateWidth(s, fontSize) <= budget) return s;
  }
  return ELLIPSIS;
}

export function layoutCover(i: { width: number; height: number; title: string; subtitle?: string }): CoverLayout {
  const { width: W, height: H } = i;
  const title = normalize(i.title ?? "");
  if (!title) throw new Error("cover_title_required");
  const subtitle = normalize(i.subtitle ?? "");

  const bandH = Math.round(H * BAND_RATIO);
  const image: Rect = { x: 0, y: 0, width: W, height: H - bandH };
  const band: Rect = { x: 0, y: H - bandH, width: W, height: bandH };
  const margin = Math.round(W * MARGIN_RATIO);
  const maxWidth = W - 2 * margin;
  const padY = Math.round(bandH * 0.12);
  const avail = bandH - 2 * padY;
  const maxSize = Math.round(W * TITLE_MAX_RATIO);
  const minSize = Math.round(W * TITLE_MIN_RATIO);
  const subSize = (t: number) => Math.max(Math.round(W * SUB_MIN_RATIO), Math.round(t * 0.55));
  const gap = (t: number) => Math.round(t * 0.3);
  const blockH = (n: number, t: number) => n * t * TITLE_LH + (subtitle ? gap(t) + subSize(t) * SUB_LH : 0);

  // Largest size where the title takes ≤2 lines and the block fits the band; else the minimum, line 2 cut with "…".
  let size = minSize;
  let lines: string[] | null = null;
  for (let t = maxSize; t >= minSize; t--) {
    const l = wrapText(title, t, maxWidth);
    if (l.length <= 2 && blockH(l.length, t) <= avail) { size = t; lines = l; break; }
  }
  if (!lines) {
    const l = wrapText(title, size, maxWidth);
    lines = l.length <= 2 ? l : [l[0], truncateLine(title.slice(l[0].length), size, maxWidth)];
  }

  const top = band.y + (bandH - blockH(lines.length, size)) / 2;
  const baseline = (boxTop: number, s: number, lh: number) => Math.round(boxTop + (s * lh - s) / 2 + s * 0.86);
  const titleLines = lines.map((text, n) => ({ text, x: margin, y: baseline(top + n * size * TITLE_LH, size, TITLE_LH) }));
  let sub: CoverLayout["subtitle"] = null;
  if (subtitle) {
    const s = subSize(size);
    const boxTop = top + lines.length * size * TITLE_LH + gap(size);
    sub = { fontSize: s, line: { text: truncateLine(subtitle, s, maxWidth), x: margin, y: baseline(boxTop, s, SUB_LH) } };
  }
  return { width: W, height: H, image, band, title: { fontSize: size, lines: titleLines }, subtitle: sub };
}

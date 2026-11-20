/**
 * Where a cover's title goes (compositions/Cover.tsx), as a pure function so it is tested without a browser.
 * Invariant: every title line stays inside its ratio's safe area. Lines are broken here (the composition draws each
 * with white-space: pre, so the browser never re-wraps), widths are an OVER-estimate per character (charEm), so the
 * real line is never wider than the estimate. Too long a title: the size steps down to TITLE_MIN, then the last
 * line that fits ends in "…".
 */
import { TITLE_LETTER_SPACING_EM, TITLE_LINE_HEIGHT } from "./brand";

export interface SafeArea { top: number; right: number; bottom: number; left: number }
export interface CoverFormat { width: number; height: number; safe: SafeArea; maxLines: number }

// Fractions of the frame kept clear of each platform's own overlays.
export const COVER_FORMATS: Record<string, CoverFormat> = {
  // YouTube: the length badge sits bottom-right.
  "16x9": { width: 1920, height: 1080, safe: { top: 0.08, right: 0.06, bottom: 0.14, left: 0.06 }, maxLines: 3 },
  // Reels / Shorts / TikTok: header ~12 % on top, caption + profile row ~30 % at the bottom, action column ~16 % right.
  "9x16": { width: 1080, height: 1920, safe: { top: 0.12, right: 0.16, bottom: 0.3, left: 0.06 }, maxLines: 5 },
  // Instagram feed: the profile grid shows the middle 3:4 (about 3 % off each side).
  "4x5": { width: 1080, height: 1350, safe: { top: 0.08, right: 0.09, bottom: 0.1, left: 0.09 }, maxLines: 4 },
  "1x1": { width: 1080, height: 1080, safe: { top: 0.08, right: 0.08, bottom: 0.1, left: 0.08 }, maxLines: 3 },
};
const TITLE_MAX = 0.12, TITLE_MIN = 0.06, SUB_MIN = 0.035, SUB_RATIO = 0.42, SUB_GAP = 0.35, BLOCK_SHARE = 0.6;

/** The format whose aspect matches width x height within 1 %; null = no cover layout for that shape. */
export function coverFormatKey(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  for (const [key, f] of Object.entries(COVER_FORMATS))
    if (Math.abs(width / height / (f.width / f.height) - 1) <= 0.01) return key;
  return null;
}

const CJK = /[⺀-鿿가-힯豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3ffff}]/u;
/** Width of one character in em, rounded UP from the widest bold sans glyph of its class. */
export function charEm(c: string): number {
  if (c === " ") return 0.3;
  if (CJK.test(c)) return 1;
  if (/[MWmw@%&]/.test(c)) return 1;
  if (/[A-Z]/.test(c)) return 0.75;
  if (/[a-z0-9]/.test(c)) return 0.62;
  if (/[\x21-\x7e]/.test(c)) return 0.45;
  if (/\p{L}/u.test(c)) return 0.8;
  return 1.2; // emoji and the rest
}
export const textEm = (s: string): number => Array.from(s).reduce((n, c) => n + charEm(c) + TITLE_LETTER_SPACING_EM, 0);

// Each CJK character is its own token (a line may break between any two); Latin words and space runs stay whole.
const tokens = (s: string): string[] => s.match(/\s+|[⺀-鿿가-힯豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{3ffff}]|[^\s⺀-鿿가-힯豈-﫿︰-﹏＀-￯\u{20000}-\u{3ffff}]+/gu) ?? [];
// Never at the start of a line (Chinese and Latin closing punctuation).
const NO_START = /^[，。、！？：；）」』》〉】…—,.!?:;)\]}%]/;

/** Greedy line breaking at `limit` em; every returned line has textEm <= limit (limit >= 2 em). */
export function wrapLines(text: string, limit: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => {
    const l = line.trimEnd();
    if (l) lines.push(l);
    line = "";
  };
  for (const tok of tokens(text)) {
    if (/^\s+$/.test(tok)) {
      if (line) line += " ";
      continue;
    }
    if (textEm(line + tok) <= limit) {
      line += tok;
      continue;
    }
    if (textEm(tok) > limit) {
      for (const c of Array.from(tok)) {
        if (textEm(line + c) > limit) push();
        line += c;
      }
      continue;
    }
    push();
    line = tok;
    const prev = lines.length ? Array.from(lines[lines.length - 1]) : [];
    if (NO_START.test(tok) && prev.length > 1) {
      const last = prev.pop() as string;
      lines[lines.length - 1] = prev.join("").trimEnd();
      line = last + tok;
    }
  }
  push();
  return lines;
}

/** `s` cut so that s + "…" fits `limit` em (always ends in "…"). */
export function ellipsize(s: string, limit: number): string {
  const chars = Array.from(s.trimEnd());
  while (chars.length && textEm(chars.join("") + "…") > limit) chars.pop();
  return chars.join("").trimEnd() + "…";
}

/**
 * Card R2: the cover as a 2-5 s opener (composition CoverOpener = the same Cover component). The picture grows from
 * IMAGE_START to full bleed over a blurred copy of itself and the title slides up into place, both done by MOTION_SHARE
 * of the length; the rest holds the finished cover, so the crossfade into the video starts from the thumbnail's picture.
 * Invariant: the last frame, and a 1-frame still, is the cover exactly (progress 1: scale 1, offset 0, opacity 1).
 */
const IMAGE_START = 0.86, MOTION_SHARE = 0.6, TITLE_DELAY = 0.15, TITLE_RISE = 0.06;
export interface CoverMotion { progress: number; imageScale: number; backdropVisible: boolean; titleOffset: number; titleOpacity: number }
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (n: number) => 1 - Math.pow(1 - n, 3);
export function coverMotion(frame: number, durationInFrames: number, height: number): CoverMotion {
  const span = Math.max(1, Math.round(durationInFrames * MOTION_SHARE));
  const p = durationInFrames <= 1 ? 1 : clamp01(frame / span);
  const t = durationInFrames <= 1 ? 1 : clamp01((frame - span * TITLE_DELAY) / (span * (1 - TITLE_DELAY)));
  return {
    progress: p,
    imageScale: IMAGE_START + (1 - IMAGE_START) * easeOut(p),
    backdropVisible: p < 1,
    titleOffset: Math.round((1 - easeOut(t)) * height * TITLE_RISE),
    titleOpacity: easeOut(t),
  };
}

export interface CoverLayout {
  format: string;
  box: { left: number; top: number; width: number; height: number };
  fontSize: number;
  lines: string[];
  truncated: boolean;
  subtitle: { fontSize: number; gap: number; text: string } | null;
  /** y of the title block's top edge; the block ends at the safe box's bottom. */
  blockTop: number;
}

export function layoutCover({ width, height, title, subtitle }: { width: number; height: number; title: string; subtitle?: string }): CoverLayout {
  const format = coverFormatKey(width, height);
  if (!format) throw new Error(`no cover layout for ${width}x${height}`);
  const { safe, maxLines } = COVER_FORMATS[format];
  const box = {
    left: Math.round(width * safe.left),
    top: Math.round(height * safe.top),
    width: Math.floor(width * (1 - safe.left - safe.right)),
    height: Math.floor(height * (1 - safe.top - safe.bottom)),
  };
  const text = String(title ?? "").replace(/\s+/g, " ").trim().toUpperCase(); // the 片頭 style is uppercase
  const sub = String(subtitle ?? "").replace(/\s+/g, " ").trim();
  const short = Math.min(width, height),
    max = Math.round(short * TITLE_MAX),
    min = Math.round(short * TITLE_MIN);
  const subOf = (size: number) => {
    if (!sub) return null;
    const fontSize = Math.max(Math.round(short * SUB_MIN), Math.round(size * SUB_RATIO));
    const limit = box.width / fontSize;
    return { fontSize, gap: Math.round(size * SUB_GAP), text: textEm(sub) <= limit ? sub : ellipsize(sub, limit) };
  };
  const blockHeight = (size: number, n: number) => {
    const s = subOf(size);
    return Math.ceil(size * TITLE_LINE_HEIGHT * n + (s ? s.gap + s.fontSize * TITLE_LINE_HEIGHT : 0));
  };
  const done = (size: number, lines: string[], truncated: boolean): CoverLayout => ({
    format, box, fontSize: size, lines, truncated, subtitle: subOf(size), blockTop: box.top + box.height - blockHeight(size, lines.length),
  });
  for (let size = max; size >= min; size--) {
    const lines = wrapLines(text, box.width / size);
    if (lines.length <= maxLines && blockHeight(size, lines.length) <= box.height * BLOCK_SHARE) return done(size, lines, false);
  }
  let n = maxLines;
  while (n > 1 && blockHeight(min, n) > box.height * BLOCK_SHARE) n--;
  const lines = wrapLines(text, box.width / min).slice(0, n);
  lines[n - 1] = ellipsize(lines[n - 1], box.width / min);
  return done(min, lines, true);
}

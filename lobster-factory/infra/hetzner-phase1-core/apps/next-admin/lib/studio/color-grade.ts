/**
 * Color grade — shared, React-free seam between the UI sliders and the two
 * server-side bake pipelines (to-product-image.ts WebP, to-print-file.ts CMYK PDF).
 *
 * Composable image-edit BLOCKS. Each block is neutral-skippable, so any tool that
 * imports this seam gets the whole toolbox and pays only for the blocks it moves:
 *   - modulate : hue / saturation / brightness   (Sharp .modulate)
 *   - levels   : black-point / white-point        (Sharp .linear — input range remap)
 *   - gamma    : midtone                           (Sharp .gamma, 1.0..3.0)
 *   - sharpen  : sharpness                         (Sharp .sharpen sigma)
 * Blocks apply in a fixed, deterministic order (see applyColorGrade). Add a new
 * block = add its clamp + a `toSharpX()` descriptor + one line in applyColorGrade;
 * nothing else in the codebase changes (the two pipelines call applyColorGrade).
 *
 * Two shapes on purpose:
 *   - ColorGradeState  : UI-facing short names + the units sliders speak
 *                        (hue/black/white degrees|levels, sat/bri/gamma as PERCENT,
 *                         sharpen as sigma; neutral = 0/100/.../0).
 *   - ColorGradeParams : the API/engine payload Sharp consumes
 *                        (hue degrees, sat/bri/gamma as MULTIPLIER, black/white 0..255,
 *                         sharpen sigma; neutral = 0/1/1/0/255/1/0).
 *
 * Keep this file free of React (no hooks here) and free of a RUNTIME sharp import
 * (type-only): both Sharp pipelines import it on the server, and `useColorGrade()`
 * lives in the component layer (ColorGradePanel), so server bundles never pull in
 * React. CSS preview ≠ Sharp output (hue-rotate is an RGB matrix, Sharp modulate is
 * HSL; gamma/sharpen have no CSS equivalent) — the UI carries a disclaimer.
 */
import type { Sharp } from "sharp";

/**
 * UI slider state. sat/bri/gamma are PERCENT (100 = neutral); black/white are
 * levels input points on the 0..255 scale; sharpen is a Sharp sigma (0 = off).
 */
export type ColorGradeState = {
  /** -30..30 degrees */
  hue: number;
  /** 50..200 percent (100 = neutral) */
  sat: number;
  /** 50..200 percent (100 = neutral) */
  bri: number;
  // Optional blocks — omit to leave neutral (clampState fills the neutral value).
  /** levels input black point, 0..64 (0 = neutral) */
  black?: number;
  /** levels input white point, 191..255 (255 = neutral) */
  white?: number;
  /** midtone gamma, 100..300 percent (100 = neutral → 1.0) */
  gamma?: number;
  /** sharpen sigma, 0..10 (0 = off / neutral) */
  sharpen?: number;
  // Colour balance (Adobe-style, global midtone), each -100..100, neutral 0.
  /** 青↔紅 Cyan–Red: + adds red, − adds cyan */
  balCR?: number;
  /** 洋紅↔綠 Magenta–Green: + adds green, − adds magenta */
  balMG?: number;
  /** 黃↔藍 Yellow–Blue: + adds blue, − adds yellow */
  balYB?: number;
};

/**
 * Server/API payload. saturation/brightness/gamma are MULTIPLIERS (1 = neutral);
 * black/white are 0..255 levels points; sharpen is a Sharp sigma; balCR/MG/YB are
 * −100..100 colour-balance offsets (same units as the UI state).
 */
export type ColorGradeParams = {
  /** degrees, -30..30 */
  hue: number;
  /** multiplier, 0.5..2 */
  saturation: number;
  /** multiplier, 0.5..2 */
  brightness: number;
  // Optional blocks — omit to leave neutral (clampParams fills the neutral value).
  /** levels input black point, 0..64 */
  black?: number;
  /** levels input white point, 191..255 */
  white?: number;
  /** midtone gamma multiplier, 1.0..3.0 */
  gamma?: number;
  /** sharpen sigma, 0..10 */
  sharpen?: number;
  /** 青↔紅 Cyan–Red, −100..100 */
  balCR?: number;
  /** 洋紅↔綠 Magenta–Green, −100..100 */
  balMG?: number;
  /** 黃↔藍 Yellow–Blue, −100..100 */
  balYB?: number;
};

/** Slider bounds (single source of truth for UI + clamps). */
export const GRADE_LIMITS = {
  hue: { min: -30, max: 30, neutral: 0 },
  sat: { min: 50, max: 200, neutral: 100 },
  bri: { min: 50, max: 200, neutral: 100 },
  black: { min: 0, max: 64, neutral: 0 },
  white: { min: 191, max: 255, neutral: 255 },
  gamma: { min: 100, max: 300, neutral: 100 },
  sharpen: { min: 0, max: 10, neutral: 0 },
  balCR: { min: -100, max: 100, neutral: 0 },
  balMG: { min: -100, max: 100, neutral: 0 },
  balYB: { min: -100, max: 100, neutral: 0 },
} as const;

export const NEUTRAL_STATE: ColorGradeState = {
  hue: GRADE_LIMITS.hue.neutral,
  sat: GRADE_LIMITS.sat.neutral,
  bri: GRADE_LIMITS.bri.neutral,
  black: GRADE_LIMITS.black.neutral,
  white: GRADE_LIMITS.white.neutral,
  gamma: GRADE_LIMITS.gamma.neutral,
  sharpen: GRADE_LIMITS.sharpen.neutral,
  balCR: 0,
  balMG: 0,
  balYB: 0,
};

export const NEUTRAL_PARAMS: ColorGradeParams = {
  hue: 0,
  saturation: 1,
  brightness: 1,
  black: 0,
  white: 255,
  gamma: 1,
  sharpen: 0,
  balCR: 0,
  balMG: 0,
  balYB: 0,
};

// Defense-in-depth: TS types are erased at runtime, so wire payloads can carry
// undefined/null/strings/missing keys. Anything that is not a FINITE number
// (NaN, ±Infinity, non-number) collapses to the neutral no-op — it must never
// reach a Sharp op as NaN/extreme. The API boundary ([1-e]) also schema-
// validates; this is the second line so a slip can't push an out-of-bounds bake.
const clamp = (v: unknown, min: number, max: number, neutral: number): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : neutral;

/** Clamp a (possibly user/wire-supplied) state into valid slider bounds. */
export function clampState(s: ColorGradeState): ColorGradeState {
  const o = (s ?? {}) as Partial<ColorGradeState>; // tolerate null/garbage object
  return {
    hue: clamp(o.hue, GRADE_LIMITS.hue.min, GRADE_LIMITS.hue.max, GRADE_LIMITS.hue.neutral),
    sat: clamp(o.sat, GRADE_LIMITS.sat.min, GRADE_LIMITS.sat.max, GRADE_LIMITS.sat.neutral),
    bri: clamp(o.bri, GRADE_LIMITS.bri.min, GRADE_LIMITS.bri.max, GRADE_LIMITS.bri.neutral),
    black: clamp(o.black, GRADE_LIMITS.black.min, GRADE_LIMITS.black.max, GRADE_LIMITS.black.neutral),
    white: clamp(o.white, GRADE_LIMITS.white.min, GRADE_LIMITS.white.max, GRADE_LIMITS.white.neutral),
    gamma: clamp(o.gamma, GRADE_LIMITS.gamma.min, GRADE_LIMITS.gamma.max, GRADE_LIMITS.gamma.neutral),
    sharpen: clamp(
      o.sharpen,
      GRADE_LIMITS.sharpen.min,
      GRADE_LIMITS.sharpen.max,
      GRADE_LIMITS.sharpen.neutral
    ),
    balCR: clamp(o.balCR, GRADE_LIMITS.balCR.min, GRADE_LIMITS.balCR.max, GRADE_LIMITS.balCR.neutral),
    balMG: clamp(o.balMG, GRADE_LIMITS.balMG.min, GRADE_LIMITS.balMG.max, GRADE_LIMITS.balMG.neutral),
    balYB: clamp(o.balYB, GRADE_LIMITS.balYB.min, GRADE_LIMITS.balYB.max, GRADE_LIMITS.balYB.neutral),
  };
}

/** Is this state effectively neutral (no bake needed)? */
export function isNeutralState(s: ColorGradeState): boolean {
  const c = clampState(s);
  return (
    c.hue === GRADE_LIMITS.hue.neutral &&
    c.sat === GRADE_LIMITS.sat.neutral &&
    c.bri === GRADE_LIMITS.bri.neutral &&
    c.black === GRADE_LIMITS.black.neutral &&
    c.white === GRADE_LIMITS.white.neutral &&
    c.gamma === GRADE_LIMITS.gamma.neutral &&
    c.sharpen === GRADE_LIMITS.sharpen.neutral &&
    c.balCR === 0 &&
    c.balMG === 0 &&
    c.balYB === 0
  );
}

/** UI state (percent/levels) → API params (multiplier/0..255). Clamps first. */
export function stateToParams(s: ColorGradeState): ColorGradeParams {
  const c = clampState(s);
  return {
    hue: c.hue,
    saturation: c.sat / 100,
    brightness: c.bri / 100,
    black: c.black,
    white: c.white,
    gamma: c.gamma / 100,
    sharpen: c.sharpen,
    balCR: c.balCR,
    balMG: c.balMG,
    balYB: c.balYB,
  };
}

/** Clamp a wire-supplied ColorGradeParams into Sharp-safe bounds. */
export function clampParams(p: ColorGradeParams): ColorGradeParams {
  const o = (p ?? {}) as Partial<ColorGradeParams>; // tolerate null/garbage object
  return {
    hue: clamp(o.hue, GRADE_LIMITS.hue.min, GRADE_LIMITS.hue.max, GRADE_LIMITS.hue.neutral),
    saturation: clamp(
      o.saturation, GRADE_LIMITS.sat.min / 100, GRADE_LIMITS.sat.max / 100, GRADE_LIMITS.sat.neutral / 100
    ),
    brightness: clamp(
      o.brightness, GRADE_LIMITS.bri.min / 100, GRADE_LIMITS.bri.max / 100, GRADE_LIMITS.bri.neutral / 100
    ),
    black: clamp(o.black, GRADE_LIMITS.black.min, GRADE_LIMITS.black.max, GRADE_LIMITS.black.neutral),
    white: clamp(o.white, GRADE_LIMITS.white.min, GRADE_LIMITS.white.max, GRADE_LIMITS.white.neutral),
    gamma: clamp(
      o.gamma, GRADE_LIMITS.gamma.min / 100, GRADE_LIMITS.gamma.max / 100, GRADE_LIMITS.gamma.neutral / 100
    ),
    sharpen: clamp(
      o.sharpen, GRADE_LIMITS.sharpen.min, GRADE_LIMITS.sharpen.max, GRADE_LIMITS.sharpen.neutral
    ),
    balCR: clamp(o.balCR, GRADE_LIMITS.balCR.min, GRADE_LIMITS.balCR.max, GRADE_LIMITS.balCR.neutral),
    balMG: clamp(o.balMG, GRADE_LIMITS.balMG.min, GRADE_LIMITS.balMG.max, GRADE_LIMITS.balMG.neutral),
    balYB: clamp(o.balYB, GRADE_LIMITS.balYB.min, GRADE_LIMITS.balYB.max, GRADE_LIMITS.balYB.neutral),
  };
}

export function isNeutralParams(p: ColorGradeParams): boolean {
  const c = clampParams(p);
  return (
    c.hue === 0 &&
    c.saturation === 1 &&
    c.brightness === 1 &&
    c.black === 0 &&
    c.white === 255 &&
    c.gamma === 1 &&
    c.sharpen === 0 &&
    c.balCR === 0 &&
    c.balMG === 0 &&
    c.balYB === 0
  );
}

/** Colour-balance per-channel additive offset (0..255 scale). undefined when neutral. */
const BALANCE_SCALE = 0.6; // ±100 → ±60 on the 0..255 channel
export function toSharpBalance(p: ColorGradeParams): { r: number; g: number; b: number } | undefined {
  const c = clampParams(p);
  const r = (c.balCR ?? 0) * BALANCE_SCALE;
  const g = (c.balMG ?? 0) * BALANCE_SCALE;
  const b = (c.balYB ?? 0) * BALANCE_SCALE;
  if (r === 0 && g === 0 && b === 0) return undefined;
  return { r, g, b };
}

// ── Per-block Sharp descriptors (pure, unit-testable without Sharp) ──

/** True only when the modulate block (hue/sat/bri) is non-neutral. */
function isNeutralModulate(c: ColorGradeParams): boolean {
  return c.hue === 0 && c.saturation === 1 && c.brightness === 1;
}

/**
 * Sharp `.modulate()` argument — the hue/saturation/brightness block. hue stays
 * degrees; saturation/brightness are multipliers (same field names Sharp expects),
 * clamped so a hostile payload can't push an extreme transform. Returns undefined
 * when that block is neutral (skip the op). Backward-compatible with [1-b].
 */
export function toSharpModulate(
  p: ColorGradeParams
): { hue: number; saturation: number; brightness: number } | undefined {
  const c = clampParams(p);
  if (isNeutralModulate(c)) return undefined;
  return { hue: c.hue, saturation: c.saturation, brightness: c.brightness };
}

/**
 * Sharp `.linear(a, b)` argument — the LEVELS block (input black/white point).
 * Remaps input range [black, white] → [0, 255]: out = a·in + b, with
 *   a = 255 / (white − black),  b = −black · a.
 * Sharp clamps the result to the channel range internally. Returns undefined when
 * neutral (black=0, white=255 → a=1, b=0) or degenerate (white ≤ black). Plan §6.
 */
export function toSharpLevels(p: ColorGradeParams): { a: number; b: number } | undefined {
  const c = clampParams(p);
  if (c.white <= c.black) return undefined; // degenerate range → skip (can't divide)
  if (c.black === 0 && c.white === 255) return undefined; // neutral
  const a = 255 / (c.white - c.black);
  const b = -c.black * a;
  return { a, b };
}

/**
 * Compose every non-neutral block onto a Sharp instance, in fixed order:
 *   modulate (color) → levels (linear) → gamma (midtone) → sharpen (last).
 * Each block is skipped when neutral. This is the ONE place the block order lives;
 * both bake pipelines call it so they can never drift. Pass already-resized `img`.
 *
 * `img` is typed as Sharp via a type-only import (no runtime sharp coupling here).
 */
export function applyColorGrade(img: Sharp, params: ColorGradeParams): Sharp {
  const c = clampParams(params);
  let out = img;

  const mod = toSharpModulate(c);
  if (mod) out = out.modulate(mod);

  const lv = toSharpLevels(c);
  if (lv) out = out.linear(lv.a, lv.b);

  // Colour balance — per-channel additive offset (青紅/洋紅綠/黃藍). Sharp .linear with
  // arrays applies per-channel: out = 1·in + offset, clamped internally to 0..255.
  const bal = toSharpBalance(c);
  if (bal) out = out.linear([1, 1, 1], [bal.r, bal.g, bal.b]);

  // Sharp .gamma() valid range is 1.0..3.0; 1.0 is the identity (skip it).
  if (c.gamma > 1) out = out.gamma(c.gamma);

  // Sharp .sharpen({sigma}) — sigma must be > 0; 0 means no sharpening.
  if (c.sharpen > 0) out = out.sharpen({ sigma: c.sharpen });

  return out;
}

/**
 * CSS filter string for the LIVE preview (NOT the bake — see file header).
 * Approximates the bake with the CSS functions that exist: hue-rotate/saturate/
 * brightness map the modulate block; the levels block is approximated as contrast()
 * (input-range narrowing ≈ contrast boost). Gamma and sharpen have NO CSS analog,
 * so the preview understates them — the UI disclaimer covers the gap.
 */
export function toCssFilter(s: ColorGradeState): string {
  const c = clampState(s);
  const parts = [`hue-rotate(${c.hue}deg)`, `saturate(${c.sat}%)`, `brightness(${c.bri}%)`];
  // Levels → approximate contrast. Neutral (0,255) → 100% → omit to stay minimal.
  if (!(c.black === 0 && c.white === 255) && c.white > c.black) {
    const contrastPct = Math.round((255 / (c.white - c.black)) * 100);
    parts.push(`contrast(${contrastPct}%)`);
  }
  return parts.join(" ");
}

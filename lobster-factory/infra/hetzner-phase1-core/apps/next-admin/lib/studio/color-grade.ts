/**
 * Color grade — shared, React-free seam between the UI sliders and the two
 * server-side bake pipelines (to-product-image.ts WebP, to-print-file.ts CMYK PDF).
 *
 * Two shapes on purpose:
 *   - ColorGradeState  : UI-facing short names + the units sliders speak
 *                        (hue degrees, sat/bri as PERCENT, neutral = 0/100/100).
 *   - ColorGradeParams : the API/engine payload Sharp consumes
 *                        (hue degrees, sat/bri as MULTIPLIER, neutral = 0/1/1).
 *
 * Keep this file free of React (no hooks here): both Sharp pipelines import it on
 * the server. The `useColorGrade()` hook lives in the component layer (ColorGradePanel),
 * not here, so server bundles never pull in React. CSS preview ≠ Sharp output
 * (hue-rotate is an RGB matrix, Sharp modulate is HSL) — UI carries a disclaimer.
 */

/** UI slider state. sat/bri are PERCENT (100 = neutral). */
export type ColorGradeState = {
  /** -30..30 degrees */
  hue: number;
  /** 50..200 percent (100 = neutral) */
  sat: number;
  /** 50..200 percent (100 = neutral) */
  bri: number;
};

/** Server/API payload. saturation/brightness are MULTIPLIERS (1 = neutral). */
export type ColorGradeParams = {
  /** degrees, -30..30 */
  hue: number;
  /** multiplier, 0.5..2 */
  saturation: number;
  /** multiplier, 0.5..2 */
  brightness: number;
};

/** Slider bounds (single source of truth for UI + clamps). */
export const GRADE_LIMITS = {
  hue: { min: -30, max: 30, neutral: 0 },
  sat: { min: 50, max: 200, neutral: 100 },
  bri: { min: 50, max: 200, neutral: 100 },
} as const;

export const NEUTRAL_STATE: ColorGradeState = {
  hue: GRADE_LIMITS.hue.neutral,
  sat: GRADE_LIMITS.sat.neutral,
  bri: GRADE_LIMITS.bri.neutral,
};

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

/** Clamp a (possibly user/wire-supplied) state into valid slider bounds. */
export function clampState(s: ColorGradeState): ColorGradeState {
  return {
    hue: clamp(s.hue, GRADE_LIMITS.hue.min, GRADE_LIMITS.hue.max),
    sat: clamp(s.sat, GRADE_LIMITS.sat.min, GRADE_LIMITS.sat.max),
    bri: clamp(s.bri, GRADE_LIMITS.bri.min, GRADE_LIMITS.bri.max),
  };
}

/** Is this state effectively neutral (no bake needed)? */
export function isNeutralState(s: ColorGradeState): boolean {
  return (
    s.hue === GRADE_LIMITS.hue.neutral &&
    s.sat === GRADE_LIMITS.sat.neutral &&
    s.bri === GRADE_LIMITS.bri.neutral
  );
}

/** UI state (percent) → API params (multiplier). Clamps first. */
export function stateToParams(s: ColorGradeState): ColorGradeParams {
  const c = clampState(s);
  return { hue: c.hue, saturation: c.sat / 100, brightness: c.bri / 100 };
}

/** Clamp a wire-supplied ColorGradeParams into Sharp-safe multiplier bounds. */
export function clampParams(p: ColorGradeParams): ColorGradeParams {
  return {
    hue: clamp(p.hue, GRADE_LIMITS.hue.min, GRADE_LIMITS.hue.max),
    saturation: clamp(p.saturation, GRADE_LIMITS.sat.min / 100, GRADE_LIMITS.sat.max / 100),
    brightness: clamp(p.brightness, GRADE_LIMITS.bri.min / 100, GRADE_LIMITS.bri.max / 100),
  };
}

export function isNeutralParams(p: ColorGradeParams): boolean {
  return p.hue === 0 && p.saturation === 1 && p.brightness === 1;
}

/**
 * Sharp `.modulate()` argument. hue stays degrees; saturation/brightness are
 * multipliers — same field names Sharp expects, but clamped so a hostile payload
 * can't push an extreme transform. Returns undefined when neutral (skip the op).
 */
export function toSharpModulate(
  p: ColorGradeParams
): { hue: number; saturation: number; brightness: number } | undefined {
  const c = clampParams(p);
  return isNeutralParams(c) ? undefined : c;
}

/** CSS filter string for the live preview (NOT the bake — see file header). */
export function toCssFilter(s: ColorGradeState): string {
  const c = clampState(s);
  return `hue-rotate(${c.hue}deg) saturate(${c.sat}%) brightness(${c.bri}%)`;
}

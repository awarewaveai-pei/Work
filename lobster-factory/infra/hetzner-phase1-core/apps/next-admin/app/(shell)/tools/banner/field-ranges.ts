// Card R2-A: one range per numeric design field. The sliders, the AI answer's sanitizer and the drawing all read this
// table, so a value one of them accepts is always one the others can show (before: AI productScale 1.2 vs slider 1.0).

export interface FieldRange { min: number; max: number; step: number }

export const FIELD_RANGES = {
  /** px set by hand (the automatic title has its own range per size: titleRange below). */
  headlineSize: { min: 16, max: 600, step: 1 },
  subtextSize: { min: 10, max: 260, step: 1 },
  letterSpacing: { min: -2, max: 16, step: 1 },
  bodyLetterSpacing: { min: -2, max: 16, step: 1 },
  headlineLineHeight: { min: 0.9, max: 2, step: 0.02 },
  bodyLineHeight: { min: 1, max: 2.4, step: 0.02 },
  textScrimOpacity: { min: 0.05, max: 0.9, step: 0.05 },
  dimOverlayOpacity: { min: 0.05, max: 0.85, step: 0.05 },
  productScale: { min: 0.2, max: 1, step: 0.05 },
  badgeScale: { min: 0.5, max: 2.5, step: 0.1 },
  /** R3-A: the logo's height as a share of the canvas's short side (set by hand; automatic = banner-layout LOGO_AUTO). */
  logoScale: { min: 0.04, max: 0.25, step: 0.005 },
  bgImgScale: { min: 0.5, max: 3, step: 0.05 },
  trustStars: { min: 1, max: 5, step: 1 },
} as const satisfies Record<string, FieldRange>;
export type RangedField = keyof typeof FIELD_RANGES;

/** R4 (T1 決定 1): the title as shown is 36-57 CSS px (Material 3 display small..large) at the width the size is
 *  displayed at; the subtitle is the title / SUB_RATIO (Figma type scale 1.25). */
export const TITLE_SHOWN_PX = { min: 36, max: 57 } as const;
export const SUB_RATIO = 1.25;
/** The automatic title's range in canvas px for a canvas `canvasW` wide shown `displayW` CSS px wide. */
export function titleRange(canvasW: number, displayW: number): { min: number; max: number } {
  const k = canvasW / displayW;
  return { min: Math.ceil(TITLE_SHOWN_PX.min * k), max: Math.floor(TITLE_SHOWN_PX.max * k) };
}

/** `v` kept inside the field's range; undefined when it is not a finite number. */
export function clampField(field: RangedField, v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const r = FIELD_RANGES[field];
  return Math.max(r.min, Math.min(r.max, v));
}

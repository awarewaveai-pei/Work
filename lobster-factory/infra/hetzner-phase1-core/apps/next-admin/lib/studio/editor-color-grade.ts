/**
 * Typed door to public/editor-shared/color-grade.js — the ONE place the 🎨 調色 math lives for both
 * /tools/canvas (Fabric 7, imports it here) and the /tools/vector-pro 調色 block public/editor-shared/blocks/color-grade.js
 * (Fabric 5, imports the same file as an ES module). Nothing is re-implemented in TS; this file only adds types.
 * drift guard: lib/studio/__tests__/editor-color-grade-drift.test.ts
 */
import * as shared from "../../public/editor-shared/color-grade.js";

export type GradeKey = "hue" | "sat" | "bri" | "black" | "white" | "gamma" | "sharpen" | "balCR" | "balMG" | "balYB";
export type GradeState = Record<GradeKey, number>;
export type EffectKey = "vibrance" | "temp" | "blur" | "noise" | "contrast" | "shadows" | "highlights" | "exposure" | "clarity" | "dehaze";
export type HslKey = "all" | "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";
export type HslAdj = { h: number; s: number; l: number };
export type HslMixerState = Record<HslKey, HslAdj>;
/** A Fabric filter as `filter.toObject()` serializes it; adj.legacy holds the ones an old project carried that no panel can express. */
export type LegacyFilter = { type: string } & Record<string, unknown>;
export type RemoveColorState = { color: string; distance: number };
/** Stored on every image as `adj` (survives toJSON / design save / load / cross-editor load). Every filter on the image derives from it. */
export type AdjState = {
  grade: GradeState; presetId: string | null; removeWhite: boolean; hslMixer: HslMixerState;
  removeColor: RemoveColorState | null; legacy: LegacyFilter[];
} & Record<EffectKey, number>;
export type FilterSpec = { cls: string; opts?: Record<string, unknown> };
export type GradeRow = { path: string; label: string; step: number; fmt: string };
export type GradeSection = { id: string; title: string; rows: GradeRow[] };
export type AutoKind = "contrast" | "color" | "tone";
type Limit = { min: number; max: number; neutral: number };

export const REMOVE_COLOR_LIMITS = shared.REMOVE_COLOR_LIMITS as Limit;
export const GRADE_LIMITS = shared.GRADE_LIMITS as Record<GradeKey, Limit>;
export const EFFECT_LIMITS = shared.EFFECT_LIMITS as Record<EffectKey, Limit>;
export const PRESETS = shared.PRESETS as { id: string; label: string; cls: string; opts?: Record<string, unknown> }[];
export const GRADE_SECTIONS = shared.GRADE_SECTIONS as GradeSection[];
export const HSL_RANGES = shared.HSL_RANGES as { key: HslKey; label: string; color: string; center: number; hw: number }[];
export const HSL_AXES = shared.HSL_AXES as { axis: "h" | "s" | "l"; label: string; min: number; max: number }[];
export const neutralAdj = shared.neutralAdj as () => AdjState;
export const sanitizeAdj = shared.sanitizeAdj as (raw: unknown) => AdjState;
export const isNeutralAdj = shared.isNeutralAdj as (adj: unknown) => boolean;
export const hasAnyHsl = shared.hasAnyHsl as (s: HslMixerState) => boolean;
export const hslNeutral = shared.hslNeutral as () => HslMixerState;
export const sanitizeHsl = shared.sanitizeHsl as (raw: unknown) => HslMixerState;
export const applyBlurPixels = shared.applyBlurPixels as (img: { data: Uint8ClampedArray; width: number; height: number }, blur: number) => void;
export const applyHslPixels = shared.applyHslPixels as (data: Uint8ClampedArray, state: HslMixerState) => void;
/** One AwHsl / AwBlur definition; each Fabric version wraps it in a class (see the shared file). */
export type AwFilterDef = {
  init: (o: Record<string, unknown> | undefined) => Record<string, unknown>;
  apply2d: (f: Record<string, unknown>, imageData: ImageData) => void;
  neutral: (f: Record<string, unknown>) => boolean;
  toObject: (f: Record<string, unknown>) => Record<string, unknown>;
};
export const AW_FILTERS = shared.AW_FILTERS as Record<"AwHsl" | "AwBlur", AwFilterDef>;
export const getPath = shared.getPath as (adj: AdjState, path: string) => number;
export const setPath = shared.setPath as (adj: AdjState, path: string, v: number) => AdjState;
export const limitOf = shared.limitOf as (path: string) => Limit;
export const fmtValue = shared.fmtValue as (fmt: string, v: number) => string;
export const buildFilterSpecs = shared.buildFilterSpecs as (adj: unknown) => FilterSpec[];
export const makeFilters = shared.makeFilters as (ctor: (cls: string) => (new (opts?: Record<string, unknown>) => object) | null | undefined, specs: FilterSpec[]) => object[];
export const sanitizeRemoveColor = shared.sanitizeRemoveColor as (raw: unknown) => RemoveColorState | null;
export const sanitizeLegacy = shared.sanitizeLegacy as (raw: unknown) => LegacyFilter[];
export const resetGradeAdj = shared.resetGradeAdj as (adj: unknown) => AdjState;
export const isGradeNeutral = shared.isGradeNeutral as (adj: unknown) => boolean;
export const setRemoveColor = shared.setRemoveColor as (adj: unknown, color: string, distance: number) => AdjState;
export const clearRemoveColor = shared.clearRemoveColor as (adj: unknown) => AdjState;
export const serializeFilters = shared.serializeFilters as (filters: unknown[] | null | undefined) => LegacyFilter[];
export const adoptAdj = shared.adoptAdj as (raw: unknown, filters: unknown[] | null | undefined) => AdjState;
export const applyAuto = shared.applyAuto as (adj: AdjState, kind: AutoKind, data: Uint8ClampedArray) => AdjState;

/**
 * Typed door to public/editor-shared/color-grade.js — the ONE place the 🎨 調色 math lives for both
 * /tools/canvas (Fabric 7, imports it here) and public/vector-editor.html (Fabric 5, loads the same file
 * as <script type="module">). Nothing is re-implemented in TS; this file only adds types.
 * drift guard: lib/studio/__tests__/editor-color-grade-drift.test.ts
 */
import * as shared from "../../public/editor-shared/color-grade.js";

export type GradeKey = "hue" | "sat" | "bri" | "black" | "white" | "gamma" | "sharpen" | "balCR" | "balMG" | "balYB";
export type GradeState = Record<GradeKey, number>;
export type EffectKey = "vibrance" | "temp" | "blur" | "noise" | "contrast" | "shadows" | "highlights" | "exposure" | "clarity" | "dehaze";
export type HslKey = "all" | "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";
export type HslAdj = { h: number; s: number; l: number };
export type HslMixerState = Record<HslKey, HslAdj>;
/** Stored on every image as `adj` (survives toJSON / design save / load / cross-editor load). */
export type AdjState = { grade: GradeState; presetId: string | null; removeWhite: boolean; hslMixer: HslMixerState } & Record<EffectKey, number>;
export type FilterSpec = { cls: string; opts?: Record<string, unknown> };
export type GradeRow = { path: string; label: string; step: number; fmt: string };
export type GradeSection = { id: string; title: string; rows: GradeRow[] };
export type AutoKind = "contrast" | "color" | "tone";
type Limit = { min: number; max: number; neutral: number };

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
export const getPath = shared.getPath as (adj: AdjState, path: string) => number;
export const setPath = shared.setPath as (adj: AdjState, path: string, v: number) => AdjState;
export const limitOf = shared.limitOf as (path: string) => Limit;
export const fmtValue = shared.fmtValue as (fmt: string, v: number) => string;
export const buildFilterSpecs = shared.buildFilterSpecs as (adj: unknown) => FilterSpec[];
export const makeFilters = shared.makeFilters as (ctor: (cls: string) => (new (opts?: Record<string, unknown>) => object) | null | undefined, specs: FilterSpec[]) => object[];
export const isGradeFilter = shared.isGradeFilter as (f: unknown) => boolean;
export const applyAuto = shared.applyAuto as (adj: AdjState, kind: AutoKind, data: Uint8ClampedArray) => AdjState;

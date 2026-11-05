/**
 * Typed door to public/editor-shared/edge-mask.js — the ONE place the ✂️ 邊緣遮罩 styles and compositing live, for /tools/canvas,
 * Studio and My Designs (import here) and the editor-shared dock blocks (import the same file as an ES module).
 * Nothing is re-implemented in TS; this file only adds types. ⚠️ `applyEdgeMask` is browser-only (document/Image/<canvas>).
 * drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts
 */
import * as shared from "../../public/editor-shared/edge-mask.js";

export type EdgeMaskId =
  | "mask-01" | "mask-02" | "mask-03" | "mask-04" | "mask-05" | "mask-06" | "mask-07" | "mask-08"
  | "mask-09" | "mask-10" | "mask-11" | "mask-12" | "mask-13" | "mask-14" | "mask-15" | "mask-16"
  | "dry-brush" | "soft-brush" | "flat-brush" | "comb-brush" | "calligraphy-brush" | "chalk-brush" | "stipple-brush" | "scratch-brush";

export interface EdgeMaskParams {
  /** 0–100. Higher = (procedural) edge eats further in + rougher displacement. */
  amount: number;
  /** Variation seed (procedural styles). Integer ≥ 1. */
  seed: number;
}

export interface EdgeMaskStyle {
  id: EdgeMaskId;
  /** zh label (UI). */
  label: string;
  /** English label (tooltip / aria). */
  labelEn: string;
  kind: "texture" | "asset";
  /** Procedural styles only — returns the INNER svg markup (white shape on transparent). */
  build?: (w: number, h: number, p: EdgeMaskParams) => string;
  /** Asset styles only — same-origin white-on-transparent PNG alpha mask. */
  maskUrl?: string;
}

export type EdgeMaskResult = { ok: true; image: string } | { ok: false; error: string };

export const DEFAULT_EDGE_PARAMS = shared.DEFAULT_EDGE_PARAMS as EdgeMaskParams;
export const EDGE_MASK_STYLES = shared.EDGE_MASK_STYLES as readonly EdgeMaskStyle[];
export const getEdgeMaskStyle = shared.getEdgeMaskStyle as (id: EdgeMaskId) => EdgeMaskStyle | undefined;
/** Complete SVG mask string for a PROCEDURAL style at w×h; "" for asset styles (they use `maskUrl`). */
export const buildMaskSvg = shared.buildMaskSvg as (id: EdgeMaskId, w: number, h: number, params: EdgeMaskParams) => string;
/** Browser-only: source image (data URL or CORS/same-origin URL) through the style's mask → transparent PNG data URL. */
export const applyEdgeMask = shared.applyEdgeMask as (sourceUrl: string, id: EdgeMaskId, params: EdgeMaskParams) => Promise<EdgeMaskResult>;

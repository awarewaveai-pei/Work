/**
 * Typed door to public/editor-shared/posterize.js — the ONE place the 🎚 色調分離 (Posterize) maths lives, for /tools/canvas (imports
 * here) and the editor-shared dock block blocks/genfx.js (same file as an ES module). Nothing is re-implemented in TS; types only.
 * ⚠️ `posterizeDataUrl` is browser-only (Image/<canvas>). drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts
 */
import * as shared from "../../public/editor-shared/posterize.js";

/** Quantize the RGB channels of an RGBA buffer in place. levels is clamped to 2..32; alpha untouched. */
export const quantizeRgb = shared.quantizeRgb as (data: Uint8ClampedArray, levels: number) => void;
/** Browser-only: decode → quantize → PNG data URL (long edge capped at 4096). Throws on decode / no 2D context. */
export const posterizeDataUrl = shared.posterizeDataUrl as (dataUrl: string, levels: number) => Promise<string>;

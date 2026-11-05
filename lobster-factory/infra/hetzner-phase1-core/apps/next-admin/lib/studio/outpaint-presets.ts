/**
 * Typed door to public/editor-shared/outpaint-presets.js — the ONE copy of the flux-fill-pro `outpaint` enum and its UI labels, for
 * /tools/canvas and the server (generative-fill.ts re-exports it for the genfill route) and the editor-shared dock blocks (same file as
 * an ES module). Pure data, no server deps (keeps Buffer/process.env of generative-fill.ts out of the browser bundle).
 * Nothing is re-implemented in TS; this file only adds types. drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts
 */
import * as shared from "../../public/editor-shared/outpaint-presets.js";

export type OutpaintPreset =
  | "Zoom out 1.5x" | "Zoom out 2x" | "Make square" | "Left outpaint" | "Right outpaint" | "Top outpaint" | "Bottom outpaint";

export const OUTPAINT_PRESETS = shared.OUTPAINT_PRESETS as readonly OutpaintPreset[];

/** Friendly Chinese labels for the UI (keys must match OUTPAINT_PRESETS values). */
export const OUTPAINT_LABELS = shared.OUTPAINT_LABELS as Readonly<Record<OutpaintPreset, string>>;

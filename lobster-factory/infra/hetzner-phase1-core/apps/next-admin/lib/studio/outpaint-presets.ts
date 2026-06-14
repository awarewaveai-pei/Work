/**
 * Outpaint presets — the `outpaint` enum of black-forest-labs/flux-fill-pro, verbatim.
 *
 * Pure data (no server deps) so the client CanvasEditor can import the list + type without
 * pulling generative-fill.ts (which uses Buffer/process.env) into the browser bundle. The
 * server module re-exports from here so the enum stays single-sourced. Mirrors the
 * print-destinations.ts split that keeps sharp/r2 off the client.
 */
export const OUTPAINT_PRESETS = [
  "Zoom out 1.5x",
  "Zoom out 2x",
  "Make square",
  "Left outpaint",
  "Right outpaint",
  "Top outpaint",
  "Bottom outpaint",
] as const;

export type OutpaintPreset = (typeof OUTPAINT_PRESETS)[number];

/** Friendly Chinese labels for the UI (keys must match OUTPAINT_PRESETS values). */
export const OUTPAINT_LABELS: Record<OutpaintPreset, string> = {
  "Zoom out 1.5x": "縮小 1.5×（四周擴）",
  "Zoom out 2x": "縮小 2×（四周擴）",
  "Make square": "補成正方形",
  "Left outpaint": "向左擴",
  "Right outpaint": "向右擴",
  "Top outpaint": "向上擴",
  "Bottom outpaint": "向下擴",
};

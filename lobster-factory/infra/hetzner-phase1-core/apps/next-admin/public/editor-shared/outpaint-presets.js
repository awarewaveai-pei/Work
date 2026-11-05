// 🖼 擴圖 SSOT — the `outpaint` enum of black-forest-labs/flux-fill-pro, verbatim, plus the UI labels. One plain ES module (like
// color-grade.js): pure data, no server deps, so the browser (canvas, editor-shared dock blocks) and the server (generative-fill.ts →
// app/api/tools/studio/genfill/route.ts validation) read the same list. Typed door: lib/studio/outpaint-presets.ts.
// drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts

export const OUTPAINT_PRESETS = Object.freeze([
  "Zoom out 1.5x",
  "Zoom out 2x",
  "Make square",
  "Left outpaint",
  "Right outpaint",
  "Top outpaint",
  "Bottom outpaint",
]);

/** Friendly Chinese labels for the UI (keys must match OUTPAINT_PRESETS values). */
export const OUTPAINT_LABELS = Object.freeze({
  "Zoom out 1.5x": "縮小 1.5×（四周擴）",
  "Zoom out 2x": "縮小 2×（四周擴）",
  "Make square": "補成正方形",
  "Left outpaint": "向左擴",
  "Right outpaint": "向右擴",
  "Top outpaint": "向上擴",
  "Bottom outpaint": "向下擴",
});

// 🖼 擴圖 SSOT — the `outpaint` enum of black-forest-labs/flux-fill-pro, verbatim, plus the UI labels and the geometry of each
// preset. One plain ES module (like color-grade.js): pure data, no server deps, so the browser (canvas, editor-shared dock blocks)
// and the server (generative-fill.ts → app/api/tools/studio/genfill/route.ts validation; bria/expand-image canvas placement)
// read the same list. Typed door: lib/studio/outpaint-presets.ts. drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts

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

const FRAMES = {
  "Zoom out 1.5x": (w, h) => ({ W: w * 1.5, H: h * 1.5, x: w * 0.25, y: h * 0.25 }),
  "Zoom out 2x": (w, h) => ({ W: w * 2, H: h * 2, x: w * 0.5, y: h * 0.5 }),
  "Make square": (w, h) => { const s = Math.max(w, h); return { W: s, H: s, x: (s - w) / 2, y: (s - h) / 2 }; },
  "Left outpaint": (w, h) => ({ W: w * 2, H: h, x: w, y: 0 }),
  "Right outpaint": (w, h) => ({ W: w * 2, H: h, x: 0, y: 0 }),
  "Top outpaint": (w, h) => ({ W: w, H: h * 2, x: 0, y: h }),
  "Bottom outpaint": (w, h) => ({ W: w, H: h * 2, x: 0, y: 0 }),
};
/** Where a w×h source sits in the extended canvas of `preset`, in source pixels: {W, H, x, y} (x, y = the source's top-left);
 *  null for an unknown preset. flux-fill-pro returns that canvas resampled to its own size (908×789 + Left → 1440×625 = 1816×789
 *  × 0.793, prod 2026-11-06); bria/expand-image is sent these numbers and returns the canvas at exactly this size. */
export function outpaintFrame(preset, w, h) {
  const f = FRAMES[preset];
  return f ? f(w, h) : null;
}

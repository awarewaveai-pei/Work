/**
 * Canvas handoff — the source image is too large for a query string (base64 data URLs
 * are megabytes), so OutputTrackBar stashes it in sessionStorage and CanvasEditor reads
 * it back on mount. Tiny standalone module so importers don't pull in either component.
 */
export const CANVAS_SOURCE_KEY = "canvas:source-image";
/** Base filename (no extension) the editor uses for its 下載 PNG button. */
export const CANVAS_NAME_KEY = "canvas:source-name";

/**
 * Stash the image (and an optional base filename for the editor's download) and navigate
 * to the Fabric editor. Full nav = clean fabric load. `baseName` carries the semantic
 * 產品-主圖名稱-風格 across the handoff so the canvas export isn't named canvas-design.png.
 */
export function openInCanvas(image: string, baseName?: string): void {
  try {
    sessionStorage.setItem(CANVAS_SOURCE_KEY, image);
    if (baseName) sessionStorage.setItem(CANVAS_NAME_KEY, baseName);
    else sessionStorage.removeItem(CANVAS_NAME_KEY);
  } catch {
    /* sessionStorage may be unavailable (private mode / quota) — editor opens blank. */
  }
  window.location.assign("/tools/canvas");
}

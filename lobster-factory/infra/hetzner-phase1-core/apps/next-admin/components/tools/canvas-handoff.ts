/**
 * Canvas handoff — the source image is too large for a query string (base64 data URLs
 * are megabytes), so OutputTrackBar stashes it in sessionStorage and CanvasEditor reads
 * it back on mount. Tiny standalone module so importers don't pull in either component.
 */
export const CANVAS_SOURCE_KEY = "canvas:source-image";

/** Stash the image and navigate to the Fabric editor. Full nav = clean fabric load. */
export function openInCanvas(image: string): void {
  try {
    sessionStorage.setItem(CANVAS_SOURCE_KEY, image);
  } catch {
    /* sessionStorage may be unavailable (private mode / quota) — editor opens blank. */
  }
  window.location.assign("/tools/canvas");
}

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

/**
 * Make a handoff source safe to draw onto a Fabric canvas under crossOrigin:"anonymous".
 *
 * data:/blob:/relative URLs are already same-origin → load + export fine. A remote http(s)
 * URL (e.g. a My Designs R2 public URL, pub-*.r2.dev — a DIFFERENT origin) taints the canvas
 * (SecurityError on toDataURL/export) unless the bucket sends CORS headers, which R2 public
 * buckets don't. Route those through the same-origin image proxy — the exact fix the gallery's
 * edge-mask editor already uses (DesignsGallery.tsx → /api/tools/studio/proxy-image). The proxy
 * fails closed for non-allowlisted URLs (HTTP 400), so a stray URL just doesn't load (= today's
 * behaviour, no regression). Only the gallery hands off a remote URL; every other caller
 * (Banner/Studio/Tarot/OutputTrackBar) passes a base64 data URL and is untouched.
 */
export function toCanvasSrc(raw: string): string {
  if (/^https?:\/\//i.test(raw)) {
    return `/api/tools/studio/proxy-image?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

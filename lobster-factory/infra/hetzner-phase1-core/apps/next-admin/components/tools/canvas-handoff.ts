/**
 * Canvas handoff — the source image is too large for a query string (base64 data URLs
 * are megabytes), so the studios stash it and CanvasEditor reads it back on mount.
 *
 * Transport: sessionStorage first (fast, fine for short R2/gallery URLs). Studio/Tarot/
 * Banner results are multi-MB base64 data URLs that BLOW the ~5MB sessionStorage quota —
 * setItem throws QuotaExceededError, which used to be swallowed → the editor opened blank
 * ("沒有把圖帶入 canvas"). So when sessionStorage fails we fall back to IndexedDB (no
 * practical size cap) and leave a sentinel flag. CanvasEditor's readCanvasSource() checks
 * sessionStorage, then the flag → IndexedDB. Tiny standalone module so importers don't pull
 * in either component.
 */

import { bucketDownloadHref } from "@/lib/storage/download-href";
export const CANVAS_SOURCE_KEY = "canvas:source-image";
/** Base filename (no extension) the editor uses for its 下載 PNG button. */
export const CANVAS_NAME_KEY = "canvas:source-name";
/** Sentinel: set when the source image was stashed in IndexedDB instead of sessionStorage. */
export const CANVAS_IDB_FLAG = "canvas:source-in-idb";

const IDB_DB = "canvas-handoff";
const IDB_STORE = "kv";
const IDB_IMAGE_KEY = "source-image";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await idbOpen();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet(key: string): Promise<string | null> {
  const db = await idbOpen();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve((r.result as string | undefined) ?? null);
      r.onerror = () => reject(r.error);
      tx.onabort = () => reject(tx.error); // don't hang readCanvasSource() if the read tx aborts
    });
  } finally {
    db.close();
  }
}

async function idbDel(key: string): Promise<void> {
  try {
    const db = await idbOpen();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Stash the image (and an optional base filename for the editor's download) and navigate
 * to the Fabric editor. Full nav = clean fabric load. `baseName` carries the semantic
 * 產品-主圖名稱-風格 across the handoff so the canvas export isn't named canvas-design.png.
 *
 * Async: when the image overflows sessionStorage we MUST await the IndexedDB write before
 * navigating, otherwise window.location.assign would unload the page mid-write. Callers
 * invoke this fire-and-forget from onClick — the returned promise is harmless to ignore.
 */
export const CANVAS_STAFF_HREF = "/tools/canvas";

/** `href` is where the canvas lives on this page: `useDoorHref(CANVAS_STAFF_HREF)` -- /tools/canvas for staff, the design
 *  door's canvas page there, null (hide the button) on a door without one. */
export async function openInCanvas(image: string, baseName: string | undefined, href: string): Promise<void> {
  let stashed = false;
  // Fast path: small payloads (short R2/gallery URLs) live in sessionStorage.
  try {
    sessionStorage.setItem(CANVAS_SOURCE_KEY, image);
    sessionStorage.removeItem(CANVAS_IDB_FLAG);
    stashed = true;
  } catch {
    /* quota exceeded for a large base64 data URL → fall back to IndexedDB below */
  }
  // Fallback: large data URLs go to IndexedDB (no practical size cap).
  if (!stashed) {
    try {
      await idbPut(IDB_IMAGE_KEY, image);
      sessionStorage.setItem(CANVAS_IDB_FLAG, "1");
      sessionStorage.removeItem(CANVAS_SOURCE_KEY);
      stashed = true;
    } catch {
      /* both transports failed → editor opens blank (previous behaviour, no worse) */
    }
  }
  try {
    if (baseName) sessionStorage.setItem(CANVAS_NAME_KEY, baseName);
    else sessionStorage.removeItem(CANVAS_NAME_KEY);
  } catch {
    /* sessionStorage unavailable (private mode) — editor opens with default name */
  }
  window.location.assign(href);
}

/**
 * Read back the stashed source image on the editor side. Checks sessionStorage first
 * (preserves the previous refresh-keeps-image behaviour for small payloads), then the
 * IndexedDB sentinel — consuming the IDB entry so a future session can't inherit a stale
 * multi-MB image. Returns null when no handoff is pending.
 */
export async function readCanvasSource(): Promise<string | null> {
  try {
    const inline = sessionStorage.getItem(CANVAS_SOURCE_KEY);
    if (inline) return inline;
    if (sessionStorage.getItem(CANVAS_IDB_FLAG) === "1") {
      const value = await idbGet(IDB_IMAGE_KEY);
      sessionStorage.removeItem(CANVAS_IDB_FLAG);
      void idbDel(IDB_IMAGE_KEY);
      return value;
    }
  } catch {
    /* storage unavailable → no handoff */
  }
  return null;
}

/**
 * Make a handoff source safe to draw onto a Fabric canvas under crossOrigin:"anonymous".
 *
 * data:/blob:/relative URLs are already same-origin → load + export fine. A remote http(s)
 * URL (e.g. a My Designs R2 public URL, pub-*.r2.dev — a DIFFERENT origin) taints the canvas
 * (SecurityError on toDataURL/export) unless the bucket sends CORS headers, which R2 public
 * buckets don't. Route those through the platform download route (same-origin re-stream of our own
 * bucket, lib/storage/download-href.ts): the gallery is a PLATFORM_PAGE (lib/portal/doors.ts) and may
 * call only PLATFORM_APIS, which studio's former proxy-image was not. The route fails closed for
 * non-allowlisted URLs, so a stray URL just doesn't load. Only the gallery hands off a remote URL;
 * every other caller (Banner/Studio/Tarot/OutputTrackBar) passes a base64 data URL and is untouched.
 */
export function toCanvasSrc(raw: string): string {
  if (/^https?:\/\//i.test(raw)) {
    return bucketDownloadHref(raw);
  }
  return raw;
}

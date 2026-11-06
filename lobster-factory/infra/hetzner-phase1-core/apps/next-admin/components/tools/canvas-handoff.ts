/**
 * Canvas handoff: a tool sends an image (or a design's editable original) to a pro editor (PhotoCraft / VectorCraft).
 *
 * R0-PLAN 2026-11-05-photocraft-pro C8.1: the editor always opens in a NEW tab, so the sender tab stays alive to take the
 * edited image back ("傳回"). A new tab has no copy of the sender's sessionStorage, so the handoff is one IndexedDB record
 * `handoff:<id>` = { editor, image | source, name, ret? } (IndexedDB is shared by every same-origin tab; no practical size
 * cap) and the editor URL carries `?h=<id>`. A blocked popup falls back to the same tab (the sender then is gone, so a
 * "傳回" lands in My Designs). Return path: useCanvasReturn.ts (sender) + public/editor-shared/dock.js (editor), over
 * BroadcastChannel CANVAS_RETURN_CHANNEL; a ticket id is honoured only by the tab that issued it (issuedReturnTickets).
 *
 * Which editor (C7.1): one table, CANVAS_TARGETS, picks the editor from the design's source file (.vectorcraft/.svg ->
 * VectorCraft, anything else or none -> PhotoCraft). ProEditorFrame reads the record with takeCanvasHandoff(editor) and
 * leaves another editor's record alone; it is deleted only once the editor has opened it (handoff.done()).
 */

import { bucketDownloadHref } from "@/lib/storage/download-href";
// The four sessionStorage keys below are the OLD (pre-C8.1) handoff: nothing writes them any more. readCanvasSource
// (Fabric CanvasEditor) still reads them until card C7.2 retires that editor.
export const CANVAS_SOURCE_KEY = "canvas:source-image";
/** Base filename (no extension) the editor uses for its 下載 PNG button. */
export const CANVAS_NAME_KEY = "canvas:source-name";
/** Sentinel: set when the source image was stashed in IndexedDB instead of sessionStorage. */
export const CANVAS_IDB_FLAG = "canvas:source-in-idb";
/** JSON { editor, source? } of a handoff meant for a pro editor (absent = an old-style handoff for the Fabric editor). */
export const CANVAS_TARGET_KEY = "canvas:target";

/** BroadcastChannel name of the return path: editor -> `{type:"return", id, image}`, sender -> `{type:"ack", id}`. */
export const CANVAS_RETURN_CHANNEL = "canvas-return";
/** Where the edited image goes back to: the sending tool, its slot (tool-defined, e.g. "preview"), the button's label. */
export type CanvasReturnTicket = { tool: string; slot: string; label: string };
/** Tickets this tab issued (handoff id -> ticket). Memory only: a reload forgets them and a "傳回" then lands in My Designs. */
export const issuedReturnTickets = new Map<string, CanvasReturnTicket>();

export type CanvasEditorId = "photocraft" | "vectorcraft";
/** A design's editable original (My Designs `source_url` + `metadata.source_name`). */
export type CanvasSourceFile = { url: string; name: string };

/** Where a design is edited, by its source file's extension. First match wins; the last row (no `exts`) takes the rest. */
export const CANVAS_TARGETS: readonly { editor: CanvasEditorId; staffHref: string; exts?: readonly string[] }[] = [
  { editor: "vectorcraft", staffHref: "/tools/vector-pro", exts: [".vectorcraft", ".svg"] },
  { editor: "photocraft", staffHref: "/tools/photo-pro" },
];

export function canvasTarget(sourceName?: string | null): { editor: CanvasEditorId; staffHref: string } {
  const name = (sourceName ?? "").toLowerCase();
  const row = CANVAS_TARGETS.find((t) => !t.exts || t.exts.some((e) => name.endsWith(e)))!;
  return { editor: row.editor, staffHref: row.staffHref };
}

const IDB_DB = "canvas-handoff";
const IDB_STORE = "kv";
/** Old Fabric-editor handoffs (flag "1") used this one key; readCanvasSource still reads it (until C7.2). */
const IDB_IMAGE_KEY = "source-image";
/** One record per handoff, `${IDB_HANDOFF_PREFIX}<id>`: IndexedDB is shared by every tab, so one key per handoff keeps
 *  one tab's done() from deleting another tab's record. */
const IDB_HANDOFF_PREFIX = "handoff:";
/** Records (and pre-C8.1 `source-image:<id>` images) older than this were abandoned (never opened): openInCanvas prunes them. */
const IDB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

async function idbPut(key: string, value: unknown): Promise<void> {
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

async function idbGet(key: string): Promise<unknown> {
  const db = await idbOpen();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
      tx.onabort = () => reject(tx.error); // don't hang readCanvasSource() if the read tx aborts
    });
  } finally {
    db.close();
  }
}

/** Delete handoff records whose id (base-36 time first) is older than IDB_MAX_AGE_MS. Best effort. */
async function idbPrune(now: number): Promise<void> {
  try {
    const db = await idbOpen();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const req = tx.objectStore(IDB_STORE).openKeyCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return;
          const m = /^(?:handoff|source-image):([0-9a-z]+)-/.exec(String(cur.key));
          if (m && now - parseInt(m[1], 36) > IDB_MAX_AGE_MS) tx.objectStore(IDB_STORE).delete(cur.key);
          cur.continue();
        };
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

export const CANVAS_STAFF_HREF = canvasTarget().staffHref;

/** The IndexedDB record of one handoff. */
type HandoffRecord = { editor: CanvasEditorId; image?: string; source?: CanvasSourceFile; name?: string; ret?: CanvasReturnTicket & { id: string } };

/**
 * Send `image` to the pro editor at `href` in a new tab: `useDoorHref(canvasTarget(source?.name).staffHref)` --
 * CANVAS_STAFF_HREF for an image, /tools/vector-pro for a vector source; null (hide the button) on a door without one.
 * `baseName`: 產品-主圖名稱-風格, the opened file's name. `source`: the design's editable original, opened instead of the
 * image. `ret`: give the editor a "傳回 <label>" button; the edited PNG comes back to this tab's useCanvasReturn(ret.tool)
 * as onReturn(ret.slot, dataUrl). Call it straight from the click handler: the tab is opened before the first await
 * (popup blockers allow window.open only inside the click), then pointed at the editor once the record is written.
 */
export async function openInCanvas(
  image: string,
  baseName: string | undefined,
  href: string,
  source?: CanvasSourceFile,
  ret?: CanvasReturnTicket,
): Promise<void> {
  // id: base-36 time first (idbPrune reads it), random after: each handoff is distinct.
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let tab: Window | null = null;
  try {
    tab = window.open("", "_blank");
  } catch {
    tab = null; // blocked -> same tab below
  }
  if (tab) {
    try {
      tab.opener = null; // the editor tab talks back over BroadcastChannel only
    } catch {
      /* harmless */
    }
  }
  const record: HandoffRecord = {
    editor: canvasTarget(source?.name).editor,
    ...(source ? { source } : { image }),
    ...(baseName ? { name: baseName } : {}),
    ...(ret ? { ret: { ...ret, id } } : {}),
  };
  let url = href;
  try {
    await idbPrune(Date.now());
    await idbPut(`${IDB_HANDOFF_PREFIX}${id}`, record);
    url = `${href}${href.includes("?") ? "&" : "?"}h=${encodeURIComponent(id)}`;
    if (ret && tab) issuedReturnTickets.set(id, ret); // same-tab fallback: this page unloads, nobody would answer
  } catch {
    /* IndexedDB unavailable -> the editor opens empty (no ?h=) */
  }
  if (tab) tab.location.href = url;
  else window.location.assign(url);
}

/**
 * Fabric editor (CanvasEditor, until card C7.2) only: read back an old-style stashed image. A handoff addressed to a pro
 * editor (CANVAS_TARGET_KEY set) is not its to take. Checks sessionStorage first (preserves the previous
 * refresh-keeps-image behaviour for small payloads), then the IndexedDB sentinel — consuming the IDB entry so a future
 * session can't inherit a stale multi-MB image. Returns null when no handoff is pending.
 */
export async function readCanvasSource(): Promise<string | null> {
  try {
    if (sessionStorage.getItem(CANVAS_TARGET_KEY)) return null;
    const inline = sessionStorage.getItem(CANVAS_SOURCE_KEY);
    if (inline) return inline;
    if (sessionStorage.getItem(CANVAS_IDB_FLAG) === "1") {
      const value = await idbGet(IDB_IMAGE_KEY);
      sessionStorage.removeItem(CANVAS_IDB_FLAG);
      void idbDel(IDB_IMAGE_KEY);
      return typeof value === "string" ? value : null;
    }
  } catch {
    /* storage unavailable → no handoff */
  }
  return null;
}

/** What a pro editor's dock opens: a same-origin URL to fetch and the file name to open it as. */
export type ProEditorHandoff = {
  url: string;
  name: string;
  /** Delete the handoff record: call once the editor has opened it. */
  done: () => void;
  /** Present when the sender asked for the edited image back: the dock shows "傳回 <label>" and posts `{type:"return", id}`. */
  ret?: { id: string; label: string };
};

const IMAGE_EXT: Record<string, string> = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp", gif: "gif" };

/** `<base>.<ext>` for the handed-off image: ext from a data: URL's MIME or a URL's path, else png. */
export function handoffImageName(image: string, base: string | null): string {
  const kind = (/^data:image\/([a-z0-9.+-]+)[;,]/i.exec(image)?.[1] ?? /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(image.split(/[?#]/)[0] + "#")?.[1] ?? "").toLowerCase();
  return `${base || "canvas"}.${IMAGE_EXT[kind] ?? "png"}`;
}

/**
 * A pro editor's side: read the handoff named by this page's `?h=<id>` if it is addressed to `editor`, else leave it for
 * its own editor and return null. Nothing is deleted here: `done()` deletes the record once the editor has opened it; an
 * unreadable or empty record is deleted at once (nobody can open it); a failed read keeps it for the next load. The source
 * file, when there is one, is opened instead of the image; remote URLs go through the same-origin bucket download route
 * (toCanvasSrc: the bucket is cross-origin, so CORS blocks a direct fetch), data: URLs pass as they are.
 */
export async function takeCanvasHandoff(editor: CanvasEditorId): Promise<ProEditorHandoff | null> {
  let id: string | null = null;
  try {
    id = new URLSearchParams(window.location.search).get("h");
  } catch {
    return null;
  }
  if (!id) return null;
  const key = `${IDB_HANDOFF_PREFIX}${id}`;
  let raw: unknown;
  try {
    raw = await idbGet(key);
  } catch {
    return null; // a failed read is not a missing record: keep it for the next load
  }
  if (raw == null) return null;
  const rec = raw as Partial<HandoffRecord>;
  if (typeof rec !== "object" || typeof rec.editor !== "string") {
    void idbDel(key);
    return null;
  }
  if (rec.editor !== editor) return null;
  const done = () => void idbDel(key);
  const ret = rec.ret && rec.ret.id === id && typeof rec.ret.label === "string" ? { ret: { id, label: rec.ret.label } } : {};
  const src = rec.source;
  if (src && typeof src.url === "string" && src.url && typeof src.name === "string" && src.name) {
    return { url: toCanvasSrc(src.url), name: src.name, done, ...ret };
  }
  if (typeof rec.image !== "string" || !rec.image) {
    void idbDel(key); // nothing to open
    return null;
  }
  return { url: toCanvasSrc(rec.image), name: handoffImageName(rec.image, rec.name ?? null), done, ...ret };
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

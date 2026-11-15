import { randomUUID } from "node:crypto";
import { deleteDesignObject, designsBucket, isSafeObjectKey, r2DeleteObject, r2GetObject } from "../storage/r2";
import { copyObject, headObject } from "../storage/r2-s3";
import { SOURCE_CONTENT_TYPE, SOURCE_EXTS, type SourceExt } from "./design-source";

/**
 * Direct-to-R2 uploads for My Designs (plan lobster-factory/docs/PLAN-designs-direct-upload.md): the browser PUTs the original
 * bytes to uploads/pending/<org>/<uuid>.<ext>, then POST /api/tools/designs registers the key. The org segment is the
 * authorization (I3): a key is accepted only from a requester of that org. Unregistered keys expire by bucket lifecycle (C2).
 */
export const PENDING_PREFIX = "uploads/pending/";
/** Largest original accepted through the pending path (HEAD before copy, and again while reading). */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export const PRESIGN_TTL_SEC = 600;

/** The image types My Designs stores (r2.ts MIME_EXT minus video): key extension -> type. */
const IMAGE_EXT_MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type UploadImageMime = (typeof IMAGE_EXT_MIME)[keyof typeof IMAGE_EXT_MIME];
export const UPLOAD_IMAGE_MIMES = Object.values(IMAGE_EXT_MIME) as readonly UploadImageMime[];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`, "i");
const PENDING_KEY_RE = new RegExp(`^uploads/pending/(${UUID})/${UUID}\\.([a-z0-9]+)$`);

export type PendingTarget =
  | { ok: true; kind: "image"; mime: UploadImageMime; contentType: UploadImageMime; ext: string }
  | { ok: true; kind: "source"; ext: SourceExt; contentType: typeof SOURCE_CONTENT_TYPE }
  | { ok: false; error: string };

/** What the browser asked to upload -> the type it must PUT with and the key extension; anything off the allowlist fails. */
export function pendingTarget(kind: unknown, mime: unknown, ext: unknown): PendingTarget {
  if (kind === "image") {
    const m = typeof mime === "string" ? mime.trim().toLowerCase() : "";
    const hit = Object.entries(IMAGE_EXT_MIME).find(([, v]) => v === m);
    if (!hit) return { ok: false, error: `mime must be one of ${UPLOAD_IMAGE_MIMES.join(", ")}` };
    return { ok: true, kind: "image", mime: hit[1], contentType: hit[1], ext: hit[0] };
  }
  if (kind === "source") {
    const raw = typeof ext === "string" ? ext.trim().toLowerCase() : "";
    const e = (raw.startsWith(".") ? raw : `.${raw}`) as SourceExt;
    if (!SOURCE_EXTS.includes(e)) return { ok: false, error: `ext must be one of ${SOURCE_EXTS.join(", ")}` };
    return { ok: true, kind: "source", ext: e, contentType: SOURCE_CONTENT_TYPE };
  }
  return { ok: false, error: 'kind must be "image" or "source"' };
}

/** uploads/pending/<org>/<uuid>.<ext> (ext without the dot). null = org is not a uuid. */
export function mintPendingKey(org: string, ext: string): string | null {
  if (!UUID_RE.test(org)) return null;
  return `${PENDING_PREFIX}${org.toLowerCase()}/${randomUUID()}.${ext.replace(/^\./, "")}`;
}

export type PendingKey =
  | { ok: true; kind: "image"; key: string; mime: UploadImageMime; contentType: UploadImageMime }
  | { ok: true; kind: "source"; key: string; ext: SourceExt; contentType: typeof SOURCE_CONTENT_TYPE }
  | { ok: false; status: 400 | 403; error: string };

/** A key the requester may register: shape mintPendingKey makes, its org segment = the requester's org, ext of this kind. */
export function parsePendingKey(key: unknown, org: string, kind: "image" | "source"): PendingKey {
  const m = typeof key === "string" ? PENDING_KEY_RE.exec(key) : null;
  if (!m) return { ok: false, status: 400, error: "upload key must be uploads/pending/<org>/<uuid>.<ext> from /api/tools/designs/upload-url" };
  if (m[1] !== org.toLowerCase()) return { ok: false, status: 403, error: "upload key belongs to another organization" };
  const k = key as string;
  if (kind === "image") {
    const mime = (IMAGE_EXT_MIME as Record<string, UploadImageMime>)[m[2]];
    return mime ? { ok: true, kind, key: k, mime, contentType: mime } : { ok: false, status: 400, error: "upload key is not an image upload" };
  }
  const ext = `.${m[2]}` as SourceExt;
  return SOURCE_EXTS.includes(ext) ? { ok: true, kind, key: k, ext, contentType: SOURCE_CONTENT_TYPE } : { ok: false, status: 400, error: "sourceUpload key is not a source-file upload" };
}

/**
 * pending -> formalKey, then the bytes read back FROM formalKey (only the server writes there; the presigned PUT stays usable
 * until it expires, so checking the pending object and copying it later could check one file and keep another).
 * The caller owns formalKey from before this call: on any failure it deletes it (a copy may have landed before the error).
 */
export async function claimPendingUpload(
  p: { key: string; contentType: string },
  formalKey: string,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; error: string }> {
  const head = await headObject(p.key);
  if (!head.ok) {
    const e = (head as { ok: false; error: string }).error;
    return e === "r2_not_found" ? { ok: false, status: 404, error: "upload_not_found (expired or never uploaded)" } : { ok: false, status: 502, error: e };
  }
  if (head.contentLength === null) return { ok: false, status: 502, error: "upload_size_unknown" };
  if (head.contentLength > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: "upload too large (64 MiB limit)" };
  if ((head.contentType ?? "").split(";")[0].trim().toLowerCase() !== p.contentType) {
    return { ok: false, status: 400, error: "upload content-type does not match its key" };
  }
  const copied = await copyObject(p.key, formalKey);
  if (!copied.ok) return { ok: false, status: 502, error: (copied as { ok: false; error: string }).error };
  const got = await r2GetObject(designsBucket(), formalKey, { maxBytes: MAX_UPLOAD_BYTES, timeoutMs: 45_000 });
  if ("error" in got) {
    return got.error === "r2_object_too_large" ? { ok: false, status: 413, error: "upload too large (64 MiB limit)" } : { ok: false, status: 502, error: got.error };
  }
  return { ok: true, buffer: got.body };
}

// The shape buildDesignKey / sourceKeyFor mint: designs/YYYY-MM/<uuid>.<ext>. Nothing else is ever removed by the rollback.
const MINTED_DESIGN_KEY_RE = new RegExp(`^designs/\\d{4}-\\d{2}/${UUID}\\.[a-z0-9]+$`);

/**
 * Rollback of POST /api/tools/designs: deletes the designs/ keys that request minted and wrote before its row existed.
 * Only for keys minted in the same request and never returned to the client (no media_assets row, no post can show them);
 * a saved asset's file is deleted only through lib/content/r2-delete-guard.ts.
 */
export async function discardUnregisteredDesignObjects(keys: readonly string[]): Promise<void> {
  for (const k of keys) {
    if (!MINTED_DESIGN_KEY_RE.test(k)) { console.error("[designs] rollback refused, not a minted key:", k); continue; }
    const r = await deleteDesignObject(k);
    if (!r.ok) console.error("[designs] rollback delete failed:", k, (r as { ok: false; error: string }).error);
  }
}

/** Best effort after the row exists: the lifecycle rule removes whatever this misses. Pending keys only. */
export async function discardPendingUpload(key: string): Promise<void> {
  if (!key.startsWith(PENDING_PREFIX) || !isSafeObjectKey(key)) return;
  const r = await r2DeleteObject(designsBucket(), key);
  if ("error" in r) console.warn("[designs] pending delete failed (lifecycle will remove it):", r.error);
}

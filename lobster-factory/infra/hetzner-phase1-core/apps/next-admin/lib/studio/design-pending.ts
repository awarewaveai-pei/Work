import { randomUUID } from "node:crypto";
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

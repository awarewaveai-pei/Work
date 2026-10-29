import { createHash, randomUUID } from "node:crypto";

/**
 * Cloudflare R2 object storage via the Cloudflare REST API.
 *
 * Follows the established convention from /root/lobster-phase1/scripts/upload-to-r2.sh:
 * plain Bearer-token PUT against api.cloudflare.com — no S3 credentials, no aws-sdk.
 * Designs live in their own bucket (R2_DESIGNS_BUCKET), never in the backup bucket.
 */

const DEFAULT_DESIGNS_BUCKET = "lobster-designs";
// Public dev URL of the designs bucket (enabled 2026-06-11). Not a secret — it is the
// public serving origin. Override with R2_DESIGNS_PUBLIC_BASE when a custom domain lands.
const DEFAULT_PUBLIC_BASE = "https://pub-a88b06f569bd41a3b9e27e29644d520e.r2.dev";

export interface R2PutResult {
  ok: true;
  objectKey: string;
  publicUrl: string;
  byteSize: number;
  checksumSha256: string;
}

export interface R2PutError {
  ok: false;
  error: string;
}

function getR2Config(): { apiToken: string; accountId: string; bucket: string; publicBase: string } | null {
  const apiToken = process.env.R2_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!apiToken || !accountId) return null;
  return {
    apiToken,
    accountId,
    bucket: process.env.R2_DESIGNS_BUCKET ?? DEFAULT_DESIGNS_BUCKET,
    publicBase: (process.env.R2_DESIGNS_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, ""),
  };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

/** Public serving origin of the designs bucket (no trailing slash). Not a secret. */
export function getDesignsPublicBase(): string {
  return (process.env.R2_DESIGNS_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
}

/**
 * True iff `url` is one of OUR R2 designs-bucket assets (designs/ master OR web/ derivative). Used as
 * an SSRF allowlist before any server-side fetch of the URL: a bare `startsWith(base)` is bypassable
 * (`https://<base-host>.attacker.tld/x` passes a prefix test), so we require a `/` boundary AND assert
 * the parsed origin is https with the exact bucket host. Mirrors the guard in lib/tarot/image-gen.ts.
 */
export function isDesignsAsset(url: unknown): url is string {
  return isUnderBase(url, getDesignsPublicBase());
}

/** True iff `url` is a public object of the designs bucket or the video bucket (R2_VIDEO_PUBLIC_BASE), same guard. */
export function isPublicBucketAsset(url: unknown): url is string {
  return isDesignsAsset(url) || isUnderBase(url, (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, ""));
}

function isUnderBase(url: unknown, base: string): url is string {
  if (typeof url !== "string" || !base) return false;
  if (!url.startsWith(base + "/")) return false;
  try {
    const u = new URL(url);
    const b = new URL(base);
    return u.protocol === "https:" && u.host === b.host;
  } catch {
    return false;
  }
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  // video/mp4：使用者上傳影片素材（/api/video/upload-asset）。現有 image 生成路徑永不傳 video mime，故為純擴充。
  "video/mp4": "mp4",
};

export function extensionForMime(mime: string): string | null {
  return MIME_EXT[mime] ?? null;
}

/** designs/YYYY-MM/<uuid>.<ext> — stable, collision-free, listable by month. */
export function buildDesignKey(mime: string, now: Date = new Date()): string | null {
  const ext = extensionForMime(mime);
  if (!ext) return null;
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  // Imported randomUUID (not global crypto) — SG host runs Node 18 where the
  // crypto global is absent in the vitest/npm-test context (sg-deploy gate).
  return `designs/${yyyy}-${mm}/${randomUUID()}.${ext}`;
}

/**
 * web/YYYY-MM/<uuid>.webp — keys for storefront DISPLAY derivatives (WebP ≤150KB), deliberately
 * under a SEPARATE prefix from designs/. The designs/ masters (full-res originals for re-editing and
 * the high-res print files sent to Printful) are NEVER overwritten — these are disposable web copies
 * the wp-bridge sideloads into WordPress. Same bucket, distinct prefix, so "My Designs" (designs/)
 * stays clean.
 */
export function buildWebImageKey(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `web/${yyyy}-${mm}/${randomUUID()}.webp`;
}

/** Parse a base64 data URL into mime + buffer. Returns null when malformed or unsupported. */
export function parseImageDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

// ── Bucket-generic object transport ─────────────────────────────────────────
// One implementation of PUT/GET/DELETE/LIST for every bucket. The designs helpers below delegate
// here; site-watch (lib/site-watch/storage.ts) uses a PRIVATE bucket through the same functions.

type R2Fail = { ok: false; error: string; status?: number };

function r2Credentials(): { apiToken: string; accountId: string } | null {
  const apiToken = process.env.R2_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  return apiToken && accountId ? { apiToken, accountId } : null;
}

function bucketBase(accountId: string, bucket: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`;
}

/** Keys keep their "/" separators; everything else is percent-encoded once. */
function objectUrl(accountId: string, bucket: string, objectKey: string): string {
  return `${bucketBase(accountId, bucket)}/objects/${encodeURIComponent(objectKey).replace(/%2F/g, "/")}`;
}

export async function r2PutObject(
  bucket: string,
  objectKey: string,
  body: Buffer,
  contentType: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: true } | R2Fail> {
  const cred = r2Credentials();
  if (!cred) return { ok: false, error: "r2_not_configured" };
  let res: Response;
  try {
    res = await fetch(objectUrl(cred.accountId, bucket, objectKey), {
      method: "PUT",
      headers: { Authorization: `Bearer ${cred.apiToken}`, "Content-Type": contentType },
      body: new Uint8Array(body),
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
    });
  } catch {
    return { ok: false, error: "r2_network_error" };
  }
  return res.ok ? { ok: true } : { ok: false, error: `r2_put_failed_${res.status}`, status: res.status };
}

export async function r2GetObject(
  bucket: string,
  objectKey: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ ok: true; body: Buffer; contentType: string } | R2Fail> {
  const cred = r2Credentials();
  if (!cred) return { ok: false, error: "r2_not_configured" };
  let res: Response;
  try {
    res = await fetch(objectUrl(cred.accountId, bucket, objectKey), {
      headers: { Authorization: `Bearer ${cred.apiToken}` },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch {
    return { ok: false, error: "r2_network_error" };
  }
  if (!res.ok) return { ok: false, error: res.status === 404 ? "r2_not_found" : `r2_get_failed_${res.status}`, status: res.status };
  const body = Buffer.from(await res.arrayBuffer());
  if (opts.maxBytes && body.byteLength > opts.maxBytes) return { ok: false, error: "r2_object_too_large" };
  return { ok: true, body, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

/** 404 = already gone = success (idempotent). */
export async function r2DeleteObject(
  bucket: string,
  objectKey: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: true } | R2Fail> {
  const cred = r2Credentials();
  if (!cred) return { ok: false, error: "r2_not_configured" };
  let res: Response;
  try {
    res = await fetch(objectUrl(cred.accountId, bucket, objectKey), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cred.apiToken}` },
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
    });
  } catch {
    return { ok: false, error: "r2_network_error" };
  }
  if (!res.ok && res.status !== 404) return { ok: false, error: `r2_delete_failed_${res.status}`, status: res.status };
  return { ok: true };
}

export interface R2ListedObject {
  key: string;
  /** null when the API did not report it — callers must treat that as "age unknown", never "old". */
  lastModified: Date | null;
}

/** Every object under `prefix` (follows the cursor). `prefix` is the raw key prefix, encoded once here. */
export async function r2ListObjects(
  bucket: string,
  prefix: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: true; objects: R2ListedObject[] } | R2Fail> {
  const cred = r2Credentials();
  if (!cred) return { ok: false, error: "r2_not_configured" };
  const objects: R2ListedObject[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(`${bucketBase(cred.accountId, bucket)}/objects`);
    u.searchParams.set("per_page", "1000");
    u.searchParams.set("prefix", prefix);
    if (cursor) u.searchParams.set("cursor", cursor);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        headers: { Authorization: `Bearer ${cred.apiToken}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
    } catch {
      return { ok: false, error: "r2_list_network_error" };
    }
    if (!res.ok) return { ok: false, error: `r2_list_failed_${res.status}`, status: res.status };
    const j = (await res.json()) as {
      result?: Array<{ key: string; last_modified?: string }>;
      result_info?: { cursor?: string; is_truncated?: boolean };
    };
    for (const o of j.result ?? []) {
      const t = o.last_modified ? new Date(o.last_modified) : null;
      objects.push({ key: o.key, lastModified: t && !Number.isNaN(t.getTime()) ? t : null });
    }
    cursor = j.result_info?.is_truncated ? j.result_info.cursor : undefined;
  } while (cursor);
  return { ok: true, objects };
}

/** Delete one object from the designs bucket. Returns ok:true on success or 404 (already gone). */
export async function deleteDesignObject(
  objectKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getR2Config();
  if (!config) return { ok: false, error: "r2_not_configured" };
  const r = await r2DeleteObject(config.bucket, objectKey);
  return "error" in r ? { ok: false, error: r.error } : { ok: true };
}

/**
 * media_assets.object_key for a video is `video/<dir>/<format>.mp4` percent-encoded (videoObjectKey uses URL.pathname, so CJK
 * becomes %E9…). Anything that hands the key to R2 or video-service needs the raw form; null = not a video key.
 */
export function decodeVideoObjectKey(objectKey: string): string | null {
  if (!/^video\/.+\/[^/]+\.mp4$/.test(objectKey)) return null;
  try { return decodeURIComponent(objectKey); } catch { return null; }
}

/**
 * Delete all objects under the video/<dir>/ prefix in R2_VIDEO_BUCKET ("lobster-videos").
 * Uses LIST-then-delete rather than a hardcoded format list so it is immune to format drift
 * between r2.ts, reconcile.ts, and the EU video-service FORMATS SSOT.
 *
 * Videos are NOT in the designs bucket — using deleteDesignObject on a video was a no-op
 * (the object isn't there → 404 treated as success), leaving the file in lobster-videos so
 * the reconcile cron re-inserted the media_assets row every ~15 min.
 *
 * Idempotent — 404s and an empty list both return ok:true.
 */
export async function deleteVideoObjects(
  objectKey: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const apiToken = process.env.R2_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!apiToken || !accountId) return { ok: false, error: "r2_not_configured" };

  // object_key for videos is `video/<dir>/<format>.mp4`.
  // videoObjectKey() derives the key via URL.pathname which percent-encodes CJK chars
  // (e.g. 龍蝦 → %E9%BE%8D%8D). Decode before building the LIST prefix so that
  // URLSearchParams.set() encodes the raw UTF-8 once — matching Cloudflare's raw key.
  // Double-encoding (%25E9…) would cause LIST to return 0 results and silently succeed
  // while leaving the files in the bucket (orphan → reconcile re-inserts every ~15 min).
  const decoded = decodeVideoObjectKey(objectKey);
  if (!decoded) return { ok: false, error: "invalid_video_object_key" };
  const dir = /^video\/(.+)\/[^/]+\.mp4$/.exec(decoded)![1];

  const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`;
  const headers = { Authorization: `Bearer ${apiToken}` };

  // 1) List all objects under video/<dir>/, its caption-less copies videoclean/<dir>/ and its caption-reburn versions
  //    videorev/<dir>/ (V4.8): one video = all three prefixes, so a delete never leaves a copy behind. Listing is authoritative,
  //    immune to format-name drift.
  const keys: string[] = [];
  for (const prefix of [`video/${dir}/`, `videoclean/${dir}/`, `videorev/${dir}/`]) {
  let cursor: string | undefined;
  do {
    const u = new URL(`${base}/objects`);
    u.searchParams.set("per_page", "100");
    u.searchParams.set("prefix", prefix);
    if (cursor) u.searchParams.set("cursor", cursor);
    let listRes: Response;
    try {
      listRes = await fetch(u.toString(), { headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      return { ok: false, error: "r2_video_list_network_error" };
    }
    if (!listRes.ok) return { ok: false, error: `r2_video_list_failed_${listRes.status}` };
    const j = (await listRes.json()) as { result?: { key: string }[]; result_info?: { cursor?: string; is_truncated?: boolean } };
    for (const o of j.result ?? []) keys.push(o.key);
    cursor = j.result_info?.is_truncated ? j.result_info.cursor : undefined;
  } while (cursor);
  }

  // 2) Delete each object found (idempotent — 404 treated as success).
  let deleted = 0;
  for (const key of keys) {
    try {
      const res = await fetch(
        `${base}/objects/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
        { method: "DELETE", headers },
      );
      if (!res.ok && res.status !== 404) {
        return { ok: false, error: `r2_video_delete_failed_${res.status}` };
      }
      deleted++;
    } catch {
      return { ok: false, error: "r2_video_network_error" };
    }
  }
  return { ok: true, deleted };
}

/**
 * Upload one object to the designs bucket. Returns the public URL on success.
 * Caller is responsible for size limits; this function only transports bytes.
 */
export async function putDesignObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<R2PutResult | R2PutError> {
  const config = getR2Config();
  if (!config) return { ok: false, error: "r2_not_configured" };
  const put = await r2PutObject(config.bucket, objectKey, body, contentType);
  if ("error" in put) return { ok: false, error: put.error };
  return {
    ok: true,
    objectKey,
    publicUrl: `${config.publicBase}/${objectKey}`,
    byteSize: body.byteLength,
    checksumSha256: sha256Hex(body),
  };
}

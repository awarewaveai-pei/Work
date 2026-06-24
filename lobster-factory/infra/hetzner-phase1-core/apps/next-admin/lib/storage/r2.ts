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
  if (typeof url !== "string") return false;
  const base = getDesignsPublicBase();
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

/** Delete one object from the designs bucket. Returns ok:true on success or 404 (already gone). */
export async function deleteDesignObject(
  objectKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getR2Config();
  if (!config) return { ok: false, error: "r2_not_configured" };

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}` +
    `/r2/buckets/${config.bucket}/objects/${encodeURIComponent(objectKey).replace(/%2F/g, "/")}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.apiToken}` },
    });
  } catch {
    return { ok: false, error: "r2_network_error" };
  }
  // 404 = already deleted; treat as success (idempotent delete).
  if (!res.ok && res.status !== 404) {
    return { ok: false, error: `r2_delete_failed_${res.status}` };
  }
  return { ok: true };
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiToken = process.env.R2_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!apiToken || !accountId) return { ok: false, error: "r2_not_configured" };

  // object_key for videos is `video/<dir>/<format>.mp4` — extract the dir segment.
  const m = /^video\/(.+)\/[^/]+\.mp4$/.exec(objectKey);
  if (!m) return { ok: false, error: "invalid_video_object_key" };
  const dir = m[1];

  const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`;
  const headers = { Authorization: `Bearer ${apiToken}` };

  // 1) List all objects under video/<dir>/ (authoritative, immune to format-name drift).
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(`${base}/objects`);
    u.searchParams.set("per_page", "100");
    u.searchParams.set("prefix", `video/${dir}/`);
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

  // 2) Delete each object found (idempotent — 404 treated as success).
  for (const key of keys) {
    try {
      const res = await fetch(
        `${base}/objects/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
        { method: "DELETE", headers },
      );
      if (!res.ok && res.status !== 404) {
        return { ok: false, error: `r2_video_delete_failed_${res.status}` };
      }
    } catch {
      return { ok: false, error: "r2_video_network_error" };
    }
  }
  return { ok: true };
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

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}` +
    `/r2/buckets/${config.bucket}/objects/${encodeURIComponent(objectKey).replace(/%2F/g, "/")}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": contentType,
      },
      body: new Uint8Array(body),
    });
  } catch {
    return { ok: false, error: "r2_network_error" };
  }
  if (!res.ok) {
    return { ok: false, error: `r2_put_failed_${res.status}` };
  }
  return {
    ok: true,
    objectKey,
    publicUrl: `${config.publicBase}/${objectKey}`,
    byteSize: body.byteLength,
    checksumSha256: sha256Hex(body),
  };
}

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

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
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

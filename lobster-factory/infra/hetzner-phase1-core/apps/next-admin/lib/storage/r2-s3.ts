import { AwsClient } from "aws4fetch";
import { designsBucket, isSafeObjectKey, readCappedBody } from "./r2";

/**
 * R2 through its S3 API (SigV4, aws4fetch) -- only for what the Cloudflare REST API in r2.ts cannot do: presigned
 * browser PUTs and server-side CopyObject (plan lobster-factory/docs/PLAN-designs-direct-upload.md §2). Designs bucket only.
 * Credentials R2_S3_ACCESS_KEY_ID / R2_S3_SECRET_ACCESS_KEY (a token scoped to that bucket); absent = r2_s3_not_configured.
 */

type Fail = { ok: false; error: string; status?: number };

function s3Config(): { client: AwsClient; endpoint: string; bucket: string } | null {
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accessKeyId || !secretAccessKey || !accountId) return null;
  return {
    // retries: aws4fetch retries 5xx/429 itself; 2 keeps a copy + read inside the route's 60 s budget.
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto", retries: 2 }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket: designsBucket(),
  };
}

export function isR2S3Configured(): boolean {
  return s3Config() !== null;
}

/** Path-style object URL; each key segment percent-encoded once. null = unsafe key (r2.ts isSafeObjectKey). */
function objectUrl(endpoint: string, bucket: string, key: string): string | null {
  if (!isSafeObjectKey(key)) return null;
  return `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** A URL the browser PUTs the bytes to. Content-Type is a signed header: a PUT with any other type is refused by R2. */
export async function presignPut(key: string, mime: string, expiresSec: number): Promise<{ ok: true; url: string } | Fail> {
  const cfg = s3Config();
  if (!cfg) return { ok: false, error: "r2_s3_not_configured" };
  const url = objectUrl(cfg.endpoint, cfg.bucket, key);
  if (!url) return { ok: false, error: "r2_bad_key" };
  const u = new URL(url);
  u.searchParams.set("X-Amz-Expires", String(Math.max(1, Math.min(604_800, Math.floor(expiresSec)))));
  const signed = await cfg.client.sign(u.toString(), {
    method: "PUT",
    headers: { "Content-Type": mime },
    // allHeaders: aws4fetch leaves content-type out of SignedHeaders by default.
    aws: { signQuery: true, allHeaders: true },
  });
  return { ok: true, url: signed.url };
}

/** HEAD: size + type of one object. 404 = r2_not_found. */
export async function headObject(key: string): Promise<{ ok: true; contentLength: number | null; contentType: string | null } | Fail> {
  const cfg = s3Config();
  if (!cfg) return { ok: false, error: "r2_s3_not_configured" };
  const url = objectUrl(cfg.endpoint, cfg.bucket, key);
  if (!url) return { ok: false, error: "r2_bad_key" };
  let res: Response;
  try {
    res = await cfg.client.fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false, error: "r2_s3_network_error" };
  }
  if (!res.ok) return { ok: false, error: res.status === 404 ? "r2_not_found" : `r2_head_failed_${res.status}`, status: res.status };
  const len = res.headers.get("content-length");
  const n = len === null ? NaN : Number(len);
  return { ok: true, contentLength: Number.isFinite(n) && n >= 0 ? n : null, contentType: res.headers.get("content-type") };
}

/** Server-side copy inside the designs bucket (metadata, incl. Content-Type, copied from the source). */
export async function copyObject(srcKey: string, dstKey: string): Promise<{ ok: true } | Fail> {
  const cfg = s3Config();
  if (!cfg) return { ok: false, error: "r2_s3_not_configured" };
  const url = objectUrl(cfg.endpoint, cfg.bucket, dstKey);
  if (!url || !isSafeObjectKey(srcKey)) return { ok: false, error: "r2_bad_key" };
  const source = `${cfg.bucket}/${srcKey.split("/").map(encodeURIComponent).join("/")}`;
  let res: Response;
  try {
    res = await cfg.client.fetch(url, { method: "PUT", headers: { "x-amz-copy-source": source }, signal: AbortSignal.timeout(30_000) });
  } catch {
    return { ok: false, error: "r2_s3_network_error" };
  }
  if (!res.ok) return { ok: false, error: res.status === 404 ? "r2_not_found" : `r2_copy_failed_${res.status}`, status: res.status };
  // S3 may answer a failed copy with 200 + <Error> in the body; only <CopyObjectResult> counts as done.
  const text = await res.text().catch(() => "");
  if (!/<CopyObjectResult[\s>]/.test(text)) return { ok: false, error: "r2_copy_failed_body" };
  return { ok: true };
}

/** GET with a byte cap (r2.ts readCappedBody). Faster than the Cloudflare REST read of r2GetObject (it proxies the bytes):
 *  measured 2026-11-15 on a 9 MB object from the laptop, S3 19 s vs REST 32 s. 404 = r2_not_found. */
export async function getObject(key: string, opts: { maxBytes: number; timeoutMs?: number }): Promise<{ ok: true; body: Buffer } | Fail> {
  const cfg = s3Config();
  if (!cfg) return { ok: false, error: "r2_s3_not_configured" };
  const url = objectUrl(cfg.endpoint, cfg.bucket, key);
  if (!url) return { ok: false, error: "r2_bad_key" };
  let res: Response;
  try {
    res = await cfg.client.fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000) });
  } catch {
    return { ok: false, error: "r2_s3_network_error" };
  }
  if (!res.ok) return { ok: false, error: res.status === 404 ? "r2_not_found" : `r2_get_failed_${res.status}`, status: res.status };
  const body = await readCappedBody(res, opts.maxBytes);
  return Buffer.isBuffer(body) ? { ok: true, body } : body;
}

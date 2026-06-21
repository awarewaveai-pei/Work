/**
 * WP display-image normalisation — the single boundary that enforces the operator's invariant:
 * EVERY image uploaded to a WordPress storefront (product gallery + colour-variation images) is
 * WebP and ≤150KB. This runs on OUR Node + sharp infra, so it is HOST-INDEPENDENT — it works for
 * any client WordPress regardless of whether that host's PHP image library supports WebP (the
 * reason we do NOT enforce this on the WP side: this swatch/POD stack is a drop-in for arbitrary
 * client sites). See agency-os/WORKLOG.md (2026-06-22 fix(pod) WebP boundary).
 *
 * It NEVER touches the masters:
 *   - the full-res ORIGINAL design stays in the R2 `designs/` bucket (so re-editing has the big file);
 *   - the high-res PRINT FILE goes to Printful / any print provider unchanged (printing needs full res).
 * It bakes a SEPARATE small display derivative under the R2 `web/` prefix and returns its URL.
 *
 * @package next-admin/lib/studio
 */
import sharp from "sharp";
import { buildWebImageKey, putDesignObject } from "../storage/r2";

/** Operator rule: nothing over 150KB lands in WordPress. */
const WP_MAX_BYTES = 150 * 1024;
/** Never buffer an unbounded body — the SG host is OOM-prone (mirrors the productimage cap). */
const FETCH_MAX_BYTES = 60 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;
const SHARP_LIMIT_INPUT_PIXELS = 50_000_000;
/** Opaque white — product images are opaque; flatten removes any source alpha. */
const WHITE = { r: 255, g: 255, b: 255 };

// Walk DOWN dimension then quality until the encoded WebP is ≤150KB. Starting at 1280px keeps
// product photos crisp; most designs resolve within the first dimension at a high quality.
const DIMENSION_STEPS = [1280, 1024, 800, 600];
const QUALITY_STEPS = [82, 74, 66, 58, 50, 42];

/**
 * Encode `input` as a WebP ≤150KB. Returns the first buffer at or under the cap; if even the
 * smallest/lowest setting cannot reach it (pathological input), returns the smallest buffer
 * produced so the caller still gets a valid — if slightly oversized — WebP rather than nothing.
 */
export async function toWebUnder150KB(input: Buffer): Promise<Buffer> {
  let smallest: Buffer | null = null;
  for (const dim of DIMENSION_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const buf = await sharp(input, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
        .rotate() // honour EXIF orientation before resizing
        .resize({ width: dim, height: dim, fit: "inside", withoutEnlargement: true })
        .flatten({ background: WHITE })
        .webp({ quality })
        .toBuffer();
      if (!smallest || buf.byteLength < smallest.byteLength) smallest = buf;
      if (buf.byteLength <= WP_MAX_BYTES) return buf;
    }
  }
  // Non-null: the loops always run at least once.
  return smallest as Buffer;
}

/**
 * Fetch one image URL, bake a WebP ≤150KB display derivative, store it under R2 `web/`, and return
 * the public URL the wp-bridge will sideload. Returns `null` on any failure (fetch / decode / store)
 * so the caller can fall back to the original URL and log — a working product beats a broken one.
 *
 * Fast path: an already-compliant image (WebP and ≤150KB) is passed through untouched (no re-encode,
 * no quality loss, no extra R2 object).
 */
export async function normalizeForWp(url: string): Promise<string | null> {
  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let input: Buffer;
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? "0") > FETCH_MAX_BYTES) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > FETCH_MAX_BYTES) return null;
    // Already compliant → keep as-is (avoids a needless re-encode + R2 object).
    if (ab.byteLength <= WP_MAX_BYTES && (res.headers.get("content-type") ?? "").includes("webp")) {
      return url;
    }
    input = Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
  }

  let webp: Buffer;
  try {
    webp = await toWebUnder150KB(input);
  } catch {
    return null;
  }

  const put = await putDesignObject(buildWebImageKey(), webp, "image/webp");
  return put.ok ? put.publicUrl : null;
}

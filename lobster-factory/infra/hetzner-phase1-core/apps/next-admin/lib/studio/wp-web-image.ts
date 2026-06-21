/**
 * WP display-image normalisation — the single boundary that enforces the operator's invariant:
 * EVERY image uploaded to a WordPress storefront (product gallery + colour-variation images) or post
 * (hero + in-article images, bridge path) is WebP and ≤150KB. This runs on OUR Node + sharp infra, so
 * it is HOST-INDEPENDENT — it works for any client WordPress regardless of whether that host's PHP
 * image library supports WebP (the reason we do NOT enforce this on the WP side: this swatch/POD stack
 * is a drop-in for arbitrary client sites). See agency-os/WORKLOG.md (2026-06-22 fix(pod) WebP boundary).
 *
 * It NEVER touches the masters:
 *   - the full-res ORIGINAL design stays in the R2 `designs/` bucket (so re-editing has the big file);
 *   - the high-res PRINT FILE goes to Printful / any print provider unchanged (printing needs full res).
 * It bakes a SEPARATE small display derivative under the R2 `web/` prefix and returns its URL.
 *
 * SSRF: callers MUST gate input URLs through `isDesignsAsset` (our R2 only) before passing them here —
 * `normalizeForWp` additionally fails closed on redirects (`redirect: "manual"`) so an allowlisted
 * origin cannot 3xx-bounce the server fetch to an arbitrary host.
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
/** Decoder-bomb ceiling. 25MP is ample for display derivatives (our designs are ≤~2MP); a larger
 *  input is almost certainly not a display image and is rejected rather than risk an OOM decode. */
const SHARP_LIMIT_INPUT_PIXELS = 25_000_000;
/** Opaque white — product images are opaque; flatten removes any source alpha. */
const WHITE = { r: 255, g: 255, b: 255 };
/** Bound concurrent fetch+decode on the OOM-prone host (each in-flight decode can hold ~100MB raw). */
const DEFAULT_CONCURRENCY = 3;

// Walk DOWN dimension then quality until the encoded WebP is ≤150KB. Starting at 1280px keeps
// product photos crisp; most designs resolve within the first dimension at a high quality.
const DIMENSION_STEPS = [1280, 1024, 800, 600];
const QUALITY_STEPS = [82, 74, 66, 58, 50, 42];

/**
 * Encode `input` as a WebP ≤150KB. Returns the first buffer at or under the cap; if even the
 * smallest/lowest setting cannot reach it (pathological/high-entropy input), returns the smallest
 * buffer produced AND logs a warning — so the one case that violates the invariant is observable in
 * logs rather than silent (critic 2026-06-22). The caller still uploads it (a valid, if oversized,
 * WebP beats no image).
 */
export async function toWebUnder150KB(input: Buffer): Promise<Buffer> {
  // Source dimensions decide which steps are worth trying: resizing UP is a no-op (withoutEnlargement),
  // so any step ≥ the source's long edge produces the same pixels — try the source size once, then
  // only smaller steps. Avoids redundant re-encodes of an already-small source (critic 2026-06-22).
  let srcMax = Infinity;
  try {
    const meta = await sharp(input).metadata();
    srcMax = Math.max(meta.width ?? 0, meta.height ?? 0) || Infinity;
  } catch {
    /* fall back to the full ladder if metadata read fails */
  }
  const dims = DIMENSION_STEPS.filter((d) => d < srcMax);
  const effectiveDims = dims.length && dims[0] === DIMENSION_STEPS[0] ? dims : [Math.min(DIMENSION_STEPS[0], srcMax), ...dims];

  let smallest: Buffer | null = null;
  let smallestDim = 0;
  for (const dim of effectiveDims) {
    for (const quality of QUALITY_STEPS) {
      const buf = await sharp(input, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
        .rotate() // honour EXIF orientation before resizing
        .resize({ width: dim, height: dim, fit: "inside", withoutEnlargement: true })
        .flatten({ background: WHITE })
        .webp({ quality })
        .toBuffer();
      if (!smallest || buf.byteLength < smallest.byteLength) {
        smallest = buf;
        smallestDim = dim;
      }
      if (buf.byteLength <= WP_MAX_BYTES) return buf;
    }
  }
  // Non-null: the loops always run at least once.
  console.warn(
    `[wp-web-image] could not reach the 150KB cap; best=${Math.round((smallest as Buffer).byteLength / 1024)}KB @ ${smallestDim}px — uploading oversized.`,
  );
  return smallest as Buffer;
}

/**
 * Fetch one image URL, bake a WebP ≤150KB display derivative, store it under R2 `web/`, and return
 * the public URL the wp-bridge will sideload. Returns `null` on any failure (fetch / redirect / decode
 * / store) so the caller can fall back to the original URL and log — a working product beats a broken
 * one.
 *
 * Caller MUST have already allowlisted `url` (our R2) — see `isDesignsAsset`. `redirect: "manual"`
 * fails closed so an allowlisted origin cannot bounce the fetch off-host.
 *
 * Fast path: an already-compliant image (WebP and ≤150KB) is passed through untouched (no re-encode,
 * no quality loss, no extra R2 object).
 */
export async function normalizeForWp(url: string): Promise<string | null> {
  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let input: Buffer;
  try {
    const res = await fetch(url, { redirect: "manual", signal: controller.signal });
    if (!res.ok) return null; // a 3xx is not `ok` → fails closed (no off-host bounce).
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

/**
 * Normalise many URLs with bounded concurrency, deduplicating first. Returns a Map from EACH input URL
 * to its WebP display URL — or back to the original URL when normalisation failed (logged once per
 * failure). Bounded so an article with many images, or the POD gallery, never fan-out fetch+decode
 * unboundedly on the OOM-prone host (critic 2026-06-22).
 */
export async function normalizeManyForWp(
  urls: Iterable<string>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<Map<string, string>> {
  const unique = [...new Set(urls)];
  const out = new Map<string, string>();
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < unique.length) {
      const u = unique[cursor++];
      const web = await normalizeForWp(u);
      if (!web) console.warn(`[wp-web-image] normalise failed; keeping original for WP upload: ${u}`);
      out.set(u, web ?? u);
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, unique.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return out;
}

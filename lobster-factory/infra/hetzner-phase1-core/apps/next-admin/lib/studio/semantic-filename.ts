/**
 * Semantic download filenames — 產品-主圖名稱-風格[-軌].ext.
 *
 * Every studio download path used to emit a FIXED name (web-tarot.webp,
 * web-square.webp, canvas-design.png, design.png …), so a folder of downloads was
 * unidentifiable (operator report 2026-06-14). This builds a human-meaningful name
 * from the metadata the studio already holds (product / subject / style). It is PURE
 * and CLIENT-SAFE (zero node imports) so OutputTrackBar and CanvasEditor can both
 * import it without dragging sharp/node into the browser bundle.
 *
 * The operator's spec was "產品-主圖名稱-畫家/媒材/風格.ext". The slashes there mean
 * "or" (pick whichever segment applies) — NOT literal path separators. A "/" in a
 * filename is illegal on every OS, so sanitise() strips it along with the rest of the
 * Windows + POSIX reserved set; an empty segment is simply dropped.
 */

export interface SemanticFileMeta {
  /** 產品 — product label, e.g. "塔羅卡" / "T-shirt". */
  product?: string;
  /** 主圖名稱 — the work/subject title, e.g. "月亮女神". */
  subject?: string;
  /** 畫家／媒材／風格 — artist or medium or style, e.g. "水彩". */
  style?: string;
  /** Optional track tag to disambiguate outputs (e.g. "網頁" / "印刷"). */
  track?: string;
}

// Members normalised to a dash (then seg() collapses dash runs):
//   \p{Cc}            ASCII/Unicode control chars (un-saveable on Windows; \u flag enables \p)
//   space             word separator
//   \\ / : * ? " < > |  Windows + POSIX reserved / path-separator set
//   .                 dot — so a ". . ." segment can't form a leading-dot / ".." name
// Literal dash is intentionally NOT a member; the trailing collapse step folds dash runs.
const ILLEGAL = /[\p{Cc} \\/:*?"<>|.]+/gu;
// A segment must carry at least one letter or number to survive — rejects dot-only /
// punctuation-only inputs that would otherwise yield a malformed name.
const HAS_CONTENT = /[\p{L}\p{N}]/u;

/** Sanitise one segment: drop illegal chars, collapse dashes, trim, require real content. */
function seg(v: string | undefined): string {
  if (!v) return "";
  const out = v
    .trim()
    .replace(ILLEGAL, "-") // reserved/space/dot/control → dash
    .replace(/-+/g, "-") // collapse repeated dashes
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dash
  return HAS_CONTENT.test(out) ? out : "";
}

/** Joined "產品-主圖名稱-風格[-軌]" base (no extension); "" when every segment is empty. */
function buildBase(meta: SemanticFileMeta): string {
  const parts = [seg(meta.product), seg(meta.subject), seg(meta.style), seg(meta.track)].filter(
    Boolean,
  );
  // Slice on code points (not UTF-16 units) so a 120-boundary can't split a surrogate pair.
  return parts.length === 0 ? "" : [...parts.join("-")].slice(0, 120).join("");
}

/**
 * Build "產品-主圖名稱-風格[-軌].ext". Empty segments are dropped; if EVERY segment is
 * empty the caller's `fallback` (the old fixed name) is returned, so a download is
 * never blocked by missing metadata.
 */
export function buildSemanticFilename(
  meta: SemanticFileMeta,
  ext: string,
  fallback: string,
): string {
  const base = buildBase(meta);
  if (!base) return fallback;
  return ext ? `${base}.${ext}` : base;
}

/** Extension-less semantic base for handoffs (e.g. canvas); undefined when no metadata. */
export function buildSemanticBase(meta: SemanticFileMeta): string | undefined {
  return buildBase(meta) || undefined;
}

/** Pull the extension off a server-provided filename (e.g. "web-square.webp" → "webp"). */
export function extOf(filename: string | undefined, fallbackExt: string): string {
  if (!filename) return fallbackExt;
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1) : fallbackExt;
}

/** Extension of a `data:image/...` URL (jpeg → jpg); fallbackExt for anything else. */
export function extOfDataUrl(url: string, fallbackExt: string): string {
  const m = /^data:image\/(png|jpe?g|webp);/i.exec(url);
  if (!m) return fallbackExt;
  const t = m[1].toLowerCase();
  return t === "jpeg" ? "jpg" : t;
}

/**
 * Semantic name + local-time stamp + 4 random chars, e.g. 商品圖-虎-平拍-white-20261102-153012-a7k2.png.
 * For results that are not saved yet (no asset id): two downloads of the same setup never overwrite.
 */
export function buildUniqueFilename(
  meta: SemanticFileMeta,
  ext: string,
  fallbackBase: string,
  now: Date = new Date(),
  rand: () => number = Math.random,
): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const tag = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0");
  return `${buildBase(meta) || fallbackBase}-${stamp}-${tag}.${ext}`;
}

/**
 * Browser side of the My Designs direct upload (lobster-factory/docs/PLAN-designs-direct-upload.md §2): the original bytes go
 * straight to R2 (① POST /api/tools/designs/upload-url → ② PUT to the presigned URL), then ③ POST /api/tools/designs registers
 * the key. Nothing large passes through the app's request body (Next's middleware cuts bodies over 10 MiB), and nothing is
 * re-encoded: My Designs keeps the exact bytes the user got. public/editor-shared/blocks/my-designs.js is the static editors'
 * copy of these three steps (they cannot import this module).
 */

const ROLE_HEADERS = { "x-ops-simulated-role": "operator" };

export type UploadResult = { ok: true; key: string } | { ok: false; error: string };
export type RegisterResult =
  | { ok: true; asset?: { id?: string; object_url?: string } & Record<string, unknown>; reused?: boolean }
  | { ok: false; status: number; error: string; /** the pending upload is gone (1-day lifecycle): make the picture again */ expired: boolean };

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** ①② — one Blob to uploads/pending/<org>/. kind "image" needs a png/jpeg/webp Blob; "source" needs ext (".psd", ".svg", ".vectorcraft"). */
export async function uploadToPending(
  blob: Blob,
  kind: "image" | "source",
  opts: { ext?: string; organizationId?: string } = {},
): Promise<UploadResult> {
  if (kind === "image" && !IMAGE_TYPES.has(blob.type)) return { ok: false, error: `不支援的圖片格式：${blob.type || "未知"}` };
  try {
    const res = await fetch("/api/tools/designs/upload-url", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...ROLE_HEADERS },
      body: JSON.stringify({ kind, mime: kind === "image" ? blob.type : undefined, ext: opts.ext, organizationId: opts.organizationId }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; key?: string; putUrl?: string; contentType?: string; error?: string };
    if (!res.ok || !j.ok || !j.key || !j.putUrl || !j.contentType) return { ok: false, error: j.error ?? `upload-url HTTP ${res.status}` };
    // Content-Type is signed into the URL: it must be exactly what the server answered.
    const put = await fetch(j.putUrl, { method: "PUT", headers: { "Content-Type": j.contentType }, body: blob });
    if (!put.ok) return { ok: false, error: `上傳到儲存空間失敗（HTTP ${put.status}）` };
    return { ok: true, key: j.key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ③ — register pending key(s) with the design's metadata (prompt, source, modelName, …). */
export async function registerDesign(
  key: string,
  meta: Record<string, unknown>,
  sourceUpload?: { key: string; name?: string },
): Promise<RegisterResult> {
  try {
    const res = await fetch("/api/tools/designs", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...ROLE_HEADERS },
      body: JSON.stringify({ ...meta, upload: { key }, ...(sourceUpload ? { sourceUpload } : {}) }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; asset?: Record<string, unknown>; reused?: boolean; error?: string };
    if (res.ok && j.ok) return { ok: true, asset: j.asset, reused: j.reused };
    const error = j.error ?? `HTTP ${res.status}`;
    return { ok: false, status: res.status, error, expired: res.status === 404 && error.startsWith("upload_not_found") };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e), expired: false };
  }
}

/** ①②③ in one call: the picture (and optionally its original file) into My Designs. */
export async function saveDesign(
  image: Blob,
  meta: Record<string, unknown>,
  opts: { source?: { blob: Blob; name: string; ext: string }; organizationId?: string } = {},
): Promise<RegisterResult> {
  const [img, src] = await Promise.all([
    uploadToPending(image, "image", { organizationId: opts.organizationId }),
    opts.source ? uploadToPending(opts.source.blob, "source", { ext: opts.source.ext, organizationId: opts.organizationId }) : Promise.resolve(null),
  ]);
  if (!img.ok) return { ok: false, status: 0, error: (img as { ok: false; error: string }).error, expired: false };
  if (src && !src.ok) return { ok: false, status: 0, error: (src as { ok: false; error: string }).error, expired: false };
  // The register step must name the org the upload went to: the pending key carries it, and without it the route falls
  // back to the default org and refuses the key (a save to a picked client failed this way until 2026-11-26).
  const registerMeta = opts.organizationId ? { ...meta, organizationId: opts.organizationId } : meta;
  return registerDesign(img.key, registerMeta, src && src.ok ? { key: src.key, name: opts.source!.name } : undefined);
}

/** A data:, blob: or same-origin URL as a Blob, bytes unchanged. A public bucket URL (another origin, no CORS) goes through
 *  the same-origin proxy app/api/tools/designs/download (it refuses any other host). */
export async function urlToBlob(url: string): Promise<Blob> {
  const crossOrigin = /^https?:/i.test(url) && new URL(url).origin !== window.location.origin;
  const res = await fetch(crossOrigin ? `/api/tools/designs/download?url=${encodeURIComponent(url)}` : url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`讀取圖片失敗（HTTP ${res.status}）`);
  return res.blob();
}

/** One line for the page's message area. */
export function saveFailureText(r: RegisterResult): string {
  if (r.ok) return "";
  const f = r as { ok: false; error: string; expired: boolean };
  return f.expired ? "原圖已過期（上傳超過 1 天未存），請重新生成。" : `存進「我的設計」失敗：${f.error}`;
}

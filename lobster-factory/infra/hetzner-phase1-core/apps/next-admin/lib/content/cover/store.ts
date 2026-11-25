// Server side of the article cover (K25): where a cover's picture comes from and where the finished cover goes. One
// path for the automatic pipeline (topics/make.ts) and the article page (/api/content/cover, /api/content/cover-preview).
// A picture is a data: image or one of OUR designs-bucket objects, read through the R2 API by key: never a fetch of a
// caller-given address.
import { buildDesignKey, getDesignObjectByUrl, isDesignsAsset, parseImageDataUrl, putDesignObject } from "@/lib/storage/r2";
import { renderCover } from "./render";
import type { CoverSettings } from "./settings";
import { SITE_COVER_SIZE, type CoverSize } from "./sizes";

export const MAX_COVER_IMAGE_BYTES = 9_000_000;   // one big photo, as the image route's reference limit

export type CoverBackground = { ok: true; buffer: Buffer } | { ok: false; status: number; error: string };

/** The picture named by imageUrl: a data: image or a designs-bucket object; anything else is refused. */
export async function readCoverBackground(imageUrl: string): Promise<CoverBackground> {
  let buffer: Buffer;
  if (imageUrl.startsWith("data:")) {
    if (imageUrl.length > MAX_COVER_IMAGE_BYTES * 1.4) return { ok: false, status: 413, error: "image_too_large" };   // base64 ≈ 4/3
    const parsed = parseImageDataUrl(imageUrl);
    if (!parsed) return { ok: false, status: 400, error: "image_url_not_allowed" };
    buffer = parsed.buffer;
  } else if (isDesignsAsset(imageUrl)) {
    const got = await getDesignObjectByUrl(imageUrl, MAX_COVER_IMAGE_BYTES);
    if (!got.ok) return { ok: false, status: 400, error: "image_unreadable" };
    buffer = got.body;
  } else {
    return { ok: false, status: 400, error: "image_url_not_allowed" };
  }
  if (buffer.length > MAX_COVER_IMAGE_BYTES) return { ok: false, status: 413, error: "image_too_large" };
  return { ok: true, buffer };
}

/** The cover laid on the picture and stored in the designs bucket; its public URL. Throws on any failure (the caller
 *  decides the fallback: the automatic pipeline keeps the plain picture). */
export async function storeCover(background: Buffer, text: { title: string; subtitle?: string }, settings: CoverSettings,
  size: CoverSize = SITE_COVER_SIZE): Promise<string> {
  const out = await renderCover(background, text, settings, size);
  const key = buildDesignKey(out.mime);
  if (!key) throw new Error("cover_key_failed");
  const put = await putDesignObject(key, out.buffer, out.mime);
  if (!put.ok) throw new Error((put as { error: string }).error);
  return put.publicUrl;
}

/** readCoverBackground + storeCover: the cover on a stored picture (the automatic pipeline's images); size = K29's
 *  per-channel size (sizes.ts), the website's by default. */
export async function storeCoverOn(imageUrl: string, text: { title: string; subtitle?: string }, settings: CoverSettings,
  size: CoverSize = SITE_COVER_SIZE): Promise<string> {
  const bg = await readCoverBackground(imageUrl);
  if (!bg.ok) throw new Error((bg as { error: string }).error);   // strict:false: !ok does not narrow
  return storeCover(bg.buffer, text, settings, size);
}

/**
 * The longest request body that reaches a route whole: Next's middleware reads every body and silently cuts it at
 * `middlewareClientMaxBodySize` (next.config.ts, 50mb since d065d6025), so the route reads invalid JSON, whatever limit
 * it declares. 2026-11-15 tarot pictures vanished from My Designs that way.
 * lib/studio/__tests__/image-upload-limit.test.ts keeps this equal to what Next runs with.
 */
export const REQUEST_BODY_MAX_BYTES = 50 * 1024 * 1024;
/** The image routes' own ceiling for one image field (image/process, genfill, inpaint, designs save: 12M chars, 413 above). */
export const IMAGE_FIELD_MAX_CHARS = 12_000_000;

const TOO_LARGE = "圖片太大，縮小後仍超過上傳上限"; // shown as is by the callers' error lines

/** Browser only. Returns an image data URL no longer than `maxChars` -- the input as it is when it fits, else WebP at
 *  fewer pixels -- or throws: a longer body would only be cut short. An encode that yields no image (`data:,` from a
 *  canvas over the device limit) counts as not fitting yet. The default is the smaller of the image field ceiling and
 *  the whole body less 512 KiB for the other JSON fields. */
export async function uploadableDataUrl(url: string, maxChars = Math.min(IMAGE_FIELD_MAX_CHARS, REQUEST_BODY_MAX_BYTES - 512 * 1024)): Promise<string> {
  if (url.length <= maxChars) return url; // short input passes as is (callers also hand in plain image URLs)
  const fits = (s: string) => s.length <= maxChars && s.startsWith("data:image/");
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("decode failed")); img.src = url; });
  const oc = document.createElement("canvas");
  const g = oc.getContext("2d");
  if (!g) throw new Error(TOO_LARGE);
  let sc = 1;
  let out = url;
  while (!fits(out) && sc > 0.05) {
    oc.width = Math.max(1, Math.round(img.width * sc));
    oc.height = Math.max(1, Math.round(img.height * sc));
    g.clearRect(0, 0, oc.width, oc.height);
    g.drawImage(img, 0, 0, oc.width, oc.height);
    out = oc.toDataURL("image/webp", 0.92);
    sc *= 0.85;
  }
  if (!fits(out)) throw new Error(TOO_LARGE);
  return out;
}

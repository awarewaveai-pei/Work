/**
 * Posterize (色調分離) — quantize each RGB channel to N evenly-spaced levels, the classic
 * Photoshop "Posterize" effect. Pure, side-effect-on-buffer helper so it can be unit-tested
 * and reused. Fabric v7 ships no Posterize filter and registering a custom WebGL filter at
 * runtime is fragile, so CanvasEditor bakes this over an offscreen 2D canvas instead.
 *
 * Alpha is left untouched (only R/G/B are quantized) so transparency / erased regions survive.
 */

/** Quantize the RGB channels of an RGBA buffer in place. levels is clamped to 2..32. */
export function quantizeRgb(data: Uint8ClampedArray, levels: number): void {
  const L = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (L - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.round(data[i] / step) * step); // R
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step); // G
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step); // B
    // data[i + 3] (alpha) untouched
  }
}

/**
 * Browser-only: posterize an image data URL by decoding it to an offscreen canvas, quantizing
 * the pixels, and re-encoding to PNG. Returns the new data URL. Throws if decode fails or the
 * 2D context is unavailable (callers surface the error to the user).
 */
export async function posterizeDataUrl(dataUrl: string, levels: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("posterize_decode_failed"));
    im.src = dataUrl;
  });
  const w = Math.max(1, img.naturalWidth || img.width);
  const h = Math.max(1, img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("posterize_no_context");
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  quantizeRgb(id.data, levels);
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL("image/png");
}

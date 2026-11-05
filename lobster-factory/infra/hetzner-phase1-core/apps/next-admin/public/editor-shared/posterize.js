// 🎚 色調分離 SSOT — quantize each RGB channel to N evenly-spaced levels, the classic Photoshop "Posterize". One plain ES module (like
// color-grade.js), used by /tools/canvas (typed door lib/studio/posterize.ts) and the editor-shared dock block blocks/genfx.js.
// Alpha is left untouched (only R/G/B are quantized) so transparency / erased regions survive.
// drift guard: lib/studio/__tests__/editor-edge-mask-drift.test.ts

/** Quantize the RGB channels of an RGBA buffer in place. levels is clamped to 2..32. */
export function quantizeRgb(data, levels) {
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
 * Browser-only: posterize an image data URL by decoding it to an offscreen canvas, quantizing the pixels, and re-encoding to PNG.
 * Returns the new data URL. Throws if decode fails or the 2D context is unavailable (callers surface the error to the user).
 */
export async function posterizeDataUrl(dataUrl, levels) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("posterize_decode_failed"));
    im.src = dataUrl;
  });
  const nw = Math.max(1, img.naturalWidth || img.width);
  const nh = Math.max(1, img.naturalHeight || img.height);
  // Cap the working resolution so a 6000²+ print-res source can't OOM the tab (two 4·w·h buffers).
  const MAX_EDGE = 4096;
  const fit = Math.min(1, MAX_EDGE / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * fit));
  const h = Math.max(1, Math.round(nh * fit));
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

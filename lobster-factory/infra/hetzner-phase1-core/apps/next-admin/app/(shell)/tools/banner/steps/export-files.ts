// Files of a design: PNG / JPG / WebP / PSD / SVG, thumbnails, download (moved from BannerStudio.tsx, R2-B1).
import { buildBannerPsd, buildBannerSvg, rasterize, renderBannerLayers, type Pixels } from "../banner-layers";
import { PRESETS, type PresetKey, type State } from "../banner-state";

export const bannerLayers = (state: State) => renderBannerLayers(state, PRESETS[state.preset]);
export const flatCanvas = async (state: State) => (await renderBannerLayers(state, PRESETS[state.preset], { flat: true })).layers[0].canvas;

export async function exportToPng(state: State): Promise<string> {
  return (await flatCanvas(state)).toDataURL("image/png");
}

export const dataUrlBytes = (u: string) => Math.floor(((u.length - u.indexOf(",") - 1) * 3) / 4);

/** JPG / WebP: quality 0.92, or with a KB target the highest quality (binary search) whose file is <= target; when even
 *  the lowest quality is over, that lowest one (`over` = true). */
export function encodeLossy(cv: HTMLCanvasElement, mime: "image/jpeg" | "image/webp", targetKb: number | null): { url: string; kb: number; over: boolean } {
  if (!targetKb) { const url = cv.toDataURL(mime, 0.92); return { url, kb: dataUrlBytes(url) / 1024, over: false }; }
  const max = targetKb * 1024, MIN_Q = 0.05;
  let best: string | null = null, lo = MIN_Q, hi = 1;
  for (let i = 0; i < 8; i++) {
    const q = (lo + hi) / 2, url = cv.toDataURL(mime, q);
    if (dataUrlBytes(url) <= max) { best = url; lo = q; } else hi = q;
  }
  if (!best) {
    const low = cv.toDataURL(mime, MIN_Q);
    if (dataUrlBytes(low) <= max) best = low;
    else return { url: low, kb: dataUrlBytes(low) / 1024, over: true };
  }
  return { url: best, kb: dataUrlBytes(best) / 1024, over: false };
}

export function pngOfPixels(px: Pixels): string {
  const cv = document.createElement("canvas");
  cv.width = px.width; cv.height = px.height;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  return cv.toDataURL("image/png");
}

export type ExportFormat = "png" | "jpg" | "webp" | "psd" | "svg";
export const EXPORT_FORMATS: { key: ExportFormat; label: string }[] = [
  { key: "png", label: "PNG" }, { key: "jpg", label: "JPG" }, { key: "webp", label: "WebP" }, { key: "psd", label: "PSD（可編輯）" }, { key: "svg", label: "SVG（可編輯）" },
];
/** One file of a design in a format; JPG / WebP squeezed to `targetKb` when given. `note` = why it is not as asked. */
export async function encodeDesign(st: State, fmt: ExportFormat, targetKb: number | null): Promise<{ url: string; note?: string }> {
  if (fmt === "png") return { url: await exportToPng(st) };
  if (fmt === "psd") return { url: bytesToDataUrl(await exportToPsd(st), "image/vnd.adobe.photoshop") };
  if (fmt === "svg") return { url: textDataUrl(await exportToSvg(st), "image/svg+xml") };
  const mime = fmt === "jpg" ? "image/jpeg" : "image/webp";
  let cv = await flatCanvas(st);
  // Safari cannot encode WebP (WebKit 226950): toDataURL silently returns a PNG -- say so instead of a fake .webp
  if (!cv.toDataURL(mime, 0.5).startsWith(`data:${mime}`)) throw new Error(`這個瀏覽器不能存 ${fmt.toUpperCase()}，請改用 Chrome／Edge，或下載 JPG／PNG。`);
  if (fmt === "jpg") {
    // JPG has no alpha: a transparent background image would turn black -- lay the background colour under it
    const solid = document.createElement("canvas");
    solid.width = cv.width; solid.height = cv.height;
    const sctx = solid.getContext("2d");
    if (!sctx) throw new Error("canvas_unavailable");
    sctx.fillStyle = st.bgColor; sctx.fillRect(0, 0, solid.width, solid.height); sctx.drawImage(cv, 0, 0);
    cv = solid;
  }
  const out = encodeLossy(cv, mime, targetKb);
  return { url: out.url, ...(out.over ? { note: `${fmt.toUpperCase()} 壓到最低畫質仍有 ${Math.ceil(out.kb)} KB，比目標 ${targetKb} KB 大；已照最低畫質。` } : {}) };
}
/** A file name per size: banner-9x16.png, banner-1.91x1.psd … */
export const sizeFileName = (k: PresetKey, fmt: ExportFormat) => `banner-${PRESETS[k].ratio.replace(":", "x")}.${fmt}`;
/** A small JPEG of a design for the size thumbnails. */
export async function thumbOf(st: State): Promise<string> {
  const full = await flatCanvas(st);
  const k = 320 / Math.max(full.width, full.height);
  const cv = document.createElement("canvas");
  cv.width = Math.round(full.width * k); cv.height = Math.round(full.height * k);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(full, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.8);
}

export async function exportToSvg(state: State): Promise<string> {
  return buildBannerSvg(rasterize(await bannerLayers(state)), pngOfPixels);
}
export async function exportToPsd(state: State): Promise<ArrayBuffer> {
  return buildBannerPsd(rasterize(await bannerLayers(state)));
}
export function bytesToDataUrl(bytes: ArrayBuffer, mime: string): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}
export const textDataUrl = (text: string, mime: string) => bytesToDataUrl(new TextEncoder().encode(text).buffer as ArrayBuffer, mime);
export function downloadUrl(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
}

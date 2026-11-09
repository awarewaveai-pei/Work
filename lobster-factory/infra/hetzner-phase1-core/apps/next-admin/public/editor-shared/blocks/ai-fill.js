// Block: 🪄 去除／生成填色（AI）. Flow (CanvasEditor.tsx:2596-2643 UI, :1775-1912 startInpaint / applyInpaint): pick 去除 or 生成填色
// → (prompt, may be empty) → press a MODEL button (one per catalog row with use "remove" / "fill", price on it) → POST to
// /api/tools/studio/inpaint (去除) or /genfill (生成填色, {model}) → the result replaces the image. The area is the host's own
// selection (ctx.selectionMask — 選取工具, or Q quick mask with the host's own brush), not a red pen.
// Photoshop-like since 2026-11-09 (operator: "無法像真正的 Photoshop"): (1) only a padded CROP around the selection is sent, so the
// model works at the source's own resolution instead of returning a ≤1440 px whole image that was then stretched back; (2) the
// result is blended back through a FEATHERED mask (a soft band straddling the selection edge), not a hard 0/255 switch, so there
// is no seam or colour step; (3) an empty prompt is allowed (the server fills from the surroundings).
// Also exports the request / Blob helpers the other AI image blocks share (genfx.js, edge-mask.js, ai-edit.js).
import { OPS_ROLE_HEADER } from "/editor-shared/bg-remove.js";
import { modelsFor, nt, takesBlankPrompt, takesChinese } from "/editor-shared/image-models.js";
import { modelButton } from "/editor-shared/block-ui.js";

export const INPAINT_URL = "/api/tools/studio/inpaint";
export const GENFILL_URL = "/api/tools/studio/genfill";
/** Routes cap image/mask at MAX_IMAGE_CHARS = 12_000_000 (app/api/tools/studio/{inpaint,genfill}/route.ts); stay under it. */
export const UPLOAD_MAX_CHARS = 11500000;
/** Longest side of the crop sent to a model: flux-fill-pro returns at most ~1440 px (genfx.js measurement); above this the crop is
 *  downscaled for the request and the result resampled back, below it the model works at the source's own pixels. */
export const CROP_MAX_SIDE = 1440;
/** Context around the selection sent with it, as a fraction of the selection's longer side, with a floor and a ceiling in px;
 *  the crop is also widened to at least CROP_MIN_SIDE so a tiny selection still gets a scene to continue. */
export const CROP_PAD = { fraction: 0.5, min: 64, max: 768 };
export const CROP_MIN_SIDE = 512;
/** Feather radius = this fraction of the crop's longer side, clamped to [2, 12] px (at the crop's scale). */
export const FEATHER = { fraction: 0.015, min: 2, max: 12 };

export const REMOVE_MODELS = modelsFor("remove");
export const FILL_MODELS = modelsFor("fill");

/** Blob → base64 data URL (no FileReader: works for every Blob implementation). */
export async function blobToDataUrl(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return "data:" + (blob.type || "image/png") + ";base64," + btoa(bin);
}
/** data URL (base64 or URL-encoded) → Blob. */
export function dataUrlToBlob(url) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(url || "");
  if (!m) throw new Error("bad_image");
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return new Blob([u8], { type: m[1] || "image/png" });
}

/** POST JSON to a studio route with the operator role header (the routes 403 forbidden_role without it).
 *  Resolves { ok:true, image } (data URL) or { ok:false, error } — never throws. */
export async function postStudio(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...OPS_ROLE_HEADER },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "bad_response" }));
    if (!data || !data.ok || typeof data.image !== "string") return { ok: false, error: (data && data.error) || `HTTP ${res.status}` };
    return { ok: true, image: data.image };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function surface(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); if (!g) throw new Error("no_canvas_context");
  return { c, g };
}
/** Image Blob → PNG data URL under UPLOAD_MAX_CHARS (natural size, shrunk 15% per try when too big) + the size it was drawn at. */
export async function uploadableImage(blob) {
  const bmp = await createImageBitmap(blob);
  let sc = 1, w = 1, h = 1, url = "";
  do {
    w = Math.max(1, Math.round(bmp.width * sc)); h = Math.max(1, Math.round(bmp.height * sc));
    const s = surface(w, h); s.g.drawImage(bmp, 0, 0, w, h);
    url = s.c.toDataURL("image/png"); sc *= 0.85;
  } while (url.length > UPLOAD_MAX_CHARS && sc > 0.05);
  return { url, width: w, height: h };
}

/** Selection mask Blob at w×h → one byte per pixel, 255 = selected (luminance × alpha ≥ 50%), 0 = keep. */
export async function maskBytes(blob, w, h) {
  const s = surface(w, h); s.g.drawImage(await createImageBitmap(blob), 0, 0, w, h);
  const px = s.g.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    out[p] = ((0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * px[i + 3]) / 255 >= 128 ? 255 : 0;
  }
  return out;
}
/** Bounding box {x, y, w, h} of the selected bytes, or null when nothing is selected. */
export function maskBounds(bytes, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bytes[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** The crop sent to the model: the selection's box padded by CROP_PAD, widened to CROP_MIN_SIDE, clamped to the image. */
export function cropRegion(b, w, h) {
  const pad = Math.min(CROP_PAD.max, Math.max(CROP_PAD.min, Math.round(Math.max(b.w, b.h) * CROP_PAD.fraction)));
  let x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad, y1 = b.y + b.h + pad;
  const growX = Math.max(0, CROP_MIN_SIDE - (x1 - x0)) / 2, growY = Math.max(0, CROP_MIN_SIDE - (y1 - y0)) / 2;
  x0 = Math.max(0, Math.floor(x0 - growX)); y0 = Math.max(0, Math.floor(y0 - growY));
  x1 = Math.min(w, Math.ceil(x1 + growX)); y1 = Math.min(h, Math.ceil(y1 + growY));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Draws a w×h slice of `img` at (sx, sy) onto a canvas of dw×dh → PNG data URL. */
function cropToDataUrl(img, r, dw, dh) {
  const s = surface(dw, dh); s.g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, dw, dh);
  return s.c.toDataURL("image/png");
}
/** Mask bytes → white-on-black PNG data URL of the crop, at dw×dh. */
function cropMaskToDataUrl(bytes, w, h, r, dw, dh) {
  const full = surface(w, h), d = full.g.createImageData ? full.g.createImageData(w, h) : full.g.getImageData(0, 0, w, h);
  for (let p = 0, i = 0; p < bytes.length; p++, i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = bytes[p]; d.data[i + 3] = 255; }
  full.g.putImageData(d, 0, 0);
  return cropToDataUrl(full.c, r, dw, dh);
}

/** Separable box blur (two passes ≈ triangle) of a 0–255 byte plane → Float32Array 0–1: the feathered blend alpha. A radius-r
 *  blur of the hard mask yields a 2r-wide ramp centred on the selection edge, so the AI pixels fade in just outside the selection
 *  and the source fades out just inside it — the seam is hidden on both sides. */
export function featherAlpha(bytes, w, h, r) {
  let a = Float32Array.from(bytes, (v) => v / 255);
  if (r < 1) return a;
  const pass = (src) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 2 * r + 1;
    for (let y = 0; y < h; y++) { // horizontal
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / k;
        sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) { // vertical
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / k;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  };
  a = pass(pass(a));
  return a;
}
/** RGBA arrays of equal size + alpha plane (0–1, one per pixel) → the two images mixed by `alpha`, PREMULTIPLIED: colour is
 *  weighted by each side's own opacity and divided back out at the end. Mixing straight RGB instead darkens the ramp wherever
 *  one side is transparent (a half-blend over a transparent pixel returned half-black — Codex review 2026-11-09). */
export function blendFeathered(orig, ai, alpha) {
  const out = new Uint8ClampedArray(orig.length);
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    const a = alpha[p], b = 1 - a;
    const oa = (orig[i + 3] / 255) * b, aa = (ai[i + 3] / 255) * a, sum = oa + aa;
    out[i + 3] = sum * 255;
    for (let c = 0; c < 3; c++) out[i + c] = sum ? (orig[i + c] * oa + ai[i + c] * aa) / sum : 0;
  }
  return out;
}
/** The whole job on the pixels: crop around the selection, post, blend back → PNG Blob at the source's own size, or
 *  { error } before any paid request when the selection is empty. `post(image, mask)` sends the crop and resolves postStudio's shape. */
export async function fillSelection(srcBlob, maskBlob, post) {
  const src = await createImageBitmap(srcBlob);
  const w = src.width, h = src.height;
  const bytes = await maskBytes(maskBlob, w, h);
  const bounds = maskBounds(bytes, w, h);
  if (!bounds) return { error: "empty_selection" };
  const r = cropRegion(bounds, w, h);
  const k = Math.min(1, CROP_MAX_SIDE / Math.max(r.w, r.h));
  let dw = Math.max(1, Math.round(r.w * k)), dh = Math.max(1, Math.round(r.h * k)), image = cropToDataUrl(src, r, dw, dh);
  while (image.length > UPLOAD_MAX_CHARS && dw > 64) { dw = Math.round(dw * 0.85); dh = Math.round(dh * 0.85); image = cropToDataUrl(src, r, dw, dh); }
  const res = await post(image, cropMaskToDataUrl(bytes, w, h, r, dw, dh));
  if (!res.ok) return { error: res.error };
  // AI result (its own size) → the crop's size on the source; blend inside the crop only, everything else is untouched source.
  const aiBmp = await createImageBitmap(dataUrlToBlob(res.image));
  const o = surface(w, h); o.g.drawImage(src, 0, 0);
  const ai = surface(r.w, r.h); ai.g.drawImage(aiBmp, 0, 0, aiBmp.width, aiBmp.height, 0, 0, r.w, r.h);
  const cropBytes = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) cropBytes.set(bytes.subarray((r.y + y) * w + r.x, (r.y + y) * w + r.x + r.w), y * r.w);
  const feather = Math.min(FEATHER.max, Math.max(FEATHER.min, Math.round(Math.max(r.w, r.h) * FEATHER.fraction)));
  const od = o.g.getImageData(r.x, r.y, r.w, r.h);
  od.data.set(blendFeathered(od.data, ai.g.getImageData(0, 0, r.w, r.h).data, featherAlpha(cropBytes, r.w, r.h, feather)));
  o.g.putImageData(od, r.x, r.y);
  return { blob: dataUrlToBlob(o.c.toDataURL("image/png")), region: r, sent: { width: dw, height: dh } };
}

// Quick mask follows PhotoCraft (= Photoshop): white = selected. With no selection, Q starts all white, so painting white
// changes nothing and painting with the default black EXCLUDES the strokes (measured on build 98bcbfa, W3 smoke 2026-11-06).
// "Paint = change" is therefore: Q, paint black, Q, then Select › Inverse (Shift+Ctrl+I).
const AREA_HOW = "用選取工具框出範圍（或按 Q 用黑色塗 → 再按 Q → 按 Shift+Ctrl+I 反轉）";
const price = (m) => "NT$" + nt(m.usd);

export default {
  id: "ai-fill",
  icon: "🪄",
  title: "去除／生成填色（AI）",
  mount(ctx, body) {
    const hasMask = typeof ctx.selectionMask === "function"; // optional ctx method: hosts without a selection don't offer it
    let mode = null, busy = false; // null = the two start buttons (CE:2599-2603); "remove" | "fill" = the model step
    body.innerHTML = '<fieldset id="afFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info" id="afHint" data-af-hint></div>'
      + '<div id="afStart"><div class="row" style="flex-wrap:wrap;"><button type="button" class="btn btn-ghost" id="afRemove" data-af-mode="remove">🪄 去除不要的部分</button>'
      + '<button type="button" class="btn btn-ghost" id="afFill" data-af-mode="fill">✨ 生成填色（選哪生哪）</button></div></div>'
      + '<div id="afStep">'
      + '<input id="afPrompt" class="form-input" data-af-prompt placeholder="要生成什麼，例如：一片藍天">'
      + '<div class="info" style="margin-top:6px;">按模型就開始（按下即扣點）</div>'
      + '<div class="row" id="afModels" style="flex-wrap:wrap;"></div>'
      + '<div class="row" style="margin-top:6px;"><button type="button" class="btn btn-ghost" id="afCancel" data-af-cancel>✖ 取消</button></div></div>'
      + '<div class="info" id="afMsg" data-af-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const say = (msg, b) => { const el = $("afMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    function paint() {
      // style.display, not [hidden]: a class rule (e.g. .form-input display) would override the attribute
      $("afStart").style.display = mode !== null ? "none" : ""; $("afStep").style.display = mode === null ? "none" : "";
      $("afPrompt").style.display = mode !== "fill" ? "none" : "";
      $("afHint").textContent = !hasMask ? "這個編輯器沒有選取範圍，無法使用此功能。"
        : mode === "fill" ? "要重新生成的區域：" + AREA_HOW + "，寫描述後按模型；留空＝照周圍補，只有標「可留空」的鈕吃得住。"
        : mode === "remove" ? "想清掉的物件：" + AREA_HOW + "，再按模型。"
        : "先在圖層選取一張圖片，再" + AREA_HOW + "。";
      $("afRemove").disabled = !hasMask; $("afFill").disabled = !hasMask;
      $("afFields").disabled = busy;
      const models = $("afModels"); models.replaceChildren();
      for (const m of mode === "fill" ? FILL_MODELS : mode === "remove" ? REMOVE_MODELS : []) {
        const b = modelButton(m, nt, () => run(m));
        if (mode === "fill") {
          b.title = (takesBlankPrompt(m) ? "描述可以留空＝照周圍補" : "這顆一定要寫描述")
            + (takesChinese(m) ? "；中文可以" : "；描述要寫英文（中文這顆讀不懂）");
        }
        b.dataset.afModel = m.value;
        models.appendChild(b);
      }
    }
    const setBusy = (v) => { busy = v; paint(); if (typeof ctx.busy === "function") ctx.busy(v); };
    $("afRemove").onclick = () => { mode = "remove"; say(""); paint(); };
    $("afFill").onclick = () => { mode = "fill"; say(""); paint(); };
    $("afCancel").onclick = () => { mode = null; say(""); paint(); };
    async function run(m) {
      if (busy || !hasMask || !mode) return;
      const prompt = $("afPrompt").value.trim();
      // Measured 2026-11-09: a model with no mask gets CONTEXT_FILL_PROMPT with no area to apply it to and returns the
      // image untouched -- a full-price no-op. Refuse before the request rather than explain the charge afterwards.
      if (mode === "fill" && !prompt && !takesBlankPrompt(m)) {
        say("⚠️ " + m.label + " 不能留空，請寫要改成什麼（例如：移除那三隻動物，延續後面的橘色布幔）。");
        return;
      }
      setBusy(true); // before any await: a second click while the host answers must not send a second paid request
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("先在圖層選取一張圖片。"); return; }
        const maskBlob = await ctx.selectionMask(); if (!maskBlob) { say("請先" + AREA_HOW + "。"); return; }
        say(m.label + " 處理中…", true);
        const out = await fillSelection(sel.blob, maskBlob, (image, mask) => mode === "fill"
          ? postStudio(GENFILL_URL, { image, mask, prompt, model: m.value })
          : postStudio(INPAINT_URL, { image, mask }));
        if (out.error === "empty_selection") { say("選取範圍是空的，請先" + AREA_HOW + "。"); return; }
        if (out.error) { say("⚠️ " + (out.error || (mode === "fill" ? "生成失敗，請重試" : "去除失敗，請重試"))); return; }
        await ctx.replaceImage(sel.id, out.blob);
        say((mode === "fill" ? "✅ 生成填色完成（" : "✅ 已去除選取範圍（") + m.label + "，" + price(m) + "）");
        mode = null;
      } catch (err) { say("⚠️ " + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    }
    paint();
  },
};

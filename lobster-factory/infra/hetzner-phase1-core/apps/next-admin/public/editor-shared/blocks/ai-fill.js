// Block: 🪄 去除／生成填色（AI）. Same panel and flow as /tools/canvas CanvasEditor.tsx:2596-2643 (UI) and :1775-1912 (startInpaint /
// applyInpaint): pick 去除 or 生成填色 → (prompt) → 套用 → POST image+mask to /api/tools/studio/inpaint (bria eraser) or /genfill
// (flux-fill-pro, + prompt) → replace the image. One change (operator 2026-11-06): the area is the host's own selection
// (ctx.selectionMask — 選取工具, or Q quick mask with the host's own brush), not a red pen, so there is no brush-size slider here.
// Second (operator 2026-11-06, prod test): the AI image is only taken inside the mask, the rest stays the source (keepOutsideMask).
// Also exports the request / Blob helpers the other AI image blocks share (genfx.js, edge-mask.js), like color-grade.js exports applyAdjToBlob.
import { OPS_ROLE_HEADER } from "/editor-shared/bg-remove.js";

export const INPAINT_URL = "/api/tools/studio/inpaint";
export const GENFILL_URL = "/api/tools/studio/genfill";
/** Routes cap image/mask at MAX_IMAGE_CHARS = 12_000_000 (app/api/tools/studio/{inpaint,genfill}/route.ts); stay under it. */
export const UPLOAD_MAX_CHARS = 11500000;

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

function surface(src, w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); if (!g) throw new Error("no_canvas_context");
  g.drawImage(src, 0, 0, w, h);
  return { c, g };
}
/** Image Blob → PNG data URL under UPLOAD_MAX_CHARS (natural size, shrunk 15% per try when too big) + the size it was drawn at. */
export async function uploadableImage(blob) {
  const bmp = await createImageBitmap(blob);
  let sc = 1, w = 1, h = 1, url = "";
  do {
    w = Math.max(1, Math.round(bmp.width * sc)); h = Math.max(1, Math.round(bmp.height * sc));
    url = surface(bmp, w, h).c.toDataURL("image/png"); sc *= 0.85;
  } while (url.length > UPLOAD_MAX_CHARS && sc > 0.05);
  return { url, width: w, height: h };
}
/** Selection mask Blob → white (change) on black (keep) PNG data URL at w×h, the mask shape the routes take (CE:1851-1857);
 *  a pixel counts as selected when luminance × alpha ≥ 50%. null when nothing is selected. */
export async function binaryMask(blob, w, h) {
  const { c, g } = surface(await createImageBitmap(blob), w, h);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  let any = false;
  for (let i = 0; i < px.length; i += 4) {
    const on = ((0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * px[i + 3]) / 255 >= 128;
    const v = on ? 255 : 0;
    px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    if (on) any = true;
  }
  g.putImageData(d, 0, 0);
  return any ? c.toDataURL("image/png") : null;
}

/** RGBA pixel arrays of equal length → out: AI pixel where the mask is selected (same rule as binaryMask), the original
 *  pixel (alpha included) everywhere else. */
export function mergeMasked(orig, ai, mask) {
  const out = new Uint8ClampedArray(orig.length);
  for (let i = 0; i < orig.length; i += 4) {
    const on = ((0.299 * mask[i] + 0.587 * mask[i + 1] + 0.114 * mask[i + 2]) * mask[i + 3]) / 255 >= 128;
    const src = on ? ai : orig;
    out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
  }
  return out;
}
/** The AI routes return a whole image (other size, holes filled, colours drifted); only the selected area may change.
 *  → PNG Blob at the source's own size: AI result inside the mask, source pixels (transparency included) outside. */
export async function keepOutsideMask(srcBlob, aiDataUrl, maskBlob) {
  const src = await createImageBitmap(srcBlob);
  const w = src.width, h = src.height;
  const o = surface(src, w, h), a = surface(await createImageBitmap(dataUrlToBlob(aiDataUrl)), w, h);
  const m = surface(await createImageBitmap(maskBlob), w, h);
  const od = o.g.getImageData(0, 0, w, h);
  od.data.set(mergeMasked(od.data, a.g.getImageData(0, 0, w, h).data, m.g.getImageData(0, 0, w, h).data));
  o.g.putImageData(od, 0, 0);
  return dataUrlToBlob(o.c.toDataURL("image/png"));
}

// Quick mask follows PhotoCraft (= Photoshop): white = selected. With no selection, Q starts all white, so painting white
// changes nothing and painting with the default black EXCLUDES the strokes (measured on build 98bcbfa, W3 smoke 2026-11-06).
// "Paint = change" is therefore: Q, paint black, Q, then Select › Inverse (Shift+Ctrl+I).
const AREA_HOW = "用選取工具框出範圍（或按 Q 用黑色塗 → 再按 Q → 按 Shift+Ctrl+I 反轉）";

export default {
  id: "ai-fill",
  icon: "🪄",
  title: "去除／生成填色（AI）",
  mount(ctx, body) {
    const hasMask = typeof ctx.selectionMask === "function"; // optional ctx method: hosts without a selection don't offer it
    let mode = null, busy = false; // null = the two start buttons (CE:2599-2603); "remove" | "fill" = the apply step (CE:2604-2640)
    body.innerHTML = '<fieldset id="afFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info" id="afHint" data-af-hint></div>'
      + '<div id="afStart"><div class="row" style="flex-wrap:wrap;"><button type="button" class="btn btn-ghost" id="afRemove" data-af-mode="remove">🪄 去除不要的部分</button>'
      + '<button type="button" class="btn btn-ghost" id="afFill" data-af-mode="fill">✨ 生成填色（選哪生哪）</button></div></div>'
      + '<div id="afStep">'
      + '<input id="afPrompt" class="form-input" data-af-prompt placeholder="要生成什麼，例如：一片藍天 / 紅玫瑰">'
      + '<div class="row" style="margin-top:6px;"><button type="button" class="btn btn-primary" id="afApply" data-af-apply></button>'
      + '<button type="button" class="btn btn-ghost" id="afCancel" data-af-cancel>✖ 取消</button></div></div>'
      + '<div class="info" id="afMsg" data-af-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const say = (msg, b) => { const el = $("afMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    function paint() {
      // style.display, not [hidden]: a class rule (e.g. .form-input display) would override the attribute
      $("afStart").style.display = mode !== null ? "none" : ""; $("afStep").style.display = mode === null ? "none" : "";
      $("afPrompt").style.display = mode !== "fill" ? "none" : "";
      $("afHint").textContent = !hasMask ? "這個編輯器沒有選取範圍，無法使用此功能。"
        : mode === "fill" ? "要重新生成的區域：" + AREA_HOW + "，填描述後按套用。"
        : mode === "remove" ? "想清掉的物件：" + AREA_HOW + "，再按套用。"
        : "先在圖層選取一張圖片，再" + AREA_HOW + "。";
      $("afApply").textContent = busy ? "AI 處理中…" : mode === "fill" ? "✨ 套用生成" : "✅ 套用去除";
      $("afRemove").disabled = !hasMask; $("afFill").disabled = !hasMask;
      $("afApply").disabled = busy; $("afCancel").disabled = busy;
    }
    const setBusy = (v) => { busy = v; paint(); if (typeof ctx.busy === "function") ctx.busy(v); };
    $("afRemove").onclick = () => { mode = "remove"; say(""); paint(); };
    $("afFill").onclick = () => { mode = "fill"; say(""); paint(); };
    $("afCancel").onclick = () => { mode = null; say(""); paint(); };
    $("afApply").onclick = async () => {
      if (busy || !hasMask || !mode) return;
      const prompt = $("afPrompt").value.trim();
      if (mode === "fill" && prompt.length < 2) { say("請先描述要生成的內容（prompt）"); return; }
      setBusy(true); // before any await: a second click while the host answers must not send a second paid request
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("先在圖層選取一張圖片。"); return; }
        const maskBlob = await ctx.selectionMask(); if (!maskBlob) { say("請先" + AREA_HOW + "。"); return; }
        say("AI 處理中…", true);
        const img = await uploadableImage(sel.blob);
        const mask = await binaryMask(maskBlob, img.width, img.height);
        if (!mask) { say("選取範圍是空的，請先" + AREA_HOW + "。"); return; }
        const r = mode === "fill" ? await postStudio(GENFILL_URL, { image: img.url, mask, prompt }) : await postStudio(INPAINT_URL, { image: img.url, mask });
        if (!r.ok) { say("⚠️ " + (r.error || (mode === "fill" ? "生成失敗，請重試" : "去除失敗，請重試"))); return; }
        await ctx.replaceImage(sel.id, await keepOutsideMask(sel.blob, r.image, maskBlob));
        say(mode === "fill" ? "✅ 生成填色完成" : "✅ 已去除選取範圍");
        mode = null;
      } catch (err) { say("⚠️ " + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    };
    paint();
  },
};

// Block: 🖼 擴圖／🎚 色調分離. Same panel as /tools/canvas CanvasEditor.tsx:2646-2677; flows from :1489-1530 (applyOutpaint) and
// :1446-1484 (posterizeSelected). The direction list is a row of visible buttons (the canvas used a <select>; operator rule: no dropdowns).
// Enum, labels and geometry from the SSOT /editor-shared/outpaint-presets.js, models + prices from /editor-shared/image-models.js
// (rows with use "outpaint", one button each), posterize maths from /editor-shared/posterize.js; nothing re-implemented.
// 擴圖 result is larger than the source by design, so it goes in with placeImage (a new layer at its own pixel size, the source stays
// under it): ctx.replaceImage keeps the old size (ctx-contract.md) and would squash the new area back into the old box.
import { OUTPAINT_PRESETS, OUTPAINT_LABELS, outpaintFrame } from "/editor-shared/outpaint-presets.js";
import { modelsFor, nt } from "/editor-shared/image-models.js";
import { modelButton } from "/editor-shared/block-ui.js";
import { posterizeDataUrl } from "/editor-shared/posterize.js";
import { choiceGroup } from "/editor-shared/block-ui.js";
import { GENFILL_URL, blobToDataUrl, dataUrlToBlob, postStudio, uploadableImage } from "./ai-fill.js";

export const OUTPAINT_MODELS = modelsFor("outpaint");
export { outpaintFrame };
/** Model output may round each side (multiples of 16/32): accept 3% aspect drift, refuse anything else. */
export const ASPECT_TOLERANCE = 0.03;

/** Mean |ΔRGB| (0–255) between two equal-size RGBA arrays over the pixels opaque (alpha ≥ 128) in `src`; 0 when none are. */
export function meanDiff(region, src) {
  let sum = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] < 128) continue;
    sum += Math.abs(region[i] - src[i]) + Math.abs(region[i + 1] - src[i + 1]) + Math.abs(region[i + 2] - src[i + 2]); n += 3;
  }
  return n ? sum / n : 0;
}
/** The aspect alone can't tell a zoom-out result from the source sent back unextended (same shape): the frame is only trusted
 *  when the result, at frame scale, shows the source where the frame puts it. Compared as MATCH_THUMB-px thumbnails, so the
 *  model's down/up resampling blur drops out and only placement / content shows (a 2× zoom of a smooth gradient: ≈ 21). */
export const MATCH_MAX_DIFF = 10;
export const MATCH_THUMB = 32;
function thumb(img, sx, sy, sw, sh, tw, th) {
  const t = document.createElement("canvas"); t.width = tw; t.height = th;
  const tg = t.getContext("2d"); if (!tg) throw new Error("no_canvas_context");
  tg.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
  return tg.getImageData(0, 0, tw, th).data;
}

/** Outpaint result → PNG at source scale: the result resized to the preset frame (a no-op for bria-expand, which returns the
 *  frame's exact size), the source pixels pasted back unchanged at (x, y). → {blob, x, y, width, height} (x, y = where the
 *  source's top-left sits in it), or null when the result's shape or content does not match the preset (then nothing can be aligned). */
export async function alignOutpaint(srcBlob, resultUrl, preset) {
  const src = await createImageBitmap(srcBlob), res = await createImageBitmap(dataUrlToBlob(resultUrl));
  const f = outpaintFrame(preset, src.width, src.height);
  if (!f || Math.abs(res.width / res.height / (f.W / f.H) - 1) > ASPECT_TOLERANCE) return null;
  const W = Math.round(f.W), H = Math.round(f.H), x = Math.round(f.x), y = Math.round(f.y);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); if (!g) throw new Error("no_canvas_context");
  g.drawImage(res, 0, 0, W, H);
  const k = Math.min(1, MATCH_THUMB / Math.max(src.width, src.height));
  const tw = Math.max(1, Math.round(src.width * k)), th = Math.max(1, Math.round(src.height * k));
  const region = thumb(c, x, y, src.width, src.height, tw, th), own = thumb(src, 0, 0, src.width, src.height, tw, th);
  if (meanDiff(region, own) > MATCH_MAX_DIFF) return null;
  g.clearRect(x, y, src.width, src.height); // source alpha stays its own, not blended over the AI copy of itself
  g.drawImage(src, x, y);
  return { blob: dataUrlToBlob(c.toDataURL("image/png")), x, y, width: W, height: H };
}

const price = (m) => "NT$" + nt(m.usd);

export default {
  id: "genfx",
  icon: "🖼",
  title: "擴圖／🎚 色調分離",
  mount(ctx, body) {
    let busy = false;
    body.innerHTML = '<fieldset id="gfFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info">先在圖層選取一張圖片。</div>'
      + "<label>🖼 擴圖 Outpaint（AI 往外補畫面）</label>"
      + '<input id="gfPrompt" class="form-input" data-gf-prompt placeholder="整體場景，例如：海邊草地（可留空＝照周圍補）">'
      + '<div id="gfDirs" style="margin-top:6px;"></div>'
      + '<div class="info" style="margin-top:6px;">按模型就開始（按下即扣點，結果放成新圖層，原圖保留）</div>'
      + '<div class="row" id="gfModels" style="flex-wrap:wrap;"></div>'
      + '<div style="border-top:1px solid var(--card-border);margin-top:10px;padding-top:10px;">'
      + '<label>🎚 色調分離 Posterize　色階數 <span id="gfLevelsV" data-gf-levels-val>5</span></label>'
      + '<input id="gfLevels" data-gf-levels type="range" min="2" max="16" step="1" value="5">'
      + '<button type="button" class="btn btn-ghost" id="gfPosterize" data-gf-posterize style="margin-top:6px;">套用色調分離</button></div>'
      + '<div class="info" id="gfMsg" data-gf-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const dir = choiceGroup(OUTPAINT_PRESETS.map((p) => [p, OUTPAINT_LABELS[p]]), OUTPAINT_PRESETS[0]); // canvas default "Zoom out 1.5x" (CE:324)
    $("gfDirs").appendChild(dir.el);
    const say = (msg, b) => { const el = $("gfMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    const setBusy = (v) => { busy = v; $("gfFields").disabled = v; if (typeof ctx.busy === "function") ctx.busy(v); };
    for (const m of OUTPAINT_MODELS) {
      const b = modelButton(m, nt, () => outpaint(m));
      b.dataset.gfModel = m.value;
      $("gfModels").appendChild(b);
    }
    $("gfLevels").oninput = (e) => { $("gfLevelsV").textContent = String(e.target.value); };
    async function outpaint(m) {
      if (busy) return;
      const prompt = $("gfPrompt").value.trim();
      setBusy(true); // before any await: a second click while the host answers must not send a second paid request
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("先在圖層選取一張圖片。"); return; }
        say(m.label + " 擴圖中…", true);
        const img = await uploadableImage(sel.blob);
        const r = await postStudio(GENFILL_URL, { image: img.url, prompt, outpaint: dir.get(), model: m.value });
        if (!r.ok) { say("⚠️ " + (r.error || "擴圖失敗，請重試")); return; }
        const al = await alignOutpaint(sel.blob, r.image, dir.get());
        if (!al) {
          await ctx.placeImage(dataUrlToBlob(r.image), "擴圖.png");
          say("⚠️ 擴圖完成（" + m.label + "，" + price(m) + "），但回傳尺寸和方向對不上，已原樣置入為新圖層（原圖在下方）");
          return;
        }
        // at = the result's top-left in document px, so the source part lands exactly on the source layer
        const [, , , , tx, ty] = sel.transform;
        await ctx.placeImage(al.blob, "擴圖.png", { at: [tx - al.x, ty - al.y] });
        say("✅ 擴圖完成（" + m.label + "，" + price(m) + "），已置入為新圖層（原圖在下方）");
      } catch (err) { say("⚠️ " + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    }
    $("gfPosterize").onclick = async () => {
      if (busy) return;
      setBusy(true);
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("先在圖層選取一張圖片。"); return; }
        say("套用中…", true);
        const out = await posterizeDataUrl(await blobToDataUrl(sel.blob), +$("gfLevels").value);
        await ctx.replaceImage(sel.id, dataUrlToBlob(out));
        say("✅ 色調分離已套用");
      } catch (err) { say("⚠️ " + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    };
  },
};

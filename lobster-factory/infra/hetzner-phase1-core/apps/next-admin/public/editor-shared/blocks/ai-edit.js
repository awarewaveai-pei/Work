// Block: ✏️ AI 修圖 — one sentence edits the whole selected image ("把背景換成海邊"). Same call Studio makes
// (app/(shell)/tools/studio/StudioWorkbench.tsx:804-808): POST /api/tools/studio/generate {model, prompt, referenceImages:[the
// image], aspectRatio}; the reference is downscaled like Studio's downscaleImageFile (:269, 1024 px JPEG 0.85). One visible
// button per model, each showing its price; the result goes in as a new layer (placeImage), the source layer stays.
import { dataUrlToBlob, postStudio } from "./ai-fill.js";

export const GENERATE_URL = "/api/tools/studio/generate";

/** Edit-capable Studio models (lib/studio/model-options.ts PRODUCT_COMPOSITE_MODELS ∩ maxRefs ≥ 1). label / costNt are copies of
 *  STUDIO_MODEL_OPTIONS (that file is TypeScript, the browser can't import it); drift guard:
 *  lib/studio/__tests__/editor-ai-panels.test.ts "ai-edit 模型與價錢＝STUDIO_MODEL_OPTIONS". */
export const AI_EDIT_MODELS = Object.freeze([
  { value: "openai-25-edit", label: "GPT-Image-2.5 修圖", costNt: 2 },
  { value: "nano-banana-2", label: "Nano Banana 2", costNt: 2.2 },
  { value: "nano-banana-pro", label: "Nano Banana Pro", costNt: 4.4 },
  { value: "flux-kontext-pro", label: "FLUX Kontext Pro", costNt: 3.5 },
]);

/** Same table and rule as lib/studio/model-options.ts nearestAspectRatio (drift guard as above). */
const ASPECTS = [["2:3", 2 / 3], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["9:16", 9 / 16], ["3:2", 3 / 2], ["4:3", 4 / 3], ["16:9", 16 / 9]];
export function nearestAspectRatio(width, height) {
  const r = width / height;
  return ASPECTS.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

export const REF_MAX_DIM = 1024;
const REF_QUALITY = 0.85;
/** Image Blob → JPEG data URL, longest side ≤ REF_MAX_DIM (Studio downscaleImageFile), + the source size. */
export async function referenceImage(blob) {
  const bmp = await createImageBitmap(blob);
  const sc = Math.min(1, REF_MAX_DIM / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  const g = c.getContext("2d"); if (!g) throw new Error("no_canvas_context");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/jpeg", REF_QUALITY), width: bmp.width, height: bmp.height };
}
/** Model output (its own size) → PNG at the source's width, aspect kept, so the new layer is as big as the source. */
export async function atSourceWidth(resultUrl, width) {
  const bmp = await createImageBitmap(dataUrlToBlob(resultUrl));
  const c = document.createElement("canvas");
  c.width = width; c.height = Math.max(1, Math.round((bmp.height * width) / bmp.width));
  const g = c.getContext("2d"); if (!g) throw new Error("no_canvas_context");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return dataUrlToBlob(c.toDataURL("image/png"));
}

const price = (n) => "NT$" + n;

export default {
  id: "ai-edit",
  icon: "✏️",
  title: "AI 修圖",
  mount(ctx, body) {
    let busy = false;
    body.innerHTML = '<fieldset id="aeFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info">先在圖層選取一張圖片，寫一句要怎麼改，再按模型（按下就扣點，結果放成新圖層，原圖保留）。</div>'
      + '<textarea id="aePrompt" class="form-input" data-ae-prompt rows="3" placeholder="例如：把背景換成海邊"></textarea>'
      + '<div class="row" id="aeModels" style="flex-wrap:wrap;margin-top:6px;"></div>'
      + '<div class="info" id="aeMsg" data-ae-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const say = (msg, b) => { const el = $("aeMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    const setBusy = (v) => { busy = v; $("aeFields").disabled = v; if (typeof ctx.busy === "function") ctx.busy(v); };
    for (const m of AI_EDIT_MODELS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn btn-ghost"; b.dataset.aeModel = m.value;
      b.textContent = m.label + "　" + price(m.costNt);
      b.onclick = () => run(m);
      $("aeModels").appendChild(b);
    }
    async function run(m) {
      if (busy) return;
      const prompt = $("aePrompt").value.trim();
      if (prompt.length < 3) { say("請先寫一句要怎麼改（至少 3 個字）"); return; }
      setBusy(true); // before any await: a second click while the host answers must not send a second paid request
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("先在圖層選取一張圖片。"); return; }
        say(m.label + " 修圖中…", true);
        const ref = await referenceImage(sel.blob);
        const r = await postStudio(GENERATE_URL, {
          model: m.value, prompt, referenceImages: [ref.url], aspectRatio: nearestAspectRatio(ref.width, ref.height),
        });
        if (!r.ok) { say("⚠️ " + (r.error || "修圖失敗，請重試")); return; }
        const [, , , , tx, ty] = sel.transform; // new layer on the source's top-left (same width)
        await ctx.placeImage(await atSourceWidth(r.image, ref.width), "AI 修圖.png", { at: [tx, ty] });
        say("✅ 修圖完成（" + m.label + "，" + price(m.costNt) + "），已置入為新圖層（原圖在下方）");
      } catch (err) { say("⚠️ " + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    }
  },
};

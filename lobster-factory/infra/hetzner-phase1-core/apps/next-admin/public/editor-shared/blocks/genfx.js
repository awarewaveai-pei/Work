// Block: 🖼 擴圖／🎚 色調分離. Same panel as /tools/canvas CanvasEditor.tsx:2646-2677; flows from :1489-1530 (applyOutpaint) and
// :1446-1484 (posterizeSelected). The direction list is a row of visible buttons (the canvas used a <select>; operator rule: no dropdowns).
// Enum + labels from the SSOT /editor-shared/outpaint-presets.js, posterize maths from /editor-shared/posterize.js; nothing re-implemented.
// 擴圖 result is larger than the source by design, so it goes in with placeImage (a new layer at its own pixel size, the source stays
// under it): ctx.replaceImage keeps the old size (ctx-contract.md) and would squash the new area back into the old box.
import { OUTPAINT_PRESETS, OUTPAINT_LABELS } from "/editor-shared/outpaint-presets.js";
import { posterizeDataUrl } from "/editor-shared/posterize.js";
import { choiceGroup } from "/editor-shared/block-ui.js";
import { GENFILL_URL, blobToDataUrl, dataUrlToBlob, postStudio, uploadableImage } from "./ai-fill.js";

export default {
  id: "genfx",
  icon: "🖼",
  title: "擴圖／🎚 色調分離",
  mount(ctx, body) {
    let busy = false;
    body.innerHTML = '<fieldset id="gfFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info">先在圖層選取一張圖片。</div>'
      + "<label>🖼 擴圖 Outpaint（AI 往外補畫面）</label>"
      + '<input id="gfPrompt" class="form-input" data-gf-prompt placeholder="描述整體場景，例如：海邊草地">'
      + '<div id="gfDirs" style="margin-top:6px;"></div>'
      + '<button type="button" class="btn btn-primary" id="gfOutpaint" data-gf-outpaint style="margin-top:6px;">套用擴圖</button>'
      + '<div style="border-top:1px solid var(--card-border);margin-top:10px;padding-top:10px;">'
      + '<label>🎚 色調分離 Posterize　色階數 <span id="gfLevelsV" data-gf-levels-val>5</span></label>'
      + '<input id="gfLevels" data-gf-levels type="range" min="2" max="16" step="1" value="5">'
      + '<button type="button" class="btn btn-ghost" id="gfPosterize" data-gf-posterize style="margin-top:6px;">套用色調分離</button></div>'
      + '<div class="info" id="gfMsg" data-gf-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const dir = choiceGroup(OUTPAINT_PRESETS.map((p) => [p, OUTPAINT_LABELS[p]]), OUTPAINT_PRESETS[0]); // canvas default "Zoom out 1.5x" (CE:324)
    $("gfDirs").appendChild(dir.el);
    const say = (msg, b) => { const el = $("gfMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    const setBusy = (v) => {
      busy = v; $("gfFields").disabled = v; $("gfOutpaint").textContent = v ? "AI 處理中…" : "套用擴圖";
      if (typeof ctx.busy === "function") ctx.busy(v);
    };
    $("gfLevels").oninput = (e) => { $("gfLevelsV").textContent = String(e.target.value); };
    $("gfOutpaint").onclick = async () => {
      if (busy) return;
      const prompt = $("gfPrompt").value.trim();
      if (prompt.length < 2) { say("請先描述要生成的內容（prompt）"); return; }
      setBusy(true); // before any await: a second click while the host answers must not send a second paid request
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("先在圖層選取一張圖片。"); return; }
        say("AI 處理中…", true);
        const img = await uploadableImage(sel.blob);
        const r = await postStudio(GENFILL_URL, { image: img.url, prompt, outpaint: dir.get() });
        if (!r.ok) { say("⚠️ " + (r.error || "擴圖失敗，請重試")); return; }
        await ctx.placeImage(dataUrlToBlob(r.image), "擴圖.png");
        say("✅ 擴圖完成，已置入為新圖層（原圖在下方）");
      } catch (err) { say("⚠️ " + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    };
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

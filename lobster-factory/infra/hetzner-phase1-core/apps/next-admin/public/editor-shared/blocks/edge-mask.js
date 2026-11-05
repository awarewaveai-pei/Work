// Block: ✂️ 邊緣遮罩（筆刷邊）. Same panel as /tools/canvas CanvasEditor.tsx:2680-2721 (a visible chip per brush + 強度 slider that
// re-applies on release); flow from :1535-1580 (applyEdgeMaskToSelected): the mask always starts from the pixels before the first edge,
// so switching brushes REPLACES the edge instead of stacking masks. Styles + compositing from the SSOT /editor-shared/edge-mask.js.
// Chip previews: the white-on-transparent mask is drawn as a CSS mask over a theme-token fill, so it reads on any theme (no colour literal).
import { EDGE_MASK_STYLES, applyEdgeMask, buildMaskSvg } from "/editor-shared/edge-mask.js";
import { idAfterReplace } from "./color-grade.js";
import { blobToDataUrl, dataUrlToBlob } from "./ai-fill.js";

/** Chip preview source: the asset PNG, or the procedural SVG at 44×44 (amount 62, seed 7 — the canvas chip values, CE:38-43). */
const previewSrc = (s) => s.maskUrl || "data:image/svg+xml;charset=utf-8," + encodeURIComponent(buildMaskSvg(s.id, 44, 44, { amount: 62, seed: 7 }));

export default {
  id: "edge-mask",
  icon: "✂️",
  title: "邊緣遮罩（筆刷邊）",
  mount(ctx, body) {
    const original = new Map(); // image id -> Blob before its first edge (the canvas's img.edgeOriginal)
    let applied = null, busy = false;
    body.innerHTML = '<fieldset id="emFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info">點筆刷 → 把選取的圖套有機邊（透明 PNG）。可換不同筆刷。</div>'
      + '<div id="emGrid" data-em-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:5px;"></div>'
      + '<label>強度 <span id="emAmountV" data-em-amount-val>55</span></label>'
      + '<input id="emAmount" data-em-amount type="range" min="10" max="90" step="1" value="55">'
      + '<div class="info" id="emMsg" data-em-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const say = (msg, b) => { const el = $("emMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    const chips = EDGE_MASK_STYLES.map((s) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tab"; b.dataset.emStyle = s.id; b.title = s.labelEn; b.setAttribute("aria-label", s.label);
      b.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px;";
      const pv = document.createElement("span");
      const url = 'url("' + previewSrc(s) + '")';
      pv.style.cssText = "display:block;width:100%;aspect-ratio:1;background:var(--text-primary);";
      for (const k of ["maskImage", "webkitMaskImage"]) pv.style[k] = url;
      for (const k of ["maskSize", "webkitMaskSize"]) pv.style[k] = "contain";
      for (const k of ["maskRepeat", "webkitMaskRepeat"]) pv.style[k] = "no-repeat";
      const lb = document.createElement("span"); lb.textContent = s.label; lb.style.cssText = "font-size:var(--font-size-xs);line-height:1;";
      b.append(pv, lb);
      b.onclick = () => apply(s.id);
      $("emGrid").appendChild(b);
      return b;
    });
    const paint = () => chips.forEach((b) => { const on = b.dataset.emStyle === applied; b.classList.toggle("tab--active", on); b.setAttribute("aria-pressed", String(on)); });
    const setBusy = (v) => { busy = v; $("emFields").disabled = v; if (typeof ctx.busy === "function") ctx.busy(v); };
    async function apply(styleId) {
      if (busy) return;
      setBusy(true); // before any await: a second click while the host answers must not start a second bake
      try {
        const sel = await ctx.selectedImage(); if (!sel) { say("請先點選一張圖片，再套邊緣"); return; }
        say("套用中…", true);
        const base = original.get(sel.id) || sel.blob;
        const res = await applyEdgeMask(await blobToDataUrl(base), styleId, { amount: +$("emAmount").value, seed: 7 });
        if (!res.ok) { say("套邊失敗：" + res.error); return; }
        const nid = idAfterReplace(await ctx.replaceImage(sel.id, dataUrlToBlob(res.image)), sel.id);
        original.delete(sel.id); original.set(nid, base);
        applied = styleId; paint();
        say("✅ 已套用邊緣");
      } catch (err) { say("套邊失敗：" + (err && err.message ? err.message : String(err))); }
      finally { setBusy(false); }
    }
    $("emAmount").oninput = (e) => { $("emAmountV").textContent = String(e.target.value); };
    $("emAmount").onchange = () => { if (applied) apply(applied); }; // change fires on release = the canvas onPointerUp re-apply (CE:2714)
    paint();
  },
};

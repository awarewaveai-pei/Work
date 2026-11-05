// Block: 🪄 去背. Panel DOM from public/vector-editor.html:369-381 (#bgPanel / #bgFields / data-bg-* hooks); handlers from :1450-1498 (bgAi / bgRevert / bgPick / bgInit).
// Request + messages + pick math come from the SSOT /editor-shared/bg-remove.js (requestRemoveBg, BG_MSG, hexAtClient not needed here), the colour key from /editor-shared/color-grade.js (setRemoveColor -> RemoveColor filter);
// nothing is re-implemented. Flow: selectedImage() -> (offscreen colour key | POST /api/tools/studio/remove-bg) -> replaceImage(). 還原 = swap back the Blob kept before the first removal.
import * as bg from "/editor-shared/bg-remove.js";
import * as cg from "/editor-shared/color-grade.js";
import { applyAdjToBlob, idAfterReplace } from "./color-grade.js";

const WHITE = "#" + "f".repeat(6); // default of the colour-key input
const UPLOAD_MAX_CHARS = 11500000; // vector-editor.html:1009 (route MAX_IMAGE_CHARS = 12_000_000)
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function uploadableDataUrl(png) { // vector-editor.html:1010-1016
  if (png.length <= UPLOAD_MAX_CHARS) return png;
  const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = png; });
  const oc = document.createElement("canvas"), g = oc.getContext("2d"); let sc = 1, url = png;
  while (url.length > UPLOAD_MAX_CHARS && sc > 0.05) { oc.width = Math.max(1, Math.round(img.width * sc)); oc.height = Math.max(1, Math.round(img.height * sc)); g.clearRect(0, 0, oc.width, oc.height); g.drawImage(img, 0, 0, oc.width, oc.height); url = oc.toDataURL("image/webp", 0.92); sc *= 0.85; }
  return url;
}

export default {
  id: "bg-remove",
  icon: "🪄",
  title: "去背",
  mount(ctx, body) {
    const M = bg.BG_MSG;
    const before = new Map(); // image id -> Blob before its first removal (the old img.bgOriginal)
    let busy = false;
    body.innerHTML = '<fieldset id="bgFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info" id="bgHint" data-bg-hint>先在畫板選取一張圖片。</div>'
      + "<label>去除指定顏色 → 透明</label>"
      + '<div class="grid2"><div><label>要去除的顏色</label><input id="bgKeyColor" data-bg-color type="color" value="' + WHITE + '"></div><div><label>容差 <span id="bgKeyDistV" data-bg-dist-val>0.15</span></label><input id="bgKeyDist" data-bg-dist type="range" min="0" max="0.6" step="0.01" value="0.15"></div></div>'
      + '<div class="row" style="margin-top:6px;"><button class="btn btn-ghost" id="bgKeyPick" data-bg-pick title="吸取畫面任一點的顏色">💧 吸色</button><button class="btn btn-primary" id="bgKeyGo" data-bg-go>去除此色 → 透明</button></div>'
      + "<label>AI 去背（雲端）</label>"
      + '<button class="btn btn-primary" id="bgAiGo" data-bg-ai>AI 去背（選圖片）</button>'
      + '<button class="btn btn-ghost" id="bgRevert" data-bg-revert style="margin-top:6px;" title="把去背前的圖換回來">還原</button>'
      + '<div class="info" id="bgMsg" data-bg-msg></div></fieldset>';
    const $ = (id) => body.querySelector("#" + id);
    const say = (msg, b) => { const el = $("bgMsg"); el.textContent = msg; el.classList.toggle("busy", !!b); };
    const setBusy = (v) => { busy = v; $("bgFields").disabled = v; if (typeof ctx.busy === "function") ctx.busy(v); };
    async function swap(sel, blob) { // replace + remember the pre-removal Blob under the (possibly new) id
      const base = before.get(sel.id) || sel.blob;
      const nid = idAfterReplace(await ctx.replaceImage(sel.id, blob), sel.id);
      before.delete(sel.id); before.set(nid, base);
    }
    $("bgKeyDist").oninput = (e) => { $("bgKeyDistV").textContent = (+e.target.value).toFixed(2); };
    $("bgKeyGo").onclick = async () => {
      const sel = await ctx.selectedImage(); if (!sel || busy) { say(M.needImage); return; }
      setBusy(true);
      try { await swap(sel, await applyAdjToBlob(sel.blob, cg.setRemoveColor(cg.neutralAdj(), $("bgKeyColor").value, +$("bgKeyDist").value))); say(M.keyOk); }
      catch (err) { say(M.failed(err.message)); }
      finally { setBusy(false); }
    };
    $("bgKeyPick").onclick = async () => {
      if ("EyeDropper" in window) { try { const hex = (await new EyeDropper().open()).sRGBHex; $("bgKeyColor").value = hex; say(M.picked(hex)); } catch (err) { /* cancelled (Esc) */ } return; }
      say("此瀏覽器沒有吸色工具，請直接選顏色。");
    };
    $("bgAiGo").onclick = async () => {
      const sel = await ctx.selectedImage(); if (!sel || busy) { say(M.needImage); return; }
      setBusy(true); say(M.busy, true);
      try {
        const r = await bg.requestRemoveBg(await uploadableDataUrl(await blobToDataUrl(sel.blob)));
        if (!r.ok) { say(M.failed(r.error)); return; }
        await swap(sel, await (await fetch(r.image)).blob());
        say(M.ok);
      } catch (err) { say(M.failed(err.message)); }
      finally { setBusy(false); }
    };
    $("bgRevert").onclick = async () => {
      const sel = await ctx.selectedImage(); if (!sel || busy) { say(M.needImage); return; }
      const orig = before.get(sel.id); if (!orig) { say(M.nothingToRevert); return; }
      setBusy(true);
      try { const nid = idAfterReplace(await ctx.replaceImage(sel.id, orig), sel.id); before.delete(sel.id); if (nid !== sel.id) before.delete(nid); say(M.reverted); }
      catch (err) { say(M.revertFailed(err.message)); }
      finally { setBusy(false); }
    };
    say(M.intro);
  },
};

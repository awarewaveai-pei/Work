// Block: 存入 My Designs. Moved from public/vector-editor.html:1003-1032 (saveDesign handler, saveSt/editSeq button states) and :1009-1016 (uploadableDataUrl: data URL must stay under
// app/api/tools/designs/route.ts MAX_IMAGE_CHARS = 12_000_000). POST body/headers unchanged except source:'vector-pro'. Preview image = ctx.exportArtboard({format:'png'}); the native file = ctx.saveAs().
const UPLOAD_MAX_CHARS = 11500000;
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
async function uploadableDataUrl(png) {
  if (png.length <= UPLOAD_MAX_CHARS) return png;
  const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = png; });
  const oc = document.createElement("canvas"), g = oc.getContext("2d"); let sc = 1, url = png;
  while (url.length > UPLOAD_MAX_CHARS && sc > 0.05) { oc.width = Math.max(1, Math.round(img.width * sc)); oc.height = Math.max(1, Math.round(img.height * sc)); g.clearRect(0, 0, oc.width, oc.height); g.drawImage(img, 0, 0, oc.width, oc.height); url = oc.toDataURL("image/webp", 0.92); sc *= 0.85; }
  return url;
}

export default {
  id: "my-designs",
  icon: "💾",
  title: "存入 My Designs",
  mount(ctx, body) {
    body.innerHTML = '<button class="act" id="saveDesign">存入 My Designs</button><div class="info" id="mdInfo">把目前畫板的預覽圖存進 My Designs。</div>';
    const btn = body.querySelector("#saveDesign"), info = body.querySelector("#mdInfo");
    function setSaveSt(st) {
      btn.disabled = st === "saving" || st === "saved";
      btn.textContent = st === "saved" ? "已存入 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "儲存失敗 ✗（重試）" : "存入 My Designs";
    }
    btn.onclick = async () => {
      setSaveSt("saving");
      try {
        const png = await ctx.exportArtboard({ format: "png", ppi: 150 });
        const image = await uploadableDataUrl(await blobToDataUrl(png));
        const res = await fetch("/api/tools/designs", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-ops-simulated-role": "operator" },
          body: JSON.stringify({ image, prompt: "vector edit", modelName: "vector-pro", source: "vector-pro" }) });
        const data = await res.json().catch(() => ({ ok: false, error: "HTTP " + res.status }));
        setSaveSt(data.ok ? "saved" : "error");
        info.innerHTML = data.ok ? "✅ 已存入 My Designs" : "⚠️ 儲存失敗：" + (data.error || ("HTTP " + res.status));
        if (data.ok) setTimeout(() => setSaveSt("idle"), 4000);
      } catch (err) { setSaveSt("error"); info.innerHTML = "⚠️ 儲存失敗：" + err.message; }
    };
  },
};

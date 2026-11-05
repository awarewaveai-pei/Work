// Block: My Designs（存入 + 開啟）. Save moved from public/vector-editor.html:1003-1032 (saveDesign) and :1009-1016 (uploadableDataUrl).
// What /api/tools/designs can take (app/api/tools/designs/route.ts): POST accepts ONLY a png/jpeg/webp data URL (:161-176, lib/storage/r2.ts:118-120 regex),
// <= MAX_IMAGE_CHARS 12_000_000 (:15,:164-166); metadata fields are fixed (:259-269) -- there is no slot for a .vectorcraft file or an SVG, and no schema change is allowed.
// So: 存入 = PNG preview only (the editable .vectorcraft goes to the user's disk via ctx.saveAs()); 開啟 = GET list (route.ts:384-469, rows have object_url,mime_type,metadata)
// -> raster rows open with ctx.placeImage(blob); a row with mime image/svg+xml (C7.1 conversion output, not producible through this route today) opens with ctx.placeSvg(text).
// ctx methods used: exportArtboard, saveAs, placeImage, placeSvg, info (all in the C4.3 contract).
const UPLOAD_MAX_CHARS = 11500000; // route MAX_IMAGE_CHARS minus headroom
const SOURCES = new Set(["vector-editor", "vector-pro"]); // metadata.source written by the old editor / this panel
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Keep the data URL under the route limit: re-encode as WebP, then fewer pixels; null when it cannot fit (caller refuses with a message). */
async function uploadableDataUrl(png) {
  if (png.length <= UPLOAD_MAX_CHARS) return png;
  const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = png; });
  const oc = document.createElement("canvas"), g = oc.getContext("2d"); let sc = 1, url = png;
  while (url.length > UPLOAD_MAX_CHARS && sc > 0.05) { oc.width = Math.max(1, Math.round(img.width * sc)); oc.height = Math.max(1, Math.round(img.height * sc)); g.clearRect(0, 0, oc.width, oc.height); g.drawImage(img, 0, 0, oc.width, oc.height); url = oc.toDataURL("image/webp", 0.92); sc *= 0.85; }
  return url.length > UPLOAD_MAX_CHARS ? null : url;
}
const headers = { "Content-Type": "application/json", "x-ops-simulated-role": "operator" };

export default {
  id: "my-designs",
  icon: "💾",
  title: "My Designs",
  mount(ctx, body) {
    body.innerHTML = '<button class="act" id="saveDesign">存入 My Designs（預覽圖）</button>'
      + '<button class="ghost" id="saveFile" style="margin-top:6px;">下載可編輯檔（.vectorcraft）</button>'
      + '<div class="info" id="mdInfo">My Designs 只收圖片（PNG/WebP）；要保留可編輯內容請另外下載 .vectorcraft。</div>'
      + '<hr><div class="row"><button class="ghost" id="mdReload">重新整理清單</button></div>'
      + '<div id="mdList" class="fontlist" style="margin-top:6px;"></div><button class="ghost" id="mdMore" style="margin-top:6px;" hidden>載入更多</button>';
    const $ = (id) => body.querySelector("#" + id);
    const btn = $("saveDesign"), info = $("mdInfo");
    let cursor = null, loading = false;
    function setSaveSt(st) {
      btn.disabled = st === "saving" || st === "saved";
      btn.textContent = st === "saved" ? "已存入 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "儲存失敗 ✗（重試）" : "存入 My Designs（預覽圖）";
    }
    btn.onclick = async () => {
      setSaveSt("saving");
      try {
        const png = await ctx.exportArtboard({ format: "png", ppi: 150 });
        const image = await uploadableDataUrl(await blobToDataUrl(png));
        if (!image) { setSaveSt("error"); info.innerHTML = "⚠️ 圖片太大（超過 My Designs 約 9MB 上限），請縮小畫板再存。"; return; }
        const res = await fetch("/api/tools/designs", { method: "POST", credentials: "same-origin", headers,
          body: JSON.stringify({ image, prompt: "vector edit", modelName: "vector-pro", source: "vector-pro" }) });
        const data = await res.json().catch(() => ({ ok: false, error: "HTTP " + res.status }));
        setSaveSt(data.ok ? "saved" : "error");
        info.innerHTML = data.ok ? "✅ 已存入 My Designs" : "⚠️ 儲存失敗：" + esc(data.error || ("HTTP " + res.status));
        if (data.ok) { setTimeout(() => setSaveSt("idle"), 4000); load(true); }
      } catch (err) { setSaveSt("error"); info.innerHTML = "⚠️ 儲存失敗：" + esc(err.message); }
    };
    $("saveFile").onclick = async () => {
      try {
        const blob = await ctx.saveAs();
        const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = "design.vectorcraft"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
        info.innerHTML = "✅ 已下載 .vectorcraft（用真品的「開啟檔案」重新載入）";
      } catch (err) { info.innerHTML = "⚠️ 下載失敗：" + esc(err.message); }
    };
    async function openAsset(a) {
      info.innerHTML = '<span class="busy">開啟中…</span>';
      try {
        const res = await fetch(a.object_url, { credentials: "same-origin" }); if (!res.ok) throw new Error("HTTP " + res.status);
        if (a.mime_type === "image/svg+xml") await ctx.placeSvg(await res.text());
        else await ctx.placeImage(await res.blob());
        info.innerHTML = "✅ 已放入畫板";
      } catch (err) { info.innerHTML = "⚠️ 開啟失敗：" + esc(err.message); }
    }
    async function load(reset) {
      if (loading) return; loading = true;
      if (reset) { cursor = null; $("mdList").innerHTML = ""; }
      try {
        const q = new URLSearchParams({ order: "desc" }); if (cursor) q.set("cursor", cursor);
        const res = await fetch("/api/tools/designs?" + q, { credentials: "same-origin", headers });
        const data = await res.json().catch(() => ({ ok: false, error: "HTTP " + res.status }));
        if (!data.ok) { info.innerHTML = "⚠️ 讀取清單失敗：" + esc(data.error || ("HTTP " + res.status)); return; }
        (data.assets || []).filter((a) => !a.metadata || SOURCES.has(a.metadata.source) || a.mime_type === "image/svg+xml").forEach((a) => {
          const b = document.createElement("button"); b.className = "fontrow"; b.title = a.created_at;
          const nm = document.createElement("div"); nm.className = "fname"; nm.textContent = (a.created_at || "").slice(0, 16).replace("T", " ") + (a.mime_type === "image/svg+xml" ? "（SVG）" : "");
          const im = document.createElement("img"); im.src = a.object_url; im.loading = "lazy"; im.style.cssText = "max-width:100%;max-height:70px;object-fit:contain;";
          b.append(nm, im); b.onclick = () => openAsset(a); $("mdList").appendChild(b);
        });
        cursor = data.nextCursor || null; $("mdMore").hidden = !cursor;
        if (reset && !$("mdList").children.length && !cursor) $("mdList").innerHTML = '<div class="info">還沒有向量編輯器存過的設計。</div>';
      } catch (err) { info.innerHTML = "⚠️ 讀取清單失敗：" + esc(err.message); }
      finally { loading = false; }
    }
    $("mdReload").onclick = () => load(true);
    $("mdMore").onclick = () => load(false);
    load(true);
  },
};

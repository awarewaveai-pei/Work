// Block: My Designs（存入 + 開啟 + 選用的匯入舊專案）. Save moved from public/vector-editor.html:1003-1032 (saveDesign) and :1009-1016 (uploadableDataUrl).
// Editor-specific values (source tag, original-file name/extension, which rows belong here, labels) come from ctx.host (ctx-contract.md); nothing here names an editor.
// API (app/api/tools/designs/route.ts): POST takes the preview as `image` (png/jpeg/webp data URL, <= 12M chars) and the original file as
// `sourceFile:{name,data(base64)}` (<= 20 MB, content-sniffed by extension -> metadata.source_key); GET rows carry source_url + metadata.source_name.
// 開啟: row with source_url -> ctx.openFile(blob,name); row without -> ctx.placeImage(preview). 匯入舊專案: only when ctx.importLegacy exists (the host owns that conversion).

const UPLOAD_MAX_CHARS = 11500000; // route MAX_IMAGE_CHARS minus headroom
const SOURCE_MAX_BYTES = 20 * 1024 * 1024; // route MAX_SOURCE_BYTES
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
// The R2 public host sends no CORS headers, so a browser fetch of it fails ("Failed to fetch"): same-origin proxy (app/api/tools/designs/download/route.ts, host allowlist).
const viaProxy = (publicUrl) => "/api/tools/designs/download?url=" + encodeURIComponent(publicUrl);
const headers = { "Content-Type": "application/json", "x-ops-simulated-role": "operator" };
/**
 * 存入 My Designs＝預覽 PNG＋可編輯原檔（ctx.saveAs）。面板的「存入」與 dock 的「傳回」退路（editor-shared/dock.js，C8.1）共用這一個。
 * png：已匯出的預覽（傳回時已有，不再匯出一次）；沒給就以 150 ppi 匯出。回 { ok: true } 或 { ok: false, message }（給人看的原因）。
 */
export async function saveToMyDesigns(ctx, png) {
  const host = ctx.host;
  try {
    const [preview, file] = await Promise.all([png ? Promise.resolve(png) : ctx.exportArtboard({ format: "png", ppi: 150 }), ctx.saveAs()]);
    if (file.size > SOURCE_MAX_BYTES) return { ok: false, message: "⚠️ 原檔超過 20MB 上限（" + Math.round(file.size / 1048576) + " MB），無法存入。請精簡內嵌圖片後再存。" };
    const image = await uploadableDataUrl(await blobToDataUrl(preview));
    if (!image) return { ok: false, message: "⚠️ 預覽圖太大（超過約 9MB 上限），請縮小畫板再存。" };
    const data = (await blobToDataUrl(file)).split(",")[1];
    const res = await fetch("/api/tools/designs", { method: "POST", credentials: "same-origin", headers,
      body: JSON.stringify({ image, sourceFile: { name: host.sourceName, data }, prompt: host.saveTag.prompt, modelName: host.saveTag.modelName, source: host.saveTag.source }) });
    const out = await res.json().catch(() => ({ ok: false, error: "HTTP " + res.status }));
    return out.ok ? { ok: true } : { ok: false, message: "⚠️ 儲存失敗：" + (out.error || ("HTTP " + res.status)) };
  } catch (err) {
    return { ok: false, message: "⚠️ 儲存失敗：" + (err?.message || err) };
  }
}
export default {
  id: "my-designs",
  icon: "💾",
  title: "My Designs",
  mount(ctx, body) {
    const host = ctx.host;
    if (!host || !host.sourceExt || !host.saveTag || !Array.isArray(host.listSources)) throw new Error("my-designs 需要 ctx.host（見 ctx-contract.md）");
    const sources = new Set(host.listSources);
    const canLegacy = typeof ctx.importLegacy === "function";
    body.innerHTML = '<button class="btn btn-primary" id="saveDesign">存入 My Designs</button>'
      + '<div class="info" id="mdInfo">存入＝預覽圖＋可編輯原檔（' + esc(host.sourceExt) + '）。</div>'
      + (canLegacy ? '<label>匯入舊專案（.design.json）</label><input id="mdProj" type="file" accept=".json,application/json">' : "")
      + '<hr><div class="row"><button class="btn btn-ghost" id="mdReload">重新整理清單</button></div>'
      + '<div id="mdList" class="fontlist" style="margin-top:6px;"></div><button class="btn btn-ghost" id="mdMore" style="margin-top:6px;" hidden>載入更多</button>';
    const $ = (id) => body.querySelector("#" + id);
    const btn = $("saveDesign"), info = $("mdInfo");
    let cursor = null, loading = false;
    function setSaveSt(st) {
      btn.disabled = st === "saving" || st === "saved";
      btn.textContent = st === "saved" ? "已存入 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "儲存失敗 ✗（重試）" : "存入 My Designs";
    }
    btn.onclick = async () => {
      setSaveSt("saving");
      const r = await saveToMyDesigns(ctx);
      setSaveSt(r.ok ? "saved" : "error");
      info.textContent = r.ok ? "✅ 已存入 My Designs（含可編輯原檔）" : r.message;
      if (r.ok) { setTimeout(() => setSaveSt("idle"), 4000); load(true); }
    };
    async function openAsset(a) {
      info.innerHTML = '<span class="busy">開啟中…</span>';
      try {
        if (a.source_url) {
          const res = await fetch(viaProxy(a.source_url), { credentials: "same-origin" }); if (!res.ok) throw new Error("HTTP " + res.status);
          if (typeof ctx.openFile !== "function") throw new Error("編輯器轉接器缺少 openFile(blob, name)");
          await ctx.openFile(await res.blob(), (a.metadata && a.metadata.source_name) || host.sourceName);
        } else {
          const res = await fetch(viaProxy(a.object_url), { credentials: "same-origin" }); if (!res.ok) throw new Error("HTTP " + res.status);
          await ctx.placeImage(await res.blob());
        }
        info.innerHTML = a.source_url ? "✅ 已開啟設計" : "✅ 舊設計只有預覽圖，已放入畫板";
      } catch (err) { info.innerHTML = "⚠️ 開啟失敗：" + esc(err.message); }
    }
    // 這個宿主的設計：來源標記在 host.listSources（舊資料沒有 metadata 的也算）；有原始檔時，原始檔副檔名（伺服器發的 key 尾巴）要等於 host.sourceExt，
    // 否則別的編輯器的原始檔會列出來卻開不了。
    const extOf = (url) => { const m = /\.[A-Za-z0-9]+$/.exec(String(url).split(/[?#]/)[0]); return m ? m[0].toLowerCase() : ""; };
    const belongsHere = (a) => (!a.metadata || sources.has(a.metadata.source)) && (!a.source_url || extOf(a.source_url) === host.sourceExt);
    async function load(reset) {
      if (loading) return; loading = true;
      if (reset) { cursor = null; $("mdList").innerHTML = ""; }
      try {
        const q = new URLSearchParams({ order: "desc" }); if (cursor) q.set("cursor", cursor);
        const res = await fetch("/api/tools/designs?" + q, { credentials: "same-origin", headers });
        const data = await res.json().catch(() => ({ ok: false, error: "HTTP " + res.status }));
        if (!data.ok) { info.innerHTML = "⚠️ 讀取清單失敗：" + esc(data.error || ("HTTP " + res.status)); return; }
        (data.assets || []).filter(belongsHere).forEach((a) => {
          const b = document.createElement("button"); b.className = "fontrow"; b.title = a.created_at;
          const nm = document.createElement("div"); nm.className = "fname"; nm.textContent = (a.created_at || "").slice(0, 16).replace("T", " ") + (a.source_url ? "（可編輯）" : "（僅預覽）");
          const im = document.createElement("img"); im.src = a.object_url; im.loading = "lazy"; im.style.cssText = "max-width:100%;max-height:70px;object-fit:contain;";
          b.append(nm, im); b.onclick = () => openAsset(a); $("mdList").appendChild(b);
        });
        cursor = data.nextCursor || null; $("mdMore").hidden = !cursor;
        if (reset && !$("mdList").children.length && !cursor) $("mdList").innerHTML = '<div class="info">還沒有' + esc(host.label) + '編輯器存過的設計。</div>';
      } catch (err) { info.innerHTML = "⚠️ 讀取清單失敗：" + esc(err.message); }
      finally { loading = false; }
    }
    if (canLegacy) $("mdProj").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      info.innerHTML = '<span class="busy">轉換舊專案…</span>';
      try {
        const { objects } = await ctx.importLegacy(f);
        info.innerHTML = "✅ 舊專案已轉成向量放入畫板（" + objects + " 個物件）";
      } catch (err) { info.innerHTML = "⚠️ 匯入失敗：" + esc(err.message); }
    };
    $("mdReload").onclick = () => load(true);
    $("mdMore").onclick = () => load(false);
    load(true);
  },
};

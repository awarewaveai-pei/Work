// Block: My Designs（存入 + 開啟 + 匯入舊專案）. Save moved from public/vector-editor.html:1003-1032 (saveDesign) and :1009-1016 (uploadableDataUrl).
// API (app/api/tools/designs/route.ts): POST takes the preview as `image` (png/jpeg/webp data URL, <= 12M chars) and the original file as
// `sourceFile:{name,data(base64)}` (.vectorcraft/.svg, <= 20 MB, content-sniffed -> metadata.source_key); GET rows carry source_url + metadata.source_name.
// 開啟: row with source_url -> ctx.openFile(blob,name); row without -> ctx.placeImage(preview). 匯入舊專案: .design.json -> Fabric 5 StaticCanvas -> toSVG -> ctx.placeSvg
// (load path = vector-editor.html:1293-1317, normalizeV7Types :1288-1292, SVG size = exportSvg :970-973; Fabric via ensureFabric() of ./color-grade.js).
import { ensureFabric } from "./color-grade.js";

const UPLOAD_MAX_CHARS = 11500000; // route MAX_IMAGE_CHARS minus headroom
const SOURCE_MAX_BYTES = 20 * 1024 * 1024; // route MAX_SOURCE_BYTES
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
// vector-editor.html:442-443
const toPx = (val, unit, dpi) => { if (unit === "px") return Math.round(val); const cm = unit === "mm" ? val / 10 : val; return Math.round(cm * dpi / 2.54); };
const toCm = (val, unit, dpi) => (unit === "px" ? +(val * 2.54 / dpi).toFixed(2) : unit === "mm" ? val / 10 : val);
// vector-editor.html:1288-1292 (/tools/canvas Fabric 7 type names -> Fabric 5)
function normalizeV7Types(node) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string" && /^[A-Z]/.test(node.type)) node.type = node.type.replace(/^([A-Z])([A-Z])/, "$1-$2").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  (node.objects || []).forEach(normalizeV7Types); if (node.clipPath) normalizeV7Types(node.clipPath);
}

export default {
  id: "my-designs",
  icon: "💾",
  title: "My Designs",
  mount(ctx, body) {
    body.innerHTML = '<button class="act" id="saveDesign">存入 My Designs</button>'
      + '<div class="info" id="mdInfo">存入＝預覽圖＋可編輯原檔（.vectorcraft）。</div>'
      + '<label>匯入舊專案（.design.json）</label><input id="mdProj" type="file" accept=".json,application/json">'
      + '<hr><div class="row"><button class="ghost" id="mdReload">重新整理清單</button></div>'
      + '<div id="mdList" class="fontlist" style="margin-top:6px;"></div><button class="ghost" id="mdMore" style="margin-top:6px;" hidden>載入更多</button>';
    const $ = (id) => body.querySelector("#" + id);
    const btn = $("saveDesign"), info = $("mdInfo");
    let cursor = null, loading = false;
    function setSaveSt(st) {
      btn.disabled = st === "saving" || st === "saved";
      btn.textContent = st === "saved" ? "已存入 ✓" : st === "saving" ? "儲存中…" : st === "error" ? "儲存失敗 ✗（重試）" : "存入 My Designs";
    }
    btn.onclick = async () => {
      setSaveSt("saving");
      try {
        const [png, file] = await Promise.all([ctx.exportArtboard({ format: "png", ppi: 150 }), ctx.saveAs()]);
        if (file.size > SOURCE_MAX_BYTES) { setSaveSt("error"); info.innerHTML = "⚠️ 原檔超過 20MB 上限（" + Math.round(file.size / 1048576) + " MB），無法存入。請精簡內嵌圖片後再存。"; return; }
        const image = await uploadableDataUrl(await blobToDataUrl(png));
        if (!image) { setSaveSt("error"); info.innerHTML = "⚠️ 預覽圖太大（超過約 9MB 上限），請縮小畫板再存。"; return; }
        const data = (await blobToDataUrl(file)).split(",")[1];
        const res = await fetch("/api/tools/designs", { method: "POST", credentials: "same-origin", headers,
          body: JSON.stringify({ image, sourceFile: { name: "design.vectorcraft", data }, prompt: "vector edit", modelName: "vector-pro", source: "vector-pro" }) });
        const out = await res.json().catch(() => ({ ok: false, error: "HTTP " + res.status }));
        setSaveSt(out.ok ? "saved" : "error");
        info.innerHTML = out.ok ? "✅ 已存入 My Designs（含可編輯原檔）" : "⚠️ 儲存失敗：" + esc(out.error || ("HTTP " + res.status));
        if (out.ok) { setTimeout(() => setSaveSt("idle"), 4000); load(true); }
      } catch (err) { setSaveSt("error"); info.innerHTML = "⚠️ 儲存失敗：" + esc(err.message); }
    };
    async function openAsset(a) {
      info.innerHTML = '<span class="busy">開啟中…</span>';
      try {
        if (a.source_url) {
          const res = await fetch(a.source_url); if (!res.ok) throw new Error("HTTP " + res.status);
          if (typeof ctx.openFile !== "function") throw new Error("編輯器轉接器缺少 openFile(blob, name)");
          await ctx.openFile(await res.blob(), (a.metadata && a.metadata.source_name) || "design.vectorcraft");
        } else {
          const res = await fetch(a.object_url); if (!res.ok) throw new Error("HTTP " + res.status);
          await ctx.placeImage(await res.blob());
        }
        info.innerHTML = a.source_url ? "✅ 已開啟設計" : "✅ 舊設計只有預覽圖，已放入畫板";
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
        (data.assets || []).filter((a) => a.source_url || !a.metadata || SOURCES.has(a.metadata.source)).forEach((a) => {
          const b = document.createElement("button"); b.className = "fontrow"; b.title = a.created_at;
          const nm = document.createElement("div"); nm.className = "fname"; nm.textContent = (a.created_at || "").slice(0, 16).replace("T", " ") + (a.source_url ? "（可編輯）" : "（僅預覽）");
          const im = document.createElement("img"); im.src = a.object_url; im.loading = "lazy"; im.style.cssText = "max-width:100%;max-height:70px;object-fit:contain;";
          b.append(nm, im); b.onclick = () => openAsset(a); $("mdList").appendChild(b);
        });
        cursor = data.nextCursor || null; $("mdMore").hidden = !cursor;
        if (reset && !$("mdList").children.length && !cursor) $("mdList").innerHTML = '<div class="info">還沒有向量編輯器存過的設計。</div>';
      } catch (err) { info.innerHTML = "⚠️ 讀取清單失敗：" + esc(err.message); }
      finally { loading = false; }
    }
    $("mdProj").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      info.innerHTML = '<span class="busy">轉換舊專案…</span>';
      let sc = null;
      try {
        const fabric = await ensureFabric();
        const data = JSON.parse(await f.text());
        const mt = data.meta;
        const okMeta = mt && ["cm", "mm", "px"].includes(mt.unit) && mt.wv > 0 && mt.hv > 0 && mt.dpi >= 1 && mt.dpi <= 2400;
        const fab = data.json || data.canvas || data; normalizeV7Types(fab);
        const realW = okMeta ? toPx(mt.wv, mt.unit, mt.dpi) : (+data.w || 1063), realH = okMeta ? toPx(mt.hv, mt.unit, mt.dpi) : (+data.h || 638);
        sc = new fabric.StaticCanvas(null, { width: realW, height: realH, enableRetinaScaling: false });
        await new Promise((res, rej) => { try { sc.loadFromJSON(fab, res); } catch (err) { rej(err); } });
        if (okMeta && mt.transparent) sc.backgroundColor = ""; // 匯出透明底 was on
        else if (okMeta && /^#[0-9a-f]{6}$/i.test(mt.bgColor || "")) sc.backgroundColor = mt.bgColor;
        sc.renderAll();
        const svg = sc.toSVG(okMeta ? { width: toCm(mt.wv, mt.unit, mt.dpi) + "cm", height: toCm(mt.hv, mt.unit, mt.dpi) + "cm", viewBox: { x: 0, y: 0, width: realW, height: realH } } : undefined);
        await ctx.placeSvg(svg);
        info.innerHTML = "✅ 舊專案已轉成向量放入畫板（" + sc.getObjects().length + " 個物件）";
      } catch (err) { info.innerHTML = "⚠️ 匯入失敗：" + esc(err.message); }
      finally { if (sc) sc.dispose(); }
    };
    $("mdReload").onclick = () => load(true);
    $("mdMore").onclick = () => load(false);
    load(true);
  },
};

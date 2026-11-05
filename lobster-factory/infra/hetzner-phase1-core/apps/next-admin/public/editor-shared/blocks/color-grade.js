// Block: 🎨 調色. Panel DOM from public/vector-editor.html:362-368 (#gradePanel / #cgFields / #cgHint / #cgReset / #cgSecs); section builder from :1361-1417 (cgInit) and :1350-1360 (cgAuto).
// Math is NOT here: every number comes from the shared SSOT /editor-shared/color-grade.js (buildFilterSpecs, makeFilters, applyAuto, setPath ...). AwHsl/AwBlur are the shared
// AW_FILTERS definitions, only wrapped in Fabric 5 classes here (Fabric 7 wraps the same ones in tools/canvas/fabric-filters.ts). Offscreen: selectedImage() -> Fabric 5 filters -> PNG -> replaceImage().
import * as cg from "/editor-shared/color-grade.js";

const FABRIC_URL = "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"; // pinned + SRI (lib/security/__tests__/public-html-sri.test.ts)
const FABRIC_SRI = "sha384-K2R7AzsJQPCDnhTlIEZr5pifaODgyx7XqbqkZMtLKzGJNo/Irtg9yU85F+1YwL8X";
let fabricP = null;
export function ensureFabric() {
  if (fabricP) return fabricP;
  fabricP = (async () => {
    if (!globalThis.fabric) {
      await new Promise((res, rej) => {
        const s = document.createElement("script"); s.src = FABRIC_URL; s.integrity = FABRIC_SRI; s.crossOrigin = "anonymous";
        s.onload = res; s.onerror = () => rej(new Error("Fabric 載入失敗")); document.head.appendChild(s);
      });
    }
    const fabric = globalThis.fabric, F = fabric.Image.filters;
    if (!F.AwHsl) {
      for (const [name, def] of Object.entries(cg.AW_FILTERS)) {
        F[name] = fabric.util.createClass(F.BaseFilter, {
          type: name,
          initialize: function (o) { Object.assign(this, def.init(o)); },
          applyTo2d: function (opts) { def.apply2d(this, opts.imageData); },
          isNeutralTransformation: function () { return def.neutral(this); },
          toObject: function () { return def.toObject(this); },
        });
        F[name].fromObject = F.BaseFilter.fromObject;
      }
      fabric.filterBackend = new fabric.Canvas2dFilterBackend(); // 2d backend -> same pixels as /tools/canvas
    }
    return fabric;
  })();
  fabricP.catch(() => { fabricP = null; });
  return fabricP;
}

/** Offscreen: apply `adj` (shared adj shape) to an image Blob -> PNG Blob. Same filter chain as vector-editor.html:1324-1329 cgApply. */
export async function applyAdjToBlob(blob, adj) {
  const fabric = await ensureFabric(), F = fabric.Image.filters;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => fabric.Image.fromURL(url, (i) => (i && i.getElement() ? res(i) : rej(new Error("圖片解碼失敗")))));
    img.filters = cg.makeFilters((cls) => F[cls], cg.buildFilterSpecs(adj));
    img.applyFilters();
    const dataUrl = img.toDataURL({ format: "png", multiplier: 1, withoutTransform: true }); // same call as vector-editor.html:1359
    return await (await fetch(dataUrl)).blob();
  } finally { URL.revokeObjectURL(url); }
}

/** replaceImage may answer a new id (object {id} or the id itself); keep the old one when it answers nothing. */
export function idAfterReplace(r, oldId) { return r && typeof r === "object" && "id" in r ? r.id : (r != null && r !== true ? r : oldId); }

export default {
  id: "color-grade",
  icon: "🎨",
  title: "調色",
  mount(ctx, body) {
    let adj = cg.neutralAdj(), hslTab = "all";
    const origin = new Map(); // image id -> Blob before its first 調色 (re-grading always starts from the untouched pixels)
    body.innerHTML = '<fieldset id="cgFields" style="border:0;padding:0;margin:0;min-width:0;">'
      + '<div class="info" id="cgHint">先在畫板選取一張圖片，調好後按「套用到選取圖片」。</div>'
      + '<div class="row" style="margin-top:6px;"><button class="btn btn-ghost" id="cgReset" data-cg-reset title="全部回到中性值">重設</button><button class="btn btn-primary" id="cgApply" style="margin-top:0;">套用到選取圖片</button></div>'
      + '<div id="cgSecs"></div></fieldset>';
    const secs = body.querySelector("#cgSecs"), hint = body.querySelector("#cgHint");
    const sec = (id, title) => { const d = document.createElement("details"); d.className = "cgsec"; d.dataset.cgSec = id; const sm = document.createElement("summary"); sm.textContent = title; d.appendChild(sm); const b = document.createElement("div"); d.appendChild(b); secs.appendChild(d); return b; };
    function paint() {
      secs.querySelectorAll("input[data-cg]").forEach((el) => { const v = cg.getPath(adj, el.dataset.cg); el.value = v; const row = cg.GRADE_SECTIONS.flatMap((s) => s.rows).find((r) => r.path === el.dataset.cg); secs.querySelector('[data-cg-val="' + el.dataset.cg + '"]').textContent = cg.fmtValue(row.fmt, v); });
      secs.querySelectorAll("[data-cg-preset]").forEach((b) => b.classList.toggle("tab--active", (b.dataset.cgPreset || null) === adj.presetId));
      secs.querySelector("[data-cg-removewhite]").checked = !!adj.removeWhite;
      secs.querySelectorAll("[data-cg-hsl-tab]").forEach((b) => b.classList.toggle("tab--active", b.dataset.cgHslTab === hslTab));
      secs.querySelectorAll("input[data-cg-hsl]").forEach((el) => { const v = adj.hslMixer[hslTab][el.dataset.cgHsl]; el.value = v; secs.querySelector('[data-cg-hsl-val="' + el.dataset.cgHsl + '"]').textContent = v > 0 ? "+" + v : "" + v; });
      body.querySelector("#cgReset").disabled = cg.isGradeNeutral(adj);
    }
    const set = (next) => { adj = next; paint(); };
    // 預設風格 + 去白底
    const pb = sec("presets", "預設風格 Presets"), pr = document.createElement("div"); pr.className = "grid3"; pb.appendChild(pr);
    [{ id: "", label: "原圖" }].concat(cg.PRESETS).forEach((p) => { const b = document.createElement("button"); b.className = "btn btn-ghost"; b.dataset.cgPreset = p.id; b.textContent = p.label;
      b.onclick = () => set({ ...adj, presetId: p.id === "" ? null : (adj.presetId === p.id ? null : p.id) }); pr.appendChild(b); });
    const rw = document.createElement("label"); rw.style.cssText = "display:flex;gap:6px;align-items:center;";
    rw.innerHTML = '<input type="checkbox" data-cg-removewhite style="width:auto;"> ✂️ 去白底（免費，近白色變透明）'; pb.appendChild(rw);
    rw.querySelector("input").onchange = (e) => set({ ...adj, removeWhite: e.target.checked });
    // 自動: analysis reads the selected image's pixels, then only moves the sliders
    const ab = sec("auto", "自動 Auto"), ar = document.createElement("div"); ar.className = "grid3"; ab.appendChild(ar);
    [["contrast", "自動對比", "分析畫素亮度範圍，自動設對比／曝光"], ["color", "自動色彩", "中性灰平衡，自動矯正偏色"], ["tone", "自動色調", "同時套用自動對比 + 自動色彩"]].forEach(([k, t, tip]) => {
      const b = document.createElement("button"); b.className = "btn btn-ghost"; b.dataset.cgAuto = k; b.textContent = t; b.title = tip;
      b.onclick = async () => {
        const sel = await ctx.selectedImage(); if (!sel) { hint.textContent = "先選取圖片後才能使用。"; return; }
        try {
          const bmp = await createImageBitmap(sel.blob);
          const oc = document.createElement("canvas"); oc.width = bmp.width; oc.height = bmp.height; const g = oc.getContext("2d"); g.drawImage(bmp, 0, 0);
          set(cg.applyAuto(adj, k, g.getImageData(0, 0, bmp.width, bmp.height).data));
        } catch (e) { ctx.info("⚠️ 自動調整失敗：無法解碼圖片"); }
      };
      ar.appendChild(b);
    });
    // 色階 / 色彩平衡 / 基本 / Camera RAW — rows straight from the shared module
    cg.GRADE_SECTIONS.forEach((s) => {
      const sb = sec(s.id, s.title);
      s.rows.forEach((r) => { const lim = cg.limitOf(r.path);
        const lb = document.createElement("label"); lb.innerHTML = r.label + ' <span data-cg-val="' + r.path + '"></span>'; sb.appendChild(lb);
        const el = document.createElement("input"); el.type = "range"; el.dataset.cg = r.path; el.min = lim.min; el.max = lim.max; el.step = r.step; el.value = lim.neutral;
        el.oninput = () => set(cg.setPath(adj, r.path, +el.value)); sb.appendChild(el); });
    });
    // 色彩混合器 HSL
    const hb = sec("hsl", "色彩混合器 HSL"), tabs = document.createElement("div"); tabs.className = "grid3"; hb.appendChild(tabs);
    [{ key: "all", label: "全部" }].concat(cg.HSL_RANGES).forEach((r) => { const b = document.createElement("button"); b.className = "tab"; b.dataset.cgHslTab = r.key; b.textContent = r.label;
      if (r.color) b.style.setProperty("--swatch", r.color); // hue of the range, from the shared module; theme.css draws it b.onclick = () => { hslTab = r.key; paint(); }; tabs.appendChild(b); });
    cg.HSL_AXES.forEach((a) => {
      const lb = document.createElement("label"); lb.innerHTML = a.label + ' <span data-cg-hsl-val="' + a.axis + '"></span>'; hb.appendChild(lb);
      const el = document.createElement("input"); el.type = "range"; el.dataset.cgHsl = a.axis; el.min = a.min; el.max = a.max; el.step = 1; el.value = 0;
      el.oninput = () => { const hm = JSON.parse(JSON.stringify(adj.hslMixer)); hm[hslTab][a.axis] = +el.value; set({ ...adj, hslMixer: hm }); }; hb.appendChild(el); });
    const hr = document.createElement("div"); hr.className = "row"; hr.style.marginTop = "6px"; hb.appendChild(hr);
    [["range", "重置此色段"], ["all", "全部重置"]].forEach(([k, t]) => { const b = document.createElement("button"); b.className = "btn btn-ghost"; b.dataset.cgHslReset = k; b.textContent = t;
      b.onclick = () => { const hm = JSON.parse(JSON.stringify(adj.hslMixer)); if (k === "all") cg.HSL_RANGES.concat([{ key: "all" }]).forEach((r) => { hm[r.key] = { h: 0, s: 0, l: 0 }; }); else hm[hslTab] = { h: 0, s: 0, l: 0 }; set({ ...adj, hslMixer: hm }); }; hr.appendChild(b); });
    body.querySelector("#cgReset").onclick = () => set(cg.resetGradeAdj(adj));
    // 套用: selected image -> offscreen filters -> PNG -> replaceImage (one undo step in the host)
    body.querySelector("#cgApply").onclick = async () => {
      const sel = await ctx.selectedImage(); if (!sel) { hint.textContent = "先選取圖片後才能使用。"; return; }
      hint.textContent = ""; if (typeof ctx.busy === "function") ctx.busy(true);
      try {
        const base = origin.get(sel.id) || sel.blob; origin.set(sel.id, base);
        const out = await applyAdjToBlob(base, adj);
        const nid = idAfterReplace(await ctx.replaceImage(sel.id, out), sel.id);
        if (nid !== sel.id) { origin.set(nid, base); origin.delete(sel.id); }
        ctx.info("✅ 調色已套用");
      } catch (e) { ctx.info("⚠️ 調色失敗：" + e.message); }
      finally { if (typeof ctx.busy === "function") ctx.busy(false); }
    };
    paint();
  },
};

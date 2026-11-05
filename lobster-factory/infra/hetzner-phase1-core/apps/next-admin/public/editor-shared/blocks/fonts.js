// Block: 字型. Font lists + list/search UI moved from public/vector-editor.html:1099-1112 (CJK/LATIN/GFONTS/gfLink), :1125-1148 (buildFontList), :1155-1173 (search / 中文·英文·全部 / upload), panel DOM :248-257.
// Differences: (1) system PRESET_FONTS (:1114-1123) are dropped -- a wasm editor cannot read system fonts; (2) applying a font = get a TTF -> ctx.addFont(bytes) -> ctx.setFont(family) (the host owns type.setFont).
const CJK = ["Noto Sans TC", "Noto Serif TC", "Noto Sans HK", "Noto Serif HK"];
const LATIN = ["Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Inter", "Nunito", "Raleway", "Work Sans", "Rubik", "Manrope", "DM Sans", "Mulish", "Ubuntu", "Fredoka", "Kanit", "Merriweather", "Playfair Display", "Lora", "PT Serif", "Cormorant", "EB Garamond", "Bitter", "Crimson Text", "Cinzel", "Roboto Mono", "JetBrains Mono", "Source Code Pro", "Space Mono", "Pacifico", "Lobster", "Bebas Neue", "Anton", "Oswald", "Righteous", "Abril Fatface", "Archivo Black", "Teko", "Dancing Script", "Caveat", "Permanent Marker", "Sacramento", "Great Vibes", "Satisfy", "Shadows Into Light", "Comfortaa", "Quicksand", "Bungee"];
const GFONTS = CJK.concat(LATIN); // 中文排最前，方便找
function gfLink(families) { // preview only (the list rows render with the web font)
  if (!families.length) return;
  const link = document.createElement("link"); link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css?family=" + families.map((f) => f.replace(/ /g, "+")).join("|") + "&display=swap";
  document.head.appendChild(link);
}
// Font file for a Google family. The css2 sheet only gives woff2 to browsers, and the real FontDb reads TTF/OTF/TTC only (crates/text/src/fontdb/db.rs:245 doc,
// :247-262 add_font -> enumerate_faces via skrifa; no woff code anywhere under crates/text/src/fontdb/), so the TTF comes from the google/fonts repo
// (api.github.com + raw.githubusercontent.com both answer CORS *). Directory = family lower-cased without spaces under ofl/ apache/ ufl/.
const GH_API = "https://api.github.com/repos/google/fonts/contents/";
async function fetchGoogleFontBytes(name) {
  const dir = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const lic of ["ofl", "apache", "ufl"]) {
    const res = await fetch(GH_API + lic + "/" + dir + "?ref=main");
    if (res.status === 404) continue;
    if (!res.ok) throw new Error("字型來源 HTTP " + res.status + (res.status === 403 ? "（GitHub 每小時查詢次數用完，稍後再試）" : ""));
    const ttf = (await res.json()).filter((f) => /\.ttf$/i.test(f.name));
    const upright = ttf.filter((f) => !/italic/i.test(f.name));
    const pick = ttf.find((f) => /-Regular\.ttf$/i.test(f.name)) || upright.find((f) => /\[[^\]]*wght[^\]]*\]\.ttf$/i.test(f.name)) || upright[0] || ttf[0];
    if (!pick) continue;
    const file = await fetch(pick.download_url); if (!file.ok) throw new Error("字型下載失敗 HTTP " + file.status);
    return new Uint8Array(await file.arrayBuffer());
  }
  throw new Error("找不到 " + name + " 的 TTF 字型檔");
}
const ascii = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
/** TrueType / OpenType / collection magic; woff and woff2 are refused (FontDb cannot read them, and we do not convert in the browser). */
function isSfnt(b) {
  if (b.length < 12) return false;
  return (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || ["OTTO", "true", "ttcf"].includes(ascii(b, 0));
}
/** Family name the font registers under (name table id 16, else 1); null when unreadable. */
function familyOf(b) {
  try {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const base = ascii(b, 0) === "ttcf" ? dv.getUint32(12) : 0;
    let nameOff = -1;
    for (let i = 0, n = dv.getUint16(base + 4); i < n; i++) { const e = base + 12 + i * 16; if (ascii(b, e) === "name") { nameOff = dv.getUint32(e + 8); break; } }
    if (nameOff < 0) return null;
    const count = dv.getUint16(nameOff + 2), strOff = nameOff + dv.getUint16(nameOff + 4);
    let best = null, rank = -1;
    for (let i = 0; i < count; i++) {
      const r = nameOff + 6 + i * 12, plat = dv.getUint16(r), id = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = strOff + dv.getUint16(r + 10);
      if ((id !== 1 && id !== 16) || (plat !== 0 && plat !== 1 && plat !== 3)) continue;
      const rk = (id === 16 ? 4 : 2) + (plat === 1 ? 0 : 1);
      if (rk <= rank) continue;
      let text = "";
      if (plat === 1) for (let k = 0; k < len; k++) text += String.fromCharCode(b[off + k]);
      else for (let k = 0; k + 1 < len; k += 2) text += String.fromCharCode(dv.getUint16(off + k));
      if (text) { best = text; rank = rk; }
    }
    return best;
  } catch (e) { return null; }
}

export default {
  id: "fonts",
  icon: "🔤",
  title: "字型",
  mount(ctx, body) {
    const UPLOADED = []; // 使用者上傳的自有字型（本次開啟有效）
    gfLink(CJK); gfLink(LATIN); // 分開載：CJK 較大，獨立 request，壞了不拖累拉丁字型
    body.innerHTML = '<label>字型（搜尋 Google Fonts · 像 Canva）</label><input class="form-input" id="fontSearch" placeholder="搜尋字型名稱…">'
      + '<div class="row" style="margin-top:6px;">'
      + '<button class="btn btn-ghost" id="fontCJK" style="flex:none;width:46px;">中文</button>'
      + '<button class="btn btn-ghost" id="fontLatin" style="flex:none;width:46px;">英文</button>'
      + '<button class="btn btn-ghost" id="fontAll" style="flex:none;width:46px;">全部</button>'
      + '<label class="btn btn-ghost" style="flex:1;text-align:center;cursor:pointer;">＋ 字型檔<input type="file" id="fontUpload" accept=".ttf,.otf,.ttc" style="display:none;"></label></div>'
      + '<div class="info">每列上方小字=字型名稱、下方大字=樣式預覽。先選取文字，再點清單套用。目前字型：<b id="curFont">—</b></div>'
      + '<div id="fontList" class="fontlist"></div>';
    const $ = (id) => body.querySelector("#" + id);
    function buildFontList(filter, cat) {
      const box = $("fontList"); box.innerHTML = "";
      UPLOADED.concat(GFONTS).filter((f) => {
        const isC = CJK.includes(f), isL = LATIN.includes(f);
        if (cat === "cjk" && !isC) return false;
        if (cat === "latin" && !isL) return false; // 英文只列拉丁字型（排除中文與自有）
        if (filter && !f.toLowerCase().includes(filter.toLowerCase())) return false;
        return true;
      }).forEach((f) => {
        const b = document.createElement("button"); b.className = "fontrow";
        const nm = document.createElement("div"); nm.className = "fname"; nm.textContent = UPLOADED.includes(f) ? f + "（自有）" : f;
        const pv = document.createElement("div"); pv.className = "fprev"; pv.style.fontFamily = '"' + f + '"';
        pv.textContent = CJK.includes(f) ? "你好 永字 Ag123" : f;
        b.append(nm, pv); b.onclick = () => useGoogle(f); box.appendChild(b);
      });
    }
    /** TTF bytes -> font library -> selected text. The font stays added when no text is selected. */
    async function applyFont(bytes, fallback) {
      if (!isSfnt(bytes)) throw new Error("不是 TTF／OTF 字型檔（woff、woff2 真品字型庫讀不了）");
      await ctx.addFont(bytes);
      const family = familyOf(bytes) || fallback;
      if (typeof ctx.setFont !== "function") { ctx.info("⚠️ 字型已加入，但編輯器轉接器缺少 setFont(family)"); return family; }
      try { await ctx.setFont(family); $("curFont").textContent = family; ctx.info("✅ 已套用字型：" + family); }
      catch (err) {
        if (/選取|select/i.test(err.message)) ctx.info("字型「" + family + "」已加入。先選取文字，再點一次字型。");
        else throw err;
      }
      return family;
    }
    async function useGoogle(name) {
      ctx.info('<span class="busy">下載字型 ' + name + "…</span>");
      try { await applyFont(await fetchGoogleFontBytes(name), name); }
      catch (err) { ctx.info("⚠️ 字型載入失敗：" + err.message); }
    }
    $("fontSearch").oninput = (e) => buildFontList(e.target.value);
    $("fontCJK").onclick = () => { $("fontSearch").value = ""; buildFontList("", "cjk"); };
    $("fontLatin").onclick = () => { $("fontSearch").value = ""; buildFontList("", "latin"); };
    $("fontAll").onclick = () => { $("fontSearch").value = ""; buildFontList(""); };
    $("fontUpload").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const name = f.name.replace(/\.(ttf|otf|ttc)$/i, "");
      const r = new FileReader();
      r.onload = async () => {
        try {
          const bytes = new Uint8Array(r.result);
          await applyFont(bytes, name);
          // preview in this list, same as vector-editor.html:1165-1167
          const ff = new FontFace(name, r.result.slice(0)); await ff.load(); document.fonts.add(ff);
          if (!UPLOADED.includes(name)) UPLOADED.unshift(name);
          buildFontList($("fontSearch").value || "");
        } catch (err) { alert("字型載入失敗：" + err.message); }
      };
      r.readAsArrayBuffer(f);
    };
    buildFontList("");
  },
};

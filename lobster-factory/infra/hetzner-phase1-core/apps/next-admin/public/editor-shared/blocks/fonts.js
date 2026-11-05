// Block: 字型. Font lists + list/search UI moved from public/vector-editor.html:1099-1112 (CJK/LATIN/GFONTS/gfLink), :1125-1148 (buildFontList), :1155-1173 (search / 中文·英文·全部 / upload), panel DOM :248-257.
// Differences: (1) system PRESET_FONTS (:1114-1123) are dropped -- a wasm editor cannot read system fonts; (2) applying a font = fetch its file -> ctx.addFont(bytes) (no setText/useFont, the host owns type.setFont).
const CJK = ["Noto Sans TC", "Noto Serif TC", "Noto Sans HK", "Noto Serif HK"];
const LATIN = ["Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Inter", "Nunito", "Raleway", "Work Sans", "Rubik", "Manrope", "DM Sans", "Mulish", "Ubuntu", "Fredoka", "Kanit", "Merriweather", "Playfair Display", "Lora", "PT Serif", "Cormorant", "EB Garamond", "Bitter", "Crimson Text", "Cinzel", "Roboto Mono", "JetBrains Mono", "Source Code Pro", "Space Mono", "Pacifico", "Lobster", "Bebas Neue", "Anton", "Oswald", "Righteous", "Abril Fatface", "Archivo Black", "Teko", "Dancing Script", "Caveat", "Permanent Marker", "Sacramento", "Great Vibes", "Satisfy", "Shadows Into Light", "Comfortaa", "Quicksand", "Bungee"];
const GFONTS = CJK.concat(LATIN); // 中文排最前，方便找
function gfLink(families) { // preview only (the list rows render with the web font)
  if (!families.length) return;
  const link = document.createElement("link"); link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css?family=" + families.map((f) => f.replace(/ /g, "+")).join("|") + "&display=swap";
  document.head.appendChild(link);
}
// Font file for a Google family: the css2 sheet lists the file URL(s); the first url() is the regular face (vector-editor.html had no file fetch -- Fabric used the web font).
async function fetchGoogleFontBytes(name) {
  const css = await (await fetch("https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + "&display=swap")).text();
  const m = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(css);
  if (!m) throw new Error("找不到 " + name + " 的字型檔");
  const res = await fetch(m[1]); if (!res.ok) throw new Error("字型下載失敗 HTTP " + res.status);
  return new Uint8Array(await res.arrayBuffer());
}

export default {
  id: "fonts",
  icon: "🔤",
  title: "字型",
  mount(ctx, body) {
    const UPLOADED = []; // 使用者上傳的自有字型（本次開啟有效）
    gfLink(CJK); gfLink(LATIN); // 分開載：CJK 較大，獨立 request，壞了不拖累拉丁字型
    body.innerHTML = '<label>字型（搜尋 Google Fonts · 像 Canva）</label><input id="fontSearch" placeholder="搜尋字型名稱…">'
      + '<div class="row" style="margin-top:6px;">'
      + '<button class="ghost" id="fontCJK" style="flex:none;width:46px;">中文</button>'
      + '<button class="ghost" id="fontLatin" style="flex:none;width:46px;">英文</button>'
      + '<button class="ghost" id="fontAll" style="flex:none;width:46px;">全部</button>'
      + '<label class="ghost" style="flex:1;text-align:center;cursor:pointer;padding:7px;border:1px solid var(--line);border-radius:7px;font-size:12px;">＋ 字型檔<input type="file" id="fontUpload" accept=".ttf,.otf,.woff,.woff2" style="display:none;"></label></div>'
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
    async function useGoogle(name) {
      ctx.info('<span class="busy">下載字型 ' + name + "…</span>");
      try { await ctx.addFont(await fetchGoogleFontBytes(name), name); $("curFont").textContent = name; ctx.info("✅ 字型已載入：" + name); }
      catch (err) { ctx.info("⚠️ 字型載入失敗：" + err.message); }
    }
    $("fontSearch").oninput = (e) => buildFontList(e.target.value);
    $("fontCJK").onclick = () => { $("fontSearch").value = ""; buildFontList("", "cjk"); };
    $("fontLatin").onclick = () => { $("fontSearch").value = ""; buildFontList("", "latin"); };
    $("fontAll").onclick = () => { $("fontSearch").value = ""; buildFontList(""); };
    $("fontUpload").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const name = f.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "");
      const r = new FileReader();
      r.onload = async () => {
        try {
          const bytes = new Uint8Array(r.result);
          await ctx.addFont(bytes, name);
          // preview in this list, same as vector-editor.html:1165-1167
          const ff = new FontFace(name, r.result.slice(0)); await ff.load(); document.fonts.add(ff);
          if (!UPLOADED.includes(name)) UPLOADED.unshift(name);
          buildFontList($("fontSearch").value || ""); $("curFont").textContent = name; ctx.info("✅ 字型已載入：" + name);
        } catch (err) { alert("字型載入失敗：" + err.message); }
      };
      r.readAsArrayBuffer(f);
    };
    buildFontList("");
  },
};

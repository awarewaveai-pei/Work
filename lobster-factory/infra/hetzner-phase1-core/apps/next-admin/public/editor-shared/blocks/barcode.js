import { choiceGroup } from "../block-ui.js";

// Block: 條碼 Barcode（向量）. Moved as-is from public/vector-editor.html:1749-1770 (registerBlock 'barcode'); output = SVG string -> ctx.placeSvg (was fabric.loadSVGFromString + ctx.add).
// JsBarcode is loaded on demand (same pinned URL + SRI as vector-editor.html:13).
let libP = null;
function loadLib() {
  if (typeof globalThis.JsBarcode === "function") return Promise.resolve();
  return (libP ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
    s.integrity = "sha384-Kk5SjBOKprEnGfyBWfD2zROFd1Cu8kwOXxG2GIhYPcoDL2rBJS9P8Ud1ZMy4412a";
    s.crossOrigin = "anonymous";
    s.onload = () => res();
    s.onerror = () => { libP = null; rej(new Error("JsBarcode 載入失敗")); };
    document.head.appendChild(s);
  }));
}

export default {
  id: "barcode",
  icon: "▌",
  title: "條碼 Barcode（向量）",
  mount(ctx, body) {
    body.innerHTML = ""
      + '<input class="form-input" id="bcVal" type="text" placeholder="編號 / 文字…" value="AWAREWAVE-001">'
      + '<label>類型</label><div id="bcFmt"></div>'
      + '<label>顯示文字</label><div id="bcText"></div>'
      + '<button class="btn btn-primary" id="bcGo" style="margin-top:6px;">產生條碼</button>'
      + '<div class="info">向量輸出，列印清晰。EAN-13/UPC 需正確位數的數字（零售真碼要 GS1 公司號）。內部編號/標籤用 Code128 最彈性。</div>';
    const fmtG = choiceGroup([["CODE128", "Code128"], ["EAN13", "EAN-13"], ["EAN8", "EAN-8"], ["UPC", "UPC-A"], ["CODE39", "Code39"]], "CODE128");
    const textG = choiceGroup([["1", "是"], ["0", "否"]], "1");
    body.querySelector("#bcFmt").appendChild(fmtG.el); body.querySelector("#bcText").appendChild(textG.el);
    body.querySelector("#bcGo").onclick = async () => {
      const val = body.querySelector("#bcVal").value.trim(); if (!val) { alert("請輸入內容"); return; }
      const fmt = fmtG.get(), showText = textG.get() === "1";
      try { await loadLib(); } catch (e) { alert(e.message); return; }
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      try { globalThis.JsBarcode(svg, val, { format: fmt, displayValue: showText, fontSize: 18, margin: 10, height: 80 }); }
      catch (e) { alert("條碼產生失敗：" + e.message + "\n（" + fmt + " 對內容/位數有要求）"); return; }
      const str = new XMLSerializer().serializeToString(svg);
      if (!/<rect|<path/.test(str)) { alert("內容不符合 " + fmt + " 規則（檢查位數/字元）"); return; }
      try { await ctx.placeSvg(str); ctx.info("✅ 條碼已產生（" + fmt + "，向量）"); }
      catch (e) { alert("條碼解析失敗：" + e.message); }
    };
  },
};

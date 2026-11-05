// Block: QR Code（向量）. Moved as-is from public/vector-editor.html:1543-1558 (registerBlock 'qr'); output = SVG string -> ctx.placeSvg (was fabric.Path via ctx.add).
// qrcode-generator is loaded on demand (same pinned URL + SRI as vector-editor.html:12).
let libP = null;
function loadQrLib() {
  if (typeof globalThis.qrcode === "function") return Promise.resolve();
  return (libP ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.integrity = "sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k";
    s.crossOrigin = "anonymous";
    s.onload = () => res();
    s.onerror = () => { libP = null; rej(new Error("qrcode-generator 載入失敗")); };
    document.head.appendChild(s);
  }));
}

export default {
  id: "qr",
  icon: "🔳",
  title: "QR Code（向量）",
  mount(ctx, body) {
    body.innerHTML = '<input id="qrText" type="text" placeholder="網址或文字…" value="https://aware-wave.com"><button class="act" id="qrAdd" style="margin-top:6px;">產生向量 QR</button><div class="info">輸出為向量路徑，列印不失真，可改填色。</div>';
    body.querySelector("#qrAdd").onclick = async () => {
      const text = body.querySelector("#qrText").value || " ";
      try {
        await loadQrLib();
        const qr = globalThis.qrcode(0, "M"); qr.addData(text); qr.make();
        const n = qr.getModuleCount(), m = 10; // module size 10 user units; the host scales the placed SVG
        let d = "";
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) { const x = c * m, y = r * m; d += "M" + x + " " + y + "h" + m + "v" + m + "h" + (-m) + "z"; }
        const sz = n * m;
        await ctx.placeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="' + sz + '" height="' + sz + '" viewBox="0 0 ' + sz + " " + sz + '"><path d="' + d + '" fill="#000000"/></svg>');
        ctx.info("✅ QR 已產生（" + n + "×" + n + " 模組，向量）");
      } catch (e) { alert("QR 產生失敗：" + e.message); }
    };
  },
};

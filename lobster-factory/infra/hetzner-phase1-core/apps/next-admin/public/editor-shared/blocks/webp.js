// Block: 匯出 WebP（≤200KB）. Compression loop moved from public/vector-editor.html:977-992 (#exportWebp): quality 0.9 -> 0.6 in 0.1 steps, then shrink pixels x0.85 until <=200KB.
// The old loop re-encoded a canvas; here each step asks the host: ctx.exportArtboard({format:'webp', ppi, quality}) (pixels are shrunk through ppi).
const LIMIT = 200 * 1024;

export default {
  id: "webp",
  icon: "🌐",
  title: "匯出 WebP（≤200KB）",
  mount(ctx, body) {
    body.innerHTML = '<label>檔名（不含副檔名）</label><input class="form-input" id="wpName" type="text" value="design">'
      + '<label>起始 DPI</label><input class="form-input" id="wpPpi" type="number" value="300" min="10" step="1">'
      + '<button class="btn btn-primary" id="wpGo" style="margin-top:6px;">匯出 WebP（≤200KB）</button>'
      + '<div class="info" id="wpInfo">自動壓縮到 200KB 以內：先降品質，仍超過再縮小像素。</div>';
    const info = body.querySelector("#wpInfo");
    body.querySelector("#wpGo").onclick = async () => {
      const base = (body.querySelector("#wpName").value || "design").replace(/[\\/:*?"<>|]/g, "-").trim() || "design";
      let ppi = Math.max(10, +body.querySelector("#wpPpi").value || 300);
      const ppi0 = ppi;
      try {
        let q = 0.9;
        const enc = () => ctx.exportArtboard({ format: "webp", ppi, quality: q });
        let blob = await enc();
        while (blob && blob.size > LIMIT && q > 0.6) { q = Math.round((q - 0.1) * 10) / 10; blob = await enc(); }
        // still >200KB at q 0.6 -> shrink the pixels so the file really is <=200KB (vector-editor.html:987)
        while (blob && blob.type === "image/webp" && blob.size > LIMIT && ppi > 10) { ppi = Math.max(10, Math.round(ppi * 0.85)); blob = await enc(); }
        if (!blob || blob.type !== "image/webp") { info.innerHTML = "⚠️ WebP 失敗：此編輯器不支援 WebP 匯出（改用 PNG）"; return; }
        if (blob.size > LIMIT) { info.innerHTML = "⚠️ WebP 無法壓到 200KB 以內（" + Math.round(blob.size / 1024) + " KB）"; return; }
        const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = base + ".webp"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
        info.innerHTML = "✅ WebP：" + Math.round(blob.size / 1024) + " KB（品質 " + q + (ppi < ppi0 ? "，縮成 " + ppi + " DPI" : "") + "）";
      } catch (err) { info.innerHTML = "⚠️ WebP 失敗：" + err.message; }
    };
  },
};

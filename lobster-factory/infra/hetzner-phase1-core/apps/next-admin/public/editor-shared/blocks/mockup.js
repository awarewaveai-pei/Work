// Block: 商品 Mockup 預覽. Moved as-is from public/vector-editor.html:1646-1713 (registerBlock 'mockup'; drawProduct/rr/render/download unchanged).
// Only grabDesign changed: the old one cropped fabric objects' bounding box (:1655-1667); here the artboard PNG comes from
// ctx.exportArtboard({format:'png',background:'transparent'}) and is cropped to its non-transparent bounds (grabDesignUrl, also used by batch-export.js).

/** Artboard as transparent PNG, trimmed to the non-transparent pixels -> data URL, or null when the artboard is empty. */
export async function grabDesignUrl(ctx) {
  const blob = await ctx.exportArtboard({ format: "png", background: "transparent" });
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let minX = cv.width, minY = cv.height, maxX = -1, maxY = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) return null;
  const out = document.createElement("canvas"); out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export default {
  id: "mockup",
  icon: "👕",
  title: "商品 Mockup 預覽",
  mount(ctx, body) {
    body.innerHTML = ""
      + '<div class="grid2"><div><label>商品</label><select id="mkProduct"><option value="tee">T 恤</option><option value="tote">帆布袋</option><option value="mug">馬克杯</option><option value="phone">手機殼</option><option value="poster">海報框</option></select></div><div><label>商品顏色</label><input id="mkColor" type="color" value="#eeeeee"></div></div>'
      + '<div class="row"><button class="act" id="mkGen">產生 Mockup</button><button class="ghost" id="mkDl">下載 PNG</button></div>'
      + '<div id="mkOut" style="margin-top:8px;"></div>'
      + '<div class="info">把目前畫布的設計套到商品上。建議設計先去背（透明底）效果最好。</div>';
    let lastCanvas = null;
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function drawProduct(g, p, col) {
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = "round";
      if (p === "tee") {
        g.beginPath();
        g.moveTo(195, 80); g.lineTo(140, 100); g.lineTo(70, 175); g.lineTo(120, 225); g.lineTo(165, 195);
        g.lineTo(165, 500); g.lineTo(335, 500); g.lineTo(335, 195); g.lineTo(380, 225); g.lineTo(430, 175);
        g.lineTo(360, 100); g.lineTo(305, 80); g.quadraticCurveTo(250, 125, 195, 80); g.closePath(); g.fill();
        return { x: 200, y: 205, w: 100, h: 150 };
      }
      if (p === "tote") {
        g.fillRect(150, 180, 200, 300);
        g.lineWidth = 14; g.beginPath(); g.arc(210, 180, 38, Math.PI, 0, true); g.stroke(); g.beginPath(); g.arc(290, 180, 38, Math.PI, 0, true); g.stroke();
        return { x: 185, y: 230, w: 130, h: 170 };
      }
      if (p === "mug") {
        g.fillRect(160, 170, 180, 230); g.lineWidth = 26; g.beginPath(); g.arc(345, 285, 58, -1.05, 1.05); g.stroke();
        return { x: 180, y: 200, w: 140, h: 170 };
      }
      if (p === "phone") { rr(g, 190, 70, 130, 360, 26); g.fill(); return { x: 202, y: 90, w: 106, h: 300 }; }
      g.fillStyle = "#5a4632"; g.fillRect(120, 90, 260, 360); g.fillStyle = "#ffffff"; g.fillRect(140, 110, 220, 320);
      return { x: 140, y: 110, w: 220, h: 320 };
    }
    async function render() {
      let url;
      try { url = await grabDesignUrl(ctx); } catch (e) { alert("取得畫板失敗：" + e.message); return; }
      if (!url) { alert("畫布上沒有設計內容，先放點東西再產生 Mockup"); return; }
      const design = new Image();
      design.onload = () => {
        const cv = document.createElement("canvas"); cv.width = 500; cv.height = 540; const g = cv.getContext("2d");
        g.fillStyle = "#fafafa"; g.fillRect(0, 0, 500, 540);
        const pa = drawProduct(g, body.querySelector("#mkProduct").value, body.querySelector("#mkColor").value);
        const ar = design.width / design.height, pr = pa.w / pa.h; let dw, dh;
        if (ar > pr) { dw = pa.w; dh = pa.w / ar; } else { dh = pa.h; dw = pa.h * ar; }
        g.drawImage(design, pa.x + (pa.w - dw) / 2, pa.y + (pa.h - dh) / 2, dw, dh);
        lastCanvas = cv;
        const out = body.querySelector("#mkOut"); out.innerHTML = "";
        const im = document.createElement("img"); im.src = cv.toDataURL("image/png"); im.style.maxWidth = "100%"; im.style.borderRadius = "8px"; out.appendChild(im);
        ctx.info("✅ Mockup 已產生");
      };
      design.src = url;
    }
    body.querySelector("#mkGen").onclick = render;
    body.querySelector("#mkColor").oninput = () => { if (lastCanvas) render(); };
    body.querySelector("#mkProduct").onchange = () => { if (lastCanvas) render(); };
    body.querySelector("#mkDl").onclick = () => { if (!lastCanvas) { alert("先產生 Mockup"); return; } const a = document.createElement("a"); a.href = lastCanvas.toDataURL("image/png"); a.download = "mockup.png"; a.click(); };
  },
};

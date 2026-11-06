// Block: 範本庫（尺寸預設）. Moved as-is from public/vector-editor.html:1636-1644 (registerBlock 'templates', preset table at :1638).
// The old page clicked its own #w/#h/#unit/#dpi + #setCanvas; here the host does it through ctx.setArtboardSize({width,height,unit,dpi}) (artboard.setProps / file.new).
export default {
  id: "templates",
  icon: "📁",
  title: "範本庫（尺寸預設）",
  mount(ctx, body) {
    const T = [["名片 90×54", 90, 54, "mm", 300], ["A4", 210, 297, "mm", 300], ["A3 海報", 297, 420, "mm", 300], ["方貼紙 50", 50, 50, "mm", 300], ["IG 貼文 1:1", 381, 381, "mm", 72], ["IG 限動 9:16", 381, 677, "mm", 72], ["FB 封面", 289, 110, "mm", 72], ["明信片", 148, 105, "mm", 300]];
    const wrap = document.createElement("div"); wrap.className = "grid2";
    T.forEach(([name, wv, hv, unit, dpi]) => {
      const b = document.createElement("button"); b.className = "btn btn-ghost"; b.textContent = name;
      b.onclick = async () => {
        if (typeof ctx.setArtboardSize !== "function") { ctx.info("⚠️ 此編輯器轉接器尚未提供 setArtboardSize"); return; }
        try { await ctx.setArtboardSize({ width: wv, height: hv, unit, dpi }); ctx.info("✅ 已套用範本：" + name); }
        catch (e) { ctx.info("⚠️ 套用範本失敗：" + e.message); }
      };
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    const note = document.createElement("div"); note.className = "info"; note.textContent = "套用會改畫布尺寸，不動現有物件。"; body.appendChild(note);
    // 符合／填滿畫布（舊編輯器 CanvasEditor.tsx:1059、:2222-2223）：選用的 ctx.fitLayer，宿主沒有就不出現（向量版沒有）。
    if (typeof ctx.fitLayer === "function") {
      const fit = document.createElement("div"); fit.className = "grid2"; fit.style.marginTop = "6px";
      [["fit", "符合畫布", "選取的圖層縮放到剛好放進畫布"], ["fill", "填滿畫布", "選取的圖層放大到填滿畫布（超出的部分在畫布外）"]].forEach(([mode, label, tip]) => {
        const b = document.createElement("button"); b.className = "btn btn-ghost"; b.dataset.fit = mode; b.textContent = label; b.title = tip;
        b.onclick = async () => {
          try { await ctx.fitLayer(mode); ctx.info("✅ 已" + label); }
          catch (e) { ctx.info("⚠️ " + label + "失敗：" + e.message); }
        };
        fit.appendChild(b);
      });
      body.appendChild(fit);
    }
  },
};

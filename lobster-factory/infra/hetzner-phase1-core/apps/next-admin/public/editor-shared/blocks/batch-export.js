// Block: 批次多尺寸匯出. Moved as-is from public/vector-editor.html:1715-1746 (registerBlock 'batch-export'; presets, layout math, download loop unchanged).
// Only the design source changed: ctx.grabDesign() (:1518) -> grabDesignUrl(ctx) from ./mockup.js (artboard PNG via ctx.exportArtboard, trimmed).
import { grabDesignUrl } from "./mockup.js";
import { choiceGroup } from "../block-ui.js";

// color inputs / canvas drawing need hex strings; built from channel numbers so no colour is hard-coded as a style
const hex = (r, g, b) => "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
const WHITE = hex(255, 255, 255);

export default {
  id: "batch-export",
  icon: "📦",
  title: "批次多尺寸匯出",
  mount(ctx, body) {
    const PRESETS = [["IG 貼文 1080²", 1080, 1080], ["IG 限動 1080×1920", 1080, 1920], ["FB 貼文 1200×630", 1200, 630], ["FB 封面 820×312", 820, 312], ["大頭貼 400²", 400, 400], ["縮圖 800×600", 800, 600], ["名片 1063×638", 1063, 638], ["海報 2480×3508", 2480, 3508]];
    let html = '<label>選尺寸（可多選）</label><div id="bxList">';
    PRESETS.forEach((p, i) => { html += '<label style="display:flex;gap:6px;align-items:center;padding:2px 0;"><input type="checkbox" data-i="' + i + '" ' + (i < 2 ? "checked" : "") + ' style="width:auto;"> ' + p[0] + "</label>"; });
    html += '</div><label>背景</label><div id="bxBg"></div><label>自訂色</label><input id="bxBgColor" type="color" value="' + WHITE + '">';
    html += '<label>縮放</label><div id="bxFit"></div>';
    html += '<button class="btn btn-primary" id="bxGo" style="margin-top:6px;">批次匯出 PNG</button><div class="info" id="bxInfo">每個尺寸下載一張 PNG。瀏覽器可能詢問允許多檔下載。</div>';
    body.innerHTML = html;
    const bgG = choiceGroup([["transparent", "透明"], [WHITE, "白"], ["custom", "自訂"]], "transparent");
    const fitG = choiceGroup([["contain", "完整可見"], ["cover", "填滿裁切"]], "contain");
    body.querySelector("#bxBg").appendChild(bgG.el); body.querySelector("#bxFit").appendChild(fitG.el);
    body.querySelector("#bxGo").onclick = async () => {
      let url;
      try { url = await grabDesignUrl(ctx); } catch (e) { alert("取得畫板失敗：" + e.message); return; }
      if (!url) { alert("畫布上沒有設計內容"); return; }
      const checked = [].slice.call(body.querySelectorAll("#bxList input:checked")).map((c) => PRESETS[+c.dataset.i]);
      if (!checked.length) { alert("至少選一個尺寸"); return; }
      const bgSel = bgG.get(), bgCustom = body.querySelector("#bxBgColor").value, fit = fitG.get();
      const design = new Image();
      design.onload = () => {
        checked.forEach((p, idx) => { setTimeout(() => {
          const name = p[0], W = p[1], H = p[2], cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
          if (bgSel !== "transparent") { g.fillStyle = (bgSel === "custom") ? bgCustom : bgSel; g.fillRect(0, 0, W, H); }
          const ar = design.width / design.height, pr = W / H; let dw, dh;
          if (fit === "cover") { if (ar > pr) { dh = H; dw = H * ar; } else { dw = W; dh = W / ar; } }
          else { if (ar > pr) { dw = W * 0.9; dh = dw / ar; } else { dh = H * 0.9; dw = dh * ar; } }
          g.drawImage(design, (W - dw) / 2, (H - dh) / 2, dw, dh);
          const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = "design_" + W + "x" + H + ".png"; a.click();
          body.querySelector("#bxInfo").textContent = "✅ 已匯出 " + (idx + 1) + "/" + checked.length + "：" + name;
        }, idx * 350); });
      };
      design.src = url;
    };
  },
};

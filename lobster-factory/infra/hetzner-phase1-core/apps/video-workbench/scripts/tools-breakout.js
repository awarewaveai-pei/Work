// 破框貼文動畫 (tool "breakout"): one picture becomes the photo of a mock social post drawn on a canvas; that canvas is
// both the live preview and, as a PNG, the first frame of an image-to-video job (backend/breakout.cjs). Drawn in the
// browser so the preview and the frame are the same pixels (a server render would need its own CJK fonts and layout).
// The post is our own generic design: no platform logo, name or brand mark is drawn.
const BREAKOUT_SUBJECTS = {
  鯊魚: "一隻鯊魚張大嘴從照片裡衝出來",
  商品: "商品從照片裡飛出來，在空中旋轉",
  人物: "照片中的人伸出手，跨步走出照片",
  跑車: "跑車加速衝出照片，輪胎揚起煙塵",
  水花: "水花從照片裡爆開、濺到貼文上",
  吉祥物: "吉祥物跳出照片，開心揮手",
};
const BREAKOUT_LAYOUT = { 從圖片衝出: "burst", 浮動貼文卡: "float" };
// Colours of the rendered video frame (content, like a photo's pixels), not page chrome: the page itself uses theme tokens.
const BREAKOUT_INK = {
  淺色: { bg: "rgb(255,255,255)", text: "rgb(22,22,24)", sub: "rgb(112,114,120)", line: "rgb(228,229,232)", photo: "rgb(214,216,220)" },
  深色: { bg: "rgb(16,16,18)", text: "rgb(244,244,246)", sub: "rgb(160,162,168)", line: "rgb(52,53,58)", photo: "rgb(58,60,66)" },
};
const BREAKOUT_ACCENT = "rgb(232,72,92)",
  BREAKOUT_RING = "rgb(124,92,250)";
const BREAKOUT_FRAME = { w: 720, h: 1280 };

// Cheapest first (shared/breakout-rules.js byPrice: the server's published rate x this tool's length).
function toolBreakoutModels() {
  return VideoWorkbenchBreakout.byPrice(VideoWorkbenchBreakout.eligible(VideoWorkbenchVideoModels.list(VideoWorkbench.capabilities)));
}
// The saved model while it can run, else the cheapest that can (price on every button, so cheapest is a safe default).
function toolBreakoutModel() {
  const rows = toolBreakoutModels(),
    runs = rows.filter((m) => m.available !== false);
  return runs.find((m) => m.id === values.breakoutModel) || runs[0] || rows[0] || null;
}
const toolBreakoutPrice = (m) => VideoWorkbenchVideoModels.priceText(m, VideoWorkbenchBreakout.seconds(m));

function toolBreakoutScreen(t) {
  wfDefaults({
    breakoutLayout: "從圖片衝出",
    breakoutStyle: "IG 風格",
    breakoutRatio: "9:16",
    breakoutTheme: "淺色",
    breakoutAccount: "awarewave.studio",
    breakoutPlace: "台北市",
    breakoutCaption: "週末限定！這次真的忍不住了 🔥",
    breakoutLikes: "1,286",
    breakoutComments: "48",
    breakoutShares: "12",
    breakoutSubject: "",
  });
  const rows = toolBreakoutModels(),
    vm = toolBreakoutModel(),
    seconds = vm ? VideoWorkbenchBreakout.seconds(vm) : 5;
  const models = rows.length
    ? `<div class="flow-choices" role="group">${rows
        .map((m) => {
          const on = m.id === vm?.id,
            s = VideoWorkbenchBreakout.seconds(m);
          return `<button type="button" class="btn small ${on ? "selected" : ""}" data-flow-choice="breakoutModel" data-flow-value="${esc(m.id)}" data-flow-multiple="false" aria-pressed="${on}"${m.available === false ? " disabled" : ""}>${esc(m.label)} · ${s} 秒 · ${esc(toolBreakoutPrice(m))}${m.available === false ? "（未啟用）" : ""}</button>`;
        })
        .join("")}</div>${vm?.note ? `<p class="note">${esc(vm.note)}</p>` : ""}`
    : `<p class="note" role="status">${VideoWorkbench.capabilities ? "目前沒有能把貼文當第一格畫面的影片模型。" : "載入影片模型中…"}</p>`;
  // 聲音: a choice only when the eligible models include both kinds; picking one picks a model of that kind.
  const kinds = new Set(rows.filter((m) => m.available !== false).map((m) => !!m.audio));
  const sound =
    kinds.size > 1
      ? `<label>聲音</label><div class="flow-choices" role="group">${[["生成音效", true], ["無聲", false]]
          .map(([name, audio]) => `<button type="button" class="btn small ${!!vm?.audio === audio ? "selected" : ""}" data-flow-action="breakout-audio:${audio ? 1 : 0}" aria-pressed="${!!vm?.audio === audio}">${name}</button>`)
          .join("")}</div>`
      : `<p class="note">聲音：${vm?.audio ? "這個模型會生成音效" : "無聲（目前可用的模型都不產生聲音）"}</p>`;
  const ready = files.image && vm && vm.available !== false && String(values.breakoutSubject || "").trim();
  const side = `<aside class="side"><div class="row" style="justify-content:space-between"><h3>破框設定</h3>${wfButton("使用說明", "breakout-help")}</div>
<label>圖片</label>${chooser("image")}${files.image ? `<p class="note">已選：${esc(files.image.name || "圖片")}</p>` : ""}
<label>貼文版面</label>${wfChoice("breakoutLayout", Object.keys(BREAKOUT_LAYOUT))}
<label>貼文樣式</label>${wfChoice("breakoutStyle", ["IG 風格", "FB 風格"])}
<p class="note">只借用版面排列，不放任何平台標誌或名稱。</p>
<label>輸出比例</label>${wfChoice("breakoutRatio", ["9:16", "1:1"])}
<label>顏色</label>${wfChoice("breakoutTheme", ["淺色", "深色"])}
${wfField("breakoutAccount", "帳號名稱")}${wfField("breakoutPlace", "位置或副標")}${wfArea("breakoutCaption", "貼文文字", 300)}
<div class="breakout-counts">${wfField("breakoutLikes", "按讚數")}${wfField("breakoutComments", "留言數")}${wfField("breakoutShares", "分享數")}</div>
${wfArea("breakoutSubject", "衝出畫面的主角", VideoWorkbenchBreakout.SUBJECT_MAX)}
<div class="flow-choices">${Object.keys(BREAKOUT_SUBJECTS).map((name) => wfButton(name, "breakout-subject:" + name)).join("")}</div>
<p class="note">只描述主角和它的動作；貼文的介面、文字與數字會保持不動。</p>
<label>影片模型</label>${models}${sound}
<p class="note">${seconds} 秒 · 720p · 一支影片${values.breakoutRatio === "1:1" ? "（模型以 9:16 生成，完成後裁成 1:1）" : ""}</p>
<button type="button" class="btn primary" data-flow-action="breakout-generate" data-paid="video.motion"${vm ? ` data-paid-model="${esc(vm.id)}"` : ""} ${ready ? "" : "disabled"}>生成破框影片${vm ? " · " + esc(toolBreakoutPrice(vm)) : ""}</button>
${files.image ? "" : '<p class="note">先選一張圖片。</p>'}${files.image && !String(values.breakoutSubject || "").trim() ? '<p class="note">寫下衝出畫面的主角後才能生成。</p>' : ""}</aside>`;
  const preview = `<section class="stage breakout-stage"><div class="breakout-preview" data-breakout-preview data-ratio="${esc(values.breakoutRatio)}"></div><p class="note">預覽＝影片的第一格畫面。</p></section>`;
  return wfWrap(t, `<div class="two-col flow-layout">${preview}${side}</div>`);
}

// ---- drawing --------------------------------------------------------------------------------------------------------
const toolBreakoutImages = new Map();
function toolBreakoutImage(url) {
  if (!url) return Promise.resolve(null);
  if (!toolBreakoutImages.has(url))
    toolBreakoutImages.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => (toolBreakoutImages.delete(url), resolve(null));
        img.src = url;
      }),
    );
  return toolBreakoutImages.get(url);
}
function toolBreakoutFont(px, weight = 400) {
  return `${weight} ${Math.round(px)}px system-ui, "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
}
// Line wrap that works for CJK (break anywhere) and keeps at most `max` lines, the last one ending in "…".
function toolBreakoutWrap(ctx, text, width, max) {
  const lines = [];
  let line = "";
  for (const ch of String(text || "").replace(/\s*\n\s*/g, " ")) {
    if (ctx.measureText(line + ch).width > width && line) {
      lines.push(line);
      line = ch.trim() ? ch : "";
      if (lines.length === max) break;
    } else line += ch;
  }
  if (lines.length < max && line) lines.push(line);
  else if (lines.length === max && line) {
    let last = lines[max - 1];
    while (last && ctx.measureText(last + "…").width > width) last = Array.from(last).slice(0, -1).join(""); // whole characters: never half an emoji
    lines[max - 1] = last + "…";
  }
  return lines;
}
function toolBreakoutRound(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function toolBreakoutCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight),
    sw = w / s,
    sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}
// Line icons, drawn at (x, y) top-left inside a box of size s.
const toolBreakoutIcon = {
  heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y + s * 0.88);
    ctx.bezierCurveTo(x - s * 0.1, y + s * 0.45, x + s * 0.12, y - s * 0.02, x + s / 2, y + s * 0.25);
    ctx.bezierCurveTo(x + s * 0.88, y - s * 0.02, x + s * 1.1, y + s * 0.45, x + s / 2, y + s * 0.88);
    ctx.stroke();
  },
  bubble(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s * 0.42, Math.PI * 0.75, Math.PI * 2.62);
    ctx.lineTo(x + s * 0.08, y + s * 0.95);
    ctx.closePath();
    ctx.stroke();
  },
  send(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.05, y + s * 0.42);
    ctx.lineTo(x + s * 0.95, y + s * 0.08);
    ctx.lineTo(x + s * 0.6, y + s * 0.95);
    ctx.lineTo(x + s * 0.45, y + s * 0.55);
    ctx.closePath();
    ctx.moveTo(x + s * 0.45, y + s * 0.55);
    ctx.lineTo(x + s * 0.95, y + s * 0.08);
    ctx.stroke();
  },
  save(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.2, y + s * 0.05);
    ctx.lineTo(x + s * 0.8, y + s * 0.05);
    ctx.lineTo(x + s * 0.8, y + s * 0.95);
    ctx.lineTo(x + s / 2, y + s * 0.7);
    ctx.lineTo(x + s * 0.2, y + s * 0.95);
    ctx.closePath();
    ctx.stroke();
  },
};
// One post at (x, y), width w, at most maxH tall; returns its height. measure=true only computes the height.
function toolBreakoutPost(ctx, img, o, x, y, w, maxH, measure = false) {
  const k = w / 720,
    ink = BREAKOUT_INK[o.theme] || BREAKOUT_INK.淺色,
    fb = o.style === "FB 風格",
    pad = 28 * k,
    header = 112 * k,
    capSize = 27 * k,
    capLine = 38 * k;
  ctx.font = toolBreakoutFont(capSize);
  const capLines = toolBreakoutWrap(ctx, (fb ? "" : o.account + "  ") + o.caption, w - pad * 2, fb ? 3 : 2);
  const captionH = capLines.length ? capLines.length * capLine + 12 * k : 0;
  const bottom = fb ? captionH + 64 * k + 2 * k + 84 * k : 76 * k + 44 * k + captionH + 44 * k + 18 * k;
  const photoH = Math.max(120 * k, Math.min(w * 1.25, maxH - header - bottom));
  const total = header + photoH + bottom;
  if (measure) return total;
  ctx.fillStyle = ink.bg;
  ctx.fillRect(x, y, w, total);
  // header: avatar, name, sub line, more dots
  const ar = 34 * k,
    ax = x + pad + ar,
    ay = y + header / 2;
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = BREAKOUT_RING;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ink.photo;
  ctx.beginPath();
  ctx.arc(ax, ay, ar - 6 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink.text;
  ctx.font = toolBreakoutFont(30 * k, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((Array.from(o.account.trim())[0] || "A").toUpperCase(), ax, ay + 1 * k);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const tx = ax + ar + 20 * k;
  ctx.font = toolBreakoutFont(29 * k, 700);
  ctx.fillText(toolBreakoutWrap(ctx, o.account, w - (tx - x) - 80 * k, 1)[0] || "", tx, ay - (o.place ? 4 * k : -10 * k));
  if (o.place) {
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(23 * k);
    ctx.fillText(toolBreakoutWrap(ctx, fb ? o.place + " · 剛剛" : o.place, w - (tx - x) - 80 * k, 1)[0] || "", tx, ay + 30 * k);
  }
  ctx.fillStyle = ink.text;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + w - pad - 36 * k + i * 14 * k, ay, 3.4 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  let cy = y + header;
  const caption = (top) => {
    ctx.fillStyle = ink.text;
    ctx.font = toolBreakoutFont(capSize);
    capLines.forEach((line, i) => {
      if (!fb && i === 0 && line.startsWith(o.account)) {
        ctx.font = toolBreakoutFont(capSize, 700);
        ctx.fillText(o.account, x + pad, top + capLine * (i + 0.75));
        const wName = ctx.measureText(o.account).width;
        ctx.font = toolBreakoutFont(capSize);
        ctx.fillText(line.slice(o.account.length), x + pad + wName, top + capLine * (i + 0.75));
      } else ctx.fillText(line, x + pad, top + capLine * (i + 0.75));
    });
    return top + captionH;
  };
  if (fb) cy = caption(cy - 8 * k) + 4 * k;
  // the photo
  if (img) toolBreakoutCover(ctx, img, x, cy, w, photoH);
  else {
    ctx.fillStyle = ink.photo;
    ctx.fillRect(x, cy, w, photoH);
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(28 * k);
    ctx.textAlign = "center";
    ctx.fillText("選一張圖片", x + w / 2, cy + photoH / 2);
    ctx.textAlign = "left";
  }
  cy += photoH;
  ctx.strokeStyle = ink.text;
  ctx.lineWidth = 3.2 * k;
  ctx.lineJoin = "round";
  if (fb) {
    // counts row, divider, three action buttons
    const row = cy + 44 * k;
    ctx.fillStyle = BREAKOUT_ACCENT;
    ctx.beginPath();
    ctx.arc(x + pad + 14 * k, row - 9 * k, 15 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink.bg;
    ctx.lineWidth = 2.6 * k;
    toolBreakoutIcon.heart(ctx, x + pad + 4 * k, row - 19 * k, 20 * k);
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(24 * k);
    ctx.fillText(o.likes, x + pad + 40 * k, row);
    ctx.textAlign = "right";
    ctx.fillText(`${o.comments} 則留言　${o.shares} 次分享`, x + w - pad, row);
    ctx.textAlign = "left";
    cy += 64 * k;
    ctx.fillStyle = ink.line;
    ctx.fillRect(x + pad, cy, w - pad * 2, 2 * k);
    cy += 2 * k;
    const third = (w - pad * 2) / 3,
      mid = cy + 42 * k;
    ctx.strokeStyle = ink.sub;
    ctx.lineWidth = 3 * k;
    [["heart", "讚"], ["bubble", "留言"], ["send", "分享"]].forEach(([icon, name], i) => {
      ctx.font = toolBreakoutFont(25 * k, 600);
      const tw = ctx.measureText(name).width,
        sx = x + pad + third * i + (third - (30 * k + 12 * k + tw)) / 2;
      toolBreakoutIcon[icon](ctx, sx, mid - 15 * k, 30 * k);
      ctx.fillStyle = ink.sub;
      ctx.fillText(name, sx + 42 * k, mid + 9 * k);
    });
  } else {
    const iy = cy + 22 * k,
      s = 40 * k;
    toolBreakoutIcon.heart(ctx, x + pad, iy, s);
    toolBreakoutIcon.bubble(ctx, x + pad + 64 * k, iy, s);
    toolBreakoutIcon.send(ctx, x + pad + 128 * k, iy, s);
    toolBreakoutIcon.save(ctx, x + w - pad - s, iy, s);
    cy += 76 * k;
    ctx.fillStyle = ink.text;
    ctx.font = toolBreakoutFont(26 * k, 700);
    ctx.fillText(`${o.likes} 個讚`, x + pad, cy + 30 * k);
    cy = caption(cy + 44 * k);
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(24 * k);
    ctx.fillText(`查看全部 ${o.comments} 則留言 · ${o.shares} 次分享`, x + pad, cy + 30 * k);
  }
  return total;
}
function toolBreakoutOptions() {
  const text = (k, d = "") => String(values[k] ?? d).trim();
  return {
    layout: BREAKOUT_LAYOUT[values.breakoutLayout] || "burst",
    style: values.breakoutStyle,
    theme: values.breakoutTheme,
    ratio: values.breakoutRatio === "1:1" ? "1:1" : "9:16",
    account: text("breakoutAccount") || "account",
    place: text("breakoutPlace"),
    caption: text("breakoutCaption"),
    likes: text("breakoutLikes") || "0",
    comments: text("breakoutComments") || "0",
    shares: text("breakoutShares") || "0",
  };
}
// Paints the frame. frame=true: always 720x1280 (what the 9:16 model gets), a 1:1 post centred in it; else the output ratio.
async function toolBreakoutDraw(canvas, frame = false) {
  const o = toolBreakoutOptions(),
    img = await toolBreakoutImage(files.image?.url),
    W = BREAKOUT_FRAME.w,
    H = frame || o.ratio === "9:16" ? BREAKOUT_FRAME.h : W,
    boxH = o.ratio === "1:1" ? W : H,
    boxY = (H - boxH) / 2;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d"),
    ink = BREAKOUT_INK[o.theme] || BREAKOUT_INK.淺色;
  if (o.layout === "float") {
    // the picture itself, blurred and dimmed, behind a floating card
    if (img) {
      ctx.save();
      ctx.filter = "blur(36px) saturate(1.2)";
      toolBreakoutCover(ctx, img, -60, -60, W + 120, H + 120);
      ctx.restore();
      ctx.fillStyle = o.theme === "深色" ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.25)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = ink.line;
      ctx.fillRect(0, 0, W, H);
    }
    const cw = W * 0.84,
      maxH = boxH * 0.88,
      ch = toolBreakoutPost(ctx, img, o, 0, 0, cw, maxH, true),
      cx = (W - cw) / 2,
      cy = boxY + (boxH - ch) / 2,
      r = 28;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = ink.bg;
    toolBreakoutRound(ctx, cx, cy, cw, ch, r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    toolBreakoutRound(ctx, cx, cy, cw, ch, r);
    ctx.clip();
    toolBreakoutPost(ctx, img, o, cx, cy, cw, maxH);
    ctx.restore();
  } else {
    ctx.fillStyle = ink.bg;
    ctx.fillRect(0, 0, W, H);
    const ph = toolBreakoutPost(ctx, img, o, 0, 0, W, boxH, true);
    toolBreakoutPost(ctx, img, o, 0, boxY + (boxH - ph) / 2, W, boxH);
  }
  return canvas;
}
let toolBreakoutPainting = 0;
function toolBreakoutRepaint() {
  const host = document.querySelector("[data-breakout-preview]");
  if (!host) return;
  let canvas = host.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "貼文預覽（影片第一格畫面）");
    host.append(canvas);
  }
  const run = ++toolBreakoutPainting,
    scratch = document.createElement("canvas");
  // Paint off-screen and copy, so a slow image load never leaves a half-drawn preview or an older draw winning.
  return toolBreakoutDraw(scratch).then(() => {
    if (run !== toolBreakoutPainting || !canvas.isConnected) return;
    canvas.width = scratch.width;
    canvas.height = scratch.height;
    canvas.getContext("2d").drawImage(scratch, 0, 0);
  });
}
let toolBreakoutCapsAsked = false;
function toolBreakoutAfterRender() {
  if (!VideoWorkbench.capabilities && VideoWorkbench.loadCapabilities && !toolBreakoutCapsAsked) {
    toolBreakoutCapsAsked = true;
    VideoWorkbench.loadCapabilities().then(() => tool === "breakout" && render(), VideoWorkbench.reportError);
  }
  const flow = document.querySelector('[data-tool-flow="breakout"]');
  if (flow && !flow.dataset.breakoutWired) {
    flow.dataset.breakoutWired = "1";
    flow.addEventListener("input", (e) => {
      const key = e.target.dataset?.key || "";
      if (!key.startsWith("breakout")) return;
      values[key] = e.target.value; // this listener runs before tools-0.js's document one stores it
      if (key === "breakoutSubject") {
        const b = document.querySelector('[data-flow-action="breakout-generate"]');
        if (b) b.disabled = !(files.image && toolBreakoutModel()?.available !== false && e.target.value.trim());
        return;
      }
      toolBreakoutRepaint()?.catch(VideoWorkbench.reportError);
    });
  }
  toolBreakoutRepaint()?.catch(VideoWorkbench.reportError);
}

function toolBreakoutHelp() {
  document.querySelector(".breakout-help")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "editor-dialog breakout-help";
  dialog.setAttribute("aria-label", "破框貼文動畫使用說明");
  dialog.innerHTML = VideoWorkbench.sanitize(
    `<button type="button" class="editor-dialog-close" aria-label="關閉">×</button><h3>破框貼文動畫怎麼用</h3><ol class="instruction"><li><b>選圖片</b>：從素材庫或上傳一張主角清楚的圖片，它會變成貼文裡的照片。</li><li><b>排好貼文</b>：選版面、樣式、比例與顏色，改帳號名稱、文字和按讚數；左邊的預覽就是影片第一格。</li><li><b>寫主角、生成</b>：只描述衝出來的主角和它的動作（例如「鯊魚張大嘴衝出來」），選模型後按生成；按鈕上的價格就是這次的費用，完成的影片會進素材庫。</li></ol>`,
  );
  dialog.querySelector(".editor-dialog-close").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function toolBreakoutGenerate(button) {
  const vm = toolBreakoutModel(),
    subject = String(values.breakoutSubject || "").trim();
  if (!files.image?.url) throw Error("請先選一張圖片");
  if (!subject) throw Error("請描述衝出畫面的主角");
  if (!vm || vm.available === false) throw Error("目前沒有可用的影片模型");
  const o = toolBreakoutOptions(),
    seconds = VideoWorkbenchBreakout.seconds(vm);
  button.disabled = true;
  try {
    const canvas = await toolBreakoutDraw(document.createElement("canvas"), true);
    const frame = await VideoWorkbench.request("/uploads", { name: "破框貼文-第一格.png", data: canvas.toDataURL("image/png") });
    // paid: video.motion
    const job = await VideoWorkbench.generations.create({
      type: "video",
      operation: "breakout",
      prompt: subject,
      referenceMode: "first",
      references: { firstFrame: [{ url: frame.url, type: "image/png", name: "破框貼文第一格" }] },
      settings: {
        model: vm.id,
        duration: seconds,
        ratio: VideoWorkbenchBreakout.MODEL_RATIO,
        outputRatio: o.ratio,
        quality: "720p",
        audio: vm.audio ? "有聲" : "靜音",
        layout: o.layout,
        style: o.style,
        theme: o.theme,
        sourceImage: files.image.url,
        post: { account: o.account, place: o.place, caption: o.caption, likes: o.likes, comments: o.comments, shares: o.shares },
      },
    });
    VideoWorkbench.showJob(job);
  } finally {
    button.disabled = false;
  }
}

async function toolBreakoutAction(action, button) {
  if (!action?.startsWith("breakout-")) return;
  if (action === "breakout-help") return toolBreakoutHelp();
  if (action.startsWith("breakout-subject:")) {
    values.breakoutSubject = BREAKOUT_SUBJECTS[action.slice(17)] || "";
    saveDraft();
    render();
    return;
  }
  if (action.startsWith("breakout-audio:")) {
    const want = action.endsWith(":1"),
      pick = toolBreakoutModels().find((m) => !!m.audio === want && m.available !== false);
    if (pick) values.breakoutModel = pick.id;
    saveDraft();
    render();
    return;
  }
  if (action === "breakout-generate") await toolBreakoutGenerate(button);
}

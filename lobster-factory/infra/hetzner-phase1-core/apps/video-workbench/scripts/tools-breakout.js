// 破框貼文動畫 (tool "breakout"): one picture becomes the photo of a mock social post drawn on a canvas; that canvas is
// both the live preview and, as a PNG, the first frame of an image-to-video job (backend/breakout.cjs). Drawn in the
// browser so the preview and the frame are the same pixels (a server render would need its own CJK fonts and layout).
// The post is our own generic design: no platform logo, name or brand mark is drawn.
const BREAKOUT_SUBJECTS = {
  鯊魚: "一隻鯊魚張大嘴，捲著浪花朝鏡頭衝出來",
  商品: "照片裡的商品放大飛出來，在空中轉一圈展示",
  人物: "照片裡的人跨步走出畫面，朝鏡頭揮手",
  跑車: "跑車加速衝出照片，輪胎揚起煙塵",
  水花: "一大片水花從照片裡潑出來，灑過整則貼文",
  吉祥物: "可愛的吉祥物從照片裡跳出來，好奇地看著鏡頭",
};
const BREAKOUT_LAYOUT = { 從圖片衝出: "burst", 浮動貼文卡: "float" };
// Colours of the rendered video frame (content, like a photo's pixels), not page chrome: the page itself uses theme tokens.
const BREAKOUT_INK = {
  淺色: { bg: "rgb(255,255,255)", text: "rgb(22,22,24)", sub: "rgb(112,114,120)", line: "rgb(228,229,232)", photo: "rgb(214,216,220)", link: "rgb(38,110,214)" },
  深色: { bg: "rgb(16,16,18)", text: "rgb(244,244,246)", sub: "rgb(160,162,168)", line: "rgb(52,53,58)", photo: "rgb(58,60,66)", link: "rgb(110,170,255)" },
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

// What each layout is, under its buttons, under the subject box and under the preview (one place for the wording).
const BREAKOUT_LAYOUT_NOTES = {
  burst: {
    what: "照片放在貼文裡，主角從照片衝出來，蓋過按讚列和文字。",
    subject: "只描述主角和它的動作；貼文的介面、文字與數字會保持不動，主角會從照片裡衝出來蓋過按讚列和文字。",
    preview: "這張預覽就是影片的第一格；AI 從這裡讓主角衝出照片。",
  },
  float: {
    what: "照片鋪滿整個畫面，貼文卡浮在中間；主角先從卡片後面經過，再從卡片前面穿過。",
    subject: "選一張主角在卡片上方和下方都看得到的場景圖（例如水裡游的魚群、天上飛的鳥）；只描述主角和它的動作，貼文卡會保持不動。",
    preview: "這張預覽就是影片的第一格；AI 會讓主角在貼文卡的後面和前面穿過。",
  },
};
const BREAKOUT_RATIOS = [["9:16", "9:16 直式（限時動態、短影音）"], ["4:5", "4:5 直式貼文（動態牆）"], ["1:1", "1:1 正方形（動態牆）"]];
// Counts are whole numbers. "1,286" (an older draft's text) drops its commas; anything else parses as a number;
// empty, negative or not a number = the default.
const toolBreakoutCount = (v, d) => {
  const t = String(v ?? "").trim();
  const n = /^\d[\d,]*$/.test(t) ? Number(t.replace(/,/g, "")) : Math.floor(Number(t));
  return t === "" || !Number.isFinite(n) || n < 0 ? d : n;
};

function toolBreakoutScreen(t) {
  wfDefaults({
    breakoutLayout: "從圖片衝出",
    breakoutStyle: "IG 風格",
    breakoutRatio: "9:16",
    breakoutTheme: "淺色",
    breakoutAccount: "",
    breakoutPlace: "",
    breakoutCaption: "",
    breakoutLikes: 12456,
    breakoutComments: 389,
    breakoutShares: 127,
    breakoutSubject: "",
  });
  // An old draft's "1,286" would show as an empty number field while the preview draws 1,286: store the number itself.
  for (const [k, d] of [["breakoutLikes", 12456], ["breakoutComments", 389], ["breakoutShares", 127]]) values[k] = toolBreakoutCount(values[k], d);
  const layout =BREAKOUT_LAYOUT[values.breakoutLayout] || "burst",
    notes = BREAKOUT_LAYOUT_NOTES[layout];
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
      : `<label>聲音</label><p class="note">${vm?.audio ? "這個模型會生成音效。" : "無聲：目前能保留第一格畫面的模型都不產生聲音，要配樂可在完成後到剪輯加上。"}</p>`;
  const ready = files.image && vm && vm.available !== false && String(values.breakoutSubject || "").trim();
  const ratio = `<div class="flow-choices" role="group">${BREAKOUT_RATIOS.map(([v, name]) => {
    const on = values.breakoutRatio === v;
    return `<button type="button" class="btn small ${on ? "selected" : ""}" data-flow-choice="breakoutRatio" data-flow-value="${v}" data-flow-multiple="false" aria-pressed="${on}">${name}</button>`;
  }).join("")}</div>`;
  const side = `<aside class="side"><div class="row" style="justify-content:space-between"><h3>貼文版面</h3>${wfButton("使用說明", "breakout-help")}</div>
${wfChoice("breakoutLayout", Object.keys(BREAKOUT_LAYOUT))}<p class="note">${notes.what}</p>
<label>貼文樣式</label>${wfChoice("breakoutStyle", ["IG 風格", "FB 風格"])}
<p class="note">只借用版面排列，不放任何平台標誌或名稱。</p>
<label>輸出比例</label>${ratio}
<label>配色</label>${wfChoice("breakoutTheme", ["淺色", "深色"])}
${wfField("breakoutAccount", "帳號名稱", "text", 'placeholder="awarewave" maxlength="40"')}${wfField("breakoutPlace", "位置或副標", "text", 'placeholder="台北市" maxlength="40"')}
<label>貼文文字<textarea data-key="breakoutCaption" aria-label="貼文文字" maxlength="300" placeholder="新品上架！優惠只到這週末 🔥 #新品 #週末限定">${esc(values.breakoutCaption || "")}</textarea></label>
<div class="breakout-counts">${wfField("breakoutLikes", "按讚數", "number", 'min="0" step="1"')}${wfField("breakoutComments", "留言數", "number", 'min="0" step="1"')}${wfField("breakoutShares", "分享數", "number", 'min="0" step="1"')}</div>
<label>衝出畫面的主角<textarea data-key="breakoutSubject" aria-label="衝出畫面的主角" maxlength="${VideoWorkbenchBreakout.SUBJECT_MAX}" placeholder="描述要衝出畫面的東西，例如：張大嘴的鯊魚、拿著商品的模特兒、一台跑車">${esc(values.breakoutSubject || "")}</textarea></label>
<div class="flow-choices">${Object.keys(BREAKOUT_SUBJECTS).map((name) => wfButton(name, "breakout-subject:" + name)).join("")}</div>
<p class="note">${notes.subject}</p>
<label>影片模型</label><p class="note">由便宜到貴排列；價格是這一支影片的費用。</p>${models}${sound}
<p class="note">${seconds} 秒 · 720p · 一支影片${values.breakoutRatio !== "9:16" ? `（模型以 9:16 生成，完成後裁成 ${esc(values.breakoutRatio)}）` : ""}</p>
<p class="note">完成後會把貼文的帳號、數字和文字固定成第一格的樣子；主角衝過去的那幾列照影片原樣。</p>
<button type="button" class="btn primary" data-flow-action="breakout-generate" data-paid="video.motion"${vm ? ` data-paid-model="${esc(vm.id)}"` : ""} ${ready ? "" : "disabled"}>生成破框影片${vm ? " · " + esc(toolBreakoutPrice(vm)) : ""}</button>
${files.image ? "" : '<p class="note">先在左邊選一張圖片。</p>'}${files.image && !String(values.breakoutSubject || "").trim() ? '<p class="note">寫下衝出畫面的主角後才能生成。</p>' : ""}</aside>`;
  // No picture yet: the left side asks for one (the reference's empty state); with one: the live first frame.
  const preview = files.image
    ? `<section class="stage breakout-stage"><div class="breakout-preview" data-breakout-preview data-ratio="${esc(values.breakoutRatio)}"></div><p class="note">${notes.preview}</p><div class="btn-row">${btn("更換圖片（素材庫）", "library:image")}${btn("上傳別張", "upload:image")}</div></section>`
    : `<section class="stage breakout-stage breakout-empty"><div class="tool-icon">⇱</div><h3>先選一張圖片</h3><p>它會成為貼文裡的畫面。</p>${chooser("image")}</section>`;
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
// Grapheme clusters: what a reader sees as one character (👍🏽, a flag, a ZWJ family) stays whole. Every cut in this file
// (wrap, "…", the avatar letter) goes through this; code points would split such emoji into broken halves.
const toolBreakoutSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
function toolBreakoutGraphemes(text) {
  const s = String(text ?? "");
  return toolBreakoutSegmenter ? Array.from(toolBreakoutSegmenter.segment(s), (g) => g.segment) : Array.from(s);
}
// Line wrap into pieces { t, tag }: CJK breaks between any two characters; a #tag or a Latin word stays whole (split by
// grapheme only when it alone is wider than the line). tag is decided per token before wrapping and travels with every
// piece, so a #tag split across lines keeps its colour. At most `max` lines, the last ending in "…" when text is left over.
function toolBreakoutWrapPieces(ctx, text, width, max) {
  const units = [];
  for (const part of String(text || "").replace(/\s*\n\s*/g, " ").split(/(#[^\s#]+|[A-Za-z0-9_.@'’-]+|\s+)/)) {
    if (!part) continue;
    const tag = /^#[^\s#]+$/.test(part),
      whole = tag || /^[A-Za-z0-9_.@'’-]+$/.test(part) || /^\s+$/.test(part);
    if (whole && ctx.measureText(part).width <= width) units.push({ t: part, tag });
    else for (const g of toolBreakoutGraphemes(part)) units.push({ t: g, tag });
  }
  const text$ = (line) => line.map((p) => p.t).join("");
  const trimEnd = (line) => {
    while (line.length && !line.at(-1).t.trim()) line.pop();
    return line;
  };
  const lines = [];
  let line = [],
    cut = false; // text left over after the last allowed line (even when the break fell on a space)
  for (const [i, u] of units.entries()) {
    if (line.length && ctx.measureText(text$(line) + u.t).width > width) {
      lines.push(trimEnd(line));
      line = u.t.trim() ? [u] : [];
      if (lines.length === max) {
        cut = line.length > 0 || units.slice(i + 1).some((p) => p.t.trim());
        break;
      }
    } else line.push(u);
  }
  if (lines.length < max && line.length) lines.push(line);
  else if (lines.length === max && cut) {
    const last = lines[max - 1].map((p) => ({ ...p }));
    while (last.length && ctx.measureText(text$(last) + "…").width > width) {
      const g = toolBreakoutGraphemes(last.at(-1).t);
      g.pop();
      if (g.length) last.at(-1).t = g.join("");
      else last.pop();
    }
    last.push({ t: "…", tag: false });
    lines[max - 1] = last;
  }
  return lines;
}
// The same wrap as plain strings (header name, sub line).
function toolBreakoutWrap(ctx, text, width, max) {
  return toolBreakoutWrapPieces(ctx, text, width, max).map((line) => line.map((p) => p.t).join(""));
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
// 12456 -> "12.4K", 1286 -> "1,286" (how feeds print counts).
function toolBreakoutCompact(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (n >= 1e6) return (Math.floor(n / 1e5) / 10).toString().replace(/\.0$/, "") + "M";
  if (n >= 1e4) return (Math.floor(n / 100) / 10).toString().replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-US");
}
// One caption line of wrap pieces: an optional bold account name first, #tag pieces in the link colour, the rest plain.
function toolBreakoutRich(ctx, pieces, x, y, size, ink, bold = "") {
  let cx = x,
    left = bold && pieces.map((p) => p.t).join("").startsWith(bold) ? bold.length : 0; // characters still bold
  const draw = (t, weight, colour) => {
    if (!t) return;
    ctx.font = toolBreakoutFont(size, weight);
    ctx.fillStyle = colour;
    ctx.fillText(t, cx, y);
    cx += ctx.measureText(t).width;
  };
  for (const p of pieces) {
    const head = left ? p.t.slice(0, left) : "";
    left -= head.length;
    draw(head, 700, ink.text);
    draw(p.t.slice(head.length), 400, p.tag ? ink.link : ink.text);
  }
}
// A generic phone app bar (home, search, add, bag, profile): plain shapes, no product's icon set.
function toolBreakoutNav(ctx, x, y, w, h, k, ink) {
  ctx.fillStyle = ink.bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ink.line;
  ctx.fillRect(x, y, w, 2 * k);
  ctx.strokeStyle = ink.text;
  ctx.lineWidth = 3.2 * k;
  const s = 34 * k,
    cy = y + h / 2 - s / 2,
    step = w / 5;
  const at = (i) => x + step * i + step / 2 - s / 2;
  let ix = at(0); // home
  ctx.beginPath();
  ctx.moveTo(ix + s * 0.1, cy + s * 0.45);
  ctx.lineTo(ix + s / 2, cy + s * 0.08);
  ctx.lineTo(ix + s * 0.9, cy + s * 0.45);
  ctx.moveTo(ix + s * 0.2, cy + s * 0.38);
  ctx.lineTo(ix + s * 0.2, cy + s * 0.92);
  ctx.lineTo(ix + s * 0.8, cy + s * 0.92);
  ctx.lineTo(ix + s * 0.8, cy + s * 0.38);
  ctx.stroke();
  ix = at(1); // search
  ctx.beginPath();
  ctx.arc(ix + s * 0.42, cy + s * 0.42, s * 0.3, 0, Math.PI * 2);
  ctx.moveTo(ix + s * 0.64, cy + s * 0.64);
  ctx.lineTo(ix + s * 0.92, cy + s * 0.92);
  ctx.stroke();
  ix = at(2); // add
  toolBreakoutRound(ctx, ix + s * 0.08, cy + s * 0.08, s * 0.84, s * 0.84, 7 * k);
  ctx.moveTo(ix + s / 2, cy + s * 0.28);
  ctx.lineTo(ix + s / 2, cy + s * 0.72);
  ctx.moveTo(ix + s * 0.28, cy + s / 2);
  ctx.lineTo(ix + s * 0.72, cy + s / 2);
  ctx.stroke();
  ix = at(3); // bag
  toolBreakoutRound(ctx, ix + s * 0.12, cy + s * 0.32, s * 0.76, s * 0.6, 5 * k);
  ctx.moveTo(ix + s * 0.34, cy + s * 0.32);
  ctx.arc(ix + s / 2, cy + s * 0.32, s * 0.16, Math.PI, 0);
  ctx.stroke();
  ix = at(4); // profile
  ctx.beginPath();
  ctx.arc(ix + s / 2, cy + s / 2, s * 0.44, 0, Math.PI * 2);
  ctx.moveTo(ix + s * 0.66, cy + s * 0.4);
  ctx.arc(ix + s / 2, cy + s * 0.4, s * 0.16, 0, Math.PI * 2);
  ctx.stroke();
}
// One post at (x, y), width w, height up to maxH; returns its height. measure=true only computes it.
// photo=false: the floating card (header, actions and caption only; the picture is the frame behind it).
// fill=true: the photo grows so the post fills maxH (a phone screen); nav=true: an app bar at the bottom.
// boxes: an array that receives every text row drawn, [x, y, w, h] in canvas pixels (the server holds them still).
function toolBreakoutPost(ctx, img, o, x, y, w, maxH, { measure = false, photo = true, fill = false, nav = false, boxes = null } = {}) {
  const k = w / 720,
    ink = BREAKOUT_INK[o.theme] || BREAKOUT_INK.淺色,
    fb = o.style === "FB 風格",
    pad = 28 * k,
    header = 112 * k,
    capSize = 27 * k,
    capLine = 38 * k,
    navH = nav ? 96 * k : 0;
  ctx.font = toolBreakoutFont(capSize);
  const capLines = toolBreakoutWrapPieces(ctx, (fb ? "" : o.account + "  ") + o.caption, w - pad * 2, fb ? 3 : 2);
  const captionH = capLines.length ? capLines.length * capLine + 12 * k : 0;
  const bottom = (fb ? captionH + 64 * k + 2 * k + 84 * k : 76 * k + 44 * k + captionH + 44 * k + 18 * k) + navH;
  const room = maxH - header - bottom;
  const photoH = !photo ? 0 : Math.max(120 * k, fill ? room : Math.min(w * 1.25, room));
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
  ctx.fillStyle = BREAKOUT_ACCENT;
  ctx.beginPath();
  ctx.arc(ax, ay, ar - 6 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(255,255,255)";
  ctx.font = toolBreakoutFont(30 * k, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((toolBreakoutGraphemes(o.account.trim())[0] || "A").toUpperCase(), ax, ay + 1 * k);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const tx = ax + ar + 20 * k,
    sub = fb ? (o.place ? o.place + " · " : "") + "2 小時" : o.place;
  ctx.fillStyle = ink.text;
  ctx.font = toolBreakoutFont(29 * k, 700);
  ctx.fillText(toolBreakoutWrap(ctx, o.account, w - (tx - x) - 80 * k, 1)[0] || "", tx, ay - (sub ? 4 * k : -10 * k));
  if (sub) {
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(23 * k);
    ctx.fillText(toolBreakoutWrap(ctx, sub, w - (tx - x) - 80 * k, 1)[0] || "", tx, ay + 30 * k);
  }
  ctx.fillStyle = ink.text;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + w - pad - 36 * k + i * 14 * k, ay, 3.4 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  const mark = (top, h) => boxes?.push([x, top, w, h]);
  mark(y, header);
  let cy = y + header;
  const caption = (top) => {
    capLines.forEach((line, i) => toolBreakoutRich(ctx, line, x + pad, top + capLine * (i + 0.75), capSize, ink, !fb && i === 0 ? o.account : ""));
    return top + captionH;
  };
  if (fb) {
    mark(cy, captionH - 4 * k); // ends where the next row starts (the caption is drawn from cy - 8k)
    cy = caption(cy - 8 * k) + 4 * k;
  }
  if (photoH) {
    if (img) toolBreakoutCover(ctx, img, x, cy, w, photoH);
    else {
      ctx.fillStyle = ink.photo;
      ctx.fillRect(x, cy, w, photoH);
    }
    cy += photoH;
  } else if (fb) {
    ctx.fillStyle = ink.line;
    ctx.fillRect(x + pad, cy, w - pad * 2, 2 * k);
  }
  ctx.strokeStyle = ink.text;
  ctx.lineWidth = 3.2 * k;
  ctx.lineJoin = "round";
  if (fb) {
    // counts row, divider, three action buttons
    mark(cy, 64 * k + 2 * k + 84 * k); // counts row + action buttons
    const row = cy + 44 * k;
    ctx.fillStyle = BREAKOUT_ACCENT;
    ctx.beginPath();
    ctx.arc(x + pad + 14 * k, row - 9 * k, 15 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgb(255,255,255)";
    ctx.lineWidth = 2.6 * k;
    toolBreakoutIcon.heart(ctx, x + pad + 4 * k, row - 19 * k, 20 * k);
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(24 * k);
    ctx.fillText(toolBreakoutCompact(o.likes), x + pad + 40 * k, row);
    ctx.textAlign = "right";
    ctx.fillText(`${toolBreakoutCompact(o.comments)} 則留言 · ${toolBreakoutCompact(o.shares)} 次分享`, x + w - pad, row);
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
    mark(cy, 76 * k); // action icons
    mark(cy + 76 * k, 44 * k); // likes
    if (captionH) mark(cy + 120 * k, captionH);
    mark(cy + 120 * k + captionH, 62 * k); // comments line
    const iy = cy + 22 * k,
      s = 40 * k;
    toolBreakoutIcon.heart(ctx, x + pad, iy, s);
    toolBreakoutIcon.bubble(ctx, x + pad + 64 * k, iy, s);
    toolBreakoutIcon.send(ctx, x + pad + 128 * k, iy, s);
    toolBreakoutIcon.save(ctx, x + w - pad - s, iy, s);
    cy += 76 * k;
    ctx.fillStyle = ink.text;
    ctx.font = toolBreakoutFont(26 * k, 700);
    ctx.fillText(`${toolBreakoutCompact(o.likes)} 個讚`, x + pad, cy + 30 * k);
    cy = caption(cy + 44 * k);
    ctx.fillStyle = ink.sub;
    ctx.font = toolBreakoutFont(24 * k);
    ctx.fillText(`查看全部 ${toolBreakoutCompact(o.comments)} 則留言 · ${toolBreakoutCompact(o.shares)} 次分享`, x + pad, cy + 30 * k);
  }
  if (nav) {
    mark(y + total - navH, navH);
    toolBreakoutNav(ctx, x, y + total - navH, w, navH, k, ink);
  }
  return total;
}
// Empty fields draw their placeholder, like the reference preview.
function toolBreakoutOptions() {
  const text = (k, d) => String(values[k] ?? "").trim() || d;
  return {
    layout: BREAKOUT_LAYOUT[values.breakoutLayout] || "burst",
    style: values.breakoutStyle,
    theme: values.breakoutTheme,
    ratio: VideoWorkbenchBreakout.OUTPUT_RATIOS.includes(values.breakoutRatio) ? values.breakoutRatio : "9:16",
    account: text("breakoutAccount", "awarewave"),
    place: text("breakoutPlace", "台北市"),
    caption: text("breakoutCaption", "新品上架！優惠只到這週末 🔥 #新品 #週末限定"),
    likes: toolBreakoutCount(values.breakoutLikes, 12456),
    comments: toolBreakoutCount(values.breakoutComments, 389),
    shares: toolBreakoutCount(values.breakoutShares, 127),
  };
}
// Paints the preview at the output ratio. frame=true: always 720x1280 (what the 9:16 model gets); a 4:5 or 1:1 frame is the
// preview itself, pixel for pixel, centred (the outside is the post background; the server's crop drops it).
// boxes: receives the post's text rows in this canvas's pixels (shifted with the preview when centred).
async function toolBreakoutDraw(canvas, frame = false, boxes = null) {
  const o = toolBreakoutOptions();
  if (frame && o.ratio !== VideoWorkbenchBreakout.MODEL_RATIO) {
    const rows = boxes ? [] : null,
      preview = await toolBreakoutDraw(document.createElement("canvas"), false, rows),
      top = (BREAKOUT_FRAME.h - preview.height) / 2;
    canvas.width = BREAKOUT_FRAME.w;
    canvas.height = BREAKOUT_FRAME.h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = (BREAKOUT_INK[o.theme] || BREAKOUT_INK.淺色).bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(preview, 0, top);
    for (const [x, y, w, h] of rows || []) boxes.push([x, y + top, w, h]);
    return canvas;
  }
  const img = await toolBreakoutImage(files.image?.url),
    W = BREAKOUT_FRAME.w,
    H = VideoWorkbenchBreakout.outputHeight(o.ratio, W);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d"),
    ink = BREAKOUT_INK[o.theme] || BREAKOUT_INK.淺色;
  if (o.layout === "float") {
    // The picture fills the output over an opaque base (a cut-out PNG never sends alpha); a text-only post card floats
    // in the middle of it.
    ctx.fillStyle = ink.photo;
    ctx.fillRect(0, 0, W, H);
    if (img) toolBreakoutCover(ctx, img, 0, 0, W, H);
    const cw = W * 0.86,
      ch = toolBreakoutPost(ctx, img, o, 0, 0, cw, H, { measure: true, photo: false }),
      cx = (W - cw) / 2,
      cy = (H - ch) / 2,
      r = 26;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.3)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = ink.bg;
    toolBreakoutRound(ctx, cx, cy, cw, ch, r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    toolBreakoutRound(ctx, cx, cy, cw, ch, r);
    ctx.clip();
    toolBreakoutPost(ctx, img, o, cx, cy, cw, H, { photo: false, boxes });
    ctx.restore();
  } else {
    // The post is the whole screen: the photo grows to fill it, with an app bar at the bottom of a 9:16 screen.
    ctx.fillStyle = ink.bg;
    ctx.fillRect(0, 0, W, H);
    toolBreakoutPost(ctx, img, o, 0, 0, W, H, { fill: true, nav: o.ratio === "9:16", boxes });
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
    `<button type="button" class="editor-dialog-close" aria-label="關閉">×</button><h3>破框貼文動畫怎麼用</h3><ol class="instruction"><li><b>選圖片</b>：從素材庫或上傳一張主角清楚的圖片，它會變成貼文裡的照片。</li><li><b>排好貼文</b>：選版面、樣式、比例與顏色，改帳號名稱、文字和按讚數；左邊的預覽就是影片第一格。</li><li><b>寫主角、生成</b>：只描述衝出來的主角和它的動作（例如「鯊魚張大嘴衝出來」），選模型後按生成；按鈕上的價格就是這次的費用，完成的影片會進素材庫。</li></ol><p class="note"><b>小提醒</b>：預覽就是影片的第一格；主角描述只寫它是什麼、做什麼動作，貼文介面會保持不動。</p><div class="row" style="justify-content:flex-end"><button type="button" class="btn primary breakout-help-start">開始使用</button></div>`,
  );
  dialog.querySelector(".editor-dialog-close").onclick = () => dialog.close();
  dialog.querySelector(".breakout-help-start").onclick = () => dialog.close();
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
    const rows = [],
      canvas = await toolBreakoutDraw(document.createElement("canvas"), true, rows),
      ink = BREAKOUT_INK[o.theme] || BREAKOUT_INK.淺色,
      rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    // 鎖定貼文文字 (backend/breakout.cjs finish): the rows as 0..1 of the frame, and the colours text and icons are drawn in.
    const unit = (v) => Math.min(1, Math.max(0, v));
    const lock = {
      boxes: rows.slice(0, VideoWorkbenchBreakout.LOCK_MAX_BOXES).map(([x, y, w, h]) => {
        const x0 = unit(x / canvas.width), y0 = unit(y / canvas.height);
        return [x0, y0, unit((x + w) / canvas.width) - x0, unit((y + h) / canvas.height) - y0];
      }),
      inks: [ink.text, ink.sub, ink.link, BREAKOUT_ACCENT].map(rgb),
    };
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
        lock,
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

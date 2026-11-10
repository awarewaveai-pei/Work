let toolOverlayPaint = 0,
  toolOverlayImageCache = null;
function toolOverlayScreen(t) {
  wfDefaults({
    ctaType: "文字按鈕",
    ctaText: "立即購買",
    ctaShape: "膠囊",
    ctaFill: "實色",
    ctaColor: "#ef4444",
    ctaFontColor: "#ffffff",
    ctaIcon: "箭頭",
    ctaShadow: true,
    ctaFade: "無",
    overlayPreviewRatio: "16:9",
    overlayBackground: "去白底（免費）",
    overlayThreshold: 40,
    overlayInterior: false,
    大小: t.id === "watermark" ? 22 : 40,
    不透明度: t.id === "watermark" ? 90 : 100,
    水平位置: 30,
    垂直位置: 76,
    出現: 0,
    消失: 3,
  });
  const cta = t.id === "cta",
    imageMode =
      !cta || values.ctaType === "上傳圖檔" || values.ctaType === "上傳圖片",
    imageKey = cta ? "ctaImage" : "png";
  const preview = `<section class="flow-overlay-stage"><div class="flow-overlay-base" data-overlay-base style="aspect-ratio:${values.overlayPreviewRatio === "9:16" ? "9/16" : "16/9"}">${files.src ? `<video data-flow-media="src" src="${esc(files.src.previewUrl || files.src.url)}" controls preload="metadata"></video>` : "<p>可先調整位置與樣式，再選取影片預覽。</p>"}<button type="button" data-overlay-mark aria-label="${cta ? "CTA 按鈕" : "浮水印"}（可拖曳，方向鍵微調）"><img alt="疊加預覽"><i data-overlay-resize aria-label="調整大小"></i></button></div><div class="row">${files.src ? btn("換一支影片", "library:src") : btn("從素材庫選取影片", "library:src")}${btn("上傳影片", "upload:src")}${cta ? wfButton("預覽按鈕時段", "overlay-preview") : wfChoice("overlayPreviewRatio", ["16:9", "9:16"])}</div>${wfStats()}</section>`;
  const content = `${cta ? `<h3>按鈕內容</h3>${wfChoice("ctaType", ["文字按鈕", "上傳圖檔"])}` : "<h3>浮水印圖檔</h3>"}${imageMode ? `<div class="row">${btn(files[imageKey] ? "更換圖片" : "上傳 PNG", "upload:" + imageKey)}${btn("從素材庫選取圖片", "library:" + imageKey)}</div>${files[imageKey] ? `<p>${esc(files[imageKey].name)}</p>` : ""}${cta ? "<label>背景處理</label>" + wfChoice("overlayBackground", ["保留原圖", "去白底（免費）"]) + '<p class="note">AI 去背尚未接入；免費去白底可在本機預覽與輸出。</p>' + (values.overlayBackground !== "保留原圖" ? range("overlayThreshold", 40, 0, 150, 1, "") + wfCheck("overlayInterior", "連圖案內部的白色一起去除") : "") : ""}` : `${wfField("ctaText", "按鈕文字", "text", 'maxlength="80"')}<label>快速樣式</label><div class="flow-choices">${["紅色膠囊", "橘色漸層", "白底黑字", "黃底黑字", "白色外框", "半透明", "青色方角"].map((name) => wfButton(name, "cta-style:" + name)).join("")}</div>${wfSelect("ctaShape", "形狀", ["膠囊", "圓角", "方角"])}${wfSelect("ctaFill", "填色", ["實色", "漸層", "外框", "半透明"])}${wfField("ctaColor", "按鈕顏色", "color")}${wfField("ctaFontColor", "文字顏色", "color")}${wfSelect("ctaIcon", "圖示", ["無", "箭頭", "角括號", "播放", "購物車"])}${wfCheck("ctaShadow", "陰影")}`}${cta ? `<h3>出現時間</h3>${wfField("出現", "出現（秒）", "number", 'min="0" step="0.1"')}${wfButton("出現設為目前播放時間", "overlay-start-now")}${wfField("消失", "消失（秒）", "number", 'min="0" step="0.1"')}${wfButton("消失設為目前播放時間", "overlay-end-now")}<label>淡入淡出</label>${wfChoice("ctaFade", ["無", "0.3 秒", "0.5 秒", "1 秒"])}` : ""}<h3>位置與大小</h3><div class="flow-position-grid">${["左上", "正上", "右上", "左中", "正中", "右中", "左下", "正下", "右下"].map((name, i) => `<button type="button" class="btn small" data-overlay-position="${i}">${name}</button>`).join("")}</div>${range("水平位置", 30, 0, 100)}${range("垂直位置", 76, 0, 100)}${range("大小", cta ? 40 : 22, 1, 100)}${range("不透明度", cta ? 100 : 90, 0, 100)}${!cta ? wfButton("儲存浮水印設定", "overlay-save") : ""}${wfButton(cta ? "合成並存到素材庫" : "匯出浮水印影片", "overlay-export", !files.src || (imageMode && !files[imageKey]))}<p class="note">拖曳調整位置，右下角調整大小；輸出維持原影片尺寸。</p>`;
  return wfWrap(
    t,
    `<div class="two-col flow-layout">${preview}<aside class="side">${content}</aside></div>`,
  );
}
function toolRemoveWhite(canvas, threshold, interior) {
  const context = canvas.getContext("2d"),
    image = context.getImageData(0, 0, canvas.width, canvas.height),
    pixels = image.data;
  const count = canvas.width * canvas.height,
    white = (index) =>
      pixels[index * 4 + 3] === 0 ||
      Math.min(
        pixels[index * 4],
        pixels[index * 4 + 1],
        pixels[index * 4 + 2],
      ) >=
        255 - threshold;
  if (interior) {
    for (let i = 0; i < count; i++) if (white(i)) pixels[i * 4 + 3] = 0;
  } else {
    const queue = new Uint32Array(count),
      visited = new Uint8Array(count);
    let start = 0,
      end = 0;
    const add = (i) => {
      if (i < 0 || i >= count || visited[i]) return;
      visited[i] = 1;
      if (white(i)) queue[end++] = i;
    };
    for (let x = 0; x < canvas.width; x++) {
      add(x);
      add((canvas.height - 1) * canvas.width + x);
    }
    for (let y = 0; y < canvas.height; y++) {
      add(y * canvas.width);
      add((y + 1) * canvas.width - 1);
    }
    while (start < end) {
      const i = queue[start++];
      pixels[i * 4 + 3] = 0;
      if (i % canvas.width) add(i - 1);
      if (i % canvas.width < canvas.width - 1) add(i + 1);
      add(i - canvas.width);
      add(i + canvas.width);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
async function toolOverlayCanvas(snapshot = { tool, values, files }) {
  const { tool, values, files } = snapshot;
  const cta = tool === "cta",
    imageMode = !cta || ["上傳圖檔", "上傳圖片"].includes(values.ctaType);
  const canvas = document.createElement("canvas");
  if (imageMode) {
    const source = files[cta ? "ctaImage" : "png"];
    if (!source) return null;
    if (toolOverlayImageCache?.url !== source.url) {
      const image = new Image();
      image.src = source.url;
      toolOverlayImageCache = { url: source.url, image, ready: image.decode() };
    }
    const cached = toolOverlayImageCache;
    await cached.ready;
    const scale = Math.min(
      1,
      2048 / Math.max(cached.image.naturalWidth, cached.image.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(cached.image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(cached.image.naturalHeight * scale));
    canvas
      .getContext("2d")
      .drawImage(cached.image, 0, 0, canvas.width, canvas.height);
    if (cta && values.overlayBackground !== "保留原圖")
      toolRemoveWhite(
        canvas,
        Math.max(0, Math.min(150, Number(values.overlayThreshold) || 0)),
        !!values.overlayInterior,
      );
  } else {
    canvas.width = 800;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    const color = /^#[\da-f]{6}$/i.test(values.ctaColor)
      ? values.ctaColor
      : "#ef4444";
    if (values.ctaShadow) {
      ctx.shadowColor = "#0006";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
    }
    ctx.beginPath();
    ctx.roundRect(
      12,
      10,
      776,
      156,
      values.ctaShape === "膠囊"
        ? 78
        : ["方角", "方形"].includes(values.ctaShape)
          ? 0
          : 18,
    );
    if (values.ctaFill === "漸層") {
      const gradient = ctx.createLinearGradient(0, 0, 800, 0);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "#facc15");
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = values.ctaFill === "半透明" ? color + "99" : color;
    if (["外框", "透明"].includes(values.ctaFill)) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = /^#[\da-f]{6}$/i.test(values.ctaFontColor)
      ? values.ctaFontColor
      : "#ffffff";
    ctx.font = "bold 64px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const icon =
      { 無: "", 箭頭: " →", 角括號: " ›", 播放: " ▶", 購物車: " 🛒" }[
        values.ctaIcon
      ] || "";
    ctx.fillText(String(values.ctaText || "") + icon, 400, 88, 720);
  }
  return canvas;
}
function toolOverlayPosition() {
  const stage = document.querySelector("[data-overlay-base]"),
    mark = document.querySelector("[data-overlay-mark]");
  if (!stage || !mark) return;
  const source = stage.querySelector("video"),
    area = (source || stage).getBoundingClientRect(),
    parent = stage.getBoundingClientRect();
  const width =
    (area.width * Math.max(1, Math.min(100, Number(values["大小"]) || 1))) /
    100;
  const image = mark.querySelector("img"),
    ratio = Number(mark.dataset.ratio) || 4;
  mark.style.width = width + "px";
  mark.style.height = width / ratio + "px";
  mark.style.left =
    area.left -
    parent.left +
    (Math.max(0, area.width - width) * Number(values["水平位置"] || 0)) / 100 +
    "px";
  mark.style.top =
    area.top -
    parent.top +
    (Math.max(0, area.height - width / ratio) *
      Number(values["垂直位置"] || 0)) /
      100 +
    "px";
  mark.style.opacity = String(
    Math.max(0, Math.min(100, Number(values["不透明度"] ?? 100))) / 100,
  );
  if (source && source.videoWidth)
    stage.style.aspectRatio = `${source.videoWidth}/${source.videoHeight}`;
  if (tool === "cta" && source)
    mark.classList.toggle(
      "outside-time",
      source.currentTime < Number(values["出現"]) ||
        source.currentTime >= Number(values["消失"]),
    );
  image.style.width = "100%";
  image.style.height = "100%";
  for (const key of ["水平位置", "垂直位置", "大小"]) {
    const input = document.querySelector(`[data-key="${key}"]`),
      output = document.getElementById("v-" + key);
    if (input && document.activeElement !== input) input.value = values[key];
    if (output) output.textContent = values[key] + "%";
  }
}
async function toolOverlayUpdate() {
  if (!["cta", "watermark"].includes(tool)) return;
  const request = ++toolOverlayPaint,
    mark = document.querySelector("[data-overlay-mark]");
  if (!mark) return;
  try {
    const canvas = await toolOverlayCanvas();
    if (request !== toolOverlayPaint || !mark.isConnected) return;
    mark.hidden = !canvas;
    if (canvas) {
      mark.querySelector("img").src = canvas.toDataURL("image/png");
      mark.dataset.ratio = canvas.width / canvas.height;
      toolOverlayPosition();
    }
  } catch (error) {
    if (request === toolOverlayPaint && mark.isConnected)
      VideoWorkbench.reportError(error);
  }
}
function toolOverlayAfterRender() {
  if (!["cta", "watermark"].includes(tool)) return;
  toolOverlayUpdate();
  const stage = document.querySelector("[data-overlay-base]"),
    mark = document.querySelector("[data-overlay-mark]");
  if (!stage || !mark) return;
  mark.onpointerdown = (event) => {
    event.preventDefault();
    const resize = event.target.hasAttribute("data-overlay-resize");
    const rect = stage.getBoundingClientRect(),
      box = mark.getBoundingClientRect(),
      x = event.clientX,
      y = event.clientY;
    const previous = {
      x: Number(values["水平位置"]),
      y: Number(values["垂直位置"]),
      size: Number(values["大小"]),
    };
    mark.setPointerCapture(event.pointerId);
    mark.onpointermove = (move) => {
      if (resize)
        values["大小"] = Math.max(
          1,
          Math.min(
            100,
            previous.size + ((move.clientX - x) / rect.width) * 100,
          ),
        );
      else {
        values["水平位置"] = Math.max(
          0,
          Math.min(
            100,
            previous.x +
              ((move.clientX - x) / Math.max(1, rect.width - box.width)) * 100,
          ),
        );
        values["垂直位置"] = Math.max(
          0,
          Math.min(
            100,
            previous.y +
              ((move.clientY - y) / Math.max(1, rect.height - box.height)) *
                100,
          ),
        );
      }
      toolOverlayPosition();
    };
    mark.onpointerup = mark.onpointercancel = () => {
      mark.onpointermove = mark.onpointerup = mark.onpointercancel = null;
      saveDraft();
    };
  };
  mark.onkeydown = (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const key = ["ArrowLeft", "ArrowRight"].includes(event.key)
        ? "水平位置"
        : "垂直位置",
      delta = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
    values[key] = Math.max(
      0,
      Math.min(100, Number(values[key]) + delta * (event.shiftKey ? 5 : 1)),
    );
    toolOverlayPosition();
    saveDraft();
  };
}
async function toolOverlayAction(action, button) {
  if (!["cta", "watermark"].includes(tool)) return;
  if (action?.startsWith("cta-style:")) {
    const style = action.slice(10),
      styles = {
        紅色膠囊: ["#ef4444", "#ffffff", "膠囊", "實色", "箭頭"],
        橘色漸層: ["#f97316", "#ffffff", "膠囊", "漸層", "購物車"],
        白底黑字: ["#ffffff", "#111827", "圓角", "實色", "箭頭"],
        黃底黑字: ["#facc15", "#111827", "膠囊", "實色", "箭頭"],
        白色外框: ["#ffffff", "#ffffff", "膠囊", "外框", "箭頭"],
        半透明: ["#111827", "#ffffff", "圓角", "半透明", "播放"],
        青色方角: ["#06b6d4", "#ffffff", "方角", "實色", "角括號"],
      };
    const selected = styles[style];
    if (selected) {
      [
        values.ctaColor,
        values.ctaFontColor,
        values.ctaShape,
        values.ctaFill,
        values.ctaIcon,
      ] = selected;
      saveDraft();
      render();
    }
  }
  if (
    ["overlay-start-now", "overlay-end-now", "overlay-preview"].includes(action)
  ) {
    const media = document.querySelector('[data-flow-media="src"]');
    if (!media) throw Error("請先選取影片");
    if (action === "overlay-preview") {
      media.currentTime = Number(values["出現"]);
      await media.play();
    } else {
      values[action === "overlay-start-now" ? "出現" : "消失"] = Number(
        media.currentTime.toFixed(1),
      );
      saveDraft();
      render();
    }
  }
  if (action === "overlay-save") {
    await VideoWorkbench.preferences.set("tools.watermark", {
      values: structuredClone(values),
      files: structuredClone(files),
    });
    VideoWorkbench.notify("浮水印設定已儲存");
  }
  if (action === "overlay-export") {
    const currentTool = tool,
      source = structuredClone(files.src),
      settings = structuredClone(values);
    if (!source?.url || !source.width)
      throw Error("請先選取影片，並等待影片資料載入");
    if (
      tool === "cta" &&
      (!Number.isFinite(Number(settings["出現"])) ||
        Number(settings["出現"]) < 0 ||
        Number(settings["消失"]) <= Number(settings["出現"]) ||
        Number(settings["消失"]) > source.duration + 0.1)
    )
      throw Error("出現與消失時間需位於影片範圍，且消失需晚於出現");
    if (
      tool === "cta" &&
      settings.ctaType === "文字按鈕" &&
      !String(settings.ctaText).trim()
    )
      throw Error("請填寫按鈕文字");
    button.disabled = true;
    try {
      const canvas = await toolOverlayCanvas({
        tool: currentTool,
        values: settings,
        files: structuredClone(files),
      });
      if (!canvas) throw Error("請先選擇疊加圖片");
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      const asset = await VideoWorkbench.uploadAsset(
        new File([blob], currentTool + "-overlay.png", { type: "image/png" }),
      );
      settings.overlayWidth = Math.max(
        16,
        Math.round((source.width * Number(settings["大小"])) / 100),
      );
      settings.ctaPos ??= 4;
      settings.watermarkPos ??= 4;
      // paid: none (watermark / cta overlays run locally)
      const job = await VideoWorkbench.generations.create({
        type: "video",
        operation: currentTool,
        settings,
        references: {
          src: source,
          [currentTool === "cta" ? "ctaImage" : "png"]: asset,
        },
      });
      VideoWorkbench.showJob(job);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-overlay-position]");
  if (!button) return;
  const index = Number(button.dataset.overlayPosition);
  values["水平位置"] = [0, 50, 100][index % 3];
  values["垂直位置"] = [0, 50, 100][Math.floor(index / 3)];
  values[tool === "cta" ? "ctaPos" : "watermarkPos"] = index;
  saveDraft();
  toolOverlayPosition();
});
document.addEventListener("input", (event) => {
  if (!["cta", "watermark"].includes(tool) || !event.target.dataset.key) return;
  values[event.target.dataset.key] =
    event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value;
  toolOverlayUpdate();
});

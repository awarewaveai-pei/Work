const toolSubtitleStyles = [
  "白字黑邊",
  "白字灰底",
  "半透明底框",
  "黑底白字",
  "白底黑字",
  "白字陰影",
  "黃字黑邊",
];
const toolSubtitleColors = {
  白色: "#ffffff",
  黃色: "#facc15",
  青色: "#22d3ee",
  粉紅色: "#f472b6",
  綠色: "#4ade80",
  橘色: "#fb923c",
  黑色: "#000000",
};
function toolSubtitleTime(value) {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(
    String(value).trim(),
  );
  if (!match) throw Error("時間請使用 時:分:秒.毫秒 或 分:秒.毫秒");
  const time =
    Number(match[1] || 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number((match[4] || "").padEnd(3, "0")) / 1000;
  if (Number(match[2]) > 59 || Number(match[3]) > 59 || !Number.isFinite(time))
    throw Error("字幕時間無效");
  return time;
}
function toolSubtitleStamp(time, full = false) {
  const ms = Math.max(0, Math.round(Number(time) * 1000)),
    h = Math.floor(ms / 3600000),
    m = Math.floor(ms / 60000) % 60,
    s = Math.floor(ms / 1000) % 60;
  return (
    (full || h ? String(h).padStart(2, "0") + ":" : "") +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "." +
    String(ms % 1000).padStart(3, "0")
  );
}
// Card P2: one parser for every SRT/VTT the page reads (shared/subtitle-parse.js); seconds + ids for this tool.
function toolSubtitleParse(text) {
  return SubtitleParse.parse(String(text)).map((cue) => ({
    id: crypto.randomUUID(),
    start: cue.startMs / 1000,
    end: cue.endMs / 1000,
    text: cue.text,
  }));
}
function toolSubtitleSerialize(cues, format = "srt", texts = null) {
  const blocks = cues.map(
    (cue, i) =>
      `${format === "srt" ? i + 1 + "\n" : ""}${toolSubtitleStamp(cue.start, true).replace(".", format === "srt" ? "," : ".")} --> ${toolSubtitleStamp(cue.end, true).replace(".", format === "srt" ? "," : ".")}\n${texts?.[cue.id] ?? cue.text}`,
  );
  return (format === "vtt" ? "WEBVTT\n\n" : "") + blocks.join("\n\n") + "\n";
}
function toolSubtitleCommit() {
  values.subtitleText = toolSubtitleSerialize(values.subtitleCues || []);
  values.subtitleParsedFrom = values.subtitleText;
  saveDraft();
}
function toolSubtitleScreen(t) {
  wfDefaults({
    subtitleTab: "校對",
    subtitleSourceKind: "影片",
    subtitleCues: [],
    subtitleTranslations: {},
    subtitleStyle: "白字黑邊",
    subtitleColor: "#ffffff",
    subtitleSize: 52,
    subtitlePosition: "下方",
    subtitleFirstLine: "原文",
    subtitleSecondLine: "不顯示",
    subtitleLanguage: "自動偵測",
  });
  if (
    values.subtitleText &&
    values.subtitleParsedFrom !== values.subtitleText
  ) {
    try {
      values.subtitleCues = toolSubtitleParse(values.subtitleText);
      values.subtitleTranslations = {};
      values.subtitleParsedFrom = values.subtitleText;
      delete values.subtitleImportError;
    } catch (error) {
      values.subtitleImportError = error.message;
    }
  }
  const cues = values.subtitleCues,
    translations = values.subtitleTranslations;
  const preview = `<section class="subtitle-preview">${files.src ? `<div class="subtitle-video-box">${wfSource()}<div data-subtitle-overlay aria-live="off"></div></div><div class="row">${wfButton("倒退 0.1 秒", "subtitle-back")}${wfButton("前進 0.1 秒", "subtitle-forward")}<span data-subtitle-clock>0:00.000</span></div>` : wfChoice("subtitleSourceKind", ["影片", "音檔"]) + wfSource("src", values.subtitleSourceKind === "音檔" ? "audio" : "video")}<div class="row">${btn("匯入 SRT／VTT 字幕檔（免費）", "upload:subtitlefile")}${wfButton("SRT", "subtitle-download:srt", !cues.length)}${wfButton("VTT", "subtitle-download:vtt", !cues.length)}</div><details><summary>貼上或檢查字幕原文</summary>${ta("subtitleText", "貼上 SRT 或 VTT 時間碼與內容")}${wfButton("載入貼上的字幕", "subtitle-import-text")}</details>${values.subtitleImportError ? `<p role="alert">${esc(values.subtitleImportError)}</p>` : ""}</section>`;
  let body;
  if (!cues.length)
    body = `<h3>產生字幕</h3>${wfSelect("subtitleLanguage", "辨識語言", wfLanguages())}<p>先選影片或音檔，辨識語音後逐行校對；也可免費匯入既有字幕檔。</p>${wfProviderChoice("transcribe", "subtitleEngine", "辨識方式")}${wfButton("辨識字幕", "subtitle-transcribe", !files.src, "video.transcribe", wfProviderCurrent("transcribe", values.subtitleEngine))}`;
  else if (values.subtitleTab === "校對")
    body = `<div class="row">${wfButton("在目前時間新增一行", "subtitle-add")}${wfButton("清除字幕重新開始", "subtitle-clear")}</div><ol class="subtitle-cues">${cues.map((cue, i) => `<li data-subtitle-row="${esc(cue.id)}"><button class="btn small" data-subtitle-seek="${i}" aria-label="從第 ${i + 1} 行播放">▶ ${i + 1}</button><div class="row"><label>開始<input class="text-input" data-subtitle-start="${i}" aria-label="第 ${i + 1} 行開始時間" value="${toolSubtitleStamp(cue.start)}"></label><label>結束<input class="text-input" data-subtitle-end="${i}" aria-label="第 ${i + 1} 行結束時間" value="${toolSubtitleStamp(cue.end)}"></label></div><textarea data-subtitle-text="${i}" aria-label="第 ${i + 1} 行字幕">${esc(values.subtitleFirstLine !== "原文" ? (translations[values.subtitleFirstLine]?.[cue.id] ?? cue.text) : cue.text)}</textarea><div class="row"><button class="btn small" data-subtitle-shift="${i}" data-delta="-0.1">整行往前移 0.1 秒</button><button class="btn small" data-subtitle-shift="${i}" data-delta="0.1">整行往後移 0.1 秒</button><button class="btn small" data-subtitle-delete="${i}">刪除這一行</button></div></li>`).join("")}</ol>`;
  else if (values.subtitleTab === "翻譯")
    body = `<h3>翻譯字幕</h3><p>保留逐行時間；翻譯使用已接入的文字服務，依 API 用量計費。</p><div class="flow-choices">${["繁體中文", "簡體中文", "English", "日本語", "한국어", "ภาษาไทย"].map((language) => wfButton((translations[language] ? "重新翻譯成 " : "翻譯成 ") + language, "subtitle-translate:" + language, false, "video.script")).join("")}</div>${wfSelect("subtitleFirstLine", "第一行", ["原文", ...Object.keys(translations)])}${wfSelect("subtitleSecondLine", "第二行", ["不顯示", "原文", ...Object.keys(translations)])}`;
  else
    body = `<h3>樣式 · 即時預覽</h3>${wfChoice("subtitleStyle", toolSubtitleStyles)}<label>文字顏色</label><div class="flow-choices">${Object.entries(
      toolSubtitleColors,
    )
      .map(
        ([name, color]) =>
          `<button class="btn small" data-subtitle-color="${color}">${name}</button>`,
      )
      .join(
        "",
      )}</div>${wfField("subtitleColor", "自訂顏色", "color")}${range("subtitleSize", 52, 20, 100, 1, " / 1000 畫面高度")}<label>位置</label>${wfChoice("subtitlePosition", ["下方", "中下", "中間", "上方"])}<p class="note">匯入字幕沒有逐字時間碼；逐字高亮及卡拉 OK 尚未啟用。</p>`;
  return wfWrap(
    t,
    `<div class="two-col flow-layout">${preview}<aside class="side">${wfChoice("subtitleTab", ["校對", "翻譯", "樣式"])}${body}<p class="note">${cues.length} 行字幕 · 時間與文字會隨草稿保存。</p>${wfButton("燒錄字幕成新影片", "subtitle-burn", !cues.length || !files.src || !String(files.src.type).startsWith("video/"))}</aside></div>`,
  );
}
function toolSubtitleAfterRender() {
  const media = document.querySelector('[data-flow-media="src"]');
  if (!media) return;
  media.addEventListener("timeupdate", toolSubtitlePreview);
  media.addEventListener("loadedmetadata", toolSubtitlePreview);
  toolSubtitlePreview();
}
function toolSubtitlePreview() {
  if (tool !== "subtitle") return;
  const media = document.querySelector('[data-flow-media="src"]'),
    overlay = document.querySelector("[data-subtitle-overlay]");
  if (!media || !overlay) return;
  const time = media.currentTime,
    cues = values.subtitleCues || [],
    current = cues.find((cue) => cue.start <= time && cue.end > time);
  const clock = document.querySelector("[data-subtitle-clock]");
  if (clock)
    clock.textContent =
      toolSubtitleStamp(time) +
      " / " +
      (Number.isFinite(media.duration)
        ? toolSubtitleStamp(media.duration)
        : "…");
  document
    .querySelectorAll("[data-subtitle-row]")
    .forEach((row) =>
      row.classList.toggle("active", row.dataset.subtitleRow === current?.id),
    );
  overlay.hidden = !current;
  if (!current) return;
  const text = (language) =>
    language === "原文"
      ? current.text
      : values.subtitleTranslations?.[language]?.[current.id] || "";
  overlay.replaceChildren();
  const first = document.createElement("span");
  first.textContent = text(values.subtitleFirstLine);
  overlay.append(first);
  if (
    values.subtitleSecondLine !== "不顯示" &&
    values.subtitleSecondLine !== values.subtitleFirstLine
  ) {
    const second = document.createElement("small");
    second.textContent = text(values.subtitleSecondLine);
    overlay.append(second);
  }
  const style = values.subtitleStyle;
  overlay.style.color = values.subtitleColor;
  overlay.style.fontSize =
    Math.max(
      10,
      (media.getBoundingClientRect().height * Number(values.subtitleSize)) /
        1000,
    ) + "px";
  overlay.style.background =
    {
      白字灰底: "#666a",
      半透明底框: "#0007",
      黑底白字: "#000",
      白底黑字: "#fff",
    }[style] || "transparent";
  if (style === "白底黑字") overlay.style.color = "#111";
  if (style === "黃字黑邊") overlay.style.color = "#facc15";
  overlay.style.textShadow =
    style === "白字陰影"
      ? "2px 2px 3px #000"
      : ["白字黑邊", "黃字黑邊"].includes(style)
        ? "-1px 0 #000,1px 0 #000,0 -1px #000,0 1px #000"
        : "none";
  const mediaBox = media.getBoundingClientRect(),
    parent = overlay.parentElement.getBoundingClientRect();
  overlay.style.left = mediaBox.left - parent.left + mediaBox.width / 2 + "px";
  overlay.style.width = mediaBox.width * 0.9 + "px";
  overlay.style.top =
    mediaBox.top -
    parent.top +
    mediaBox.height *
      { 下方: 0.82, 中下: 0.68, 中間: 0.46, 上方: 0.12 }[
        values.subtitlePosition
      ] +
    "px";
}
let toolSubtitlePending = false;
document.addEventListener("input", (event) => {
  const index = event.target.dataset.subtitleText;
  if (index !== undefined && values.subtitleCues?.[index]) {
    const cue = values.subtitleCues[index];
    if (
      values.subtitleFirstLine !== "原文" &&
      values.subtitleTranslations?.[values.subtitleFirstLine]
    )
      values.subtitleTranslations[values.subtitleFirstLine][cue.id] =
        event.target.value;
    else cue.text = event.target.value;
    toolSubtitleCommit();
    toolSubtitlePreview();
  }
  if (
    tool === "subtitle" &&
    ["subtitleColor", "subtitleSize"].includes(event.target.dataset.key)
  ) {
    values[event.target.dataset.key] = event.target.value;
    toolSubtitlePreview();
  }
});
document.addEventListener("change", (event) => {
  const index =
    event.target.dataset.subtitleStart ?? event.target.dataset.subtitleEnd;
  if (index === undefined) return;
  const cue = values.subtitleCues?.[index];
  if (!cue) return;
  try {
    const time = toolSubtitleTime(event.target.value),
      key = event.target.dataset.subtitleStart !== undefined ? "start" : "end";
    if (key === "start" ? time >= cue.end : time <= cue.start)
      throw Error("開始時間需早於結束時間");
    cue[key] = time;
    toolSubtitleCommit();
    toolSubtitlePreview();
  } catch (error) {
    event.target.value = toolSubtitleStamp(
      event.target.dataset.subtitleStart !== undefined ? cue.start : cue.end,
    );
    VideoWorkbench.reportError(error);
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest(
    "[data-flow-action],[data-subtitle-seek],[data-subtitle-delete],[data-subtitle-shift],[data-subtitle-color]",
  );
  if (!button || tool !== "subtitle") return;
  try {
    const cues = values.subtitleCues || [],
      media = document.querySelector('[data-flow-media="src"]'),
      action = button.dataset.flowAction;
    if (button.dataset.subtitleColor) {
      values.subtitleColor = button.dataset.subtitleColor;
      saveDraft();
      render();
    }
    if (button.dataset.subtitleSeek !== undefined) {
      if (media) {
        media.currentTime = cues[+button.dataset.subtitleSeek].start;
        await media.play();
      }
    }
    if (button.dataset.subtitleDelete !== undefined) {
      cues.splice(+button.dataset.subtitleDelete, 1);
      toolSubtitleCommit();
      render();
    }
    if (button.dataset.subtitleShift !== undefined) {
      const cue = cues[+button.dataset.subtitleShift],
        delta = Math.max(-cue.start, Number(button.dataset.delta));
      cue.start += delta;
      cue.end += delta;
      toolSubtitleCommit();
      render();
    }
    if (action === "subtitle-back" || action === "subtitle-forward") {
      if (media)
        media.currentTime = Math.max(
          0,
          Math.min(
            media.duration || 0,
            media.currentTime + (action === "subtitle-back" ? -0.1 : 0.1),
          ),
        );
    }
    if (action === "subtitle-import-text") {
      const parsed = toolSubtitleParse(values.subtitleText);
      values.subtitleCues = parsed;
      values.subtitleTranslations = {};
      delete values.subtitleImportError;
      toolSubtitleCommit();
      render();
    }
    if (action === "subtitle-add") {
      const start = Math.max(
        0,
        Math.min(
          media?.currentTime || 0,
          Math.max(0, (media?.duration || 99999) - 0.1),
        ),
      );
      cues.push({
        id: crypto.randomUUID(),
        start,
        end: Math.min(start + 3, media?.duration || start + 3),
        text: "",
      });
      toolSubtitleCommit();
      render();
    }
    if (action === "subtitle-clear") {
      values.subtitleCues = [];
      values.subtitleTranslations = {};
      delete values.subtitleImportError;
      toolSubtitleCommit();
      render();
    }
    if (action?.startsWith("subtitle-download:")) {
      const format = action.split(":")[1],
        translated =
          values.subtitleFirstLine === "原文"
            ? null
            : values.subtitleTranslations[values.subtitleFirstLine];
      VideoWorkbench.download(
        "subtitles." + format,
        toolSubtitleSerialize(cues, format, translated),
        "text/plain;charset=utf-8",
      );
    }
    if (action === "subtitle-transcribe") {
      if (toolSubtitlePending) return;
      if (!files.src) throw Error("請先選取影片或音檔");
      if (files.src.duration > 1200) throw Error("字幕辨識單次最長 20 分鐘");
      const originalFile = files.src,
        originalText = values.subtitleText;
      toolSubtitlePending = true;
      button.disabled = true;
      try {
        const srt = await wfTranscribe(originalFile, values.subtitleLanguage, values.subtitleEngine);
        if (
          files.src !== originalFile ||
          values.subtitleText !== originalText
        ) {
          VideoWorkbench.notify("來源或字幕已改變，保留目前內容，請重新辨識。");
          return;
        }
        values.subtitleCues = toolSubtitleParse(srt);
        values.subtitleTranslations = {};
        delete values.subtitleImportError;
        toolSubtitleCommit();
        if (tool === "subtitle") render();
      } finally {
        toolSubtitlePending = false;
        if (button.isConnected) button.disabled = false;
      }
    }
    if (action?.startsWith("subtitle-translate:")) {
      if (toolSubtitlePending) return;
      const language = action.slice(19),
        snapshot = structuredClone(cues),
        fingerprint = JSON.stringify(cues);
      const translated = {};
      toolSubtitlePending = true;
      button.disabled = true;
      try {
        let batch = [],
          size = 0;
        const send = async () => {
          if (!batch.length) return;
          const result = await VideoWorkbench.request("/tools/subtitles/translate", {
            language,
            cues: batch,
          });
          for (const cue of result.cues) translated[cue.id] = cue.text;
          batch = [];
          size = 0;
        };
        for (const cue of snapshot) {
          if (
            batch.length &&
            (size + cue.text.length > 1200 || batch.length >= 30)
          )
            await send();
          batch.push({ id: cue.id, text: cue.text });
          size += cue.text.length;
        }
        await send();
        if (fingerprint !== JSON.stringify(values.subtitleCues)) {
          VideoWorkbench.notify("字幕內容已改變，保留目前草稿，請重新翻譯。");
          return;
        }
        values.subtitleTranslations[language] = translated;
        values.subtitleFirstLine = language;
        saveDraft();
        if (tool === "subtitle") render();
      } finally {
        toolSubtitlePending = false;
        if (button.isConnected) button.disabled = false;
      }
    }
    if (action === "subtitle-burn") {
      if (!files.src || !String(files.src.type).startsWith("video/"))
        throw Error("燒錄字幕需要影片");
      const selected = cues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        text:
          (values.subtitleFirstLine === "原文"
            ? cue.text
            : values.subtitleTranslations[values.subtitleFirstLine]?.[cue.id] ||
              "") +
          (values.subtitleSecondLine !== "不顯示" &&
          values.subtitleSecondLine !== values.subtitleFirstLine
            ? "\n" +
              (values.subtitleSecondLine === "原文"
                ? cue.text
                : values.subtitleTranslations[values.subtitleSecondLine]?.[
                    cue.id
                  ] || "")
            : ""),
      }));
      const job = await VideoWorkbench.generations.create({
        type: "video",
        operation: "subtitle-burn",
        references: { src: files.src },
        settings: {
          cues: selected,
          style: values.subtitleStyle,
          color: values.subtitleColor,
          size: Number(values.subtitleSize),
          position: values.subtitlePosition,
          width: files.src.width,
          height: files.src.height,
        },
      });
      VideoWorkbench.showJob(job);
    }
  } catch (error) {
    VideoWorkbench.reportError(error);
  }
});

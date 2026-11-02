// Projects live independently of storyboard designs and tool drafts.
const ed = {
  ready: false,
  loading: null,
  projects: [],
  current: null,
  selected: null,
  pane: "素材",
  time: 0,
  zoom: 35,
  playing: false,
  undo: [],
  redo: [],
  queue: Promise.resolve(),
};
const edRatios = {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1080, 1080],
    "4:5": [1080, 1350],
    "4:3": [1440, 1080],
  },
  edTracks = ["V1", "V2", "T", "A1", "A2"];
const edFilters = [
  "原始",
  "鮮豔",
  "復古",
  "黑白",
  "暖色",
  "冷色",
  "電影感",
  "底片",
  "黃金時刻",
  "憂鬱",
  "清新",
  "賽博霓虹",
  "黑色電影",
  "美食",
  "人像",
  "冷冽",
];
const edProject = () => ed.projects.find((p) => p.id === ed.current),
  edClip = () => edProject()?.clips.find((c) => c.id === ed.selected),
  edEnd = () =>
    Math.max(3, ...(edProject()?.clips || []).map((c) => c.start + c.duration));
function edNormalizeProject(project) {
  return { ...project, clips: (project.clips || []).map(clip => {
    const positioned = clip.track === 'V2' || clip.kind === 'text';
    const defaults = { start: 0, duration: 3, sourceStart: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: positioned ? clip.track === 'V2' ? 80 : 50 : 0, y: positioned ? 80 : 0, rotation: 0, width: 25, fontSize: 36 };
    const normalized = { font: '思源黑體', color: '#ffffff', align: '置中', animation: '無', ...clip };
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = clip[key];
      normalized[key] = value == null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value);
    }
    normalized.speed = Math.max(.25, Math.min(4, normalized.speed));
    normalized.volume = Math.max(0, Math.min(4, normalized.volume));
    return normalized;
  }) };
}
function edSave() {
  const copy = structuredClone(ed.projects);
  ed.queue = ed.queue
    .catch(() => {})
    .then(() => SeedStar.preferences.set("tools.editor.projects", copy));
  ed.queue.catch(SeedStar.reportError);
  return ed.queue;
}
function edCheckpoint() {
  if (!edProject()) return;
  ed.undo.push(structuredClone(edProject()));
  if (ed.undo.length > 40) ed.undo.shift();
  ed.redo = [];
}
function edStop() {
  ed.playing = false;
  cancelAnimationFrame(ed.raf);
  document.querySelectorAll("[data-ed-media]").forEach((m) => m.pause());
}
function edRender() {
  edStop();
  render();
}
function edButton(title, action, disabled = false) {
  return `<button type="button" class="btn small" data-ed-action="${esc(action)}" ${disabled ? "disabled" : ""}>${esc(title)}</button>`;
}
function edInput(key, title, value, type = "number", attrs = "") {
  return `<label>${esc(title)}<input class="text-input" aria-label="${esc(title)}" data-ed-field="${key}" type="${type}" value="${esc(value ?? "")}" ${attrs}></label>`;
}
function edSelect(key, title, value, options) {
  return `<label>${esc(title)}<select class="text-input" aria-label="${esc(title)}" data-ed-field="${key}">${options.map((o) => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
}
function toolEditorScreen(t) {
  const p = edProject(),
    c = edClip();
  if (!ed.ready) return wfWrap(t, "<p>讀取剪輯專案…</p>");
  if (!p)
    return wfWrap(
      t,
      `<h3>剪輯專案</h3><p class="note">保留原始素材；時間軸、文字與音軌獨立儲存。</p>${edButton("新增專案", "new")}<div class="flow-choices">${ed.projects.map((p) => edButton(p.title + " · " + p.ratio, "open:" + p.id)).join("")}</div>`,
    );
  let pane = "";
  if (ed.pane === "素材")
    pane = `<h3>素材</h3>${edButton("從素材庫加入", "library")}${edButton("上傳素材", "upload")}<p class="note">影片／圖片加入 V1，音訊加入 A1。可在屬性更換軌道。</p>${p.assets.map((a) => `<div class="editor-asset">${esc(a.name || "素材")}${edButton("加入時間軸", "asset:" + a.id)}</div>`).join("")}`;
  if (ed.pane === "文字")
    pane = `<h3>文字</h3>${["空白文字", "主標題", "副標題", "內文", "重點提示", "金句", "步驟", "章節", "下標", "開場", "結尾", "價格", "標籤", "品牌", "呼籲行動"].map((title, i) => edButton(title, "text:" + i)).join("")}`;
  if (ed.pane === "音訊")
    pane = `<h3>音訊</h3>${edButton("選擇音訊", "library:audio")}${edButton("上傳音訊", "upload:audio")}<p class="note">A1／A2 可獨立安排時間、音量、淡入淡出與音量均衡。</p>`;
  if (ed.pane === "轉場")
    pane = `<h3>主視訊轉場</h3><p class="note">選取兩段相鄰 V1 中的後一段；不改變總時間。</p>${c?.track === "V1" ? edSelect("transition", "轉場", c.transition || "無", ["無", "融接", "淡入淡出", "向左擦除", "向右擦除", "圓形裁切"]) + edInput("transitionDuration", "轉場秒數", c.transitionDuration || 0.5, "number", 'min="0.1" max="2" step="0.1"') + edSelect("transitionCurve", "轉場曲線", c.transitionCurve || "線性", ["線性", "平滑", "加速"]) : "<p>請先選取 V1 片段。</p>"}`;
  if (ed.pane === "特效")
    pane = `<h3>特效</h3>${edSelect("project:filter", "專案濾鏡", p.filter || "原始", edFilters)}${c ? edSelect("filter", "片段濾鏡", c.filter || "原始", edFilters) + edSelect("mask", "片段遮罩", c.mask || "無", ["無", "圓形", "圓角矩形", "三角形"]) + edInput("grain", "顆粒強度", c.grain || 0, "number", 'min="0" max="1" step="0.1"') : ""}<p class="note">光漏、鏡頭震動與關鍵影格尚未接入。</p>`;
  if (ed.pane === "貼圖")
    pane = `<h3>貼圖／品牌圖</h3>${edButton("選擇圖片", "library:image")}${edButton("上傳透明 PNG", "upload:image")}<p class="note">以 V2 疊加圖片，可設定時間、位置、大小與透明度。</p>`;
  if (ed.pane === "字幕")
    pane = `<h3>字幕</h3>${edButton("匯入 SRT／VTT", "subtitles-import")}${edButton("下載 SRT", "subtitles-download")}${edButton("前往字幕工具", "subtitles-tool")}<p class="note">每行字幕為 T 軌片段，可逐行修改。辨識與翻譯請至字幕工具處理後匯入。</p>`;
  if (ed.pane === "剪贅字")
    pane =
      "<h3>剪贅字</h3><p>自動剪贅字需要逐字時間戳服務，目前尚未接入。可分割後使用「刪除並前移」手動剪除。</p>";
  let inspector = "<h3>片段屬性</h3><p>請點選時間軸片段。</p>";
  if (c) {
    inspector =
      "<h3>片段屬性</h3>" +
      edSelect(
        "track",
        "軌道",
        c.track,
        c.kind === "text"
          ? ["T"]
          : c.kind === "audio"
            ? ["A1", "A2"]
            : ["V1", "V2"],
      ) +
      edInput(
        "start",
        "時間軸起點（秒）",
        c.start,
        "number",
        'min="0" step="0.1"',
      ) +
      edInput(
        "duration",
        "片段長度（秒）",
        c.duration,
        "number",
        'min="0.05" step="0.1"',
      );
    if (["video", "audio"].includes(c.kind))
      inspector +=
        edInput(
          "sourceStart",
          "素材起點（秒）",
          c.sourceStart,
          "number",
          'min="0" step="0.1"',
        ) +
        edInput(
          "speed",
          "播放速度",
          c.speed,
          "number",
          'min="0.25" max="4" step="0.25"',
        ) +
        edInput(
          "volume",
          "片段音量",
          c.volume,
          "number",
          'min="0" max="4" step="0.1"',
        ) +
        edButton(c.muted ? "取消片段靜音" : "片段靜音", "toggle:muted") +
        edInput(
          "fadeIn",
          "音訊淡入（秒）",
          c.fadeIn,
          "number",
          'min="0" step="0.1"',
        ) +
        edInput(
          "fadeOut",
          "音訊淡出（秒）",
          c.fadeOut,
          "number",
          'min="0" step="0.1"',
        );
    if (c.kind === "text")
      inspector +=
        `<label>文字內容<textarea data-ed-field="text" aria-label="文字內容" maxlength="4000">${esc(c.text)}</textarea></label>` +
        edSelect("font", "字型", c.font, [
          "思源黑體",
          "思源宋體",
          "Arial",
          "Georgia",
          "等寬字",
        ]) +
        edInput("fontSize", "字級", c.fontSize, "number", 'min="8" max="300"') +
        edSelect("align", "文字對齊", c.align, ["靠左", "置中", "靠右"]) +
        edInput("color", "文字顏色", c.color, "color") +
        edButton(c.bold ? "取消粗體" : "粗體", "toggle:bold") +
        edButton(c.italic ? "取消斜體" : "斜體", "toggle:italic") +
        edButton(
          c.backgroundColor ? "移除文字底色" : "加上文字底色",
          "text-background",
        ) +
        (c.backgroundColor
          ? edInput("backgroundColor", "文字底色", c.backgroundColor, "color")
          : "") +
        edSelect("animation", "文字動畫", c.animation, [
          "無",
          "淡入淡出",
          "彈出",
          "逐字顯示",
        ]);
    if (c.kind !== "audio")
      inspector +=
        edInput(
          "x",
          c.track === "V1" ? "水平偏移（px）" : "水平位置（%）",
          c.x,
        ) +
        edInput(
          "y",
          c.track === "V1" ? "垂直偏移（px）" : "垂直位置（%）",
          c.y,
        ) +
        edInput(
          "scale",
          "縮放",
          c.scale,
          "number",
          'min="0.1" max="5" step="0.1"',
        ) +
        edInput(
          "rotation",
          "旋轉角度",
          c.rotation,
          "number",
          'min="-360" max="360"',
        ) +
        edInput(
          "opacity",
          "不透明度",
          c.opacity,
          "number",
          'min="0" max="1" step="0.1"',
        ) +
        (c.track === "V2"
          ? edInput(
              "width",
              "疊加寬度（%）",
              c.width,
              "number",
              'min="1" max="100"',
            )
          : c.track === "V1"
            ? edSelect("background", "背景", c.background || "黑色", [
                "黑色",
                "模糊",
                "純色",
              ]) +
              (c.background === "純色"
                ? edInput(
                    "backgroundColor",
                    "背景顏色",
                    c.backgroundColor || "#000000",
                    "color",
                  )
                : "")
            : "");
  }
  const [w, h] = edRatios[p.ratio];
  return wfWrap(
    t,
    `<div class="editor-heading">${edButton("所有專案", "projects")}${edInput("project:title", "專案名稱", p.title, "text", 'maxlength="100"')}${edSelect("project:ratio", "輸出比例", p.ratio, Object.keys(edRatios))}${edButton("復原", "undo", !ed.undo.length)}${edButton("重做", "redo", !ed.redo.length)}${edButton("匯出影片", "export", !p.clips.length)}</div><div class="editor-workspace"><nav class="editor-panes">${["素材", "文字", "音訊", "轉場", "特效", "貼圖", "字幕", "剪贅字"].map((title) => `<button class="btn ${ed.pane === title ? "selected" : ""}" data-ed-pane="${title}" aria-pressed="${ed.pane === title}">${title}</button>`).join("")}</nav><aside class="editor-library">${pane}</aside><section class="editor-player"><div class="editor-stage" data-ed-stage style="aspect-ratio:${w}/${h};width:min(100%,${(430 * w) / h}px)"></div><div class="row">${edButton("播放／暫停", "play")}<span data-ed-clock></span><input type="range" aria-label="播放位置" data-ed-seek min="0" max="${edEnd()}" step="0.01" value="${ed.time}"></div><p class="note">預覽呈現片段、文字與基本變形；轉場、濾鏡與文字動畫以匯出影片為準。</p></section><aside class="editor-inspector">${inspector}</aside></div><div class="row editor-toolbar">${edButton("分割", "split", !c)}${edButton("複製", "duplicate", !c)}${edButton("刪除", "delete", !c)}${edButton("刪除並前移", "ripple", !c)}${edButton("主軌吸附排列", "compact")}${edButton("新增標記", "marker")}<label>時間軸縮放<input type="range" min="10" max="100" value="${ed.zoom}" data-ed-zoom></label></div><div class="editor-timeline">${edTracks
      .map(
        (id) =>
          `<div class="editor-track"><div class="editor-track-name"><b>${id}</b>${edButton(p.tracks[id].hidden ? "顯示" : "隱藏", "track-hidden:" + id)}${edButton(p.tracks[id].muted ? "開聲" : "靜音", "track-muted:" + id)}${["A1", "A2"].includes(id) ? edButton(p.tracks[id].normalize ? "取消均衡" : "均衡", "track-normalize:" + id) : ""}</div><div class="editor-track-lane" data-ed-lane="${id}" style="width:${Math.max(600, edEnd() * ed.zoom + 100)}px">${p.clips
            .filter((c) => c.track === id)
            .map(
              (c) =>
                `<button class="editor-clip ${ed.selected === c.id ? "selected" : ""}" data-ed-clip="${c.id}" style="left:${c.start * ed.zoom}px;width:${Math.max(8, c.duration * ed.zoom)}px" title="${esc(c.text || c.asset?.name || "片段")} · ${c.start.toFixed(2)}s / ${c.duration.toFixed(2)}s"><span>${esc(c.text || c.asset?.name || "片段")}</span><i data-ed-trim title="拖拉調整片段長度"></i></button>`,
            )
            .join(
              "",
            )}<div class="editor-playhead" style="left:${ed.time * ed.zoom}px"></div>${(p.markers || []).map((time) => `<button class="editor-marker" data-ed-marker="${time}" style="left:${time * ed.zoom}px" title="跳至 ${time.toFixed(2)} 秒">◆</button>`).join("")}</div></div>`,
      )
      .join("")}</div>`,
  );
}
async function edProbe(asset) {
  const kind = SeedStar.mediaKind(asset);
  if (kind === "image") return { ...asset, kind, duration: 3 };
  const m = document.createElement(kind === "audio" ? "audio" : "video");
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("素材時長讀取逾時")), 15000);
      m.onloadedmetadata = () => {
        clearTimeout(timer);
        if (!Number.isFinite(m.duration) || m.duration <= 0)
          reject(Error("素材時長無效"));
        else
          resolve({
            ...asset,
            kind,
            duration: m.duration,
            width: m.videoWidth,
            height: m.videoHeight,
          });
      };
      m.onerror = () => {
        clearTimeout(timer);
        reject(Error("素材無法讀取"));
      };
      m.preload = "metadata";
      m.src = asset.previewUrl || asset.url;
    });
  } finally {
    m.removeAttribute("src");
    m.load();
  }
}
async function edAdd(asset, track) {
  const p = edProject();
  if (!p) return;
  const a = await edProbe(asset);
  if (edProject() !== p) return;
  edCheckpoint();
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  track = track || (a.kind === "audio" ? "A1" : "V1");
  const start = Math.max(
      0,
      ...p.clips
        .filter((c) => c.track === track)
        .map((c) => c.start + c.duration),
    ),
    c = {
      id: crypto.randomUUID(),
      kind: a.kind,
      asset: a,
      track,
      start,
      duration: Math.min(3600, a.duration),
      sourceStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 1,
      x: track === "V2" ? 80 : 0,
      y: track === "V2" ? 80 : 0,
      rotation: 0,
      width: 25,
    };
  p.clips.push(c);
  ed.selected = c.id;
  ed.time = start;
  await edSave();
  edRender();
}
function edValidate(c) {
  for (const key of [
    "start",
    "duration",
    "sourceStart",
    "speed",
    "volume",
    "fadeIn",
    "fadeOut",
    "opacity",
    "scale",
    "x",
    "y",
    "rotation",
    "width",
    "fontSize",
    "grain",
    "transitionDuration",
  ])
    if (c[key] !== undefined && !Number.isFinite(Number(c[key])))
      throw Error("請輸入有效數字");
  if (
    c.start < 0 ||
    c.duration < 0.05 ||
    c.start + c.duration > 3600 ||
    c.sourceStart < 0 ||
    c.speed < 0.25 ||
    c.speed > 4 ||
    c.volume < 0 ||
    c.volume > 4 ||
    c.opacity < 0 ||
    c.opacity > 1 ||
    c.scale < 0.1 ||
    c.scale > 5
  )
    throw Error("片段設定超出範圍");
  if (
    !["image", "text"].includes(c.kind) &&
    c.asset?.duration &&
    c.sourceStart + c.duration * c.speed > c.asset.duration + 0.05
  )
    throw Error("片段超出素材時長，請調整片段長度或素材起點");
  if (
    c.fadeIn < 0 ||
    c.fadeOut < 0 ||
    c.fadeIn > Math.min(10, c.duration / 2) ||
    c.fadeOut > Math.min(10, c.duration / 2)
  )
    throw Error("淡入淡出最長 10 秒，且不超過片段一半");
}
function edPaint() {
  const p = edProject(),
    stage = document.querySelector("[data-ed-stage]");
  if (!p || !stage) {
    edStop();
    return;
  }
  const active = p.clips.filter(
      (c) =>
        ed.time >= c.start &&
        ed.time < c.start + c.duration &&
        !c.hidden &&
        !p.tracks[c.track]?.hidden,
    ),
    ids = new Set(active.map((c) => c.id));
  stage.querySelectorAll("[data-ed-layer]").forEach((el) => {
    if (!ids.has(el.dataset.edLayer)) {
      el.pause?.();
      el.remove();
    }
  });
  for (const c of active.sort(
    (a, b) => edTracks.indexOf(a.track) - edTracks.indexOf(b.track),
  )) {
    let el = stage.querySelector(`[data-ed-layer="${c.id}"]`);
    if (!el) {
      el = document.createElement(
        c.kind === "text"
          ? "div"
          : c.kind === "image"
            ? "img"
            : c.kind === "audio"
              ? "audio"
              : "video",
      );
      el.dataset.edLayer = c.id;
      if (["audio", "video"].includes(c.kind)) el.dataset.edMedia = "";
      if (c.kind !== "text") el.src = c.asset.previewUrl || c.asset.url;
      stage.append(el);
    }
    if (c.kind === "text") {
      el.textContent = c.text;
      el.style.cssText = `position:absolute;left:${c.x}%;top:${c.y}%;transform:translate(-50%,-50%) rotate(${c.rotation}deg) scale(${c.scale});font-size:${(c.fontSize * stage.clientWidth) / edRatios[p.ratio][0]}px;color:${c.color};font-family:${{ 思源黑體: "sans-serif", 思源宋體: "serif", 等寬字: "monospace" }[c.font] || c.font};font-weight:${c.bold ? "bold" : "normal"};font-style:${c.italic ? "italic" : "normal"};text-align:${c.align === "靠左" ? "left" : c.align === "靠右" ? "right" : "center"};background:${c.backgroundColor || "transparent"};opacity:${c.opacity};white-space:pre-wrap;max-width:95%;z-index:3`;
    } else if (c.kind !== "audio") {
      el.style.cssText =
        c.track === "V2"
          ? `position:absolute;width:${c.width * c.scale}%;left:${c.x * (1 - (c.width * c.scale) / 100)}%;top:${c.y}%;transform:rotate(${c.rotation}deg);opacity:${c.opacity};z-index:2`
          : `position:absolute;width:100%;height:100%;object-fit:contain;transform:translate(${(c.x * stage.clientWidth) / edRatios[p.ratio][0]}px,${(c.y * stage.clientHeight) / edRatios[p.ratio][1]}px) rotate(${c.rotation}deg) scale(${c.scale});opacity:${c.opacity};z-index:1;background:${c.background === "純色" ? c.backgroundColor || "#000" : "#000"}`;
    }
    if (["audio", "video"].includes(c.kind)) {
      const target = c.sourceStart + (ed.time - c.start) * c.speed;
      if (Math.abs(el.currentTime - target) > 0.2)
        try {
          el.currentTime = target;
        } catch (_) {}
      el.playbackRate = c.speed;
      el.muted = !!(c.muted || p.tracks[c.track]?.muted);
      el.volume = Math.max(0, Math.min(1, Number.isFinite(c.volume) ? c.volume : 1));
      if (ed.playing) el.play().catch(() => {});
      else el.pause();
    }
  }
  const clock = document.querySelector("[data-ed-clock]"),
    seek = document.querySelector("[data-ed-seek]");
  if (clock)
    clock.textContent = ed.time.toFixed(2) + " / " + edEnd().toFixed(2) + " 秒";
  if (seek) seek.value = ed.time;
  document
    .querySelectorAll(".editor-playhead")
    .forEach((el) => (el.style.left = ed.time * ed.zoom + "px"));
}
function toolEditorAfterRender() {
  if (!ed.ready && !ed.loading)
    ed.loading = SeedStar.preferences
      .get("tools.editor.projects", [])
      .then((rows) => {
        ed.projects = Array.isArray(rows) ? rows.map(edNormalizeProject) : [];
        ed.ready = true;
        if (tool === "edit") render();
      })
      .catch(SeedStar.reportError)
      .finally(() => (ed.loading = null));
  edPaint();
}
function edDialog(content) {
  const d = document.createElement("dialog");
  d.className = "editor-dialog";
  d.innerHTML = SeedStar.sanitize(
    content + '<button class="btn" type="button" data-ed-close>關閉</button>',
  );
  document.body.append(d);
  d.querySelector("[data-ed-close]").onclick = () => d.close();
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
  d.showModal();
  return d;
}
function edText(text, start = ed.time, duration = 3) {
  return {
    id: crypto.randomUUID(),
    track: "T",
    kind: "text",
    start,
    duration,
    text,
    font: "思源黑體",
    fontSize: 52,
    align: "置中",
    color: "#ffffff",
    animation: "無",
    x: 50,
    y: 80,
    scale: 1,
    opacity: 1,
    rotation: 0,
    speed: 1,
    sourceStart: 0,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}
async function edAction(action) {
  const p = edProject(),
    c = edClip();
  if (action === "new") {
    const d = edDialog(
      '<form><h3>新增剪輯專案</h3><label>專案標題<input data-ed-create-title class="text-input" aria-label="專案標題" maxlength="100" value="未命名專案" required></label><label>影片比例<select data-ed-create-ratio class="text-input" aria-label="影片比例">' +
        Object.keys(edRatios)
          .map((r) => "<option>" + r + "</option>")
          .join("") +
        '</select></label><button class="btn primary" type="submit">建立專案</button></form>',
    );
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const title = d.querySelector("[data-ed-create-title]").value,
        ratio = d.querySelector("[data-ed-create-ratio]").value,
        id = crypto.randomUUID();
      ed.projects.push({
        id,
        title: String(title).trim() || "未命名專案",
        ratio,
        clips: [],
        assets: [],
        tracks: Object.fromEntries(edTracks.map((id) => [id, { volume: 1 }])),
        markers: [],
      });
      ed.current = id;
      ed.selected = null;
      ed.time = 0;
      ed.undo = [];
      ed.redo = [];
      await edSave();
      d.close();
      edRender();
    };
    return;
  }
  if (action.startsWith("open:")) {
    ed.current = action.slice(5);
    ed.selected = null;
    ed.time = 0;
    ed.undo = [];
    ed.redo = [];
    edRender();
    return;
  }
  if (action === "projects") {
    await edSave();
    ed.current = null;
    edRender();
    return;
  }
  if (!p) return;
  if (action === "play") {
    if (ed.playing) {
      edStop();
      return;
    }
    if (ed.time >= edEnd()) ed.time = 0;
    ed.playing = true;
    let previous = performance.now();
    const tick = (now) => {
      if (!ed.playing || tool !== "edit") {
        edStop();
        return;
      }
      ed.time = Math.min(edEnd(), ed.time + (now - previous) / 1000);
      previous = now;
      edPaint();
      if (ed.time >= edEnd()) edStop();
      else ed.raf = requestAnimationFrame(tick);
    };
    ed.raf = requestAnimationFrame(tick);
    return;
  }
  if (action.startsWith("library")) {
    const kind = action.split(":")[1],
      rows = await SeedStar.pickAssets({ kind: kind || 'all' });
    if (rows[0] && edProject() === p)
      await edAdd(rows[0], kind === "image" ? "V2" : undefined);
    return;
  }
  if (action.startsWith("upload")) {
    const kind = action.split(":")[1],
      input = document.createElement("input");
    input.type = "file";
    input.accept =
      kind === "image"
        ? "image/*"
        : kind === "audio"
          ? "audio/*"
          : ".mov,.mp4,.m4v,.webm,video/*,image/*,audio/*";
    input.onchange = async () => {
      try {
        if (input.files?.[0]) {
          const a = await SeedStar.uploadAsset(input.files[0]);
          if (edProject() === p)
            await edAdd(a, kind === "image" ? "V2" : undefined);
        }
      } catch (e) {
        SeedStar.reportError(e);
      }
    };
    input.click();
    return;
  }
  if (action.startsWith("asset:")) {
    const a = p.assets.find((a) => String(a.id) === action.slice(6));
    if (a) await edAdd(a);
    return;
  }
  if (action.startsWith("text:")) {
    edCheckpoint();
    const i = Number(action.slice(5)),
      c = edText(
        [
          "在這裡輸入文字",
          "主標題",
          "副標題",
          "說明文字",
          "重點提示",
          "值得記住的一句話",
          "步驟 1",
          "第一章",
          "內容說明",
          "歡迎觀看",
          "謝謝觀看",
          "限時優惠",
          "精選",
          "品牌名稱",
          "立即了解",
        ][i],
      );
    if (i === 1) {
      c.fontSize = 96;
      c.bold = true;
      c.y = 50;
    }
    p.clips.push(c);
    ed.selected = c.id;
    await edSave();
    edRender();
    return;
  }
  if (action === "undo" || action === "redo") {
    const from = action === "undo" ? ed.undo : ed.redo,
      to = action === "undo" ? ed.redo : ed.undo;
    if (from.length) {
      to.push(structuredClone(p));
      ed.projects[ed.projects.indexOf(p)] = from.pop();
      await edSave();
      edRender();
    }
    return;
  }
  if (action === "export") {
    const d = edDialog(
      "<h3>匯出影片</h3><p>" +
        esc(p.ratio) +
        ' · MP4 · 30fps</p><label>畫質<select class="text-input" data-ed-quality><option value="1080p">1080P</option><option value="720p">720P</option></select></label><button class="btn primary" data-ed-export>開始匯出</button>',
    );
    d.querySelector("[data-ed-export]").onclick = async (e) => {
      e.target.disabled = true;
      try {
        p.clips.forEach(edValidate);
        const job = await SeedStar.generations.create({
          type: "video",
          operation: "editor-export",
          settings: {
            quality: d.querySelector("[data-ed-quality]").value,
            project: structuredClone(p),
          },
        });
        d.close();
        SeedStar.showJob(job);
      } catch (err) {
        SeedStar.reportError(err);
        e.target.disabled = false;
      }
    };
    return;
  }
  if (action === "subtitles-tool") {
    tool = "subtitle";
    restoreToolDraft();
    setToolHash("#subtitle");
    edRender();
    return;
  }
  if (action === "subtitles-import") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.vtt,text/plain";
    input.onchange = async () => {
      try {
        if (!input.files?.[0]) return;
        const cues = toolSubtitleParse(await input.files[0].text());
        edCheckpoint();
        for (const cue of cues)
          p.clips.push(edText(cue.text, cue.start, cue.end - cue.start));
        await edSave();
        edRender();
      } catch (e) {
        SeedStar.reportError(e);
      }
    };
    input.click();
    return;
  }
  if (action === "subtitles-download") {
    const cues = p.clips
        .filter((c) => c.kind === "text")
        .sort((a, b) => a.start - b.start)
        .map((c) => ({
          start: c.start,
          end: c.start + c.duration,
          text: c.text,
        })),
      blob = new Blob([toolSubtitleSerialize(cues, "srt")], {
        type: "text/plain;charset=utf-8",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = p.title + ".srt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    return;
  }
  edCheckpoint();
  if (action === "marker")
    p.markers = [
      ...new Set([...(p.markers || []), Number(ed.time.toFixed(2))]),
    ].sort((a, b) => a - b);
  if (action === "compact") {
    let t = 0;
    for (const row of p.clips
      .filter((c) => c.track === "V1")
      .sort((a, b) => a.start - b.start)) {
      row.start = t;
      t += row.duration;
    }
  }
  if (action.startsWith("track-")) {
    const [property, id] = action.slice(6).split(":");
    p.tracks[id][property] = !p.tracks[id][property];
  }
  if (c) {
    if (action.startsWith("toggle:")) c[action.slice(7)] = !c[action.slice(7)];
    if (action === "text-background")
      c.backgroundColor = c.backgroundColor ? null : "#000000";
    if (action === "duplicate") {
      const copy = {
        ...structuredClone(c),
        id: crypto.randomUUID(),
        start: c.start + c.duration,
      };
      p.clips.push(copy);
      ed.selected = copy.id;
    }
    if (action === "split") {
      const offset = ed.time - c.start;
      if (offset < 0.05 || offset > c.duration - 0.05)
        throw Error("播放頭需位於片段內部");
      const copy = {
        ...structuredClone(c),
        id: crypto.randomUUID(),
        start: ed.time,
        duration: c.duration - offset,
        sourceStart: c.sourceStart + offset * c.speed,
      };
      c.duration = offset;
      for (const row of [c, copy]) {
        row.fadeIn = Math.min(row.fadeIn, row.duration / 2);
        row.fadeOut = Math.min(row.fadeOut, row.duration / 2);
      }
      p.clips.push(copy);
      ed.selected = copy.id;
    }
    if (action === "delete" || action === "ripple") {
      p.clips = p.clips.filter((row) => row !== c);
      if (action === "ripple")
        p.clips
          .filter(
            (row) =>
              row.track === c.track && row.start >= c.start + c.duration - 0.01,
          )
          .forEach((row) => (row.start -= c.duration));
      ed.selected = null;
    }
  }
  await edSave();
  edRender();
}
document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-ed-action]"),
    pane = e.target.closest("[data-ed-pane]"),
    clip = e.target.closest("[data-ed-clip]"),
    marker = e.target.closest("[data-ed-marker]");
  if (action) edAction(action.dataset.edAction).catch(SeedStar.reportError);
  if (pane) {
    ed.pane = pane.dataset.edPane;
    edRender();
  }
  if (clip) {
    ed.selected = clip.dataset.edClip;
    edRender();
  }
  if (marker) {
    ed.time = Number(marker.dataset.edMarker);
    edPaint();
  }
});
document.addEventListener("change", (e) => {
  const key = e.target.dataset.edField,
    p = edProject(),
    c = edClip();
  if (!key || !p) return;
  edCheckpoint();
  try {
    const value =
      e.target.type === "number" ? Number(e.target.value) : e.target.value;
    if (key.startsWith("project:")) p[key.slice(8)] = value;
    else if (c) {
      const next = { ...c, [key]: value };
      if (key === "track") {
        next.x = value === "V1" ? 0 : 50;
        next.y = value === "V1" ? 0 : 50;
      }
      edValidate(next);
      Object.assign(c, next);
    }
    edSave();
    edRender();
  } catch (error) {
    ed.undo.pop();
    SeedStar.reportError(error);
    edRender();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-ed-seek]")) {
    edStop();
    ed.time = Number(e.target.value);
    edPaint();
  }
  if (e.target.matches("[data-ed-zoom]")) {
    ed.zoom = Number(e.target.value);
    edRender();
  }
});
document.addEventListener("pointerdown", (e) => {
  const button = e.target.closest("[data-ed-clip]");
  if (!button || e.button !== 0) return;
  const p = edProject(),
    c = p?.clips.find((c) => c.id === button.dataset.edClip);
  if (!c) return;
  edStop();
  const initial = structuredClone(c),
    startX = e.clientX,
    trim = !!e.target.closest("[data-ed-trim]");
  let moved = false;
  button.setPointerCapture(e.pointerId);
  button.onpointermove = (ev) => {
    if (Math.abs(ev.clientX - startX) < 4 && !moved) return;
    moved = true;
    const key = trim ? "duration" : "start",
      next = {
        ...initial,
        [key]: Math.max(
          trim ? 0.05 : 0,
          Math.round((initial[key] + (ev.clientX - startX) / ed.zoom) * 10) /
            10,
        ),
      };
    try {
      edValidate(next);
      button.style.left = next.start * ed.zoom + "px";
      button.style.width = next.duration * ed.zoom + "px";
      Object.assign(c, next);
    } catch (_) {}
  };
  button.onpointerup = () => {
    button.onpointermove = button.onpointerup = button.onpointercancel = null;
    if (moved) {
      const changed = structuredClone(c);
      Object.assign(c, initial);
      edCheckpoint();
      Object.assign(c, changed);
      edSave();
    }
    ed.selected = c.id;
    edRender();
  };
  button.onpointercancel = () => {
    Object.assign(c, initial);
    button.onpointermove = button.onpointerup = button.onpointercancel = null;
    edRender();
  };
});
document.addEventListener("keydown", (e) => {
  if (
    tool !== "edit" ||
    !edProject() ||
    e.target.closest("input,textarea,select,[contenteditable],dialog")
  )
    return;
  const action =
    e.code === "Space"
      ? "play"
      : e.key === "Delete"
        ? "delete"
        : e.key.toLowerCase() === "s"
          ? "split"
          : (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"
            ? e.shiftKey
              ? "redo"
              : "undo"
            : null;
  if (action) {
    e.preventDefault();
    edAction(action).catch(SeedStar.reportError);
  }
});

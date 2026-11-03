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
  // 片頭 pane (card P1): chosen template, its text fields, background image, last job and the library images.
  title: {
    templateId: null,
    fields: {},
    image: null,
    jobId: null,
    images: null,
    done: null,
  },
  // Card P2: 調色 before/after preview toggle, LUT assets in the library, export quality, delivery ratios.
  compare: false,
  luts: null,
  quality: "1080p",
  delivery: null,
};
const edRatios = {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1080, 1080],
    "4:5": [1080, 1350],
    "4:3": [1440, 1080],
  },
  // The five tracks every pre-P2 project had (and a new project starts with). Card P2: p.tracks is an ordered
  // array of {id, kind, name, hidden, muted, volume, normalize}; the rules live in shared/editor-model.js.
  edTracks = EditorModel.LEGACY;
const edTrack = (p, id) => p.tracks.find((t) => t.id === id),
  edMain = (p) => EditorModel.mainTrack(p.tracks),
  edOverlay = (p, id) => edTrack(p, id)?.kind === "video" && id !== edMain(p),
  edFirst = (p, kind) =>
    p.tracks.find(
      (t) => t.kind === kind && (kind !== "video" || t.id !== edMain(p)),
    )?.id;
// The track a new clip of this kind goes to; creates one when the project has none left (deleted).
function edTrackFor(p, kind) {
  const found = edFirst(p, kind);
  if (found) return found;
  if (!EditorModel.canAdd(p.tracks, kind))
    throw Error(EditorModel.NAME[kind] + "軌已達上限");
  const id = EditorModel.nextId(p.tracks, kind);
  p.tracks.push({
    id,
    kind,
    name: id,
    hidden: false,
    muted: false,
    volume: 1,
    normalize: false,
  });
  return id;
}
const edFrame = (p) => Timebase.toFrames(ed.time, p.timebase);
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
// Card M3 (plan §3 invariant 5): stored clip time = integer frames at the project timebase. The seconds fields
// are derived in memory for the UI and stripped on save; every clip time change goes through edTime.
const edTimeKeys = [
  ["start", "startFrame"],
  ["duration", "durationFrames"],
  ["sourceStart", "sourceStartFrame"],
];
function edTime(p, clip, patch = {}) {
  const tb = p.timebase;
  for (const [seconds, frames] of edTimeKeys) {
    const value =
      patch[frames] !== undefined
        ? Math.round(Number(patch[frames]))
        : patch[seconds] !== undefined
          ? Timebase.toFrames(patch[seconds], tb)
          : undefined;
    if (value !== undefined)
      clip[frames] = frames === "durationFrames" ? Math.max(1, value) : value;
  }
  for (const [seconds, frames] of edTimeKeys)
    clip[seconds] = Timebase.toSeconds(clip[frames], tb);
  return clip;
}
// Accepts an envelope or a bare project. Clips without frames (pre-M3 data, old job settings) convert once from
// seconds at the project's timebase, which for pre-M3 projects is the 30 fps they were exported at.
function edNormalizeProject(raw) {
  const { native: project, revision } = ProjectEnvelope.unwrap(raw),
    timebase = Timebase.find(project.timebase)
      ? Timebase.check(project.timebase)
      : { ...Timebase.DEFAULT },
    p = { ...project, timebase, revision };
  // Every track the screen draws must exist: pre-M3 and restored projects may carry tracks: {} (or none); pre-P2
  // projects carry the five-track object, which becomes the array V1, V2, T, A1, A2 with the same settings.
  p.assets ||= [];
  p.markers ||= [];
  p.tracks = EditorModel.normalizeTracks(project.tracks);
  const loudness = Number(project.output?.loudness);
  p.output = {
    ...(project.output || {}),
    loudness: Number.isFinite(loudness)
      ? Math.max(
          EditorModel.LOUDNESS.min,
          Math.min(EditorModel.LOUDNESS.max, loudness),
        )
      : EditorModel.LOUDNESS.neutral,
  };
  p.clips = (project.clips || []).map((clip) => {
    // A clip whose track is gone (or never existed) moves to a track of its kind instead of vanishing.
    const kind =
      clip.kind === "text" ? "text" : clip.kind === "audio" ? "audio" : "video";
    if (edTrack(p, clip.track)?.kind !== kind)
      clip = {
        ...clip,
        track: kind === "video" ? edMain(p) : edTrackFor(p, kind),
      };
    const overlay = edOverlay(p, clip.track),
      positioned = overlay || clip.kind === "text";
    const defaults = {
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 1,
      x: positioned ? (overlay ? 80 : 50) : 0,
      y: positioned ? 80 : 0,
      rotation: 0,
      width: 25,
      fontSize: 36,
    };
    const normalized = {
      font: "思源黑體",
      color: "#ffffff",
      align: "置中",
      animation: "無",
      ...clip,
    };
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = clip[key];
      normalized[key] =
        value == null || value === "" || !Number.isFinite(Number(value))
          ? fallback
          : Number(value);
    }
    normalized.speed = Math.max(0.25, Math.min(4, normalized.speed));
    normalized.volume = Math.max(0, Math.min(4, normalized.volume));
    // Card P2: transitions by their P2 names, length in frames (pre-P2: seconds and the old names).
    if (
      clip.transition !== undefined ||
      clip.transitionDuration !== undefined
    ) {
      normalized.transition =
        EditorModel.transitionName(clip.transition) ?? "無";
      normalized.transitionFrames = EditorModel.transitionFrames(
        clip,
        timebase,
      );
      delete normalized.transitionDuration;
    }
    try {
      normalized.volumeKeys = EditorModel.volumeKeys(clip.volumeKeys);
    } catch (_) {
      normalized.volumeKeys = [];
    }
    if (!normalized.volumeKeys.length) delete normalized.volumeKeys;
    const patch = {};
    for (const [seconds, frames] of edTimeKeys) {
      if (Number.isSafeInteger(clip[frames])) patch[frames] = clip[frames];
      else {
        const value = Number(clip[seconds]);
        patch[seconds] =
          clip[seconds] == null ||
          clip[seconds] === "" ||
          !Number.isFinite(value)
            ? { start: 0, duration: 3, sourceStart: 0 }[seconds]
            : value;
      }
    }
    return edTime(p, normalized, patch);
  });
  return p;
}
// The stored form: frames only, wrapped in the project envelope (invariant 10).
function edNative(p) {
  const { revision, ...native } = structuredClone(p);
  native.clips = native.clips.map((clip) => {
    const { start, duration, sourceStart, ...rest } = clip;
    return rest;
  });
  return native;
}
const edSaved = new Map();
// Saving is a PUT /state round trip (card M2): callers render first, then await the save, so an edit never
// waits on the network to appear; a failed save is reported, the edit stays on screen and in memory.
function edSave() {
  const copy = ed.projects.map((p) => {
    const native = edNative(p),
      json = JSON.stringify(native);
    // Counted from the last saved copy, not the in-memory object: an undo snapshot must not move it backwards.
    const saved = edSaved.get(p.id);
    p.revision = !saved
      ? p.revision || 0
      : saved.json === json
        ? saved.revision
        : saved.revision + 1;
    edSaved.set(p.id, { json, revision: p.revision });
    return ProjectEnvelope.wrap(native, { revision: p.revision || 0 });
  });
  ed.queue = ed.queue
    .catch(() => {})
    .then(() => VideoWorkbench.preferences.set("tools.editor.projects", copy));
  ed.queue.catch(VideoWorkbench.reportError);
  return ed.queue;
}
// First load after M3: the untouched pre-frames array is kept under its own key (never deleted), then converted.
// First load after P2 likewise keeps the projects that still carry the five-track object (pre-tracks key).
async function edLoadProjects() {
  const rows = await VideoWorkbench.preferences.get("tools.editor.projects", []),
    list = Array.isArray(rows) ? rows : [],
    legacy = list.some((row) => !ProjectEnvelope.isEnvelope(row)),
    legacyTracks = list.some((row) => {
      try {
        return !Array.isArray(ProjectEnvelope.unwrap(row).native?.tracks);
      } catch (_) {
        return false;
      }
    });
  const stamp = new Date().toISOString();
  if (legacy)
    await VideoWorkbench.preferences.set(
      "tools.editor.projects.pre-frames-" + stamp,
      list,
    );
  else if (legacyTracks)
    await VideoWorkbench.preferences.set(
      "tools.editor.projects.pre-tracks-" + stamp,
      list,
    );
  ed.projects = list.map(edNormalizeProject);
  // Saved-copy marks come from the stored rows, so a converted project counts as changed and is written back.
  for (const [i, p] of ed.projects.entries()) {
    const stored = ProjectEnvelope.isEnvelope(list[i]) ? list[i].native : null;
    edSaved.set(p.id, {
      json:
        legacyTracks && stored
          ? JSON.stringify(stored)
          : JSON.stringify(edNative(p)),
      revision: p.revision,
    });
  }
  ed.ready = true;
  if (legacy || legacyTracks) await edSave();
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
// Card P2: choices are visible buttons (aria-pressed), never <select>.
function edChoices(label, action, value, options, text = (o) => o) {
  return `<div class="flow-choices" role="group" aria-label="${esc(label)}">${options
    .map(
      (o) =>
        `<button type="button" class="btn small ${o === value ? "selected" : ""}" data-ed-action="${esc(action + ":" + o)}" aria-pressed="${o === value}">${esc(text(o))}</button>`,
    )
    .join("")}</div>`;
}
const edPrevious = (p, c) =>
  p.clips.find(
    (o) =>
      o !== c &&
      o.track === c.track &&
      o.kind !== "text" &&
      o.startFrame + o.durationFrames === c.startFrame,
  );
// What the transition at c's in point lacks: the export repeats the edge frame for any missing handle frames.
function edTransitionIssue(p, c) {
  const previous = edPrevious(p, c);
  if (!previous)
    return "前面沒有緊接（無空隙）的主軌片段，轉場無法輸出；可先按「主軌吸附排列」。";
  const frames = EditorModel.transitionFrames(c, p.timebase),
    before = Math.floor(frames / 2),
    after = frames - before,
    fps = Timebase.fps(p.timebase);
  if (
    frames - Math.floor(frames / 2) > c.durationFrames ||
    before > previous.durationFrames
  )
    return "轉場太長：片段長度需大於轉場的一半。";
  const shortIn = c.kind === "video" && c.sourceStartFrame / c.speed < before,
    shortOut =
      previous.kind === "video" &&
      previous.asset?.duration &&
      previous.sourceStart +
        ((previous.durationFrames + after) / fps) * previous.speed >
        previous.asset.duration;
  return shortIn || shortOut ? "素材不足，以靜止畫格補足" : "";
}
function edTransitionPane(p, c) {
  const head = `<h3>主影片軌轉場</h3><p class="note">選取主影片軌（${esc(edMain(p))}）上相鄰兩段中的後一段。轉場以剪點為中心：前段多播放後面的畫格、後段提前開始，各占一半，總長度不變。預覽以透明度近似，輸出為準。</p>`;
  if (!c || c.track !== edMain(p))
    return head + "<p>請先選取主影片軌片段。</p>";
  const type = EditorModel.transitionName(c.transition) ?? "無",
    frames = EditorModel.transitionFrames(c, p.timebase),
    { min, max } = EditorModel.transitionLimits(p.timebase),
    fps = Timebase.fps(p.timebase),
    issue = type === "無" ? "" : edTransitionIssue(p, c);
  return (
    head +
    edChoices("轉場", "transition", type, [
      "無",
      ...Object.keys(EditorModel.TRANSITIONS),
    ]) +
    edInput(
      "transitionSeconds",
      "轉場秒數",
      Number((frames / fps).toFixed(3)),
      "number",
      `min="${(min / fps).toFixed(3)}" max="${(max / fps).toFixed(3)}" step="${(1 / fps).toFixed(4)}"`,
    ) +
    `<p class="note">${frames} 格（${min}–${max} 格）</p>` +
    (issue ? `<p class="note" data-ed-transition-issue>${esc(issue)}</p>` : "")
  );
}
async function edLutRefresh() {
  const rows = await VideoWorkbench.assets.list();
  ed.luts = rows.filter((a) => /\.cube$/i.test(a.url || ""));
  if (tool === "edit" && ed.pane === "調色") edRender();
}
function edColorPane(p, c) {
  if (!c || !["video", "image"].includes(c.kind))
    return "<h3>調色</h3><p>請先選取影片或圖片片段。</p>";
  if (!ed.luts) {
    ed.luts = [];
    edLutRefresh().catch(VideoWorkbench.reportError);
  }
  return (
    "<h3>調色</h3>" +
    Object.entries(EditorModel.COLOR)
      .map(([key, r]) =>
        edInput(
          key,
          r.label,
          c[key] ?? r.neutral,
          "number",
          `min="${r.min}" max="${r.max}" step="${r.step}"`,
        ),
      )
      .join("") +
    `<p class="note">LUT：${esc(c.lut?.name || "無")}</p><div class="flow-choices" role="group" aria-label="LUT">${ed.luts
      .map(
        (a) =>
          `<button type="button" class="btn small ${c.lut?.url === a.url ? "selected" : ""}" data-ed-action="lut:${esc(a.id)}" aria-pressed="${c.lut?.url === a.url}">${esc(a.name || "LUT")}</button>`,
      )
      .join("")}</div>` +
    edButton("上傳 LUT（.cube）", "lut-upload") +
    edButton("移除 LUT", "lut-remove", !c.lut) +
    edButton("重設", "color-reset") +
    `<button type="button" class="btn small ${ed.compare ? "selected" : ""}" data-ed-action="color-compare" aria-pressed="${ed.compare}">比較前後</button>` +
    `<p class="note">${ed.compare ? "預覽顯示調色前（近似）" : "預覽顯示調色後（近似）"}。輸出依序套用曝光、色溫、對比／飽和度、LUT，存成 BT.709、TV 範圍（16–235）並標記色彩空間；預覽以 CSS 近似。</p>`
  );
}
function edLoudnessPane(p) {
  return `<h4>響度目標</h4>${edChoices("響度目標", "loudness", p.output.loudness, EditorModel.LOUDNESS.presets, (v) => v + " LUFS")}<p class="note">目前 ${p.output.loudness} LUFS。輸出時先量整段混音，再線性調到目標（誤差 ±1 LU），真峰值壓在 −1 dBTP 以下。−23 廣播、−16 一般網路、−14 串流平台。</p>`;
}
function edKeysPane(p, c) {
  const keys = c.volumeKeys || [],
    fps = Timebase.fps(p.timebase);
  return `<h4>音量關鍵影格（${esc(c.asset?.name || "片段")}）</h4><p class="note">有關鍵影格時取代片段音量，兩點之間線性變化；0 為靜音。</p>${keys
    .map(
      (k, i) =>
        `<div class="row">第 ${k.frame} 格（${(k.frame / fps).toFixed(2)} 秒）· 音量 ${k.gain}${edButton("刪除", "key-delete:" + i)}</div>`,
    )
    .join(
      "",
    )}<label>關鍵影格音量<input class="text-input" aria-label="關鍵影格音量" data-ed-key-gain type="number" min="0" max="4" step="0.1" value="1"></label>${edButton("在播放頭加入關鍵影格", "key-add")}`;
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
  if (ed.pane === "片頭") pane = edTitlePane(p);
  if (ed.pane === "音訊")
    pane = `<h3>音訊</h3>${edButton("選擇音訊", "library:audio")}${edButton("上傳音訊", "upload:audio")}<p class="note">每條音訊軌可獨立安排時間、音量、淡入淡出與音量均衡；音量＝片段音量 × 軌道音量（0 為靜音）。</p>${edLoudnessPane(p)}${c && ["video", "audio"].includes(c.kind) ? edKeysPane(p, c) : ""}`;
  if (ed.pane === "轉場") pane = edTransitionPane(p, c);
  if (ed.pane === "調色") pane = edColorPane(p, c);
  if (ed.pane === "特效")
    pane = `<h3>特效</h3>${edSelect("project:filter", "專案濾鏡", p.filter || "原始", edFilters)}${c ? edSelect("filter", "片段濾鏡", c.filter || "原始", edFilters) + edSelect("mask", "片段遮罩", c.mask || "無", ["無", "圓形", "圓角矩形", "三角形"]) + edInput("grain", "顆粒強度", c.grain || 0, "number", 'min="0" max="1" step="0.1"') : ""}<p class="note">光漏、鏡頭震動與關鍵影格尚未接入。</p>`;
  if (ed.pane === "貼圖")
    pane = `<h3>貼圖／品牌圖</h3>${edButton("選擇圖片", "library:image")}${edButton("上傳透明 PNG", "upload:image")}<p class="note">以主影片軌之上的影片軌疊加圖片，可設定時間、位置、大小與透明度。</p>`;
  if (ed.pane === "字幕")
    pane = `<h3>字幕</h3>${edButton("匯入 SRT／VTT", "subtitles-import")}${edButton("下載 SRT", "subtitles-download:srt")}${edButton("下載 VTT", "subtitles-download:vtt")}${edButton("前往字幕工具", "subtitles-tool")}<p class="note">每段字幕為文字軌片段，可逐段修改。時間重疊的字幕分放在不同文字軌；下載時重疊部分合併成同一段（多行）。辨識與翻譯請至字幕工具處理後匯入。</p>`;
  if (ed.pane === "剪贅字")
    pane =
      "<h3>剪贅字</h3><p>自動剪贅字需要逐字時間戳服務，目前尚未接入。可分割後使用「刪除並前移」手動剪除。</p>";
  let inspector = "<h3>片段屬性</h3><p>請點選時間軸片段。</p>";
  if (c) {
    const kind =
      c.kind === "text" ? "text" : c.kind === "audio" ? "audio" : "video";
    inspector =
      "<h3>片段屬性</h3>" +
      `<div class="flow-choices" role="group" aria-label="軌道">${p.tracks
        .filter((t) => t.kind === kind)
        .map(
          (t) =>
            `<button type="button" class="btn small ${t.id === c.track ? "selected" : ""}" data-ed-action="clip-track:${esc(t.id)}" aria-pressed="${t.id === c.track}">${esc(t.name)}</button>`,
        )
        .join("")}</div>` +
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
    const main = c.track === edMain(p);
    if (c.kind !== "audio")
      inspector +=
        edInput("x", main ? "水平偏移（px）" : "水平位置（%）", c.x) +
        edInput("y", main ? "垂直偏移（px）" : "垂直位置（%）", c.y) +
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
        (edOverlay(p, c.track)
          ? edInput(
              "width",
              "疊加寬度（%）",
              c.width,
              "number",
              'min="1" max="100"',
            )
          : main
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
  // Card P3: a clip rendered by the compositor links back to its source composition (scripts/tools-compositor.js).
  if (c && typeof cpEditorClip === "function") inspector += cpEditorClip(p, c);
  const [w, h] = edRatios[p.ratio];
  return wfWrap(
    t,
    `<div class="editor-heading">${edButton("所有專案", "projects")}${edInput("project:title", "專案名稱", p.title, "text", 'maxlength="100"')}${edSelect("project:ratio", "輸出比例", p.ratio, Object.keys(edRatios))}${edSelect("project:timebase", "影格率", Timebase.label(p.timebase), Timebase.allowed.map(Timebase.label))}${edButton("復原", "undo", !ed.undo.length)}${edButton("重做", "redo", !ed.redo.length)}${edButton("匯出影片", "export", !p.clips.length)}</div><div class="editor-workspace"><nav class="editor-panes">${["素材", "文字", "片頭", "音訊", "轉場", "特效", "調色", "貼圖", "字幕", "剪贅字"].map((title) => `<button class="btn ${ed.pane === title ? "selected" : ""}" data-ed-pane="${title}" aria-pressed="${ed.pane === title}">${title}</button>`).join("")}</nav><aside class="editor-library">${pane}</aside><section class="editor-player"><div class="editor-stage" data-ed-stage style="aspect-ratio:${w}/${h};width:min(100%,${(430 * w) / h}px)"></div><div class="row">${edButton("播放／暫停", "play")}<span data-ed-clock></span><input type="range" aria-label="播放位置" data-ed-seek min="0" max="${edEnd()}" step="0.01" value="${ed.time}"></div><div class="row editor-peak" data-ed-peak role="meter" aria-label="主輸出峰值" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60"><span class="editor-peak-bar" style="display:inline-block;width:160px;height:8px;border:1px solid currentColor;position:relative"><i data-ed-peak-fill style="position:absolute;left:0;top:0;bottom:0;width:0;background:#4ade80"></i></span><span data-ed-peak-text>峰值 — dBFS</span><span class="note">超過 −1 dB 會在輸出時自動壓低</span></div><p class="note">預覽呈現片段、文字與基本變形；轉場以透明度、調色以 CSS 近似，濾鏡與文字動畫以匯出影片為準。</p></section><aside class="editor-inspector">${inspector}</aside></div><div class="row editor-toolbar">${edButton("上一格", "frame:-1")}${edButton("下一格", "frame:1")}${edButton("設為入點", "set-in", !c)}${edButton("設為出點", "set-out", !c)}${edButton("分割", "split", !c)}${edButton("複製", "duplicate", !c)}${edButton("刪除", "delete", !c)}${edButton("刪除並前移", "ripple", !c)}${edButton("主軌吸附排列", "compact")}${edButton("新增標記", "marker")}<label>時間軸縮放<input type="range" min="10" max="100" value="${ed.zoom}" data-ed-zoom></label></div><div class="row editor-track-add">${["video", "audio", "text"].map((kind) => edButton("新增" + EditorModel.NAME[kind] + "軌", "track-add:" + kind, !EditorModel.canAdd(p.tracks, kind))).join("")}<span class="note">影片軌最多 ${EditorModel.LIMITS.video} 條、音訊軌 ${EditorModel.LIMITS.audio} 條、文字軌 ${EditorModel.LIMITS.text} 條，合計最多 ${EditorModel.TOTAL} 條。第一條影片軌（${esc(edMain(p))}）是全畫面主軌（最底層、不能刪除），其後的影片軌依清單順序疊在上方。</span></div><div class="editor-timeline">${p.tracks
      .map(
        ({ id, kind, name, hidden, muted, normalize }) =>
          `<div class="editor-track" data-ed-track="${esc(id)}"><div class="editor-track-name"><b>${esc(name)}</b>${edButton(hidden ? "顯示" : "隱藏", "track-hidden:" + id)}${kind !== "text" ? edButton(muted ? "開聲" : "靜音", "track-muted:" + id) : ""}${kind === "audio" ? edButton(normalize ? "取消均衡" : "均衡", "track-normalize:" + id) : ""}${id === edMain(p) ? "" : edButton("刪除軌道", "track-delete:" + id)}</div><div class="editor-track-lane" data-ed-lane="${esc(id)}" style="width:${Math.max(600, edEnd() * ed.zoom + 100)}px">${p.clips
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
// Remotion title templates (backend/remotion.cjs via /generations). The catalog comes from /capabilities; ratio
// and fps follow the project, so nothing here is a second source of template ids or sizes.
const edTitleFormats = ["16:9", "9:16", "4:5", "1:1"],
  edTitleFps = [24, 25, 30, 60];
function edTitleTemplate() {
  const list = VideoWorkbench.capabilities?.remotionTemplates || [];
  return list.find((t) => t.id === ed.title.templateId) || list[0] || null;
}
function edTitleBlocked(p) {
  if (!VideoWorkbench.capabilities?.remotion) return "片頭模板服務未設定";
  if (!edTitleFormats.includes(p.ratio))
    return "片頭模板不支援 " + p.ratio + " 比例";
  if (!edTitleFps.includes(Timebase.fps(p.timebase)))
    return "片頭模板只支援 24、25、30、60 fps";
  if (!ed.title.image) return "請先選一張背景圖";
  return "";
}
async function edTitleRefresh() {
  const rows = await VideoWorkbench.assets.list();
  ed.title.images = rows.filter(
    (a) =>
      VideoWorkbench.mediaKind(a) === "image" &&
      /^\/(generated|media)\/[^?#]+\.(png|jpe?g|webp)$/i.test(a.url || ""),
  );
  ed.title.done = ed.title.jobId
    ? rows.find((a) => a.id === "job-" + ed.title.jobId) || null
    : null;
  if (tool === "edit" && ed.pane === "片頭") edRender();
}
function edTitlePane(p) {
  // The pane's state belongs to one project: another project's finished title must not be offered here.
  if (ed.title.projectId !== p.id)
    ed.title = {
      templateId: null,
      fields: {},
      image: null,
      jobId: null,
      images: null,
      done: null,
      projectId: p.id,
    };
  const t = edTitleTemplate(),
    blocked = edTitleBlocked(p),
    list = VideoWorkbench.capabilities?.remotionTemplates || [];
  if (!ed.title.images) {
    ed.title.images = [];
    edTitleRefresh().catch(VideoWorkbench.reportError);
  }
  return `<h3>片頭</h3><p class="note">比例與影格率跟隨專案（${esc(p.ratio)} · ${esc(Timebase.label(p.timebase))}），長度 5 秒。</p><div class="flow-choices">${list
    .map(
      (x) =>
        `<button type="button" class="btn small ${x.id === t?.id ? "selected" : ""}" data-ed-action="title-template:${esc(x.id)}" aria-pressed="${x.id === t?.id}">${esc(x.label)}</button>`,
    )
    .join("")}</div>${(t?.fields || [])
    .map(
      (f) =>
        `<label>${esc(f.label)}<input class="text-input" aria-label="${esc(f.label)}" data-ed-title-field="${esc(f.key)}" maxlength="${f.max}" value="${esc(ed.title.fields[f.key] ?? "")}"></label>`,
    )
    .join("")}${
    t
      ? `<p class="note">${esc(t.image.label)}（從素材庫選擇）</p><div class="flow-choices">${
          ed.title.images
            .map(
              (a) =>
                `<button type="button" class="btn small ${ed.title.image?.id === a.id ? "selected" : ""}" data-ed-action="title-image:${esc(a.id)}" aria-pressed="${ed.title.image?.id === a.id}" title="${esc(a.name || "圖片")}"><img src="${esc(a.thumbUrl || a.url)}" alt="${esc(a.name || "圖片")}" width="64" height="40" style="object-fit:cover"></button>`,
            )
            .join("") || '<span class="note">素材庫沒有圖片，請先上傳。</span>'
        }</div>`
      : ""
  }<button type="button" class="btn primary small" data-ed-action="title-generate" ${blocked ? "disabled" : ""}>產生片頭（免費）</button>${blocked ? `<p class="note" data-ed-title-blocked>${esc(blocked)}</p>` : ""}${ed.title.done ? edButton("放到時間軸開頭", "title-insert") : ""}`;
}
// Puts the finished title on V1 at frame 0; every clip on every track moves later by its length, so the
// existing cut keeps its sync.
async function edTitleInsert(p, asset) {
  const a = await edProbe(asset);
  if (!ed.projects.includes(p)) return;
  edCheckpoint();
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  const c = edTime(
    p,
    {
      id: crypto.randomUUID(),
      kind: "video",
      asset: a,
      track: edMain(p),
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      width: 25,
    },
    {
      startFrame: 0,
      duration: Math.min(3600, a.duration),
      sourceStartFrame: 0,
    },
  );
  for (const row of p.clips)
    edTime(p, row, { startFrame: row.startFrame + c.durationFrames });
  p.clips.push(c);
  ed.selected = c.id;
  ed.time = 0;
  edRender();
  await edSave();
}
async function edProbe(asset) {
  const kind = VideoWorkbench.mediaKind(asset);
  // Card P2: image size too (the export dialog warns when a source is smaller than the 4K frame).
  if (kind === "image")
    return await new Promise((resolve) => {
      const img = new Image(),
        done = () =>
          resolve({
            ...asset,
            kind,
            duration: 3,
            ...(img.naturalWidth
              ? { width: img.naturalWidth, height: img.naturalHeight }
              : {}),
          });
      const timer = setTimeout(done, 15000);
      img.onload = img.onerror = () => {
        clearTimeout(timer);
        done();
      };
      img.src = asset.previewUrl || asset.url;
    });
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
  // "overlay" = the first video track above the main one (the old V2); audio -> first audio track.
  track =
    track === "overlay"
      ? edTrackFor(p, "video")
      : track && edTrack(p, track)
        ? track
        : a.kind === "audio"
          ? edTrackFor(p, "audio")
          : edMain(p);
  const overlay = edOverlay(p, track);
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
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 1,
      x: overlay ? 80 : 0,
      y: overlay ? 80 : 0,
      rotation: 0,
      width: 25,
    };
  edTime(p, c, { start, duration: Math.min(3600, a.duration), sourceStart: 0 });
  p.clips.push(c);
  ed.selected = c.id;
  ed.time = c.start;
  edRender();
  await edSave();
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
    "transitionFrames",
    ...Object.keys(EditorModel.COLOR),
  ])
    if (c[key] !== undefined && !Number.isFinite(Number(c[key])))
      throw Error("請輸入有效數字");
  for (const [key, r] of Object.entries(EditorModel.COLOR))
    if (c[key] !== undefined && (c[key] < r.min || c[key] > r.max))
      throw Error(`${r.label}需介於 ${r.min} 到 ${r.max}`);
  if (
    !(c.startFrame >= 0) ||
    !(c.durationFrames >= 1) ||
    !(c.sourceStartFrame >= 0) ||
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
// Card P2 preview audio: once the user presses play (browsers start audio only on a gesture), every media element
// goes through its own GainNode (clip volume / keyframes x track volume, which may exceed 1) into one analyser that
// drives the master peak meter. Before that, elements play natively at min(gain, 1).
const edAudio = {
  ctx: null,
  analyser: null,
  nodes: new WeakMap(),
  data: null,
  peak: -Infinity,
};
function edAudioStart() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!edAudio.ctx) {
    edAudio.ctx = new AudioCtx();
    edAudio.analyser = edAudio.ctx.createAnalyser();
    edAudio.analyser.fftSize = 2048;
    edAudio.data = new Float32Array(edAudio.analyser.fftSize);
    edAudio.analyser.connect(edAudio.ctx.destination);
  }
  edAudio.ctx.resume?.().catch?.(() => {});
}
function edAudioNode(el) {
  if (!edAudio.ctx) return null;
  if (!edAudio.nodes.has(el))
    try {
      const gain = edAudio.ctx.createGain();
      edAudio.ctx
        .createMediaElementSource(el)
        .connect(gain)
        .connect(edAudio.analyser);
      edAudio.nodes.set(el, gain);
    } catch (_) {
      edAudio.nodes.set(el, null);
    }
  return edAudio.nodes.get(el);
}
function edMeter() {
  const fill = document.querySelector("[data-ed-peak-fill]"),
    text = document.querySelector("[data-ed-peak-text]"),
    meter = document.querySelector("[data-ed-peak]");
  if (!fill || !edAudio.analyser) return;
  edAudio.analyser.getFloatTimeDomainData(edAudio.data);
  let peak = 0;
  for (const v of edAudio.data) peak = Math.max(peak, Math.abs(v));
  const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    over = db > -1;
  fill.style.width =
    Math.max(0, Math.min(100, ((Math.max(-60, db) + 60) / 60) * 100)) + "%";
  fill.style.background = over ? "#ef4444" : "#4ade80";
  text.textContent =
    "峰值 " + (Number.isFinite(db) ? db.toFixed(1) : "−∞") + " dBFS";
  meter.dataset.over = String(over);
  meter.setAttribute(
    "aria-valuenow",
    String(Number.isFinite(db) ? Math.max(-60, db).toFixed(1) : -60),
  );
}
// Preview of the main-track transitions (output is authoritative): the outgoing clip stays on through the window,
// the incoming one starts early and fades in over it.
function edPreviewSpans(p) {
  const spans = new Map(),
    main = edMain(p),
    fps = Timebase.fps(p.timebase);
  for (const c of p.clips) {
    const type =
        c.track === main ? EditorModel.transitionName(c.transition) : "無",
      previous = type && type !== "無" ? edPrevious(p, c) : null;
    if (!previous) continue;
    const frames = EditorModel.transitionFrames(c, p.timebase),
      before = Math.floor(frames / 2) / fps,
      after = (frames - Math.floor(frames / 2)) / fps;
    spans.set(c.id, {
      ...(spans.get(c.id) || {}),
      from: c.start - before,
      fadeTo: c.start + after,
    });
    spans.set(previous.id, {
      ...(spans.get(previous.id) || {}),
      until: c.start + after,
    });
  }
  return spans;
}
function edGrade(c) {
  if (ed.compare || !EditorModel.graded(c)) return "none";
  const k = c.temperature ?? 6500,
    parts = [
      `brightness(${Math.pow(2, c.exposure ?? 0)})`,
      `contrast(${c.contrast ?? 1})`,
      `saturate(${c.saturation ?? 1})`,
    ];
  if (k < 6500)
    parts.push(`sepia(${Math.min(0.6, ((6500 - k) / 4500) * 0.6).toFixed(3)})`);
  if (k > 6500)
    parts.push(
      `hue-rotate(${(((k - 6500) / 5500) * -12).toFixed(1)}deg)`,
      `saturate(${(1 + ((k - 6500) / 5500) * 0.2).toFixed(3)})`,
    );
  return parts.join(" ");
}
function edPaint() {
  const p = edProject(),
    stage = document.querySelector("[data-ed-stage]");
  if (!p || !stage) {
    edStop();
    return;
  }
  const spans = edPreviewSpans(p),
    order = new Map(p.tracks.map((t, i) => [t.id, i])),
    active = p.clips.filter((c) => {
      const s = spans.get(c.id);
      return (
        ed.time >= (s?.from ?? c.start) &&
        ed.time < (s?.until ?? c.start + c.duration) &&
        !c.hidden &&
        !edTrack(p, c.track)?.hidden
      );
    }),
    ids = new Set(active.map((c) => c.id));
  stage.querySelectorAll("[data-ed-layer]").forEach((el) => {
    if (!ids.has(el.dataset.edLayer)) {
      el.pause?.();
      el.remove();
    }
  });
  for (const c of active.sort(
    (a, b) => order.get(a.track) - order.get(b.track) || a.start - b.start,
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
    const span = spans.get(c.id),
      fade =
        span?.fadeTo !== undefined && ed.time < span.fadeTo
          ? Math.max(
              0,
              Math.min(1, (ed.time - span.from) / (span.fadeTo - span.from)),
            )
          : 1,
      layer = 10 + order.get(c.track) * 2 + (fade < 1 ? 1 : 0);
    if (c.kind === "text") {
      el.textContent = c.text;
      el.style.cssText = `position:absolute;left:${c.x}%;top:${c.y}%;transform:translate(-50%,-50%) rotate(${c.rotation}deg) scale(${c.scale});font-size:${(c.fontSize * stage.clientWidth) / edRatios[p.ratio][0]}px;color:${c.color};font-family:${{ 思源黑體: "sans-serif", 思源宋體: "serif", 等寬字: "monospace" }[c.font] || c.font};font-weight:${c.bold ? "bold" : "normal"};font-style:${c.italic ? "italic" : "normal"};text-align:${c.align === "靠左" ? "left" : c.align === "靠右" ? "right" : "center"};background:${c.backgroundColor || "transparent"};opacity:${c.opacity};white-space:pre-wrap;max-width:95%;z-index:${100 + layer}`;
    } else if (c.kind !== "audio") {
      el.style.cssText =
        (edOverlay(p, c.track)
          ? `position:absolute;width:${c.width * c.scale}%;left:${c.x * (1 - (c.width * c.scale) / 100)}%;top:${c.y}%;transform:rotate(${c.rotation}deg);opacity:${c.opacity * fade};z-index:${layer}`
          : `position:absolute;width:100%;height:100%;object-fit:contain;transform:translate(${(c.x * stage.clientWidth) / edRatios[p.ratio][0]}px,${(c.y * stage.clientHeight) / edRatios[p.ratio][1]}px) rotate(${c.rotation}deg) scale(${c.scale});opacity:${c.opacity * fade};z-index:${layer};background:${c.background === "純色" ? c.backgroundColor || "#000" : "#000"}`) +
        `;filter:${edGrade(c)}`;
    }
    if (["audio", "video"].includes(c.kind)) {
      const target = Math.max(0, c.sourceStart + (ed.time - c.start) * c.speed),
        track = edTrack(p, c.track),
        keyed = EditorModel.gainAt(
          c.volumeKeys || [],
          edFrame(p) - c.startFrame,
        ),
        gain =
          c.muted ||
          track?.muted ||
          ed.time < c.start ||
          ed.time >= c.start + c.duration
            ? 0
            : (keyed ?? (Number.isFinite(c.volume) ? c.volume : 1)) *
              (track?.volume ?? 1);
      if (Math.abs(el.currentTime - target) > 0.2)
        try {
          el.currentTime = target;
        } catch (_) {}
      el.playbackRate = c.speed;
      el.muted = !!(c.muted || track?.muted);
      const node = edAudioNode(el);
      if (node) {
        el.volume = 1;
        node.gain.value = gain;
      } else el.volume = Math.max(0, Math.min(1, gain));
      if (ed.playing) el.play().catch(() => {});
      else el.pause();
    }
  }
  const clock = document.querySelector("[data-ed-clock]"),
    seek = document.querySelector("[data-ed-seek]");
  if (clock)
    clock.textContent =
      ed.time.toFixed(2) +
      " / " +
      edEnd().toFixed(2) +
      " 秒 · 第 " +
      edFrame(p) +
      " 格";
  if (seek) seek.value = ed.time;
  document
    .querySelectorAll(".editor-playhead")
    .forEach((el) => (el.style.left = ed.time * ed.zoom + "px"));
  edMeter();
}
function toolEditorAfterRender() {
  if (!ed.ready && !ed.loading)
    ed.loading = edLoadProjects()
      .then(() => {
        if (tool === "edit") render();
      })
      .catch(VideoWorkbench.reportError)
      .finally(() => (ed.loading = null));
  if (typeof cpEditorAfterRender === "function") cpEditorAfterRender();
  edPaint();
}
function edDialog(content) {
  const d = document.createElement("dialog");
  d.className = "editor-dialog";
  d.innerHTML = VideoWorkbench.sanitize(
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
// Without a project (the short-video tool builds its own), seconds stay on the clip and edNormalizeProject
// converts them through edTime with that project's timebase.
function edText(
  text,
  start = ed.time,
  duration = 3,
  p = edProject(),
  track = p ? edTrackFor(p, "text") : "T",
) {
  const clip = {
    id: crypto.randomUUID(),
    track,
    kind: "text",
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
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
  return p
    ? edTime(p, clip, { start, duration, sourceStart: 0 })
    : { ...clip, start, duration, sourceStart: 0 };
}
async function edAction(action) {
  const p = edProject(),
    c = edClip();
  if (action.startsWith("comp-") && typeof cpEditorAction === "function")
    return cpEditorAction(action, p, c);
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
        timebase: { ...Timebase.DEFAULT },
        clips: [],
        assets: [],
        tracks: EditorModel.normalizeTracks(null),
        output: { loudness: EditorModel.LOUDNESS.neutral },
        markers: [],
      });
      ed.current = id;
      ed.selected = null;
      ed.time = 0;
      ed.undo = [];
      ed.redo = [];
      d.close();
      edRender();
      await edSave();
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
    ed.current = null;
    edRender();
    await edSave();
    return;
  }
  if (!p) return;
  if (action === "play") {
    if (ed.playing) {
      edStop();
      return;
    }
    if (ed.time >= edEnd()) ed.time = 0;
    edAudioStart();
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
      rows = await VideoWorkbench.pickAssets({ kind: kind || "all" });
    if (rows[0] && edProject() === p)
      await edAdd(rows[0], kind === "image" ? "overlay" : undefined);
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
          const a = await VideoWorkbench.uploadAsset(input.files[0]);
          if (edProject() === p)
            await edAdd(a, kind === "image" ? "overlay" : undefined);
        }
      } catch (e) {
        VideoWorkbench.reportError(e);
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
    edRender();
    await edSave();
    return;
  }
  if (action === "undo" || action === "redo") {
    const from = action === "undo" ? ed.undo : ed.redo,
      to = action === "undo" ? ed.redo : ed.undo;
    if (from.length) {
      to.push(structuredClone(p));
      ed.projects[ed.projects.indexOf(p)] = from.pop();
      edRender();
      await edSave();
    }
    return;
  }
  if (action.startsWith("title-template:")) {
    ed.title.templateId = action.slice(15);
    edRender();
    return;
  }
  if (action.startsWith("title-image:")) {
    ed.title.image =
      ed.title.images?.find((a) => String(a.id) === action.slice(12)) || null;
    edRender();
    return;
  }
  if (action === "title-generate") {
    const t = edTitleTemplate(),
      blocked = edTitleBlocked(p);
    if (!t || blocked) throw Error(blocked || "片頭模板服務未設定");
    const job = await VideoWorkbench.generations.create({
      type: "video",
      operation: "remotion-template",
      prompt: t.label,
      settings: {
        templateId: t.id,
        fields: Object.fromEntries(
          t.fields.map((f) => [f.key, String(ed.title.fields[f.key] || "")]),
        ),
        ratio: p.ratio,
        fps: Timebase.fps(p.timebase),
      },
      references: { image: { url: ed.title.image.url, id: ed.title.image.id } },
    });
    ed.title.jobId = job.id;
    ed.title.done = null;
    edRender();
    VideoWorkbench.showJob(job, {
      onSuccess: () =>
        setTimeout(() => edTitleRefresh().catch(VideoWorkbench.reportError), 300),
      apply: async (v) => {
        if (v.status !== "succeeded") return false;
        await edTitleInsert(p, VideoWorkbench.jobAsset(v));
      },
      applyLabel: "放到時間軸開頭",
    });
    return;
  }
  if (action === "title-insert") {
    if (ed.title.done && ed.title.projectId === p.id)
      await edTitleInsert(p, ed.title.done);
    return;
  }
  if (action === "export") {
    edExportDialog(p);
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
        const cues = SubtitleParse.parse(await input.files[0].text());
        edCheckpoint();
        try {
          edImportCues(p, cues);
        } catch (error) {
          ed.projects[ed.projects.indexOf(p)] = ed.undo.pop();
          throw error;
        }
        edRender();
        await edSave();
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
    };
    input.click();
    return;
  }
  if (action.startsWith("subtitles-download")) {
    const format = action.split(":")[1] || "srt",
      cues = p.clips
        .filter((c) => c.kind === "text" && c.text.trim())
        .sort((a, b) => a.startFrame - b.startFrame)
        .map((c) => ({
          startMs: Math.round(c.start * 1000),
          endMs: Math.round((c.start + c.duration) * 1000),
          text: c.text,
        }));
    if (!cues.length) throw Error("沒有文字片段可下載");
    const result = await VideoWorkbench.request("/subtitles/export", {
        format,
        cues,
      }),
      blob = new Blob([result.content], { type: "text/plain;charset=utf-8" }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = p.title + "." + format;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    return;
  }
  if (action === "color-compare") {
    ed.compare = !ed.compare;
    edRender();
    return;
  }
  if (action === "lut-upload") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".cube";
    input.onchange = async () => {
      try {
        const f = input.files?.[0];
        if (!f) return;
        if (!/\.cube$/i.test(f.name)) throw Error("請選擇 .cube LUT 檔");
        const bytes = new Uint8Array(await f.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const uploaded = await VideoWorkbench.request("/uploads", {
            name: f.name,
            data: "data:application/x-cube;base64," + btoa(binary),
          }),
          asset = await VideoWorkbench.assets.save({
            ...uploaded,
            createdAt: new Date().toISOString(),
          });
        ed.luts = null;
        const clip = edProject() === p ? edClip() : null;
        if (clip && ["video", "image"].includes(clip.kind)) {
          edCheckpoint();
          clip.lut = { id: asset.id, url: asset.url, name: asset.name };
          await edSave();
        }
        edRender();
      } catch (e) {
        VideoWorkbench.reportError(e);
      }
    };
    input.click();
    return;
  }
  if (action.startsWith("frame:")) {
    ed.time = Math.max(
      0,
      Timebase.toSeconds(
        Math.max(0, edFrame(p) + Number(action.slice(6))),
        p.timebase,
      ),
    );
    edStop();
    edPaint();
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
      .filter((c) => c.track === edMain(p))
      .sort((a, b) => a.startFrame - b.startFrame)) {
      edTime(p, row, { startFrame: t });
      t += row.durationFrames;
    }
  }
  if (/^track-(hidden|muted|normalize):/.test(action)) {
    const [property, id] = action.slice(6).split(":"),
      track = edTrack(p, id);
    if (track) track[property] = !track[property];
  }
  if (action.startsWith("track-add:")) {
    const kind = action.slice(10);
    if (!EditorModel.canAdd(p.tracks, kind))
      throw Error(EditorModel.NAME[kind] + "軌已達上限");
    const id = EditorModel.nextId(p.tracks, kind),
      // New tracks go after the last track of their kind: a new video track is the new top video layer.
      at = p.tracks.findLastIndex((t) => t.kind === kind) + 1;
    p.tracks.splice(at || p.tracks.length, 0, {
      id,
      kind,
      name: id,
      hidden: false,
      muted: false,
      volume: 1,
      normalize: false,
    });
  }
  if (action.startsWith("track-delete:")) {
    const id = action.slice(13),
      track = edTrack(p, id),
      used = p.clips.filter((row) => row.track === id).length;
    if (!track || id === edMain(p)) throw Error("主影片軌不能刪除");
    if (used) {
      // Non-empty: confirm first; the deletion (track and its clips) is one undo step.
      ed.undo.pop();
      const d = edDialog(
        `<h3>刪除軌道 ${esc(track.name)}？</h3><p>這條軌道上有 ${used} 個片段，會一起刪除。可用「復原」還原。</p><button class="btn primary" type="button" data-ed-confirm-delete>確定刪除</button>`,
      );
      d.querySelector("[data-ed-confirm-delete]").onclick = async () => {
        d.close();
        if (edProject() !== p || !edTrack(p, id)) return;
        edCheckpoint();
        p.clips = p.clips.filter((row) => row.track !== id);
        p.tracks = p.tracks.filter((t) => t.id !== id);
        if (edClip()?.track === id || !edClip()) ed.selected = null;
        edRender();
        await edSave();
      };
      return;
    }
    p.tracks = p.tracks.filter((t) => t.id !== id);
  }
  if (action.startsWith("loudness:"))
    p.output = { ...p.output, loudness: Number(action.slice(9)) };
  if (c) {
    if (action.startsWith("toggle:")) c[action.slice(7)] = !c[action.slice(7)];
    if (action === "text-background")
      c.backgroundColor = c.backgroundColor ? null : "#000000";
    if (action.startsWith("clip-track:")) {
      const id = action.slice(11),
        target = edTrack(p, id);
      if (
        !target ||
        target.kind !==
          (c.kind === "text" ? "text" : c.kind === "audio" ? "audio" : "video")
      )
        throw Error("片段與軌道類型不相符");
      if (id !== c.track) {
        const main = id === edMain(p);
        if (c.kind !== "text") {
          c.x = main ? 0 : 50;
          c.y = main ? 0 : 50;
        }
        c.track = id;
      }
    }
    if (action.startsWith("transition:")) {
      const name = EditorModel.transitionName(action.slice(11));
      if (name === null) throw Error("轉場不存在");
      c.transition = name;
      c.transitionFrames = EditorModel.transitionFrames(c, p.timebase);
      delete c.transitionDuration;
    }
    if (action.startsWith("lut:")) {
      const asset = ed.luts?.find((a) => String(a.id) === action.slice(4));
      if (asset) c.lut = { id: asset.id, url: asset.url, name: asset.name };
    }
    if (action === "lut-remove") delete c.lut;
    if (action === "color-reset") {
      for (const key of Object.keys(EditorModel.COLOR)) delete c[key];
      delete c.lut;
    }
    if (action === "key-add") {
      const frame = edFrame(p) - c.startFrame,
        gain = Number(document.querySelector("[data-ed-key-gain]")?.value ?? 1);
      if (frame < 0 || frame > c.durationFrames)
        throw Error("播放頭需位於片段內");
      c.volumeKeys = EditorModel.volumeKeys(
        [
          ...(c.volumeKeys || []).filter((k) => k.frame !== frame),
          { frame, gain },
        ],
        c.durationFrames,
      );
    }
    if (action.startsWith("key-delete:")) {
      c.volumeKeys = (c.volumeKeys || []).filter(
        (_, i) => i !== Number(action.slice(11)),
      );
      if (!c.volumeKeys.length) delete c.volumeKeys;
    }
    // In / out at the playhead (frame-exact; the source is not touched): the other end stays where it is.
    if (action === "set-in" || action === "set-out") {
      const frame = edFrame(p),
        end = c.startFrame + c.durationFrames;
      if (action === "set-in" ? frame >= end : frame <= c.startFrame)
        throw Error(
          action === "set-in" ? "入點需早於片段結尾" : "出點需晚於片段起點",
        );
      if (action === "set-in") {
        const delta = frame - c.startFrame,
          sourceStartFrame = c.sourceStartFrame + Math.round(delta * c.speed);
        if (sourceStartFrame < 0) throw Error("素材前面沒有更多畫格");
        const next = edTime(
          p,
          { ...c },
          { startFrame: frame, durationFrames: end - frame, sourceStartFrame },
        );
        if (next.volumeKeys)
          next.volumeKeys = edKeysWindow(c.volumeKeys, delta, c.durationFrames);
        edNeighbours(p, next);
        edValidate(next);
        Object.assign(c, next);
      } else {
        const next = edTime(
          p,
          { ...c },
          { durationFrames: frame - c.startFrame },
        );
        if (next.volumeKeys)
          next.volumeKeys = edKeysWindow(c.volumeKeys, 0, next.durationFrames);
        edNeighbours(p, next);
        edValidate(next);
        Object.assign(c, next);
      }
    }
    if (action === "duplicate") {
      const copy = edTime(
        p,
        { ...structuredClone(c), id: crypto.randomUUID() },
        { startFrame: c.startFrame + c.durationFrames },
      );
      p.clips.push(copy);
      ed.selected = copy.id;
    }
    if (action === "split") {
      const offset = Timebase.toFrames(ed.time, p.timebase) - c.startFrame;
      if (offset < 1 || offset > c.durationFrames - 1)
        throw Error("播放頭需位於片段內部");
      const copy = edTime(
        p,
        { ...structuredClone(c), id: crypto.randomUUID() },
        {
          startFrame: c.startFrame + offset,
          durationFrames: c.durationFrames - offset,
          sourceStartFrame: c.sourceStartFrame + Math.round(offset * c.speed),
        },
      );
      // The second half starts at a plain cut: the in-transition stays on the first half.
      delete copy.transition;
      delete copy.transitionFrames;
      if (c.volumeKeys) {
        copy.volumeKeys = edKeysWindow(c.volumeKeys, offset, c.durationFrames);
        c.volumeKeys = edKeysWindow(c.volumeKeys, 0, offset);
      }
      edTime(p, c, { durationFrames: offset });
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
              row.track === c.track &&
              row.startFrame >= c.startFrame + c.durationFrames,
          )
          .forEach((row) =>
            edTime(p, row, { startFrame: row.startFrame - c.durationFrames }),
          );
      ed.selected = null;
    }
  }
  edRender();
  await edSave();
}
// Keys inside [from, to] of a clip, rebased to `from`, with the interpolated gain pinned at both new edges.
function edKeysWindow(keys, from, to) {
  if (!keys?.length) return undefined;
  const inside = keys
    .filter((k) => k.frame > from && k.frame < to)
    .map((k) => ({ frame: k.frame - from, gain: k.gain }));
  return [
    { frame: 0, gain: EditorModel.gainAt(keys, from) },
    ...inside,
    { frame: to - from, gain: EditorModel.gainAt(keys, to) },
  ];
}
// A shorter clip keeps its volume curve up to the new end (keys past it would be outside the clip).
function edFitKeys(before, next) {
  if (
    before.volumeKeys?.length &&
    next.durationFrames !== before.durationFrames
  )
    next.volumeKeys = edKeysWindow(before.volumeKeys, 0, next.durationFrames);
}
// Trimming or moving never covers a neighbour on the same track (handoff §4.2: 相鄰片段不被意外覆蓋).
function edNeighbours(p, next) {
  const end = next.startFrame + next.durationFrames;
  if (
    p.clips.some(
      (o) =>
        o.id !== next.id &&
        o.track === next.track &&
        o.startFrame < end &&
        next.startFrame < o.startFrame + o.durationFrames,
    )
  )
    throw Error("會蓋到同一軌的相鄰片段，請先移開或縮短它");
}
// Subtitle import (card P2): each cue becomes a text clip; a cue overlapping one already on a text track goes to
// the next text track (a new one is added when needed, up to the limit). One undo step for the whole file.
function edImportCues(p, cues) {
  edTrackFor(p, "text");
  const placed = new Map(
    p.tracks
      .filter((t) => t.kind === "text")
      .map((t) => [
        t.id,
        p.clips
          .filter((c) => c.track === t.id)
          .map((c) => [c.startFrame, c.startFrame + c.durationFrames]),
      ]),
  );
  for (const cue of cues) {
    const clip = edText(
        cue.text,
        cue.startMs / 1000,
        (cue.endMs - cue.startMs) / 1000,
        p,
        edTrackFor(p, "text"),
      ),
      range = [clip.startFrame, clip.startFrame + clip.durationFrames];
    let track = [...placed.keys()].find((id) =>
      placed.get(id).every(([a, b]) => range[1] <= a || range[0] >= b),
    );
    if (!track) {
      if (!EditorModel.canAdd(p.tracks, "text"))
        throw Error(
          `重疊的字幕超過 ${EditorModel.LIMITS.text} 層，無法再新增文字軌`,
        );
      track = EditorModel.nextId(p.tracks, "text");
      p.tracks.splice(
        p.tracks.findLastIndex((t) => t.kind === "text") + 1 || p.tracks.length,
        0,
        {
          id: track,
          kind: "text",
          name: track,
          hidden: false,
          muted: false,
          volume: 1,
          normalize: false,
        },
      );
      placed.set(track, []);
    }
    clip.track = track;
    placed.get(track).push(range);
    p.clips.push(clip);
  }
}
// Export (card P2): quality buttons (720p / 1080p / 4K), the loudness target, a 4K upscale warning and the
// platforms the project's ratio fits (main-system RATIO_PREFERENCE via /delivery-ratios).
function edExportDialog(p) {
  const [w, h] = edRatios[p.ratio],
    k4 = [w * 2, h * 2],
    small = p.clips.some(
      (c) =>
        ["video", "image"].includes(c.kind) &&
        !(c.asset?.width >= k4[0] && c.asset?.height >= k4[1]),
    );
  const body = () => {
    const delivery = ed.delivery?.ratios?.[p.ratio];
    return `<h3>匯出影片</h3><p>${esc(p.ratio + " · MP4 · " + Timebase.label(p.timebase) + " · BT.709 TV 範圍 · 響度 " + p.output.loudness + " LUFS")}</p>${edChoices("畫質", "quality", ed.quality, Object.keys(EditorModel.QUALITIES), (q) => q + "（" + Math.round((w * EditorModel.QUALITIES[q]) / 2) * 2 + "×" + Math.round((h * EditorModel.QUALITIES[q]) / 2) * 2 + "）")}${ed.quality === "4K" && small ? '<p class="note" data-ed-upscale>來源低於 4K，會放大</p>' : ""}<p class="note" data-ed-delivery>適合投遞：${
      !ed.delivery
        ? "讀取中…"
        : delivery?.platforms
          ? esc(
              delivery.platforms
                .map((x) => x.platform + (x.preferred ? "（首選）" : ""))
                .join("、"),
            )
          : esc(delivery?.note || "主系統目前不收此比例（P6 處理）")
    }</p><button class="btn primary" type="button" data-ed-export>開始匯出</button>`;
  };
  const d = edDialog(`<div data-ed-export-body>${body()}</div>`),
    refresh = () => {
      const box = d.querySelector("[data-ed-export-body]");
      if (box) box.innerHTML = VideoWorkbench.sanitize(body());
      wire();
    };
  if (!ed.delivery)
    VideoWorkbench.request("/delivery-ratios", undefined, "GET")
      .then((value) => {
        ed.delivery = value;
        refresh();
      })
      .catch(VideoWorkbench.reportError);
  function wire() {
    d.querySelectorAll('[data-ed-action^="quality:"]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        ed.quality = b.dataset.edAction.slice(8);
        refresh();
      };
    });
    d.querySelector("[data-ed-export]").onclick = async (e) => {
      e.target.disabled = true;
      try {
        p.clips.forEach(edValidate);
        const job = await VideoWorkbench.generations.create({
          type: "video",
          operation: "editor-export",
          settings: {
            quality: ed.quality,
            project: edNative(p),
            projectRevision: p.revision || 0,
          },
        });
        d.close();
        VideoWorkbench.showJob(job);
      } catch (err) {
        VideoWorkbench.reportError(err);
        e.target.disabled = false;
      }
    };
  }
  wire();
}
document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-ed-action]"),
    pane = e.target.closest("[data-ed-pane]"),
    clip = e.target.closest("[data-ed-clip]"),
    marker = e.target.closest("[data-ed-marker]");
  if (action) edAction(action.dataset.edAction).catch(VideoWorkbench.reportError);
  if (pane) {
    ed.pane = pane.dataset.edPane;
    if (ed.pane === "片頭") ed.title.images = null;
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
    if (key === "project:timebase") {
      const timebase = Timebase.fromLabel(value);
      if (!timebase) throw Error("不支援的影格率");
      // Re-snap once: each clip keeps its time in seconds as closely as the new frame grid allows.
      p.timebase = { num: timebase.num, den: timebase.den };
      for (const row of p.clips)
        edTime(p, row, {
          start: row.start,
          duration: row.duration,
          sourceStart: row.sourceStart,
        });
    } else if (key.startsWith("project:")) p[key.slice(8)] = value;
    else if (key === "transitionSeconds" && c) {
      // Card P2: the pane shows seconds; the clip stores whole frames inside the allowed range.
      const { min, max } = EditorModel.transitionLimits(p.timebase),
        frames = Math.round(value * Timebase.fps(p.timebase));
      if (!Number.isFinite(frames) || frames < min || frames > max)
        throw Error(
          `轉場長度需介於 ${(min / Timebase.fps(p.timebase)).toFixed(2)} 到 ${(max / Timebase.fps(p.timebase)).toFixed(2)} 秒`,
        );
      c.transitionFrames = frames;
      delete c.transitionDuration;
    } else if (c) {
      const next = { ...c, [key]: value };
      if (edTimeKeys.some(([seconds]) => seconds === key))
        edTime(p, next, { [key]: value });
      edFitKeys(c, next);
      if (["start", "duration"].includes(key)) edNeighbours(p, next);
      edValidate(next);
      Object.assign(c, next);
    }
    edSave();
    edRender();
  } catch (error) {
    ed.undo.pop();
    VideoWorkbench.reportError(error);
    edRender();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.edTitleField)
    ed.title.fields[e.target.dataset.edTitleField] = e.target.value;
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
      next = edTime(
        p,
        { ...initial },
        {
          [key]: Math.max(0, initial[key] + (ev.clientX - startX) / ed.zoom),
        },
      );
    try {
      edFitKeys(initial, next);
      edNeighbours(p, next);
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
      : e.key === "ArrowLeft" || e.key === "ArrowRight"
        ? "frame:" + (e.key === "ArrowLeft" ? -1 : 1)
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
    edAction(action).catch(VideoWorkbench.reportError);
  }
});

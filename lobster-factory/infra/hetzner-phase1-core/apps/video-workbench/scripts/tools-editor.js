// Projects live independently of storyboard designs and tool drafts.
const ed = {
  ready: false,
  loading: null,
  projects: [],
  current: null,
  selected: null,
  pane: "素材",
  time: 0,
  zoom: 50,
  playing: false,
  // Card ED.2: multi-select (ed.selected = the clip the inspector shows; ed.picks = the whole selection, see
  // edPicked), J/K/L rate (negative = reverse, muted), in-memory clip and style clipboards, timeline switches.
  picks: new Set(),
  rate: 1,
  clipboard: null,
  styleClipboard: null,
  snap: true,
  magnet: true,
  skipMagnet: false,
  // The timeline's scroll position survives re-renders (a click on a clip used to jump it back to 0).
  scroll: { left: 0, top: 0 },
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
  // Card ED.1: panel sizes (tools.editor.layout), loop playback, and the top bar's save status.
  layout: null,
  loop: false,
  // Card ED.3.2: where 畫面效果 edits land (整片／此軌／此片段, spec §4); view state, not saved.
  fxScope: "此片段",
  save: { state: "saved", at: null, pending: 0 },
};
let edLinePress = { id: null, at: 0 };
const edCreateRatios = [
    ["16:9", "橫屏", "YouTube、電視、簡報"],
    ["9:16", "直屏", "TikTok、Reels、Shorts"],
    ["1:1", "方形", "Instagram、Facebook 貼文"],
    ["4:5", "直式貼文", "Instagram 動態、LinkedIn"],
    ["4:3", "傳統", "簡報、舊式電視"],
  ],
  edRatios = {
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
  // The selection: ed.picks while it holds ed.selected, else just ed.selected. Code that sets ed.selected to a new
  // clip (add, split, duplicate) therefore selects that one clip without having to clear ed.picks itself.
  edPicked = (p = edProject()) => {
    const ids = ed.selected && ed.picks.has(ed.selected) ? ed.picks : new Set(ed.selected ? [ed.selected] : []);
    return (p?.clips || []).filter((c) => ids.has(c.id));
  },
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
    try {
      normalized.transformKeys = EditorModel.transformKeys(clip.transformKeys, undefined, overlay);
    } catch (_) {
      normalized.transformKeys = [];
    }
    if (!normalized.transformKeys.length) delete normalized.transformKeys;
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
    const timed = edTime(p, normalized, patch);
    // Keys past the clip's end (older data) are cut at the end, like a trim (Codex ED.3.3 F2).
    if ([...(timed.volumeKeys || []), ...(timed.transformKeys || [])].some((k) => k.frame > timed.durationFrames))
      edWindowKeys(timed, { ...timed }, 0, timed.durationFrames);
    return timed;
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
  // The top bar says 已儲存 only when no queued write is left; a failed write stays visible until the next success.
  ed.save = { ...ed.save, state: "saving", pending: ed.save.pending + 1 };
  edSavePaint();
  ed.queue = ed.queue
    .catch(() => {})
    .then(() => VideoWorkbench.preferences.set("tools.editor.projects", copy));
  ed.queue
    .then(
      () => {
        const pending = ed.save.pending - 1;
        ed.save = pending ? { ...ed.save, pending } : { state: "saved", at: new Date(), pending };
      },
      (e) => {
        ed.save = { ...ed.save, state: "error", pending: ed.save.pending - 1 };
        VideoWorkbench.reportError(e);
      },
    )
    .finally(edSavePaint);
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
  ed.layout = edLayout(await VideoWorkbench.preferences.get("tools.editor.layout", null));
  // Card ED.2: 磁吸 and 磁性主軌 are per-user switches (default on, as the reference), never project data.
  const switches = await VideoWorkbench.preferences.get("tools.editor.timeline", null);
  for (const k of ["snap", "magnet"]) ed[k] = typeof switches?.[k] === "boolean" ? switches[k] : true;
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
// Card ED.2: every committed edit goes through here. 磁性主軌 closes the main track's gaps when the edit changed its
// clips (compared with the undo snapshot taken before the edit); other tracks stay where they are. A move or copy of
// clips on several tracks sets ed.skipMagnet so their relative timing survives (reference behaviour).
function edMagnet(p) {
  const skip = ed.skipMagnet;
  ed.skipMagnet = false;
  const before = ed.undo.at(-1);
  if (!ed.magnet || skip || !before || before.id !== p.id) return;
  const main = edMain(p),
    sig = (proj) =>
      proj.clips
        .filter((c) => c.track === main)
        .map((c) => c.id + ":" + c.startFrame + ":" + c.durationFrames)
        .sort()
        .join(),
    rows = p.clips.filter((c) => c.track === main);
  if (sig(before) === sig(p)) return;
  const known = new Set(before.clips.map((c) => c.id)),
    starts = EditorModel.closeGaps(rows, new Set(rows.filter((c) => !known.has(c.id)).map((c) => c.id)));
  for (const c of rows) if (starts.get(c.id) !== c.startFrame) edTime(p, c, { startFrame: starts.get(c.id) });
}
function edCommit(p) {
  edMagnet(p);
  edRender();
  return edSave();
}
function edStop() {
  ed.playing = false;
  ed.rate = 1;
  cancelAnimationFrame(ed.raf);
  document.querySelectorAll("[data-ed-media]").forEach((m) => m.pause());
  const play = document.querySelector('[data-ed-action="play"]');
  if (play) play.textContent = "▶";
}
function edRender() {
  edStop();
  render();
}
// View-only changes (panels, loop, pane, selection cleared) redraw without stopping playback: the old media
// elements are paused so detached ones fall silent, and the running tick's edPaint makes and plays the new ones.
function edRedraw() {
  document.querySelectorAll("[data-ed-media]").forEach((m) => m.pause());
  render();
}
function edButton(title, action, disabled = false) {
  return `<button type="button" class="btn small" data-ed-action="${esc(action)}" ${disabled ? "disabled" : ""}>${esc(title)}</button>`;
}
function edInput(key, title, value, type = "number", attrs = "") {
  return `<label>${esc(title)}<input class="text-input" aria-label="${esc(title)}" data-ed-field="${key}" type="${type}" value="${esc(value ?? "")}" ${attrs}></label>`;
}
// Card ED.3.5: a colour field gets 取色 where the browser has the EyeDropper API.
function edColor(key, title, value) {
  return edInput(key, title, value, "color") + (typeof window.EyeDropper === "function" ? edButton("取色", "eyedrop:" + key) : "");
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
// Card ED.3.6: inspector groups fold like the reference (<details>) and show the current value in the header; which
// groups are folded is the per-user layout preference (ed.layout.closed).
function edGroup(name, value, body) {
  return `<details class="editor-insp-group" data-ed-group="${esc(name)}" ${ed.layout.closed.includes(name) ? "" : "open"}><summary><b>${esc(name)}</b><span class="note">${esc(value)}</span></summary>${body}</details>`;
}
// Number fields take arithmetic (1920/2), ↑／↓ (Shift ×10, Alt ×0.1), Esc to restore, and scrubbing on the label.
function edNumber(key, title, value, { min, max, step }) {
  return `<label><span data-ed-num-label>${esc(title)}</span><input class="text-input" type="text" inputmode="decimal" data-ed-field="${esc(key)}" data-ed-num data-min="${min}" data-max="${max}" data-step="${step}" aria-label="${esc(title)}" value="${esc(value ?? "")}"></label>`;
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
    return "前面沒有緊接（無空隙）的主軌片段，轉場無法輸出；可開啟時間軸的「磁性主軌」補齊空隙。";
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
  if (tool === "edit" && edClip()) edRender();
}
function edColorPane(p, c) {
  if (!c || !["video", "image"].includes(c.kind))
    return "<h3>調色</h3><p>請先選取影片或圖片片段。</p>";
  if (!ed.luts) {
    ed.luts = [];
    edLutRefresh().catch(VideoWorkbench.reportError);
  }
  return (
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
// Card ED.1: the reference editor's layout (docs/editor-parity-spec-20261106.md §1.2–1.6). Rail order as the reference;
// 片頭 lives in 文字, 調色 in the clip inspector, 影格率 in 整片設定 › 輸出, the peak meter in 音訊 (operator 2026-11-06).
const edPanes = [
  ["素材", "▤"],
  ["文字", "T"],
  ["音訊", "♪"],
  ["轉場", "⧉"],
  ["特效", "✧"],
  ["貼圖", "▣"],
  ["字幕", "☰"],
  ["剪贅字", "✂"],
];
// Panel sizes are a per-user preference (tools.editor.layout), never project data.
const edLayoutLimits = { left: [200, 480], right: [240, 480], timeline: [110, 560] },
  edLayoutDefault = { left: 294, right: 300, timeline: 150, leftOpen: true, rightOpen: true, closed: [], preview: "1080P" },
  edGroupNames = ["畫面", "聲音", "文字與字幕", "輸出", "畫面效果", "變形", "背景", "播放速度", "音訊", "時間", "調色", "文字"];
function edLayout(raw) {
  const l = { ...edLayoutDefault };
  for (const [k, [min, max]] of Object.entries(edLayoutLimits))
    if (Number.isFinite(raw?.[k])) l[k] = Math.min(max, Math.max(min, Math.round(raw[k])));
  for (const k of ["leftOpen", "rightOpen"]) if (typeof raw?.[k] === "boolean") l[k] = raw[k];
  l.closed = Array.isArray(raw?.closed) ? raw.closed.filter((n) => edGroupNames.includes(n)) : [];
  if (raw?.preview === "720P") l.preview = "720P";
  return l;
}
const edColumns = (l = ed.layout) =>
  ["58px", l.leftOpen && l.left + "px", l.leftOpen && "6px", "minmax(320px,1fr)", l.rightOpen && "6px", l.rightOpen && l.right + "px"]
    .filter(Boolean)
    .join(" ");
function edLayoutSave() {
  VideoWorkbench.preferences.set("tools.editor.layout", ed.layout).catch(VideoWorkbench.reportError);
}
const edTotal = () => Math.max(0, ...(edProject()?.clips || []).map((c) => c.start + c.duration)),
  // Where playback stops or loops: the last clip's end (edEnd's 3 s minimum is for the empty timeline's width).
  edPlayEnd = () => edTotal() || edEnd();
function edClockText(seconds) {
  const cs = Math.round(Math.max(0, seconds) * 100),
    pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}
function edSaveText() {
  if (ed.save.state === "saving") return "● 儲存中…";
  if (ed.save.state === "error") return "● 儲存失敗";
  return ed.save.at ? "● 已儲存 " + ed.save.at.toLocaleTimeString("zh-TW") : "● 已儲存";
}
function edSavePaint() {
  const el = document.querySelector("[data-ed-saved]");
  if (!el) return;
  el.textContent = edSaveText();
  el.dataset.state = ed.save.state;
}
function edIconButton(label, glyph, action, pressed, disabled = false) {
  return `<button type="button" class="btn small editor-icon-btn${pressed ? " selected" : ""}" data-ed-action="${esc(action)}" aria-label="${esc(label)}" title="${esc(label)}"${pressed === undefined ? "" : ` aria-pressed="${pressed}"`}${disabled ? " disabled" : ""}>${glyph}</button>`;
}
function edResizer(side, orientation, label, value) {
  return `<div class="editor-resize editor-resize-${orientation}" data-ed-resize="${side}" role="separator" aria-orientation="${orientation}" aria-label="${label}" aria-valuenow="${value}" tabindex="0"></div>`;
}
function edPeakMeter() {
  return `<div class="row editor-peak" data-ed-peak role="meter" aria-label="主輸出峰值" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60"><span class="editor-peak-bar" style="display:inline-block;width:160px;height:8px;border:1px solid currentColor;position:relative"><i data-ed-peak-fill style="position:absolute;left:0;top:0;bottom:0;width:0;background:#4ade80"></i></span><span data-ed-peak-text>峰值 — dBFS</span><span class="note">播放時顯示；超過 −1 dB 會在輸出時自動壓低</span></div>`;
}
// Ratio choices read 「16:9 橫屏」 like the reference; the stored value stays the bare ratio.
function edRatioSelect(p, label, visibleLabel) {
  const names = Object.fromEntries(edCreateRatios.map(([r, name]) => [r, name])),
    select = `<select class="text-input" aria-label="${label}" data-ed-field="project:ratio">${Object.keys(edRatios)
      .map((r) => `<option value="${r}" ${r === p.ratio ? "selected" : ""}>${esc(r + " " + (names[r] || ""))}</option>`)
      .join("")}</select>`;
  return visibleLabel ? `<label>${label}${select}</label>` : select;
}
function edTopbar(p) {
  return `<header class="editor-topbar"><div class="editor-topbar-group"><button type="button" class="btn small" data-ed-action="projects" aria-label="回到這一集">← 回到這一集</button><label class="editor-title"><input class="text-input" aria-label="專案名稱" data-ed-field="project:title" type="text" maxlength="100" value="${esc(p.title)}"><span aria-hidden="true">✎</span></label>${edRatioSelect(p, "輸出比例", false)}</div><span class="editor-saved" data-ed-saved role="status" data-state="${ed.save.state}">${esc(edSaveText())}</span><div class="editor-topbar-group">總時長：<b class="editor-total" data-ed-total>${edClockText(edTotal())}</b><button type="button" class="btn primary small" data-ed-action="export" aria-label="匯出" ${p.clips.length ? "" : "disabled"}>▷ 匯出</button></div></header>`;
}
function edRail() {
  const open = ed.layout.leftOpen;
  return `<nav class="editor-panes" aria-label="編輯面板">${edPanes
    .map(
      ([title, icon]) =>
        `<button type="button" class="editor-pane-btn${ed.pane === title && open ? " selected" : ""}" data-ed-pane="${title}" aria-pressed="${ed.pane === title && open}"><span aria-hidden="true">${icon}</span>${title}</button>`,
    )
    .join("")}${edIconButton(open ? "收合左側面板" : "展開左側面板", open ? "«" : "»", "layout:left")}</nav>`;
}
function edPane(p, c) {
  if (ed.pane === "素材")
    return `<h3>素材</h3>${edButton("從素材庫加入", "library")}${edButton("上傳素材", "upload")}<p class="note">影片／圖片加入 V1，音訊加入 A1。可在屬性更換軌道。</p>${p.assets.map((a) => `<div class="editor-asset">${esc(a.name || "素材")}${edButton("加入時間軸", "asset:" + a.id)}</div>`).join("")}`;
  if (ed.pane === "文字")
    return `<h3>文字</h3>${["空白文字", "主標題", "副標題", "內文", "重點提示", "金句", "步驟", "章節", "下標", "開場", "結尾", "價格", "標籤", "品牌", "呼籲行動"].map((title, i) => edButton(title, "text:" + i)).join("")}<hr>${edTitlePane(p)}`;
  if (ed.pane === "音訊")
    return `<h3>音訊</h3>${edButton("選擇音訊", "library:audio")}${edButton("上傳音訊", "upload:audio")}<p class="note">每條音訊軌可獨立安排時間、音量、淡入淡出與音量均衡；音量＝片段音量 × 軌道音量（0 為靜音）。</p>${edLoudnessPane(p)}${edPeakMeter()}${c && ["video", "audio"].includes(c.kind) ? edKeysPane(p, c) : ""}`;
  if (ed.pane === "轉場") return edTransitionPane(p, c);
  if (ed.pane === "特效")
    return '<h3>畫面效果</h3><p class="note">濾鏡、遮罩與顆粒在右側屬性面板調整：選取片段時設定該片段，未選取時是整片設定。光漏、鏡頭震動與關鍵影格尚未接入。</p>';
  if (ed.pane === "貼圖")
    return `<h3>貼圖／品牌圖</h3>${edButton("選擇圖片", "library:image")}${edButton("上傳透明 PNG", "upload:image")}<p class="note">以主影片軌之上的影片軌疊加圖片，可設定時間、位置、大小與透明度。</p>`;
  if (ed.pane === "字幕")
    return `<h3>字幕</h3>${edButton("匯入 SRT／VTT", "subtitles-import")}${edButton("下載 SRT", "subtitles-download:srt")}${edButton("下載 VTT", "subtitles-download:vtt")}${edButton("前往字幕工具", "subtitles-tool")}<p class="note">每段字幕為文字軌片段，可逐段修改。時間重疊的字幕分放在不同文字軌；下載時重疊部分合併成同一段（多行）。辨識與翻譯請至字幕工具處理後匯入。</p>`;
  return "<h3>剪贅字</h3><p>自動剪贅字需要逐字時間戳服務，目前尚未接入。可分割後用「波紋刪除」（Alt+Delete）手動剪除。</p>";
}
function edPlayer(p) {
  const [w, h] = edRatios[p.ratio];
  // An empty project shows where to start instead of a black frame (reference: 「先放一個鏡頭，故事就開始。」).
  const empty = p.clips.length
    ? ""
    : `<div class="editor-stage-empty"><b>先放一個鏡頭，故事就開始。</b><p class="note">從素材庫加入影片、圖片，會放到主視訊軌。</p>${edButton("更多素材", "library")}${edButton("加入文字", "text:0")}</div>`;
  return `<section class="editor-player"><div class="editor-stage-frame" data-ed-stage-frame><div class="editor-stage" data-ed-stage style="--ed-aspect:${w}/${h};--ed-ar:${w / h}">${empty}</div></div><div class="editor-transport"><span class="editor-transport-group"><span class="editor-clock" data-ed-clock></span>${edIconButton("查看說明：播放快捷鍵", "ⓘ", "help:play")}</span><div class="editor-transport-group">${edIconButton("跳至開頭", "⏮", "jump:start")}${edIconButton("後退 1 秒", "↺", "jump:-1")}${edIconButton("播放／暫停 (Space)", ed.playing ? "❚❚" : "▶", "play")}${edIconButton("前進 1 秒", "↻", "jump:1")}${edIconButton("跳至結尾", "⏭", "jump:end")}</div><div class="editor-transport-group">${edIconButton("循環播放", "⟲", "loop", ed.loop)}${edChoices("預覽畫質", "preview", ed.layout.preview, ["720P", "1080P"])}<span class="note" data-ed-preview-note role="status"></span>${edIconButton("全螢幕瀏覽 (F)", "⛶", "fullscreen")}${ed.layout.rightOpen ? "" : edIconButton("展開檢查器", "«", "layout:right")}</div></div></section>`;
}
function edInspector(p, c) {
  const head = (title) =>
    `<div class="editor-inspector-head"><b>${title}</b>${edIconButton("收合檢查器", "»", "layout:right")}</div>`;
  return c ? head("選取對象") + edClipInspector(p, c) : head("整片設定") + edProjectSettings(p);
}
// Card ED.3.1: 整片設定 = the reference's four groups. Effects here are the project layer (spec §4); the two dB rows
// are the 配樂 A2 / 旁白 A1 track volumes and only show when that track exists.
function edProjectSettings(p) {
  const [w, h] = edRatios[p.ratio],
    names = Object.fromEntries(edCreateRatios.map(([r, name]) => [r, name])),
    percent = (key) => {
      const r = EditorModel.EFFECTS[key];
      return edNumber("fx-project:" + key, r.label + "（%）", Math.round((p[key] ?? r.neutral) * 100), { min: 0, max: 100, step: 1 });
    },
    db = (id, title) =>
      edTrack(p, id) ? edNumber("track-db:" + id, title, Number(EditorModel.volumeToDb(edTrack(p, id).volume).toFixed(1)), { min: EditorModel.DB.min, max: 12, step: 0.5 }) : "";
  return (
    edGroup("畫面", p.ratio, `<p class="note">畫面比例</p>${edChoices("畫面比例", "project-ratio", p.ratio, Object.keys(edRatios), (r) => r + " " + (names[r] || ""))}<p class="note">整片濾鏡</p>${edChoices("整片濾鏡", "project-filter", p.filter || "原始", edFilters)}${["filterStrength", "grain", "lightLeak", "shake"].map(percent).join("")}${edButton("更多特效與遮罩", "pane:特效")}`) +
    edGroup("聲音", "", `${db("A2", "配樂（dB）")}${db("A1", "旁白（dB）")}${edButton("自動降低音量、循環、響度", "pane:音訊")}`) +
    edGroup("文字與字幕", "", `${edButton("整軌字幕樣式", "pane:字幕")}${edButton("一鍵整片字幕", "pane:字幕")}${edButton("文字樣板", "pane:文字")}`) +
    edGroup("輸出", Timebase.label(p.timebase), `<p class="note">${w} × ${h} · ${esc(Timebase.label(p.timebase))}　${edTotal().toFixed(1)}s · ${p.clips.length} 段</p><p class="note">影格率</p>${edChoices("影格率", "project-timebase", Timebase.label(p.timebase), Timebase.allowed.map(Timebase.label))}${edButton("匯出影片", "export", !p.clips.length)}`) +
    `<p class="note">點擊時間軸上的片段，這裡會變成該片段的屬性。</p>`
  );
}
// Re-snap once: each clip keeps its time in seconds as closely as the new frame grid allows.
function edSetTimebase(p, label) {
  const timebase = Timebase.fromLabel(label);
  if (!timebase) throw Error("不支援的影格率");
  const ratio = Timebase.fps(timebase) / Timebase.fps(p.timebase);
  p.timebase = { num: timebase.num, den: timebase.den };
  for (const row of p.clips) {
    edTime(p, row, { start: row.start, duration: row.duration, sourceStart: row.sourceStart });
    edRescaleKeys(row, ratio);
  }
}
const edMainVisual = (p) => p.clips.filter((row) => row.track === edMain(p) && ["video", "image"].includes(row.kind));
// Card ED.3 §4: an effect written at one scope clears the narrower layers, so what is set is what shows; reading is
// nearest-first (EditorModel.effectValue). The caller takes the undo checkpoint and commits.
function edWriteEffect(p, c, key, value, scope) {
  const visual = (row) => ["video", "image"].includes(row.kind);
  if (scope === "整片") {
    p[key] = value;
    for (const t of p.tracks) if (t.kind === "video") delete t[key];
    for (const row of p.clips) if (visual(row)) delete row[key];
  } else if (scope === "此軌") {
    edTrack(p, c.track)[key] = value;
    for (const row of p.clips) if (row.track === c.track) delete row[key];
  } else c[key] = value;
}
// Card ED.3.3 變形 (video / image): with keyframes the fields show the value at the playhead and an edit sets a key
// there; ◇ adds one with the current values, ◆ removes the one under the playhead.
function edTransformFields(p, c) {
  const overlay = edOverlay(p, c.track),
    keys = c.transformKeys || [],
    frame = edFrame(p) - c.startFrame,
    t = edTransform(p, c),
    onKey = keys.some((k) => k.frame === frame),
    [min, max] = overlay ? EditorModel.TRANSFORM.overlay : EditorModel.TRANSFORM.main;
  return (
    `<div data-ed-transform>` +
    edNumber("tf:scale", "縮放（×）", Number(t.scale.toFixed(3)), { min: 0.1, max: 5, step: 0.01 }) +
    edNumber("tf:x", overlay ? "X（%）" : "X（px）", Number(t.x.toFixed(2)), { min, max, step: 1 }) +
    edNumber("tf:y", overlay ? "Y（%）" : "Y（px）", Number(t.y.toFixed(2)), { min, max, step: 1 }) +
    edNumber("tf:rotation", "旋轉（°）", Number(t.rotation.toFixed(2)), { min: -360, max: 360, step: 1 }) +
    `</div>` +
    edNumber("tf:opacity", "不透明度（%）", Math.round(c.opacity * 100), { min: 0, max: 100, step: 1 }) +
    (overlay ? edInput("width", "疊加寬度（%）", c.width, "number", 'min="1" max="100"') : "") +
    (onKey ? edButton("◆ 移除此關鍵影格", "tf-key-delete") : edButton("◇ 新增關鍵影格", "tf-key-add")) +
    (keys.length ? edButton("清除全部關鍵影格", "tf-key-clear") + `<p class="note">關鍵影格 ${keys.length} 個</p>` : "")
  );
}
// Scale / position / rotation at the playhead: keyframed when the clip has keys, else the static fields.
function edTransform(p, c) {
  return EditorModel.transformAt(c.transformKeys, edFrame(p) - c.startFrame) || { scale: c.scale, x: c.x, y: c.y, rotation: c.rotation };
}
// Card ED.3.3 音訊 extras: 分離音訊 (video) and 旁白時自動降低 (not on the narration track A1).
function edAudioExtras(p, c) {
  const detached = p.clips.some((o) => o.detachedFrom === c.id),
    narration = !!edTrack(p, EditorModel.NARRATION);
  return (
    (c.kind === "video" ? edButton(detached ? "已分離到旁白軌" : "分離音訊", "detach-audio", detached) : "") +
    (c.track === EditorModel.NARRATION
      ? ""
      : `<div class="flow-choices"><button type="button" class="btn small${c.duck ? " selected" : ""}" data-ed-action="toggle:duck" aria-pressed="${!!c.duck}"${narration ? "" : " disabled"}>旁白時自動降低</button></div>` +
        (narration ? "" : `<p class="note">需要旁白 A1 軌</p>`))
  );
}
// Narration (A1) clips that reach the mix, as ducking ranges for clip c (same rule as the export's inMix).
function edDuckRanges(p, c) {
  const intervals = p.clips
    .filter((o) => {
      const t = edTrack(p, o.track),
        peak = o.volumeKeys?.length ? Math.max(...o.volumeKeys.map((k) => k.gain)) : o.volume;
      return o.track === EditorModel.NARRATION && o.kind !== "image" && !o.hidden && !o.muted && t && !t.hidden && !t.muted && t.volume * peak > 0;
    })
    .map((o) => [o.start, o.start + o.duration]);
  return EditorModel.duckRanges(c.start, c.duration, intervals);
}
// Keys travel with the clip when it is trimmed, split or shortened: both kinds, rebased to `from`, edges pinned.
function edWindowKeys(next, src, from, to) {
  if (src.volumeKeys?.length) next.volumeKeys = edKeysWindow(src.volumeKeys, from, to);
  if (src.transformKeys?.length) next.transformKeys = edTransformWindow(src.transformKeys, from, to);
}
function edTransformWindow(keys, from, to) {
  return edWindow(keys, from, to, (frame) => EditorModel.transformAt(keys, frame));
}
// Card ED.3.6: the clip inspector in the reference's groups (spec ED.3.6); the 軌道 buttons are AwareWave's (compare
// #47). Keep cpEditorClip last: later cards anchor after it.
function edClipInspector(p, c) {
  const kind = c.kind === "text" ? "text" : c.kind === "audio" ? "audio" : "video",
    main = c.track === edMain(p),
    media = ["video", "audio"].includes(c.kind),
    time =
      edInput("start", "起點", c.start, "number", 'min="0" step="0.1"') +
      edInput("duration", "長度", c.duration, "number", 'min="0.05" step="0.1"') +
      (media
        ? edInput("sourceStart", "來源起點", c.sourceStart, "number", 'min="0" step="0.1"') +
          edInput("sourceEnd", "來源終點", Number((c.sourceStart + c.duration * c.speed).toFixed(3)), "number", 'min="0" step="0.1"') +
          (c.asset?.duration ? `<p class="note">素材原始長度 ${Number(c.asset.duration.toFixed(2))}s</p>` : "")
        : ""),
    speeds = [0.5, 1, 1.5, 2],
    speed = edChoices("播放速度", "speed", c.speed, speeds, (v) => v + "x") + (speeds.includes(c.speed) ? "" : `<p class="note">目前 ${c.speed}x</p>`),
    audio =
      edNumber("volumeDb", "音量（dB）", Number(EditorModel.volumeToDb(c.volume).toFixed(1)), { min: EditorModel.DB.min, max: 12, step: 0.1 }) +
      edButton(c.muted ? "取消片段靜音" : "片段靜音", "toggle:muted") +
      edInput("fadeIn", "音訊淡入（秒）", c.fadeIn, "number", 'min="0" step="0.1"') +
      edInput("fadeOut", "音訊淡出（秒）", c.fadeOut, "number", 'min="0" step="0.1"'),
    transform =
      edInput("x", main ? "水平偏移（px）" : "水平位置（%）", c.x) +
      edInput("y", main ? "垂直偏移（px）" : "垂直位置（%）", c.y) +
      edInput("scale", "縮放", c.scale, "number", 'min="0.1" max="5" step="0.1"') +
      edInput("rotation", "旋轉角度", c.rotation, "number", 'min="-360" max="360"') +
      edInput("opacity", "不透明度", c.opacity, "number", 'min="0" max="1" step="0.1"') +
      (edOverlay(p, c.track) ? edInput("width", "疊加寬度（%）", c.width, "number", 'min="1" max="100"') : ""),
    groups = {
      time: edGroup("時間", c.duration.toFixed(2) + "s", time),
      speed: edGroup("播放速度", c.speed + "x", speed),
      audio: edGroup("音訊", Math.round(c.volume * 100) + "%", audio + edAudioExtras(p, c)),
      transform: edGroup("變形", "×" + c.scale.toFixed(2), kind === "video" ? edTransformFields(p, c) : transform),
    };
  let html =
    `<h4>${esc(edTrackLabel(p, edTrack(p, c.track)))} 片段</h4><div class="flow-choices" role="group" aria-label="軌道">${p.tracks
      .filter((t) => t.kind === kind)
      .map(
        (t) =>
          `<button type="button" class="btn small ${t.id === c.track ? "selected" : ""}" data-ed-action="clip-track:${esc(t.id)}" aria-pressed="${t.id === c.track}">${esc(t.name)}</button>`,
      )
      .join("")}</div>`;
  if (kind === "text")
    html +=
      edGroup(
        "文字",
        "",
        `<label>文字內容<textarea data-ed-field="text" aria-label="文字內容" maxlength="4000">${esc(c.text)}</textarea></label>` +
          edInput("fontSize", "字體大小", c.fontSize, "number", 'min="8" max="300"') +
          `<p class="note">字型</p>` +
          edChoices("字型", "text-font", c.font, ["思源黑體", "思源宋體", "Arial", "Georgia", "等寬字"]) +
          edButton(c.bold ? "取消粗體" : "粗體", "toggle:bold") +
          edButton(c.italic ? "取消斜體" : "斜體", "toggle:italic") +
          `<p class="note">文字對齊</p>` +
          edChoices("文字對齊", "text-align", c.align, ["靠左", "置中", "靠右"]) +
          edColor("color", "文字顏色", c.color) +
          edButton(c.backgroundColor ? "移除文字底色" : "加上文字底色", "text-background") +
          (c.backgroundColor ? edColor("backgroundColor", "文字底色", c.backgroundColor) : "") +
          `<p class="note">文字動畫</p>` +
          edChoices("文字動畫", "text-animation", c.animation, ["無", "淡入淡出", "彈出", "逐字顯示"]) +
          edButton("套用此樣式到此軌", "text-style:track") +
          edButton("套用到整片", "text-style:all"),
      ) +
      groups.transform +
      groups.time;
  else if (kind === "audio") html += groups.audio + groups.speed + groups.time;
  else {
    const background = c.background === "模糊" || c.background === "純色" ? c.background : "黑邊",
      fx = (key) => EditorModel.effectValue(p, edTrack(p, c.track), c, key);
    html +=
      edGroup(
        "畫面效果",
        "",
        edChoices("套用範圍", "fx-scope", ed.fxScope, ["整片", "此軌", "此片段"]) +
          `<p class="note">濾鏡</p>` +
          edChoices("濾鏡", "fx:filter", fx("filter"), edFilters) +
          ["filterStrength", "lightLeak", "shake", "grain"]
            .map((key) => edNumber("fx:" + key, EditorModel.EFFECTS[key].label + "（%）", Math.round(fx(key) * 100), { min: 0, max: 100, step: 1 }))
            .join("") +
          `<p class="note">形狀遮罩</p>` +
          edChoices("形狀遮罩", "mask", c.mask || "無", ["無", "圓形", "圓角矩形", "三角形"]),
      ) +
      groups.transform +
      (main
        ? edGroup(
            "背景",
            background,
            `<p class="note">套用到主軌所有片段</p>` +
              edChoices("背景", "background", background, ["黑邊", "模糊", "純色"]) +
              (background === "模糊" ? edNumber("backgroundBlur", "模糊強度", c.backgroundBlur ?? 20, { min: 2, max: 40, step: 1 }) : "") +
              (background === "純色" ? edColor("backgroundColor", "背景顏色", c.backgroundColor || "#000000") : ""),
          )
        : "") +
      (c.kind === "video" ? groups.speed + groups.audio : "") +
      groups.time +
      edGroup("調色", "", edColorPane(p, c));
  }
  // Card P3: a clip rendered by the compositor links back to its source composition (scripts/tools-compositor.js).
  if (typeof cpEditorClip === "function") html += cpEditorClip(p, c);
  return html;
}
// Card ED.2 (spec §1.6): toolbar keys are 「icon + word」 with the shortcut in the tooltip, as the reference; the frame
// step and in/out keys are AwareWave extras kept icon-only at the end of the edit group (decision 3), so the bar
// stays one row at 1600 px like the reference.
function edTool(label, glyph, action, { title = label, disabled = false, pressed, switch: toggle = false } = {}) {
  return `<button type="button" class="btn small editor-tool${toggle ? " editor-switch" : ""}${pressed ? " selected" : ""}" data-ed-action="${esc(action)}" title="${esc(title)}" ${disabled ? "disabled" : ""}${pressed === undefined ? "" : ` aria-pressed="${pressed}"`}><span class="editor-tool-icon" aria-hidden="true">${glyph}</span>${esc(label)}</button>`;
}
const edZoomLimits = { min: 10, max: 200, step: 15, initial: 50 };
function edToolbar(p, c) {
  const picked = edPicked(p),
    group = c ? EditorModel.styleGroup(c.kind) : null,
    pasteStyle = ed.styleClipboard && picked.some((x) => EditorModel.styleGroup(x.kind) === ed.styleClipboard.group);
  return `<div class="editor-toolbar"><div class="editor-toolbar-group">${edTool("復原", "↶", "undo", { title: "復原 (Ctrl+Z)", disabled: !ed.undo.length })}${edTool("重做", "↷", "redo", { title: "重做 (Ctrl+Shift+Z / Ctrl+Y)", disabled: !ed.redo.length })}</div><div class="editor-toolbar-group">${edTool("分割", "✂", "split", { title: "在播放頭位置分割選取的片段 (S / Ctrl+B)", disabled: !c })}${edTool("刪除", "✕", "delete", { title: "刪除片段 (Delete / Backspace)", disabled: !picked.length })}${edTool("波紋刪除", "⇤", "ripple", { title: "波紋刪除：刪除後同一軌後面的片段補上 (Alt+Delete)", disabled: !picked.length })}${edTool("複製", "⧉", "duplicate", { title: "複製 (Ctrl+D)", disabled: !picked.length })}${edTool("字幕", "+", "subtitle-add", { title: "新增字幕：在播放頭加一段 3 秒文字" })}${edTool("標記", "◆", "marker", { title: "在播放頭加入／移除標記 (M)" })}${edIconButton("上一格", "◁", "frame:-1")}${edIconButton("下一格", "▷", "frame:1")}${edIconButton("設為入點", "⌊", "set-in", undefined, !c)}${edIconButton("設為出點", "⌋", "set-out", undefined, !c)}</div><div class="editor-toolbar-group">${edIconButton("複製樣式 (Ctrl+Shift+C)", "◐", "style-copy", undefined, !group)}${edIconButton("貼上樣式 (Ctrl+Shift+V)", "◑", "style-paste", undefined, !pasteStyle)}</div><div class="editor-toolbar-group">${edTool("磁吸", "⊓", "snap", { title: "磁吸對齊 (N)", pressed: ed.snap, switch: true })}${edTool("磁性主軌", "⇥", "magnet", { title: "磁性主軌：編輯後移除主視訊軌的空隙；跨軌多選移動／複製保留同步", pressed: ed.magnet, switch: true })}${edIconButton("查看說明：磁性時間軸與吸附", "ⓘ", "help:magnet")}${edIconButton("查看說明：多選與批次編輯", "ⓘ", "help:select")}</div><div class="editor-toolbar-group editor-toolbar-end"><span class="editor-picked" data-ed-picked title="Shift / Cmd / Ctrl 點選多個片段">已選 ${picked.length}</span>${edIconButton("鍵盤快捷鍵 (?)", "?", "shortcuts")}<span class="editor-zoom">縮放${edIconButton("縮小 (Ctrl+-)", "−", "zoom:out")}<input type="range" min="${edZoomLimits.min}" max="${edZoomLimits.max}" value="${ed.zoom}" data-ed-zoom aria-label="時間軸縮放"><span title="每秒顯示的像素寬度" data-ed-zoom-text>${ed.zoom} px/s</span>${edIconButton("放大 (Ctrl+=)", "+", "zoom:in")}${edIconButton("自適應全片 (Shift+Z)", "⇔", "zoom:fit")}</span></div></div>`;
}
const edLaneHint = (p, id, kind) =>
  kind === "text"
    ? "字幕 — 點 + 新增一段文字"
    : kind === "audio"
      ? edTrackLabel(p, edTrack(p, id)).split(" ")[0] + " — 點 + 加入音訊素材"
      : id === edMain(p)
        ? "主視訊 — 點 + 或從左側「素材」加入影片／圖片"
        : "疊加層 — 放 logo、浮水印或子畫面，疊在主視訊之上";
// Reference track names: 字幕 / 文字、疊加 V2、主視訊 V1、旁白 A1、配樂 A2. A renamed track keeps its own name.
function edTrackLabel(p, t) {
  if (t.name && t.name !== t.id) return t.name;
  if (t.kind === "text") return t.id === edFirst(p, "text") ? "字幕 / 文字" : "文字 " + t.id;
  if (t.kind === "video") return (t.id === edMain(p) ? "主視訊 " : "疊加 ") + t.id;
  return ({ A1: "旁白 ", A2: "配樂 " }[t.id] || "音訊 ") + t.id;
}
const edTrackNoun = (p, t) =>
  t.kind === "text" ? "文字軌" : t.kind === "audio" ? "音訊軌" : t.id === edMain(p) ? "主視訊" : "疊加層";
// Screen order, top to bottom: the highest layer first (text, then overlays down to the main track), then audio.
// p.tracks keeps the layer order (index = z-order) and is never reordered for display.
const edTrackOrder = (p) => [
  ...p.tracks.filter((t) => t.kind !== "audio").reverse(),
  ...p.tracks.filter((t) => t.kind === "audio"),
];
// The overlay above / below this one in layer order; the main track never moves (it is the first video track).
function edOverlayNeighbour(p, id, dir) {
  const videos = p.tracks.filter((t) => t.kind === "video"),
    i = videos.findIndex((t) => t.id === id),
    j = i + dir;
  return i > 0 && j > 0 && j < videos.length ? videos[j] : null;
}
function edTrackHead(p, t) {
  const label = edTrackLabel(p, t),
    noun = edTrackNoun(p, t),
    icon = { text: "T", video: t.id === edMain(p) ? "▣" : "◫", audio: "♪" }[t.kind],
    add = t.kind === "text" ? "新增一段字幕" : `加入素材到「${label}」`,
    overlay = edOverlay(p, t.id);
  return `<div class="editor-track-name"><span class="editor-track-label" title="${esc(label)}"><span aria-hidden="true">${icon}</span>${esc(label)}</span><span class="editor-track-tools">${edIconButton(add, "+", "track-clip:" + t.id)}${t.id === edMain(p) ? "" : edIconButton("刪除軌道", "✕", "track-delete:" + t.id)}${edIconButton((t.hidden ? "顯示" : "隱藏") + noun, t.hidden ? "◌" : "◉", "track-hidden:" + t.id, t.hidden)}${overlay ? edIconButton("上移" + noun, "▲", "track-up:" + t.id, undefined, !edOverlayNeighbour(p, t.id, 1)) + edIconButton("下移" + noun, "▼", "track-down:" + t.id, undefined, !edOverlayNeighbour(p, t.id, -1)) : ""}${t.kind !== "text" ? edIconButton(t.muted ? "取消靜音" : "靜音軌道", t.muted ? "∅" : "♪", "track-muted:" + t.id, t.muted) : ""}${t.kind === "audio" ? edIconButton(t.normalize ? "取消均衡" : "均衡", "≋", "track-normalize:" + t.id, t.normalize) : ""}</span></div>`;
}
// Media made by backend/media-store.cjs keep thumb.jpg and waveform.json beside the original; assets saved before
// those fields existed still find them from the /media/<sha256>/ url.
function edMediaFile(a, name) {
  const field = name === "thumb.jpg" ? a?.thumbUrl : a?.waveformUrl;
  if (field) return field;
  const m = /^(\/media\/[a-f0-9]{64}\/)[^/]+$/.exec(a?.url || "");
  return m ? m[1] + name : null;
}
function edClipHtml(p, c, picked) {
  const name = c.text || c.asset?.name || "片段",
    selected = picked.has(c.id),
    thumb = c.kind === "image" ? c.asset?.previewUrl || c.asset?.url : c.kind === "video" ? edMediaFile(c.asset, "thumb.jpg") : null,
    sound = ["video", "audio"].includes(c.kind),
    wave = sound ? edMediaFile(c.asset, "waveform.json") : null,
    db = EditorModel.volumeToDb(c.volume),
    dbText = (db <= EditorModel.DB.min ? "−∞" : db.toFixed(1)) + " dB",
    // Line height inside the 18 px band: +6 dB at the top, -60 dB at the bottom.
    top = Math.max(0, Math.round(((EditorModel.DB.max - db) / (EditorModel.DB.max - EditorModel.DB.min)) * 16)),
    kind = { video: "影片", image: "圖片", audio: "音訊", text: "文字" }[c.kind] || "";
  return `<div class="editor-clip editor-clip-${esc(c.kind)}${selected ? " selected" : ""}" data-ed-clip="${c.id}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${esc(name)}，${kind}片段，${selected ? "已選取" : "未選取"}，起點 ${c.start.toFixed(2)} 秒，時長 ${c.duration.toFixed(2)} 秒。按 Enter 選取；Shift／Ctrl＋Enter 加選。" title="${esc(name)} · ${c.start.toFixed(2)}s / ${c.duration.toFixed(2)}s" style="left:${c.start * ed.zoom}px;width:${Math.max(8, c.duration * ed.zoom)}px"><i class="editor-trim editor-trim-start" data-ed-trim="start" title="裁切起點"></i>${thumb ? `<img class="editor-clip-thumb" src="${esc(thumb)}" alt="" aria-hidden="true">` : c.kind === "video" && c.asset?.url ? `<video class="editor-clip-thumb" src="${esc((c.asset.previewUrl || c.asset.url) + "#t=" + (c.sourceStart + 0.1).toFixed(2))}" preload="metadata" muted playsinline aria-hidden="true"></video>` : ""}<span class="editor-clip-name">${esc(name)}</span>${sound ? `<span class="editor-clip-band">${wave ? `<canvas data-ed-wave="${esc(wave)}" aria-label="音訊波形"></canvas>` : ""}<i class="editor-clip-volume" data-ed-volume role="slider" tabindex="0" aria-label="片段音量" aria-valuemin="${EditorModel.DB.min}" aria-valuemax="${EditorModel.DB.max}" aria-valuenow="${db.toFixed(1)}" aria-valuetext="${dbText}" title="片段音量：${dbText}（上下拖曳調整，雙擊重設為 0 dB）" style="top:${top}px"></i></span>` : ""}<i class="editor-trim" data-ed-trim="end" title="裁切終點"></i></div>`;
}
// 新增轉場效果: a button on every cut between two touching main-track clips.
function edCutButtons(p) {
  const main = edMain(p);
  return p.clips
    .filter((c) => c.track === main && edPrevious(p, c))
    .map(
      (c) =>
        `<button type="button" class="editor-cut" data-ed-action="cut:${c.id}" title="新增轉場效果" aria-label="新增轉場效果（剪點 ${c.start.toFixed(2)} 秒）" style="left:${c.start * ed.zoom}px">⧉</button>`,
    )
    .join("");
}
// Ruler labels at least ~80 px apart.
const edRulerStep = () => [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * ed.zoom >= 80) || 300;
function edTimeline(p) {
  const width = Math.max(600, edEnd() * ed.zoom + 100),
    step = edRulerStep(),
    ticks = [];
  // Lanes stretch to the panel width (CSS flex), so ticks run to the window width at least. Not screen.width:
  // tools-0.js declares a global function screen(), which hides window.screen (the ruler had no ticks).
  for (let s = 0; s * ed.zoom < Math.max(width, window.innerWidth); s += step)
    ticks.push(`<span class="editor-tick" style="left:${s * ed.zoom}px">${edClockText(s)}</span>`);
  const playhead = `<div class="editor-playhead" style="left:${ed.time * ed.zoom}px"></div>`,
    picked = new Set(edPicked(p).map((c) => c.id));
  return `<div class="editor-timeline" data-ed-timeline><div class="editor-track editor-ruler-row"><div class="editor-track-name"></div><div class="editor-ruler" data-ed-ruler role="slider" tabindex="0" aria-label="播放頭位置" aria-valuemin="0" aria-valuemax="${edEnd().toFixed(2)}" aria-valuenow="${ed.time.toFixed(2)}" style="width:${width}px">${ticks.join("")}${playhead}</div></div>${edTrackOrder(p)
    .map(
      (t) =>
        `<div class="editor-track" data-ed-track="${esc(t.id)}">${edTrackHead(p, t)}<div class="editor-track-lane" data-ed-lane="${esc(t.id)}" style="width:${width}px">${p.clips
          .filter((c) => c.track === t.id)
          .map((c) => edClipHtml(p, c, picked))
          .join("")}${t.id === edMain(p) ? edCutButtons(p) : ""}${p.clips.some((c) => c.track === t.id) ? "" : `<span class="editor-lane-hint">${edLaneHint(p, t.id, t.kind)}</span>`}${playhead}${(p.markers || []).map((time) => `<button class="editor-marker" data-ed-marker="${time}" style="left:${time * ed.zoom}px" title="跳至 ${time.toFixed(2)} 秒">◆</button>`).join("")}</div></div>`,
    )
    .join(
      "",
    )}<div class="editor-track"><div class="editor-track-name editor-track-add" title="影片軌最多 ${EditorModel.LIMITS.video} 條、音訊軌 ${EditorModel.LIMITS.audio} 條、文字軌 ${EditorModel.LIMITS.text} 條，合計最多 ${EditorModel.TOTAL} 條。第一條影片軌（${esc(edMain(p))}）是全畫面主軌，不能刪除。">${["video", "audio", "text"].map((kind) => edButton("新增" + EditorModel.NAME[kind] + "軌", "track-add:" + kind, !EditorModel.canAdd(p.tracks, kind))).join("")}</div></div></div>`;
}
// Card PJ.1: the list of edit files is the projects page's (an episode's edit points at one); ed.projects is only
// their content. Also the target list of 放到剪輯 in tools-compositor.js and tools-3d.js.
function edSpineProjects() {
  try {
    return JSON.parse(VideoWorkbench.storage.getItem("awarewave-projects-screenshot-frontend-v1") || "null")?.projects || [];
  } catch (_) {
    return [];
  }
}
function edSpineList() {
  return edSpineProjects().flatMap((project) =>
    (project.episodes || [])
      .map((episode, i) => ({ project, episode, n: i + 1, file: episode.edit?.engine === "workbench-editor" && ed.projects.find((p) => p.id === episode.edit.projectId) }))
      .filter((x) => x.file),
  );
}
function edOpen(id) {
  ed.current = id;
  ed.selected = null;
  ed.picks.clear();
  ed.scroll = { left: 0, top: 0 };
  ed.time = 0;
  ed.undo = [];
  ed.redo = [];
}
// A new, empty edit file; opened and saved (the save adopts it into the projects page, shared/runtime.js).
async function edCreate(title, ratio, id = crypto.randomUUID()) {
  ed.projects.push({
    id,
    title: String(title || "").trim() || "未命名剪輯專案",
    ratio: edRatios[ratio] ? ratio : "16:9",
    timebase: { ...Timebase.DEFAULT },
    clips: [],
    assets: [],
    tracks: EditorModel.normalizeTracks(null),
    output: { loudness: EditorModel.LOUDNESS.neutral },
    markers: [],
  });
  edOpen(id);
  edRender();
  await edSave();
}
function toolEditorScreen(t) {
  const p = edProject(),
    c = edClip();
  if (!ed.ready) return wfWrap(t, "<p>讀取剪輯專案…</p>");
  if (!p)
    return wfWrap(
      t,
      `<h3>剪輯專案</h3><p class="note">保留原始素材；時間軸、文字與音軌獨立儲存。</p>${edButton("新建剪輯專案", "new")}<div class="flow-choices">${edSpineList()
        .map(({ project, n, file }) => `<span>${edButton(file.title + " · " + file.ratio, "open:" + file.id)} <span class="muted">屬於 ${esc(project.title)} › 第 ${n} 集</span></span>`)
        .join("")}</div>`,
    );
  const l = ed.layout;
  return `<div class="editor-app" data-tool-flow="edit" style="--ed-timeline:${l.timeline}px">${edTopbar(p)}<div class="editor-workspace" data-ed-workspace style="grid-template-columns:${edColumns()}">${edRail()}${l.leftOpen ? `<aside class="editor-library">${edPane(p, c)}</aside>${edResizer("left", "vertical", "調整面板寬度", l.left)}` : ""}${edPlayer(p)}${l.rightOpen ? `${edResizer("right", "vertical", "調整檢查器寬度", l.right)}<aside class="editor-inspector">${edInspector(p, c)}</aside>` : ""}</div>${edResizer("timeline", "horizontal", "調整時間軸高度", l.timeline)}${edToolbar(p, c)}${edTimeline(p)}</div>`;
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
  if (tool === "edit" && ed.pane === "文字") edRender();
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
  await edCommit(p);
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
  await edCommit(p);
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
  if (c.transformKeys?.length) EditorModel.transformKeys(c.transformKeys, c.durationFrames, edOverlay(edProject(), c.track));
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
// Card ED.3.2 preview only (the export uses FFmpeg's filters): each filter as CSS functions [name, value, neutral];
// strength k moves every value from neutral toward the filter's value.
const edFilterCss = {
  鮮豔: [["saturate", 1.4, 1], ["contrast", 1.08, 1]],
  復古: [["sepia", 0.25, 0], ["saturate", 0.75, 1]],
  黑白: [["grayscale", 1, 0]],
  暖色: [["sepia", 0.15, 0]],
  冷色: [["hue-rotate", 12, 0, "deg"], ["saturate", 0.95, 1]],
  電影感: [["contrast", 1.15, 1], ["saturate", 0.8, 1], ["brightness", 0.975, 1]],
  底片: [["contrast", 0.92, 1], ["saturate", 0.85, 1], ["brightness", 1.035, 1]],
  黃金時刻: [["sepia", 0.3, 0], ["saturate", 1.1, 1]],
  憂鬱: [["saturate", 0.6, 1], ["brightness", 0.97, 1], ["hue-rotate", 8, 0, "deg"]],
  清新: [["saturate", 1.1, 1], ["brightness", 1.04, 1]],
  賽博霓虹: [["saturate", 1.5, 1], ["contrast", 1.1, 1], ["hue-rotate", -15, 0, "deg"]],
  黑色電影: [["grayscale", 1, 0], ["contrast", 1.3, 1], ["brightness", 0.96, 1]],
  美食: [["saturate", 1.25, 1], ["brightness", 1.035, 1]],
  人像: [["contrast", 1.02, 1], ["brightness", 1.025, 1], ["saturate", 0.95, 1]],
  冷冽: [["hue-rotate", 15, 0, "deg"], ["contrast", 1.12, 1], ["saturate", 0.75, 1]],
};
function edFilter(p, c) {
  if (ed.compare) return "none";
  const fx = (key) => EditorModel.effectValue(p, edTrack(p, c.track), c, key),
    k = fx("filterStrength"),
    look = (edFilterCss[fx("filter")] || []).map(([f, v, n, unit = ""]) => `${f}(${Number((n + (v - n) * k).toFixed(4))}${unit})`),
    grade = edGrade(c);
  return [...look, ...(grade === "none" ? [] : [grade])].join(" ") || "none";
}
// Shake as a CSS transform prefix: the export zooms by 2A and moves its crop window by A·d(t) of the frame, so the
// picture moves by −A·d(t) of its width / height (EditorModel.shakeOffset).
function edShake(p, c) {
  const a = EditorModel.SHAKE.amplitude * EditorModel.effectValue(p, edTrack(p, c.track), c, "shake");
  if (!a) return "";
  const { dx, dy } = EditorModel.shakeOffset(ed.time - c.start);
  return `translate(${(-a * dx * 100).toFixed(3)}%,${(-a * dy * 100).toFixed(3)}%) scale(${1 + 2 * a}) `;
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
// Card ED.1.4: 720P plays preview720.* (backend/media-store.cjs preview(), made on first ask); 1080P plays previewUrl
// (the original, or the proxy). asset url -> preview url | null (nothing smaller: keep previewUrl) | Promise (making).
const edPreview720 = new Map();
function edPlayUrl(asset) {
  const made = ed.layout.preview === "720P" && edPreview720.get(asset.url);
  return typeof made === "string" ? made : asset.previewUrl || asset.url;
}
function edPreviewEnsure(p) {
  if (ed.layout.preview !== "720P") return;
  for (const c of p.clips) {
    const url = c.kind === "video" && c.asset?.url;
    if (!url || edPreview720.has(url)) continue;
    edPreview720.set(
      url,
      VideoWorkbench.request("/media/preview", { url })
        .then((r) => r?.previewUrl || null, (e) => (VideoWorkbench.reportError(e), null))
        .then((made) => {
          edPreview720.set(url, made);
          edPaint();
        }),
    );
  }
  const note = document.querySelector("[data-ed-preview-note]"),
    text = [...edPreview720.values()].some((v) => v instanceof Promise) ? "正在產生 720P 預覽檔…" : "";
  if (note && note.textContent !== text) note.textContent = text;
}
function edPaint() {
  const p = edProject(),
    stage = document.querySelector("[data-ed-stage]");
  if (!p || !stage) {
    edStop();
    return;
  }
  edPreviewEnsure(p);
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
  stage.querySelectorAll("[data-ed-layer],[data-ed-leak]").forEach((el) => {
    if (!ids.has(el.dataset.edLayer ?? el.dataset.edLeak)) {
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
      stage.append(el);
    }
    // A src change (720P file arrived, or 預覽畫質 switched) keeps the element; the seek below puts it back on ed.time.
    const src = c.kind === "text" ? null : edPlayUrl(c.asset);
    if (src && el.dataset.edSrc !== src) {
      el.dataset.edSrc = src;
      el.src = src;
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
      const shake = edShake(p, c),
        t = edTransform(p, c);
      el.style.cssText =
        (edOverlay(p, c.track)
          ? `position:absolute;width:${c.width * t.scale}%;left:${t.x * (1 - (c.width * t.scale) / 100)}%;top:${t.y}%;transform:${shake}rotate(${t.rotation}deg);opacity:${c.opacity * fade};z-index:${layer}`
          : `position:absolute;width:100%;height:100%;object-fit:contain;transform:${shake}translate(${(t.x * stage.clientWidth) / edRatios[p.ratio][0]}px,${(t.y * stage.clientHeight) / edRatios[p.ratio][1]}px) rotate(${t.rotation}deg) scale(${t.scale});opacity:${c.opacity * fade};z-index:${layer};background:${c.background === "純色" ? c.backgroundColor || "#000" : "#000"}`) +
        `;filter:${edFilter(p, c)}`;
      // Light leak: the export's radial gradient from the top-left corner, screen-blended (EditorModel.LIGHT_LEAK).
      const leak = EditorModel.effectValue(p, edTrack(p, c.track), c, "lightLeak");
      let glow = stage.querySelector(`[data-ed-leak="${c.id}"]`);
      if (!leak || ed.compare) glow?.remove();
      else {
        if (!glow) {
          glow = document.createElement("div");
          glow.dataset.edLeak = c.id;
          stage.append(glow);
        }
        // The export lights the clip's own box, before its opacity: an overlay's glow sits on the overlay.
        const L = EditorModel.LIGHT_LEAK,
          box = edOverlay(p, c.track) ? `left:${el.offsetLeft}px;top:${el.offsetTop}px;width:${el.offsetWidth}px;height:${el.offsetHeight}px;transform:${el.style.transform}` : "inset:0";
        glow.style.cssText = `position:absolute;${box};pointer-events:none;mix-blend-mode:screen;opacity:${leak * fade * c.opacity};background:radial-gradient(circle at 0 0, rgb(${L.rgb.join(",")}) 0, transparent ${L.reach * 100}%);z-index:${layer + 1}`;
      }
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
              (track?.volume ?? 1) *
              (c.duck && c.track !== EditorModel.NARRATION ? EditorModel.duckFactor(edDuckRanges(p, c), ed.time - c.start) : 1);
      // J reverse play: media cannot run backwards, so it stays paused, muted, and is seeked every paint.
      const reverse = ed.playing && ed.rate < 0;
      if (Math.abs(el.currentTime - target) > (reverse ? 0.04 : 0.2 * Math.abs(ed.rate)))
        try {
          el.currentTime = target;
        } catch (_) {}
      el.playbackRate = Math.min(16, c.speed * Math.abs(ed.rate));
      el.muted = !!(c.muted || track?.muted || reverse);
      const node = edAudioNode(el);
      if (node) {
        el.volume = 1;
        node.gain.value = gain;
      } else el.volume = Math.max(0, Math.min(1, gain));
      if (ed.playing && !reverse) el.play().catch(() => {});
      else el.pause();
    }
  }
  // Card ED.3.3: while the playhead moves, a keyframed clip's 變形 fields follow it (unless one is being typed in).
  const sel = edClip(),
    fields = document.querySelector("[data-ed-transform]");
  if (sel?.transformKeys?.length && fields && !fields.contains(document.activeElement)) {
    const t = edTransform(p, sel);
    for (const [name, digits] of [["scale", 3], ["x", 2], ["y", 2], ["rotation", 2]]) {
      const input = fields.querySelector(`[data-ed-field="tf:${name}"]`);
      if (input) input.value = input.defaultValue = String(Number(t[name].toFixed(digits)));
    }
  }
  const clock = document.querySelector("[data-ed-clock]"),
    ruler = document.querySelector("[data-ed-ruler]");
  if (clock)
    clock.textContent = `${edClockText(ed.time)} / ${edClockText(edTotal())} · ${ed.rate < 0 ? "倒播 " : ""}${Math.abs(ed.rate)}×`;
  ruler?.setAttribute("aria-valuenow", ed.time.toFixed(2));
  const play = document.querySelector('[data-ed-action="play"]');
  if (play) play.textContent = ed.playing ? "❚❚" : "▶";
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
  const timeline = document.querySelector("[data-ed-timeline]");
  if (timeline) {
    timeline.scrollLeft = ed.scroll.left;
    timeline.scrollTop = ed.scroll.top;
    timeline.onscroll = () => (ed.scroll = { left: timeline.scrollLeft, top: timeline.scrollTop });
  }
  edPaint();
  edWaves();
}
// Card ED.2: clip waveforms from the asset's waveform.json (peaks over the whole source, media-store.cjs). Only the
// part the clip plays is drawn. A missing file (no audio, older store) leaves the band empty.
const edWaveCache = new Map();
function edWaves() {
  const p = edProject();
  if (!p) return;
  for (const canvas of document.querySelectorAll("canvas[data-ed-wave]")) {
    const url = canvas.dataset.edWave,
      c = p.clips.find((x) => x.id === canvas.closest("[data-ed-clip]")?.dataset.edClip);
    if (!c) continue;
    if (!edWaveCache.has(url))
      edWaveCache.set(
        url,
        fetch(url)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      );
    edWaveCache.get(url).then((wave) => {
      if (!wave?.peaks?.length || !canvas.isConnected) return;
      const w = Math.max(1, Math.round(canvas.clientWidth)),
        h = Math.max(1, Math.round(canvas.clientHeight)),
        total = Number(wave.duration) || c.asset?.duration || 1,
        from = (c.sourceStart / total) * wave.peaks.length,
        span = ((c.duration * c.speed) / total) * wave.peaks.length,
        g = canvas.getContext("2d");
      canvas.width = w;
      canvas.height = h;
      g.fillStyle = getComputedStyle(canvas).color;
      for (let x = 0; x < w; x++) {
        const a = Math.floor(from + (x / w) * span),
          b = Math.max(a + 1, Math.floor(from + ((x + 1) / w) * span));
        let peak = 0;
        for (let i = a; i < b && i < wave.peaks.length; i++) peak = Math.max(peak, wave.peaks[i] || 0);
        const bar = Math.max(1, peak * h);
        g.fillRect(x, (h - bar) / 2, 1, bar);
      }
    });
  }
}
const edKindOf = (c) => (c.kind === "text" ? "text" : c.kind === "audio" ? "audio" : "video");
function edFreeStart(p, group, from, skip = new Set()) {
  const occupied = new Map();
  for (const c of p.clips)
    if (!skip.has(c.id)) occupied.set(c.track, [...(occupied.get(c.track) || []), [c.startFrame, c.startFrame + c.durationFrames]]);
  return EditorModel.freeStart(group, occupied, Math.max(0, from));
}
// Paste (Ctrl+V, at the playhead) and multi-clip duplicate (Ctrl+D, after the selection): the copies keep their
// relative timing and tracks, and go to the first time where none of them covers a clip already there. The copies
// become the selection. Several tracks at once = the reference's 「跨軌多選複製」, which skips 磁性主軌.
function edPlace(p, items, from) {
  const rows = items.map(({ clip, offset }) => ({
      clip,
      offset,
      track: edTrack(p, clip.track)?.kind === edKindOf(clip) ? clip.track : edTrackFor(p, edKindOf(clip)),
    })),
    start = edFreeStart(p, rows.map((r) => ({ track: r.track, offset: r.offset, durationFrames: r.clip.durationFrames })), from),
    copies = rows.map((r) => {
      const copy = edTime(p, { ...r.clip, id: crypto.randomUUID(), track: r.track }, { startFrame: start + r.offset });
      // A copy starts at a plain cut, like the second half of a split.
      delete copy.transition;
      delete copy.transitionFrames;
      edValidate(copy);
      return copy;
    });
  for (const copy of copies) {
    if (copy.asset && !p.assets.some((a) => a.id === copy.asset.id)) p.assets.push(copy.asset);
    p.clips.push(copy);
  }
  if (new Set(rows.map((r) => r.track)).size > 1) ed.skipMagnet = true;
  ed.picks = new Set(copies.map((x) => x.id));
  ed.selected = copies.at(-1)?.id || null;
}
// −／＋ step 15 px/s, Ctrl+0 back to 50, 自適應全片 fits the whole cut in the visible lane width. With a clientX
// (Ctrl+wheel) the time under the cursor stays under the cursor.
function edZoom(to, clientX) {
  const timeline = document.querySelector("[data-ed-timeline]"),
    lane = timeline?.querySelector("[data-ed-lane]"),
    head = timeline?.querySelector(".editor-track-name")?.offsetWidth || 0,
    visible = timeline ? timeline.clientWidth - head : 900,
    before = ed.zoom,
    z = edZoomLimits,
    next =
      to === "in"
        ? ed.zoom + z.step
        : to === "out"
          ? ed.zoom - z.step
          : to === "reset"
            ? z.initial
            : to === "fit"
              ? Math.floor((visible - 40) / Math.max(1, edTotal() || edEnd()))
              : Number(to);
  ed.zoom = Math.min(z.max, Math.max(z.min, Math.round(next) || z.initial));
  if (timeline && lane && clientX !== undefined) {
    const x = clientX - lane.getBoundingClientRect().left;
    ed.scroll.left = Math.max(0, timeline.scrollLeft - x + (x / before) * ed.zoom);
  } else if (to === "fit") ed.scroll.left = 0;
  edRedraw();
}
// Two help notes (toolbar ⓘ) and the playback-keys note (transport ⓘ), in our own words.
const edHelpText = {
  magnet: ["磁性時間軸與吸附", "「磁吸」讓拖曳中的片段邊緣靠近其他片段邊緣、播放頭或標記時自動對齊（拖曳時按住 Shift 暫時不吸附）。「磁性主軌」在每次編輯後把主視訊軌的空隙補起來，其他軌道不動。同時選了不同軌道的片段一起移動或複製時，保留它們彼此的時間差，不補空隙。"],
  select: ["多選與批次編輯", "按住 Shift、Cmd 或 Ctrl 點片段，可以加入或移出選取，再拖曳整組一起移動。Ctrl+A 全選、Ctrl+D 複製、Delete 刪除、Esc 取消選取。"],
  play: ["播放快捷鍵", "L 向前播放、J 倒著播放、K 停止；連按 J 或 L 依序切換 1×、2×、4×。空白鍵切換播放與暫停。倒播時沒有聲音；這些速度只影響預覽，不會改變匯出影片。"],
};
function edHelp(key) {
  const [title, text] = edHelpText[key] || [];
  if (!title) return;
  const d = edDialog(`<h3>${esc(title)}</h3><p>${esc(text)}</p><button type="button" class="btn small" data-ed-help-close>關閉說明</button>`);
  d.classList.add("editor-help");
  d.querySelector("[data-ed-help-close]").onclick = () => d.close();
}
// Card ED.2: the keyboard table lists only keys this editor handles (the numeric-field keys arrive with ED.3).
const edShortcutRows = [
  ["播放", [["播放／暫停", ["Space"]], ["倒播／停止／正播，連按切換 1×、2×、4×", ["J", "K", "L"]], ["播放頭前後 0.1 秒", ["←", "→"]], ["播放頭前後 1 秒", ["Shift+←", "Shift+→"]], ["跳到上一個／下一個標記", ["Alt+M", "Shift+M"]]]],
  ["剪輯", [["在播放頭分割", ["S", "Ctrl+B"]], ["刪除選取片段", ["Delete", "Backspace"]], ["波紋刪除（後面片段補上）", ["Alt+Delete"]], ["在播放頭加入／移除標記", ["M"]], ["複製片段", ["Ctrl+D"]], ["複製／貼上片段", ["Ctrl+C", "Ctrl+V"]], ["複製／貼上樣式（濾鏡、遮罩、調色或文字樣式）", ["Ctrl+Shift+C", "Ctrl+Shift+V"]], ["復原／重做", ["Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+Y"]], ["立即儲存", ["Ctrl+S"]]]],
  ["選取", [["加入或取消選取", ["Shift+Click", "Ctrl+Click"]], ["全選", ["Ctrl+A"]], ["取消選取", ["Esc"]]]],
  ["檢視", [["時間軸放大／縮小／重設", ["Ctrl+=", "Ctrl+-", "Ctrl+0"]], ["以游標為中心縮放（觸控板雙指開合）", ["Ctrl+滾輪"]], ["整條時間軸縮放到視窗寬度", ["Shift+Z"]], ["切換磁吸對齊", ["N"]], ["拖曳時暫時不吸附", ["Shift+拖曳"]], ["全螢幕預覽（再按一次或 Esc 離開）", ["F"]], ["收合／展開左側面板", ["[", "Alt+1"]], ["收合／展開檢查器", ["]", "Alt+2"]], ["開啟這份快捷鍵表", ["?"]]]],
];
function edShortcuts() {
  edDialog(
    `<h3>鍵盤快捷鍵</h3><div class="editor-shortcuts">${edShortcutRows
      .map(
        ([group, rows]) =>
          `<h4>${esc(group)}</h4><dl>${rows.map(([what, keys]) => `<dt>${esc(what)}</dt><dd>${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join("")}</dd>`).join("")}</dl>`,
      )
      .join("")}</div>`,
  ).classList.add("editor-shortcuts-dialog");
}
function edPlay(rate) {
  if (rate > 0 && ed.time >= edPlayEnd()) ed.time = 0;
  if (rate < 0 && ed.time <= 0) ed.time = edPlayEnd();
  edAudioStart();
  ed.rate = rate;
  if (ed.playing) return edPaint();
  ed.playing = true;
  let previous = performance.now();
  const tick = (now) => {
    if (!ed.playing || tool !== "edit") {
      edStop();
      return;
    }
    const end = edPlayEnd();
    ed.time = Math.max(0, Math.min(end, ed.time + ((now - previous) / 1000) * ed.rate));
    previous = now;
    const atEdge = ed.rate > 0 ? ed.time >= end : ed.time <= 0;
    if (atEdge && ed.loop) ed.time = ed.rate > 0 ? 0 : end;
    edPaint();
    if (atEdge && !ed.loop) edStop();
    else ed.raf = requestAnimationFrame(tick);
  };
  ed.raf = requestAnimationFrame(tick);
}
function edDialog(content) {
  const d = document.createElement("dialog");
  d.className = "editor-dialog";
  d.innerHTML = VideoWorkbench.sanitize(
    '<button class="editor-dialog-close" type="button" data-ed-close aria-label="關閉">×</button>' + content,
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
    // Card ED.1: the reference's 「新建剪輯專案」 -- name + a card per ratio (AwareWave also offers 4:3).
    const d = edDialog(
      `<form><h3>新建剪輯專案</h3><label>專案名稱<input data-ed-create-title class="text-input" aria-label="專案名稱" maxlength="100" value="未命名剪輯專案" required></label><fieldset class="editor-ratio-cards"><legend>畫面比例</legend>${edCreateRatios
        .map(
          ([r, name, use], i) =>
            `<label class="editor-ratio-card"><input type="radio" name="ratio" value="${r}" data-ed-create-ratio ${i ? "" : "checked"}><i style="aspect-ratio:${edRatios[r].join("/")}" aria-hidden="true"></i><b>${r} ${name}</b><small>${edRatios[r].join(" × ")} · ${use}</small></label>`,
        )
        .join("")}</fieldset><div class="row"><button class="btn" type="button" data-ed-create-cancel>取消</button><button class="btn primary" type="submit">建立專案</button></div></form>`,
    );
    d.querySelector("[data-ed-create-cancel]").onclick = () => d.close();
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const title = d.querySelector("[data-ed-create-title]").value,
        ratio = d.querySelector("[data-ed-create-ratio]:checked").value;
      d.close();
      await edCreate(title, ratio);
    };
    return;
  }
  if (action.startsWith("open:")) {
    edOpen(action.slice(5));
    edRender();
    return;
  }
  // 回到這一集: the episode this file belongs to; a tools page opened on its own has no projects page, so the list.
  if (action === "projects") {
    ed.current = null;
    edRender();
    await edSave();
    const hit = EpisodeSpine.findByEdit(edSpineProjects(), p?.id);
    if (hit) await VideoWorkbench.spine.open({ projectId: hit.project.id, episodeId: hit.episode.id });
    return;
  }
  if (!p) return;
  if (action === "play") {
    if (ed.playing) edStop();
    else edPlay(1);
    return;
  }
  // Card ED.2 J/K/L: L plays forward, J backwards (muted); pressing the same key again goes 1× → 2× → 4×. K stops.
  // Preview only: the clips' speed and the export are untouched.
  if (action.startsWith("rate:")) {
    const dir = { j: -1, l: 1 }[action.slice(5)];
    if (!dir) {
      edStop();
      edPaint();
    } else edPlay(ed.playing && Math.sign(ed.rate) === dir ? dir * Math.min(4, Math.abs(ed.rate) * 2) : dir);
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
      // Reference: a redo comes back with nothing selected (undo keeps the selection).
      if (action === "redo") {
        ed.selected = null;
        ed.picks.clear();
      }
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
  // Card ED.1: view actions (no undo step, no project change).
  if (action.startsWith("jump:")) {
    const to = action.slice(5);
    ed.time = Math.min(edEnd(), Math.max(0, to === "start" ? 0 : to === "end" ? edTotal() : ed.time + Number(to)));
    edPaint();
    return;
  }
  if (action === "loop") {
    ed.loop = !ed.loop;
    edRedraw();
    return;
  }
  if (action.startsWith("preview:")) {
    ed.layout.preview = action === "preview:720P" ? "720P" : "1080P";
    edLayoutSave();
    edRedraw();
    return;
  }
  if (action === "fullscreen") {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector("[data-ed-stage-frame]")?.requestFullscreen();
    return;
  }
  if (action.startsWith("layout:")) {
    const key = action.slice(7) + "Open";
    ed.layout = { ...ed.layout, [key]: !ed.layout[key] };
    edLayoutSave();
    edRedraw();
    return;
  }
  // Card ED.2 view actions: no undo step, playback keeps running.
  if (action === "snap" || action === "magnet") {
    ed[action] = !ed[action];
    VideoWorkbench.preferences
      .set("tools.editor.timeline", { snap: ed.snap, magnet: ed.magnet })
      .catch(VideoWorkbench.reportError);
    // Turning 磁性主軌 on closes the main track's existing gaps at once (one undo step), so the transition hint
    // 「開啟磁性主軌補齊空隙」 holds for an older project too (Codex ED.2 F3).
    const rows = p.clips.filter((c) => c.track === edMain(p)),
      starts = EditorModel.closeGaps(rows);
    if (action === "magnet" && ed.magnet && rows.some((c) => starts.get(c.id) !== c.startFrame)) {
      edCheckpoint();
      for (const c of rows) edTime(p, c, { startFrame: starts.get(c.id) });
      ed.skipMagnet = true;
      await edCommit(p);
      return;
    }
    edRedraw();
    return;
  }
  if (action.startsWith("zoom:")) {
    edZoom(action.slice(5));
    return;
  }
  if (action.startsWith("eyedrop:")) {
    const { sRGBHex } = await new window.EyeDropper().open(),
      input = document.querySelector(`[data-ed-field="${action.slice(8)}"]`);
    if (!input) return;
    input.value = sRGBHex;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (action.startsWith("fx-scope:")) {
    if (!["整片", "此軌", "此片段"].includes(action.slice(9))) return;
    ed.fxScope = action.slice(9);
    edRedraw();
    return;
  }
  // Card ED.3.1: 整片設定 shortcuts open a left pane (view only, no undo step).
  if (action.startsWith("pane:")) {
    if (!edPanes.some(([title]) => title === action.slice(5))) return;
    ed.pane = action.slice(5);
    ed.layout = { ...ed.layout, leftOpen: true };
    edLayoutSave();
    edRedraw();
    return;
  }
  if (action.startsWith("help:")) {
    edHelp(action.slice(5));
    return;
  }
  if (action === "shortcuts") {
    edShortcuts();
    return;
  }
  if (action === "select-all") {
    ed.picks = new Set(p.clips.map((x) => x.id));
    ed.selected = p.clips.at(-1)?.id || null;
    edRedraw();
    return;
  }
  if (action === "marker-prev" || action === "marker-next") {
    const t = Number(ed.time.toFixed(2)),
      marks = p.markers || [],
      to = action === "marker-prev" ? marks.filter((m) => m < t).at(-1) : marks.find((m) => m > t);
    if (to !== undefined) {
      ed.time = to;
      edPaint();
    }
    return;
  }
  if (action.startsWith("cut:")) {
    // 新增轉場效果 on a cut: the transition belongs to the later clip, so that clip is selected and 轉場 opens.
    if (!p.clips.some((x) => x.id === action.slice(4))) return;
    ed.selected = action.slice(4);
    ed.picks.clear();
    ed.pane = "轉場";
    if (!ed.layout.leftOpen) {
      ed.layout = { ...ed.layout, leftOpen: true };
      edLayoutSave();
    }
    edRedraw();
    return;
  }
  if (action === "copy") {
    const picked = edPicked(p);
    if (!picked.length) return;
    const base = Math.min(...picked.map((x) => x.startFrame));
    ed.clipboard = picked.map((x) => ({ clip: structuredClone(x), offset: x.startFrame - base }));
    return;
  }
  if (action === "style-copy") {
    const group = c && EditorModel.styleGroup(c.kind);
    if (!group) throw Error("請先選取影片、圖片或文字片段");
    ed.styleClipboard = {
      group,
      // Effects are copied as they resolve on this clip (clip, track or project layer, ED.3 §4), so the look travels.
      style: Object.fromEntries(
        EditorModel.STYLE[group]
          .map((k) => [k, Object.hasOwn(EditorModel.EFFECTS, k) ? EditorModel.effectValue(p, edTrack(p, c.track), c, k) : c[k]])
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, structuredClone(v)]),
      ),
    };
    edRedraw();
    return;
  }
  if (action === "save-now") {
    await edSave();
    return;
  }
  // ＋字幕 (toolbar) = the top text track's own ＋ (a text track is added first when the project has none).
  if (action === "subtitle-add" || action.startsWith("track-clip:")) {
    const sub = action === "subtitle-add";
    if (sub) edCheckpoint();
    const track = edTrack(p, sub ? edTrackFor(p, "text") : action.slice(11));
    if (!track) return;
    if (track.kind === "text") {
      if (!sub) edCheckpoint();
      const clip = edText("新文字", ed.time, 3, p, track.id),
        free = edFreeStart(p, [{ track: track.id, offset: 0, durationFrames: clip.durationFrames }], clip.startFrame);
      edTime(p, clip, { startFrame: free });
      p.clips.push(clip);
      ed.selected = clip.id;
      await edCommit(p);
      return;
    }
    const rows = await VideoWorkbench.pickAssets({ kind: track.kind === "audio" ? "audio" : "all" }),
      a = rows[0];
    if (!a || edProject() !== p) return;
    const kind = VideoWorkbench.mediaKind(a);
    if ((track.kind === "audio") !== (kind === "audio")) throw Error(track.kind === "audio" ? "音訊軌只能放音訊素材" : "影片軌只能放影片或圖片");
    await edAdd(a, track.id);
    return;
  }
  edCheckpoint();
  // M: a marker at the playhead is removed, otherwise one is added (reference 「在播放頭加入／移除標記」).
  if (action === "marker") {
    const t = Number(ed.time.toFixed(2)),
      marks = p.markers || [];
    p.markers = marks.some((m) => Math.abs(m - t) < 0.005)
      ? marks.filter((m) => Math.abs(m - t) >= 0.005)
      : [...marks, t].sort((a, b) => a - b);
  }
  if (action.startsWith("track-up:") || action.startsWith("track-down:")) {
    const [dir, id] = action.split(":"),
      other = edOverlayNeighbour(p, id, dir === "track-up" ? 1 : -1);
    if (!other) {
      ed.undo.pop();
      throw Error(dir === "track-up" ? "已是最上層的疊加層" : "已在主視訊軌上方第一層");
    }
    const i = p.tracks.findIndex((t) => t.id === id),
      j = p.tracks.indexOf(other);
    [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]];
  }
  // Delete / ripple delete / duplicate / paste work on the whole selection.
  if (action === "delete" || action === "ripple") {
    const gone = edPicked(p);
    if (!gone.length) {
      ed.undo.pop();
      return;
    }
    const ids = new Set(gone.map((x) => x.id));
    p.clips = p.clips.filter((row) => !ids.has(row.id));
    if (action === "ripple")
      for (const r of [...gone].sort((a, b) => b.startFrame - a.startFrame))
        for (const row of p.clips)
          if (row.track === r.track && row.startFrame >= r.startFrame + r.durationFrames)
            edTime(p, row, { startFrame: row.startFrame - r.durationFrames });
    ed.selected = null;
    ed.picks.clear();
  }
  // One clip keeps the original duplicate (the copy right after it); several go through edPlace.
  const several = action === "duplicate" && edPicked(p).length > 1;
  if (several) {
    const picked = edPicked(p),
      base = Math.min(...picked.map((x) => x.startFrame)),
      end = Math.max(...picked.map((x) => x.startFrame + x.durationFrames));
    edPlace(p, picked.map((x) => ({ clip: structuredClone(x), offset: x.startFrame - base })), end);
  } else if (action === "paste") {
    if (!ed.clipboard?.length) {
      ed.undo.pop();
      return;
    }
    edPlace(p, structuredClone(ed.clipboard), edFrame(p));
  }
  if (action === "style-paste") {
    const s = ed.styleClipboard,
      targets = edPicked(p).filter((x) => s && EditorModel.styleGroup(x.kind) === s.group);
    if (!targets.length) {
      ed.undo.pop();
      throw Error("樣式只能貼到同類片段（影片／圖片，或文字）");
    }
    for (const x of targets)
      for (const k of EditorModel.STYLE[s.group])
        if (Object.hasOwn(s.style, k)) x[k] = structuredClone(s.style[k]);
        else delete x[k];
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
        await edCommit(p);
      };
      return;
    }
    p.tracks = p.tracks.filter((t) => t.id !== id);
  }
  if (action.startsWith("project-filter:")) {
    const filter = action.slice(15);
    if (!edFilters.includes(filter)) throw Error("濾鏡不存在");
    edWriteEffect(p, c, "filter", filter, "整片");
  }
  if (action.startsWith("project-ratio:")) {
    if (!edRatios[action.slice(14)]) throw Error("比例不存在");
    p.ratio = action.slice(14);
    ed.skipMagnet = true;
  }
  if (action.startsWith("project-timebase:")) {
    edSetTimebase(p, action.slice(17));
    ed.skipMagnet = true;
  }
  if (action.startsWith("loudness:"))
    p.output = { ...p.output, loudness: Number(action.slice(9)) };
  if (c) {
    if (action.startsWith("fx:")) {
      const [, key, value] = action.split(":");
      if (key !== "filter" || !edFilters.includes(value)) throw Error("濾鏡不存在");
      edWriteEffect(p, c, key, value, ed.fxScope);
    }
    // Card ED.3.5 播放速度: the source range stays, the clip's length follows (2x: 22.4 s -> 11.2 s); keys and
    // fades move with it. 磁性主軌 re-lays the main track, so only other tracks check their neighbours.
    if (action.startsWith("speed:")) {
      const v = Number(action.slice(6));
      if (![0.5, 1, 1.5, 2].includes(v)) throw Error("播放速度不存在");
      const ratio = c.speed / v,
        next = edTime(p, { ...c, speed: v }, { durationFrames: Math.max(1, Math.round(c.durationFrames * ratio)) });
      edRescaleKeys(next, ratio);
      next.fadeIn = Math.min(next.fadeIn, next.duration / 2);
      next.fadeOut = Math.min(next.fadeOut, next.duration / 2);
      if (!(ed.magnet && c.track === edMain(p))) edNeighbours(p, next);
      edValidate(next);
      Object.assign(c, next);
    }
    const textChoice = { "text-font:": "font", "text-align:": "align", "text-animation:": "animation" };
    for (const [prefix, key] of Object.entries(textChoice)) if (action.startsWith(prefix)) c[key] = action.slice(prefix.length);
    if (action === "text-style:track" || action === "text-style:all") {
      if (c.kind !== "text") throw Error("請先選取文字片段");
      for (const row of p.clips)
        if (row.kind === "text" && row !== c && (action === "text-style:all" || row.track === c.track))
          for (const key of EditorModel.STYLE.text) {
            if (c[key] === undefined) delete row[key];
            else row[key] = structuredClone(c[key]);
          }
    }
    if (action.startsWith("mask:")) {
      if (!["無", "圓形", "圓角矩形", "三角形"].includes(action.slice(5))) throw Error("遮罩不存在");
      c.mask = action.slice(5);
    }
    if (action.startsWith("background:")) {
      const value = { 黑邊: "黑色", 模糊: "模糊", 純色: "純色" }[action.slice(11)];
      if (!value || c.track !== edMain(p)) throw Error("背景只用於主視訊軌");
      for (const row of edMainVisual(p)) row.background = value;
    }
    if (action === "toggle:duck") {
      if (c.duck) delete c.duck;
      else c.duck = true;
    } else if (action.startsWith("toggle:")) c[action.slice(7)] = !c[action.slice(7)];
    if (action === "tf-key-add" || action === "tf-key-delete" || action === "tf-key-clear") {
      const frame = edFrame(p) - c.startFrame,
        keys = c.transformKeys || [];
      if (action === "tf-key-clear") {
        Object.assign(c, edTransform(p, c)); // the values at the playhead become the static ones
        delete c.transformKeys;
      } else {
        if (frame < 0 || frame > c.durationFrames) throw Error("播放頭需位於片段內");
        const rest = keys.filter((k) => k.frame !== frame),
          next = action === "tf-key-add" ? [...rest, { frame, ...edTransform(p, c) }] : rest;
        if (next.length) c.transformKeys = EditorModel.transformKeys(next, c.durationFrames, edOverlay(p, c.track));
        else delete c.transformKeys;
      }
    }
    if (action === "detach-audio") {
      if (c.kind !== "video" || p.clips.some((o) => o.detachedFrom === c.id)) throw Error("這段已分離過音訊");
      // Reuses the same video file as the sound source (spec §9 Q2); the export plays it as audio.
      const track = edTrack(p, EditorModel.NARRATION) ? EditorModel.NARRATION : edTrackFor(p, "audio"),
        sound = edTime(
          p,
          {
            id: crypto.randomUUID(), kind: "audio", track, asset: c.asset, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut,
            ...(c.volumeKeys ? { volumeKeys: structuredClone(c.volumeKeys) } : {}),
            detachedFrom: c.id,
          },
          { startFrame: c.startFrame, durationFrames: c.durationFrames, sourceStartFrame: c.sourceStartFrame },
        );
      try {
        edNeighbours(p, sound);
      } catch (_) {
        throw Error("旁白軌在這段時間已有片段");
      }
      p.clips.push(sound);
      c.muted = true;
    }
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
          if (c.transformKeys) c.transformKeys = c.transformKeys.map((k) => ({ ...k, x: c.x, y: c.y }));
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
        edWindowKeys(next, c, delta, c.durationFrames);
        edNeighbours(p, next);
        edValidate(next);
        Object.assign(c, next);
      } else {
        const next = edTime(
          p,
          { ...c },
          { durationFrames: frame - c.startFrame },
        );
        edWindowKeys(next, c, 0, next.durationFrames);
        edNeighbours(p, next);
        edValidate(next);
        Object.assign(c, next);
      }
    }
    if (action === "duplicate" && !several) {
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
      edWindowKeys(copy, c, offset, c.durationFrames);
      edWindowKeys(c, c, 0, offset);
      edTime(p, c, { durationFrames: offset });
      for (const row of [c, copy]) {
        row.fadeIn = Math.min(row.fadeIn, row.duration / 2);
        row.fadeOut = Math.min(row.fadeOut, row.duration / 2);
      }
      p.clips.push(copy);
      ed.selected = copy.id;
    }
  }
  await edCommit(p);
}
// Keys inside [from, to] of a clip, rebased to `from`, with the interpolated gain pinned at both new edges.
function edKeysWindow(keys, from, to) {
  if (!keys?.length) return undefined;
  return edWindow(keys, from, to, (frame) => ({ gain: EditorModel.gainAt(keys, frame) }));
}
// Keys inside (from, to) rebased to `from`; an edge gets a pinned key only when keys lie at or beyond it (before the
// first and after the last key the value is held anyway), so a window never holds more keys than the clip had
// (EditorModel.MAX_KEYS; Codex ED.3.3 F3).
function edWindow(keys, from, to, valueAt) {
  return [
    ...(keys.some((k) => k.frame <= from) ? [{ frame: 0, ...valueAt(from) }] : []),
    ...keys.filter((k) => k.frame > from && k.frame < to).map((k) => ({ ...k, frame: k.frame - from })),
    ...(keys.some((k) => k.frame >= to) ? [{ frame: to - from, ...valueAt(to) }] : []),
  ];
}
// A new frame rate or speed moves keys with their time (both kinds); keys landing on one frame merge.
function edRescaleKeys(c, ratio) {
  for (const name of ["volumeKeys", "transformKeys"]) {
    if (!c[name]?.length) continue;
    const byFrame = new Map(c[name].map((k) => [Math.max(0, Math.min(c.durationFrames, Math.round(k.frame * ratio))), k]));
    c[name] = [...byFrame].map(([frame, k]) => ({ ...k, frame })).sort((a, b) => a.frame - b.frame);
  }
}
// A shorter clip keeps its volume curve up to the new end (keys past it would be outside the clip).
function edFitKeys(before, next) {
  if (next.durationFrames !== before.durationFrames) edWindowKeys(next, before, 0, next.durationFrames);
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
          : esc(delivery?.note || "此比例尚不能投遞")
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
    if (ed.pane === "文字") ed.title.images = null;
    if (!ed.layout.leftOpen) {
      ed.layout = { ...ed.layout, leftOpen: true };
      edLayoutSave();
    }
    edRedraw();
  }
  // A clip is selected on pointerup (edSelectClip); a click on empty lane space clears the selection.
  if (!clip && ed.selected && e.target.matches("[data-ed-lane]")) {
    ed.selected = null;
    ed.picks.clear();
    edRedraw();
  }
  if (marker) {
    ed.time = Number(marker.dataset.edMarker);
    edPaint();
  }
});
// Card ED.3.6: a folded group stays folded (toggle does not bubble, hence capture). Rendering an open <details> also
// fires toggle; nothing changes then, so nothing is saved.
document.addEventListener(
  "toggle",
  (e) => {
    const name = e.target.dataset?.edGroup;
    if (!name || !ed.layout || e.target.open !== ed.layout.closed.includes(name)) return;
    ed.layout = { ...ed.layout, closed: e.target.open ? ed.layout.closed.filter((n) => n !== name) : [...ed.layout.closed, name] };
    edLayoutSave();
  },
  true,
);
const edNumParse = (input) => {
  try {
    return EditorModel.evalNumber(input.value);
  } catch (_) {
    return Number(input.defaultValue) || 0; // an unfinished expression steps from the stored value
  }
};
function edNumSet(input, value) {
  const { min, max } = input.dataset;
  input.value = String(Number(Math.min(Number(max), Math.max(Number(min), value)).toFixed(6)));
}
const edNumFactor = (e) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
document.addEventListener("keydown", (e) => {
  const input = e.target.closest?.("[data-ed-num]");
  if (!input) return;
  if (e.key === "Escape") {
    input.value = input.defaultValue;
    input.blur();
    return;
  }
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  edNumSet(input, edNumParse(input) + (e.key === "ArrowUp" ? 1 : -1) * Number(input.dataset.step) * edNumFactor(e));
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
// Dragging a number field's label: one step per 4 px, shown while dragging, committed once on release (one undo).
let edScrub = null;
document.addEventListener("pointerdown", (e) => {
  const label = e.target.closest?.("[data-ed-num-label]"),
    input = label?.parentElement.querySelector("[data-ed-num]");
  if (!input) return;
  e.preventDefault();
  edScrub = { input, x: e.clientX, from: edNumParse(input), moved: false };
});
document.addEventListener("pointermove", (e) => {
  if (!edScrub) return;
  const steps = Math.trunc((e.clientX - edScrub.x) / 4);
  if (!steps && !edScrub.moved) return;
  edScrub.moved = true;
  edNumSet(edScrub.input, edScrub.from + steps * Number(edScrub.input.dataset.step) * edNumFactor(e));
});
document.addEventListener("pointerup", () => {
  const scrub = edScrub;
  edScrub = null;
  // Back where it started = no edit (an empty change would still clear redo).
  if (scrub?.moved && scrub.input.value !== scrub.input.defaultValue) scrub.input.dispatchEvent(new Event("change", { bubbles: true }));
});
document.addEventListener("change", (e) => {
  const key = e.target.dataset.edField,
    p = edProject(),
    c = edClip();
  if (!key || !p) return;
  edCheckpoint();
  try {
    const num = e.target.dataset.edNum !== undefined,
      value = num
        ? Math.min(Number(e.target.dataset.max), Math.max(Number(e.target.dataset.min), EditorModel.evalNumber(e.target.value)))
        : e.target.type === "number"
          ? Number(e.target.value)
          : e.target.value;
    if (key.startsWith("project:")) p[key.slice(8)] = value;
    else if (key.startsWith("fx-project:")) {
      const name = key.slice(11),
        r = EditorModel.EFFECTS[name];
      if (!r || !Number.isFinite(value)) throw Error("請輸入有效數字");
      edWriteEffect(p, c, name, Math.min(r.max, Math.max(r.min, value / 100)), "整片");
    } else if (key.startsWith("fx:") && c) {
      const name = key.slice(3),
        r = EditorModel.EFFECTS[name];
      if (!r || name === "filter") throw Error("請輸入有效數字");
      edWriteEffect(p, c, name, Math.min(r.max, Math.max(r.min, value / 100)), ed.fxScope);
    } else if (c && c.track === edMain(p) && ["video", "image"].includes(c.kind) && ["backgroundBlur", "backgroundColor"].includes(key)) {
      // Reference: 背景 applies to every clip of the main track (僅 V1).
      for (const row of edMainVisual(p)) row[key] = key === "backgroundBlur" ? Math.round(value) : value;
    } else if (key.startsWith("tf:") && c) {
      const name = key.slice(3);
      if (name === "opacity") c.opacity = value / 100;
      else if (c.transformKeys?.length) {
        const frame = edFrame(p) - c.startFrame;
        if (frame < 0 || frame > c.durationFrames) throw Error("播放頭需位於片段內");
        c.transformKeys = EditorModel.transformKeys(
          [...c.transformKeys.filter((k) => k.frame !== frame), { frame, ...edTransform(p, c), [name]: value }],
          c.durationFrames,
          edOverlay(p, c.track),
        );
      } else c[name] = value;
    } else if (key === "volumeDb" && c) {
      c.volume = EditorModel.dbToVolume(value);
    } else if (key === "sourceEnd" && c) {
      // 來源終點 = 來源起點 + 長度 × 速度; moving it changes the length.
      const next = edTime(p, { ...c }, { duration: (value - c.sourceStart) / c.speed });
      edFitKeys(c, next);
      edNeighbours(p, next);
      edValidate(next);
      Object.assign(c, next);
    } else if (key.startsWith("track-db:")) {
      const track = edTrack(p, key.slice(9));
      if (!track || !Number.isFinite(value)) throw Error("請輸入有效數字");
      track.volume = EditorModel.dbToVolume(value);
    }
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
    // A project setting (frame rate re-snap, ratio, title) is not a timeline edit: 磁性主軌 leaves gaps alone.
    if (key.startsWith("project:")) ed.skipMagnet = true;
    edMagnet(p);
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
  if (e.target.matches("[data-ed-zoom]")) edZoom(e.target.value);
});
// Card ED.2 selection: a plain click selects one clip; Shift／Ctrl／Cmd adds or removes it from the selection.
function edSelectClip(id, add) {
  if (add) {
    const ids = new Set(edPicked().map((x) => x.id));
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    ed.picks = ids;
    ed.selected = ids.has(id) ? id : [...ids].at(-1) || null;
  } else {
    ed.picks = new Set([id]);
    ed.selected = id;
  }
}
// 磁吸 targets: frame 0, the playhead, markers and the edges of every clip that is not being dragged.
function edSnapFrames(p, moving) {
  const out = [0, edFrame(p), ...(p.markers || []).map((m) => Timebase.toFrames(m, p.timebase))];
  for (const c of p.clips) if (!moving.has(c.id)) out.push(c.startFrame, c.startFrame + c.durationFrames);
  return out;
}
// One drag step: the trimmed clip, or the moved group (all by the same frame shift). Throws when the result would
// cover a clip that is not moving or break a clip rule; the caller then keeps the last valid step.
function edDragStep(p, c, group, initial, trim, delta, snap) {
  const tol = Timebase.toFrames(8 / ed.zoom, p.timebase),
    candidates = snap ? edSnapFrames(p, new Set(group.map((x) => x.id))) : [],
    shift = (edges) => (snap ? EditorModel.snapShift(edges, candidates, tol) : 0);
  if (trim) {
    const i = initial.get(c.id);
    let next;
    if (trim === "end") {
      let end = i.startFrame + i.durationFrames + delta;
      end += shift([end]);
      next = edTime(p, { ...i }, { durationFrames: end - i.startFrame });
      edFitKeys(i, next);
    } else {
      // The left edge stops one frame before the right edge, which never moves (Codex ED.2 F4).
      const last = i.startFrame + i.durationFrames - 1;
      let start = Math.max(0, Math.min(last, i.startFrame + delta));
      start = Math.max(0, Math.min(last, start + shift([start])));
      const d = start - i.startFrame,
        media = ["video", "audio"].includes(i.kind);
      next = edTime(p, { ...i }, { startFrame: start, durationFrames: i.durationFrames - d, sourceStartFrame: media ? i.sourceStartFrame + Math.round(d * i.speed) : i.sourceStartFrame });
      if (next.sourceStartFrame < 0) throw Error("素材前面沒有更多畫格");
      edWindowKeys(next, i, d, i.durationFrames);
    }
    if (next.durationFrames < 1) throw Error("片段太短");
    edNeighbours(p, next);
    edValidate(next);
    return [next];
  }
  const first = Math.min(...group.map((x) => initial.get(x.id).startFrame));
  delta = Math.max(delta, -first);
  delta = Math.max(-first, delta + shift(group.flatMap((x) => [initial.get(x.id).startFrame + delta, initial.get(x.id).startFrame + initial.get(x.id).durationFrames + delta])));
  const ids = new Set(group.map((x) => x.id)),
    nexts = group.map((x) => edTime(p, { ...initial.get(x.id) }, { startFrame: initial.get(x.id).startFrame + delta }));
  for (const next of nexts) {
    const end = next.startFrame + next.durationFrames;
    if (p.clips.some((o) => !ids.has(o.id) && o.track === next.track && o.startFrame < end && next.startFrame < o.startFrame + o.durationFrames))
      throw Error("會蓋到同一軌的相鄰片段");
    edValidate(next);
  }
  return nexts;
}
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const volume = e.target.closest("[data-ed-volume]");
  if (volume) return edVolumeDrag(e, volume);
  edLinePress = { id: null, at: 0 }; // any other press breaks a double-click on the volume line
  const el = e.target.closest("[data-ed-clip]");
  if (!el) return;
  const p = edProject(),
    c = p?.clips.find((x) => x.id === el.dataset.edClip);
  if (!c) return;
  edStop();
  const trim = e.target.closest("[data-ed-trim]")?.dataset.edTrim || null,
    add = e.shiftKey || e.ctrlKey || e.metaKey,
    picked = edPicked(p),
    // Dragging a clip that is part of the selection moves the whole selection; a trim is always one clip.
    group = !trim && picked.some((x) => x.id === c.id) ? picked : [c],
    initial = new Map(group.map((x) => [x.id, structuredClone(x)])),
    startX = e.clientX;
  let moved = false;
  el.setPointerCapture(e.pointerId);
  el.onpointermove = (ev) => {
    if (!moved && Math.abs(ev.clientX - startX) < 4) return;
    moved = true;
    try {
      const nexts = edDragStep(p, c, group, initial, trim, Timebase.toFrames((ev.clientX - startX) / ed.zoom, p.timebase), ed.snap && !ev.shiftKey);
      for (const next of nexts) {
        Object.assign(p.clips.find((x) => x.id === next.id), next);
        const node = document.querySelector(`[data-ed-clip="${next.id}"]`);
        if (node) {
          node.style.left = next.start * ed.zoom + "px";
          node.style.width = Math.max(8, next.duration * ed.zoom) + "px";
        }
      }
    } catch (_) {}
  };
  const end = () => (el.onpointermove = el.onpointerup = el.onpointercancel = null);
  el.onpointerup = () => {
    end();
    if (!moved) {
      edSelectClip(c.id, add);
      edRedraw();
      return;
    }
    // Every step refused (it would cover a clip): nothing changed, so no undo step and the redo stack stays (Codex ED.2 F2).
    const same = group.every((x) => ["startFrame", "durationFrames", "sourceStartFrame"].every((k) => x[k] === initial.get(x.id)[k]));
    if (same) {
      edRedraw();
      return;
    }
    const changed = group.map((x) => structuredClone(x));
    for (const x of group) Object.assign(x, initial.get(x.id));
    edCheckpoint();
    for (const x of changed) Object.assign(p.clips.find((y) => y.id === x.id), x);
    // Several tracks moved together keep their relative timing: 磁性主軌 is skipped (reference).
    if (new Set(group.map((x) => x.track)).size > 1) ed.skipMagnet = true;
    if (!picked.some((x) => x.id === c.id) || trim) edSelectClip(c.id, false);
    edCommit(p).catch(VideoWorkbench.reportError);
  };
  el.onpointercancel = () => {
    end();
    for (const x of group) Object.assign(x, initial.get(x.id));
    edRender();
  };
});
// The volume line on a clip: drag up / down (dB, -60..+6), double-click = 0 dB, arrow keys ±1 dB. One undo step.
function edSetDb(p, c, db) {
  // Already there (e.g. ↑ at the top): no undo step, and no 0.1 dB rounding of an older clip's exact gain.
  if (Math.abs(EditorModel.volumeToDb(c.volume) - db) < 1e-9) return Promise.resolve();
  edCheckpoint();
  c.volume = EditorModel.dbToVolume(Math.round(db * 10) / 10);
  edValidate(c);
  edRender();
  return edSave();
}
function edVolumeDrag(e, line) {
  e.stopPropagation();
  const p = edProject(),
    c = p?.clips.find((x) => x.id === line.closest("[data-ed-clip]")?.dataset.edClip);
  if (!c) return;
  edStop();
  const startY = e.clientY,
    from = EditorModel.volumeToDb(c.volume),
    { min, max } = EditorModel.DB,
    // The 18 px band spans the 66 dB range; the line follows the pointer.
    // Above +6 dB (an older clip) the line may stay where it is, never be pushed down to +6.
    dbAt = (y) => Math.max(min, Math.min(Math.max(max, from), from - ((y - startY) / 16) * (max - min)));
  let db = from,
    moved = false;
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  line.setPointerCapture(e.pointerId);
  line.onpointermove = (ev) => {
    if (!moved && Math.abs(ev.clientY - startY) < 2) return;
    moved = true;
    db = dbAt(ev.clientY);
    line.style.top = Math.max(0, Math.round(((max - db) / (max - min)) * 16)) + "px";
    line.setAttribute("aria-valuenow", db.toFixed(1));
  };
  line.onpointerup = () => {
    line.onpointermove = line.onpointerup = null;
    // The line crosses the middle of the clip: a press that does not move it is a click on the clip.
    // A second still press within 400 ms is the double-click that resets 0 dB (the first press re-renders the
    // timeline, so the browser's own dblclick never reaches the new line).
    if (!moved) {
      const now = performance.now(),
        again = edLinePress.id === c.id && now - edLinePress.at < 400;
      edLinePress = again ? { id: null, at: 0 } : { id: c.id, at: now };
      if (again) edSetDb(p, c, 0).catch(VideoWorkbench.reportError);
      else {
        edSelectClip(c.id, add);
        edRedraw();
      }
    } else if (Math.abs(db - from) >= 0.05) edSetDb(p, c, db).catch(VideoWorkbench.reportError);
  };
}
// Pinch on a trackpad arrives as Ctrl+wheel: zoom around the cursor.
document.addEventListener(
  "wheel",
  (e) => {
    if (!(e.ctrlKey || e.metaKey) || tool !== "edit" || !e.target.closest?.("[data-ed-timeline]")) return;
    e.preventDefault();
    edZoom(ed.zoom * Math.exp(-e.deltaY / 300), e.clientX);
  },
  { passive: false },
);
// Card ED.1: panel and timeline-height separators. Drag or arrow keys resize; the size is saved on release.
function edResize(side, delta) {
  const [min, max] = edLayoutLimits[side];
  ed.layout = { ...ed.layout, [side]: Math.min(max, Math.max(min, Math.round(delta))) };
  const app = document.querySelector(".editor-app"),
    workspace = document.querySelector("[data-ed-workspace]");
  app?.style.setProperty("--ed-timeline", ed.layout.timeline + "px");
  if (workspace) workspace.style.gridTemplateColumns = edColumns();
  document.querySelector(`[data-ed-resize="${side}"]`)?.setAttribute("aria-valuenow", ed.layout[side]);
  edPaint();
}
// Drag sign per separator: the left drawer grows rightwards, the inspector leftwards, the timeline upwards.
const edResizeAxis = { left: ["clientX", 1], right: ["clientX", -1], timeline: ["clientY", -1] };
function edSeekTo(ruler, clientX) {
  edStop();
  ed.time = Math.min(edEnd(), Math.max(0, (clientX - ruler.getBoundingClientRect().left) / ed.zoom));
  edPaint();
}
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const handle = e.target.closest("[data-ed-resize]"),
    ruler = e.target.closest("[data-ed-ruler]");
  if (ruler) {
    edSeekTo(ruler, e.clientX);
    ruler.setPointerCapture(e.pointerId);
    ruler.onpointermove = (ev) => edSeekTo(ruler, ev.clientX);
    ruler.onpointerup = ruler.onpointercancel = () => (ruler.onpointermove = ruler.onpointerup = ruler.onpointercancel = null);
    return;
  }
  if (!handle) return;
  const side = handle.dataset.edResize,
    [axis, sign] = edResizeAxis[side],
    from = e[axis],
    start = ed.layout[side];
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  handle.onpointermove = (ev) => edResize(side, start + sign * (ev[axis] - from));
  handle.onpointerup = handle.onpointercancel = () => {
    handle.onpointermove = handle.onpointerup = handle.onpointercancel = null;
    edLayoutSave();
  };
});
document.addEventListener("fullscreenchange", () => tool === "edit" && edPaint());
document.addEventListener("keydown", (e) => {
  const handle = e.target.closest?.("[data-ed-resize]");
  if (handle && /^Arrow/.test(e.key)) {
    const side = handle.dataset.edResize,
      [axis, sign] = edResizeAxis[side],
      step = (axis === "clientX" ? { ArrowRight: 16, ArrowLeft: -16 } : { ArrowDown: 16, ArrowUp: -16 })[e.key];
    if (step) {
      e.preventDefault();
      edResize(side, ed.layout[side] + sign * step);
      edLayoutSave();
    }
    return;
  }
  if (
    tool !== "edit" ||
    !edProject() ||
    e.target.closest("input,textarea,select,[contenteditable],dialog")
  )
    return;
  if (e.key === "Escape" && ed.selected) {
    ed.selected = null;
    ed.picks.clear();
    edRedraw();
    return;
  }
  // A focused clip: Enter selects it, Shift／Ctrl／Cmd+Enter adds it (reference clip keyboard).
  const focusedClip = e.target.closest?.("[data-ed-clip]");
  if (e.key === "Enter" && focusedClip && !e.target.closest("[data-ed-volume]")) {
    e.preventDefault();
    edSelectClip(focusedClip.dataset.edClip, e.shiftKey || e.ctrlKey || e.metaKey);
    edRedraw();
    document.querySelector(`[data-ed-clip="${focusedClip.dataset.edClip}"]`)?.focus();
    return;
  }
  const line = e.target.closest?.("[data-ed-volume]");
  if (line && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    const p = edProject(),
      c = p.clips.find((x) => x.id === line.closest("[data-ed-clip]")?.dataset.edClip);
    if (c) {
      const now = EditorModel.volumeToDb(c.volume),
        db = Math.max(EditorModel.DB.min, Math.min(Math.max(EditorModel.DB.max, now), now + (e.key === "ArrowUp" ? 1 : -1)));
      edSetDb(p, c, db)
        .then(() => document.querySelector(`[data-ed-clip="${c.id}"] [data-ed-volume]`)?.focus())
        .catch(VideoWorkbench.reportError);
    }
    return;
  }
  const key = e.key.toLowerCase(),
    view =
      key === "[" || (e.altKey && e.code === "Digit1")
        ? "layout:left"
        : key === "]" || (e.altKey && e.code === "Digit2")
          ? "layout:right"
          : key === "f" && !e.ctrlKey && !e.metaKey
            ? "fullscreen"
            : null;
  if (view) {
    e.preventDefault();
    edAction(view).catch(VideoWorkbench.reportError);
    return;
  }
  // Card ED.2: the reference's key table (edShortcutRows). Alt+M is read from e.code: on a Mac it types «µ».
  const mod = e.ctrlKey || e.metaKey,
    del = e.key === "Delete" || e.key === "Backspace",
    action = mod
      ? e.shiftKey && key === "c"
        ? "style-copy"
        : e.shiftKey && key === "v"
          ? "style-paste"
          : key === "z"
            ? e.shiftKey
              ? "redo"
              : "undo"
            : ({ y: "redo", c: "copy", v: "paste", d: "duplicate", a: "select-all", s: "save-now", b: "split", "=": "zoom:in", "+": "zoom:in", "-": "zoom:out", 0: "zoom:reset" })[key] || null
      : e.altKey && del
        ? "ripple"
        : e.altKey && e.code === "KeyM"
          ? "marker-prev"
          : e.altKey
            ? null
            : del
              ? "delete"
              : e.code === "Space"
                ? "play"
                : e.key === "ArrowLeft" || e.key === "ArrowRight"
                  ? "jump:" + (e.key === "ArrowLeft" ? "-" : "") + (e.shiftKey ? "1" : "0.1")
                  : e.key === "?"
                    ? "shortcuts"
                    : e.shiftKey
                      ? ({ m: "marker-next", z: "zoom:fit" })[key] || null
                      : ({ s: "split", m: "marker", n: "snap", j: "rate:j", k: "rate:k", l: "rate:l" })[key] || null;
  if (action) {
    e.preventDefault();
    edAction(action).catch(VideoWorkbench.reportError);
  }
});

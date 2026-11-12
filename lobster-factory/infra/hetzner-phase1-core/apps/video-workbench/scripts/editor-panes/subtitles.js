// Card ED.0: the 「字幕」 left pane (spec §3 檔案歸屬: ED.10). Registered with edRegisterPane in tools-editor.js.
// Subtitle import (card P2): each cue becomes a text clip; a cue overlapping one already on a text track goes to
// the next text track (a new one is added when needed, up to the limit). One undo step for the whole file.
// Still used by the episode's 用旁白產生字幕 (tools-editor.js edSpineSubtitles).
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
// ---- ED.10: 逐句／樣式／辨識翻譯 (spec §1.3 字幕; backend contract = spec §1.3 「ED.10 後端介面」) ----
// A language track = a text track with `language` (its name shows the language on the timeline). A text track
// without one (every project before ED.10) is 「原文字軌」 and is read as it is: opening this pane writes nothing.
// A subtitle clip may carry subtitleStyle (one of the exporter's eight looks), words [{ start, end, text }] in seconds
// from the clip's own start (逐字高亮／卡拉 OK), and needsReview (recognition score < 0.8).
const edSubLangs = [
    "繁體中文",
    "簡體中文",
    "English",
    "日本語",
    "한국어",
    "ภาษาไทย",
  ],
  // = backend/editor-export.cjs SUBTITLE_STYLES; the two word styles need word times.
  edSubStyles = [
    "白字暗底",
    "白底黑字",
    "品牌色",
    "白字黑邊",
    "黃字黑邊",
    "逐字高亮",
    "卡拉 OK",
    "色塊標題",
  ],
  // whisper answers the language as a code or an English name; anything else stays 原文.
  edSubDetected = {
    zh: "繁體中文",
    chinese: "繁體中文",
    en: "English",
    english: "English",
    ja: "日本語",
    japanese: "日本語",
    ko: "한국어",
    korean: "한국어",
    th: "ภาษาไทย",
    thai: "ภาษาไทย",
  },
  edSubUi = {
    projectId: null,
    tab: "逐句",
    track: null,
    language: "自動偵測",
    quote: null,
    job: null,
    results: null,
    from: null,
    busy: false,
  };
const edSubTracks = (p) => p.tracks.filter((t) => t.kind === "text"),
  edSubLabel = (t) => t.language || "原文字軌",
  edSubCues = (p, id) =>
    p.clips
      .filter((c) => c.track === id && c.kind === "text")
      .sort((a, b) => a.startFrame - b.startFrame),
  edSubEnd = (c) => c.start + c.duration;
// The pane's track: the chosen one while it exists, else the first text track. View state, never saved.
function edSubTrack(p) {
  if (edSubUi.projectId !== p.id)
    Object.assign(edSubUi, {
      projectId: p.id,
      track: null,
      quote: null,
      results: null,
      from: null,
    });
  const list = edSubTracks(p);
  return list.find((t) => t.id === edSubUi.track) || list[0] || null;
}
// Word times only count while they still spell the line (TranscriptWords.spells, the exporter's rule): an edited line
// burns static.
const edSubSpells = (c) => TranscriptWords.spells(c.words, c.text);
const edSubAbs = (c) =>
  edSubSpells(c)
    ? c.words.map((w) => ({
        ...w,
        start: c.start + w.start,
        end: c.start + w.end,
      }))
    : null;
// Sets a cue's timeline start/end (seconds) and keeps each word at its timeline time (EditorModel.wordsWindow: a word
// belongs to the cue its middle falls in; 播放頭分割 cuts the text by the same rule).
function edSubSet(p, c, start, end, abs = edSubAbs(c)) {
  edTime(p, c, { start, duration: Math.max(0, end - start) });
  const kept = EditorModel.wordsWindow(abs, c.start, edSubEnd(c)).map(
    ({ start, end, text }) => ({ start, end, text }),
  );
  if (kept.length && kept.length <= 200) c.words = kept;
  else delete c.words;
}
// translatedFrom = the source track of a translation: a re-translation replaces only that track, never a recognised or
// hand-made track of the same language.
function edSubNewTrack(p, language, hidden, translatedFrom) {
  if (!EditorModel.canAdd(p.tracks, "text"))
    throw Error(
      `文字軌最多 ${EditorModel.LIMITS.text} 條，請先刪除或清空一條字幕軌`,
    );
  const id = EditorModel.nextId(p.tracks, "text");
  p.tracks.splice(p.tracks.findLastIndex((t) => t.kind === "text") + 1, 0, {
    id,
    kind: "text",
    name: language,
    language,
    hidden,
    muted: false,
    volume: 1,
    normalize: false,
    ...(translatedFrom ? { translatedFrom } : {}),
  });
  return id;
}
// The look a new cue on a track takes: the track's first cue's (style, size, position, colours, type).
function edSubLook(p, id) {
  const first = edSubCues(p, id)[0];
  if (!first) return {};
  const look = {};
  for (const k of [
    "subtitleStyle",
    "fontSize",
    "y",
    "x",
    "color",
    "backgroundColor",
    "font",
    "bold",
    "italic",
    "align",
  ])
    if (first[k] !== undefined) look[k] = first[k];
  return look;
}
// Replaces every cue on a track with cues [{ start, end, text, words?, needsReview? }] (timeline seconds, words too).
// A cue overlapping the next one ends where it starts; a cue starting at or after `limit` (the video's end) is dropped.
function edSubFill(p, id, cues, look = {}, limit = Infinity) {
  p.clips = p.clips.filter((c) => c.track !== id);
  const rows = cues
    .map((q) => ({ ...q, text: String(q.text || "").trim() }))
    .filter((q) => q.text && q.end > q.start && q.start < limit)
    .sort((a, b) => a.start - b.start);
  rows.forEach((q, i) => {
    const end = Math.min(q.end, limit, rows[i + 1]?.start ?? Infinity),
      c = Object.assign(edText(q.text, q.start, 1, p, id), look);
    if (!(end > q.start)) return;
    edSubSet(p, c, q.start, end, q.words || null);
    if (q.needsReview) c.needsReview = true;
    p.clips.push(c);
  });
}
// Where imported cues stop: the video's end = the last picture clip's end (music running on past it does not count);
// a timeline without pictures takes the whole file.
const edSubLimit = (p) =>
  Math.max(
    0,
    ...p.clips.filter((c) => ["video", "image"].includes(c.kind)).map(edSubEnd),
  ) || Infinity;
async function edSubEdit(p, run) {
  edCheckpoint();
  try {
    run();
  } catch (error) {
    ed.projects[ed.projects.indexOf(p)] = ed.undo.pop();
    throw error;
  }
  await edCommit(p);
}
// 整片字幕 plan: every clip on 主視訊 V1 and 旁白 A1 with a file; the server skips silent ones and prices the rest.
function edSubSettings(p) {
  const main = edMain(p),
    segments = p.clips
      .filter(
        (c) =>
          (c.track === main || c.track === EditorModel.NARRATION) &&
          ["video", "audio"].includes(c.kind) &&
          c.asset?.url,
      )
      .sort((a, b) => a.startFrame - b.startFrame)
      .map((c) => {
        const t = edTrack(p, c.track);
        return {
          url: c.asset.url,
          sourceStart: c.sourceStart,
          duration: c.duration,
          start: c.start,
          speed: c.speed,
          track: c.track === main ? "V1" : "A1",
          clipId: c.id,
          muted: !!(c.muted || t?.muted),
          hidden: !!(c.hidden || t?.hidden),
          volume: c.volume,
        };
      });
  if (!segments.length)
    throw Error("主視訊 V1 和旁白 A1 沒有影片或音訊片段可以辨識");
  return { projectId: p.id, language: edSubUi.language, segments };
}
const edSubPrice = (usd) =>
    usd === 0 ? "免費" : window.VideoWorkbenchMoney?.(usd) || "價格未載入",
  // A run is sent only with its price shown: free, or a NT$ amount (the rate comes with /capabilities).
  edSubPriced = (usd) => usd === 0 || !!window.VideoWorkbenchMoney?.(usd);
// A finished transcript (GET /editor/transcriptions/<id>) becomes its language's track; that track's cues are replaced.
function edSubPlace(p, t) {
  const language =
      t.requestedLanguage && t.requestedLanguage !== "自動偵測"
        ? t.requestedLanguage
        : edSubDetected[String(t.language || "").toLowerCase()] || "原文",
    track =
      edSubTracks(p).find((x) => x.language === language && !x.translatedFrom)
        ?.id || edSubNewTrack(p, language, false),
    look = { subtitleStyle: "白字暗底", ...edSubLook(p, track) };
  edSubFill(
    p,
    track,
    (t.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      words: s.words,
      needsReview: s.needsReview,
    })),
    look,
  );
  edSubUi.track = track;
  return language;
}
async function edSubApply(jobId) {
  const t = await VideoWorkbench.request(
      "/editor/transcriptions/" + encodeURIComponent(jobId),
      undefined,
      "GET",
    ),
    p = edProject();
  if (!p || t.projectId !== p.id)
    throw Error("這份字幕屬於另一個剪輯專案，請打開該專案再套用");
  let language;
  await edSubEdit(p, () => (language = edSubPlace(p, t)));
  VideoWorkbench.notify(
    `已放進「${language}」字幕軌：${t.segments?.length || 0} 句${t.segments?.some((s) => s.needsReview) ? "，標「需校對」的句子請檢查" : ""}`,
  );
}
// The running job's line in the pane is updated in place (a full redraw would take the caret out of a cue being typed).
const edSubJobText = () => {
  const j = edSubUi.job;
  if (!j) return "";
  return (
    {
      queued: "排隊中…",
      running: `辨識中 ${j.progress || 0}%`,
      succeeded: "辨識完成",
      failed: "辨識失敗：" + (j.error || ""),
      cancelled: "已取消",
    }[j.status] || j.status
  );
};
async function edSubWatch(jobId) {
  while (edSubUi.job?.id === jobId) {
    const v = await VideoWorkbench.generations.get(jobId);
    if (edSubUi.job?.id !== jobId) return;
    Object.assign(edSubUi.job, {
      status: v.status,
      progress: v.progress,
      error: v.error,
    });
    const line = document.querySelector("[data-ed-sub-job]");
    if (line) line.textContent = edSubJobText();
    if (v.status === "succeeded") {
      edSubUi.results = null;
      // Placed only into its own project while it is open; otherwise 找回已完成的字幕結果 has it.
      if (edProject()?.id === edSubUi.job.projectId) await edSubApply(jobId);
      else if (tool === "edit") edRedraw();
      return;
    }
    if (!["queued", "running"].includes(v.status))
      return tool === "edit" && edRedraw();
    await new Promise((r) => setTimeout(r, 1500));
  }
}
// ---- the three tabs ----
function edSubRows(p, t) {
  const cues = edSubCues(p, t.id),
    n = (v) => (Math.round(v * 100) / 100).toFixed(2);
  if (!cues.length)
    return '<p class="note">這一軌還沒有字幕。按「新增字幕」在播放頭加一句，或到「辨識翻譯」產生。</p>';
  return `<ol class="ed-sub-list">${cues
    .map((c, i) => {
      const on = c.id === ed.selected;
      return `<li class="ed-sub-row${on ? " selected" : ""}" data-ed-sub-row="${esc(c.id)}"><div class="ed-sub-head"><button type="button" class="btn small" data-ed-action="sub-pick:${esc(c.id)}" aria-pressed="${on}" aria-label="選取第 ${i + 1} 句">${i + 1}</button><label>起<input class="text-input" type="number" step="0.01" min="0" aria-label="第 ${i + 1} 句起點（秒）" data-ed-sub="${esc(c.id)}:start" value="${n(c.start)}"></label><label>訖<input class="text-input" type="number" step="0.01" min="0" aria-label="第 ${i + 1} 句終點（秒）" data-ed-sub="${esc(c.id)}:end" value="${n(edSubEnd(c))}"></label>${c.needsReview ? '<span class="ed-sub-review" title="辨識分數低於 0.8">需校對</span>' : ""}</div><textarea class="text-input" rows="2" aria-label="第 ${i + 1} 句文字" data-ed-sub="${esc(c.id)}:text">${esc(c.text)}</textarea>${
        on
          ? `<div class="flow-choices">${edButton("播放頭分割", "sub-split:" + c.id)}${edButton("合併下一句", "sub-merge:" + c.id, i === cues.length - 1)}${edButton("刪除此句", "sub-delete:" + c.id)}</div>`
          : ""
      }</li>`;
    })
    .join("")}</ol>`;
}
function edSubStylePane(p, t) {
  const cues = edSubCues(p, t.id),
    look = edSubLook(p, t.id),
    words = cues.filter(edSubSpells).length,
    off = cues.length ? "" : "disabled";
  return `<p class="note">樣式套用到此軌全部 ${cues.length} 句。</p><div class="ed-sub-styles" role="group" aria-label="字幕樣式">${edSubStyles
    .map(
      (s) =>
        `<button type="button" class="ed-sub-style${look.subtitleStyle === s ? " selected" : ""}" data-ed-action="sub-style:${s}" aria-pressed="${look.subtitleStyle === s}" ${off}><span class="ed-sub-sample" data-look="${s}">字幕 Aa</span>${s}</button>`,
    )
    .join(
      "",
    )}</div><p class="note">逐字高亮、卡拉 OK 跟著逐字時間動（來自整片辨識）；此軌 ${words} 句有逐字時間，其餘句子與改過文字的句子輸出成靜態。</p><label>字級 <b data-ed-sub-out="fontSize">${look.fontSize ?? 52}</b><input type="range" min="16" max="120" step="1" aria-label="字級" data-ed-sub-style="fontSize" value="${look.fontSize ?? 52}" ${off}></label><label>垂直位置 <b data-ed-sub-out="y">${look.y ?? 80}%</b><input type="range" min="5" max="95" step="1" aria-label="垂直位置" data-ed-sub-style="y" value="${look.y ?? 80}" ${off}></label>`;
}
// Translation batches: ≤ 30 cues and ≤ 1200 characters each (the route's limits, as the 字幕 tool sends them).
function edSubBatches(cues) {
  const out = [];
  let batch = [],
    size = 0;
  for (const c of cues) {
    if (batch.length && (size + c.text.length > 1200 || batch.length >= 30)) {
      out.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(c);
    size += c.text.length;
  }
  if (batch.length) out.push(batch);
  return out;
}
// The translation source: the chosen track, else the pane's track, else the first track with cues (only tracks with
// cues). The pane shows and the button sends this same track.
function edSubFrom(p, t) {
  const tracks = edSubTracks(p).filter((x) => edSubCues(p, x.id).length);
  return (
    tracks.find((x) => x.id === edSubUi.from) ||
    tracks.find((x) => x.id === t?.id) ||
    tracks[0] ||
    null
  );
}
function edSubAiPane(p, t) {
  const q = edSubUi.quote,
    tracks = edSubTracks(p).filter((x) => edSubCues(p, x.id).length),
    from = edSubFrom(p, t),
    cues = from ? edSubCues(p, from.id) : [],
    job = edSubUi.job?.projectId === p.id ? edSubUi.job : null,
    running = !!job && ["queued", "running"].includes(job.status),
    langOf = (r) =>
      r.requestedLanguage === "自動偵測"
        ? edSubDetected[String(r.language || "").toLowerCase()] || "原文"
        : r.requestedLanguage;
  return `<h4>辨識語言</h4>${edChoices("辨識語言", "sub-lang", edSubUi.language, ["自動偵測", ...edSubLangs])}<h4>一鍵整片字幕</h4><p class="note">辨識主視訊 V1 和旁白 A1 所有有聲片段，合成一軌；同語言的字幕軌會被取代。先看費用，確認才開始。</p>${
    q
      ? `<p class="ed-sub-quote" data-ed-sub-quote>${q.segments} 段有聲片段，共 ${Math.round(q.seconds)} 秒 · ${edSubPrice(q.costUsd)}${q.skipped?.length ? `；略過 ${q.skipped.length} 段（${esc([...new Set(q.skipped.map((s) => s.reason))].join("、"))}）` : ""}</p>${edButton(`開始整片辨識（${edSubPrice(q.costUsd)}）`, "sub-run", running || !edSubPriced(q.costUsd), "video.transcribe")}`
      : edButton("查看費用", "sub-quote", running)
  }${job ? `<p class="note" data-ed-sub-job role="status">${esc(edSubJobText())}</p>` : ""}${edButton("找回已完成的字幕結果", "sub-results")}${
    edSubUi.results
      ? edSubUi.results.length
        ? `<ul class="ed-sub-results">${edSubUi.results.map((r) => `<li><span>${esc(new Date(r.createdAt).toLocaleString("zh-TW"))} · ${esc(langOf(r))} · ${r.segmentCount} 句${r.reviewCount ? `（${r.reviewCount} 句需校對）` : ""}</span>${edButton("套用", "sub-apply:" + r.jobId)}</li>`).join("")}</ul>`
        : '<p class="note">這個專案還沒有完成的字幕結果。</p>'
      : ""
  }<h4>匯入 SRT／VTT</h4><p class="note">免費。取代${t ? `「${esc(edSubLabel(t))}」` : "字幕"}軌；影片結尾之後的字幕不匯入。</p>${edButton("匯入 SRT／VTT", "sub-import")}<h4>翻譯既有字幕</h4>${
    from
      ? `${edChoices(
          "翻譯來源軌",
          "sub-from",
          from.id,
          tracks.map((x) => x.id),
          (id) =>
            edSubLabel(edTrack(p, id)) + "（" + edSubCues(p, id).length + "）",
        )}<p class="note">保留時間；結果放在獨立的語言軌，預設隱藏。${cues.length} 句分 ${edSubBatches(cues).length} 批送出，每批計費一次。</p><div class="flow-choices" role="group" aria-label="翻譯成">${edSubLangs
          .filter((l) => l !== from.language)
          .map(
            (l) =>
              `<button type="button" class="btn small" data-ed-action="sub-translate:${l}" data-paid="video.script" ${edSubUi.busy ? "disabled" : ""}>翻譯成 ${l}</button>`,
          )
          .join("")}</div>`
      : '<p class="note">先有一軌字幕才能翻譯。</p>'
  }`;
}
edRegisterPane("subtitles", {
  title: "字幕",
  icon: "☰",
  render: (p) => {
    const t = edSubTrack(p),
      lanes = edSubTracks(p),
      tabs = `<div class="ed-sub-tabs" role="group" aria-label="字幕分頁">${["逐句", "樣式", "辨識翻譯"].map((x) => `<button type="button" class="btn small ${x === edSubUi.tab ? "selected" : ""}" data-ed-action="sub-tab:${x}" aria-pressed="${x === edSubUi.tab}">${x}</button>`).join("")}</div>`,
      same = (x) =>
        lanes.filter((y) => edSubLabel(y) === edSubLabel(x)).length > 1,
      head = lanes.length
        ? `<div class="flow-choices ed-sub-lanes" role="group" aria-label="字幕軌">${lanes.map((x) => `<button type="button" class="btn small ${x.id === t.id ? "selected" : ""}" data-ed-action="sub-track:${x.id}" aria-pressed="${x.id === t.id}">${esc(edSubLabel(x))}${same(x) ? " " + esc(x.id) : ""}（${edSubCues(p, x.id).length}）${x.hidden ? " · 隱藏" : ""}</button>`).join("")}</div>${edButton("清空此軌", "sub-clear", !edSubCues(p, t.id).length)}`
        : "";
    const body =
      edSubUi.tab === "逐句"
        ? `<div class="flow-choices">${edButton("新增字幕", "sub-add")}${edButton("匯出此軌 SRT", "sub-srt", !t || !edSubCues(p, t.id).length)}</div>${t ? edSubRows(p, t) : '<p class="note">還沒有字幕軌。按「新增字幕」開始，或到「辨識翻譯」產生整片字幕。</p>'}`
        : edSubUi.tab === "樣式"
          ? t
            ? edSubStylePane(p, t)
            : '<p class="note">還沒有字幕軌。</p>'
          : edSubAiPane(p, t);
    return tabs + head + body;
  },
  actions: {
    "sub-tab:": async (action) => {
      edSubUi.tab = action.slice(8);
      edRedraw();
    },
    "sub-track:": async (action) => {
      edSubUi.track = action.slice(10);
      edRedraw();
    },
    "sub-pick:": async (action, p) => {
      const c = p.clips.find((x) => x.id === action.slice(9));
      if (!c) return;
      ed.selected = c.id;
      ed.picks.clear();
      ed.time = c.start;
      edRedraw();
    },
    "sub-clear": async (action, p) => {
      const t = edSubTrack(p);
      if (t)
        await edSubEdit(
          p,
          () => (p.clips = p.clips.filter((c) => c.track !== t.id)),
        );
    },
    // 新增字幕: 2 s at the playhead on this track (the next free spot), in the track's look.
    "sub-add": async (action, p) => {
      await edSubEdit(p, () => {
        const id = edSubTrack(p)?.id || edSubNewTrack(p, "繁體中文", false),
          c = Object.assign(
            edText("新字幕", ed.time, 2, p, id),
            edSubLook(p, id),
          );
        edTime(p, c, {
          startFrame: edFreeStart(
            p,
            [{ track: id, offset: 0, durationFrames: c.durationFrames }],
            c.startFrame,
          ),
        });
        p.clips.push(c);
        edSubUi.track = id;
        ed.selected = c.id;
        ed.picks.clear();
      });
    },
    "sub-split:": async (action, p) => {
      const c = p.clips.find((x) => x.id === action.slice(10)),
        at = Timebase.toFrames(ed.time, p.timebase);
      if (!c) return;
      if (at <= c.startFrame || at >= c.startFrame + c.durationFrames)
        throw Error("播放頭要停在這一句的中間才能分割");
      await edSubEdit(p, () => {
        const t = Timebase.toSeconds(at, p.timebase),
          end = edSubEnd(c),
          abs = edSubAbs(c),
          rest = Object.assign(structuredClone(c), { id: crypto.randomUUID() });
        let head, tail;
        if (abs) {
          const said = (from, to) =>
            TranscriptWords.joinWords(EditorModel.wordsWindow(abs, from, to).map((w) => w.text));
          head = said(c.start, t);
          tail = said(t, end);
        } else {
          // No word times: cut the text where the playhead is, at a space when one is within three characters.
          const chars = [...c.text],
            k = Math.round((chars.length * (t - c.start)) / c.duration),
            near = [0, 1, -1, 2, -2, 3, -3]
              .map((d) => k + d)
              .find((i) => i > 0 && i < chars.length && /\s/.test(chars[i])),
            cut = near ?? Math.min(chars.length - 1, Math.max(1, k));
          head = chars.slice(0, cut).join("").trim();
          tail = chars.slice(cut).join("").trim();
        }
        c.text = head || c.text;
        rest.text = tail || rest.text;
        edSubSet(p, c, c.start, t, abs);
        edSubSet(p, rest, t, end, abs);
        p.clips.push(rest);
        ed.selected = rest.id;
      });
    },
    "sub-merge:": async (action, p) => {
      const c = p.clips.find((x) => x.id === action.slice(10)),
        next =
          c &&
          edSubCues(p, c.track).find(
            (x) =>
              x.id !== c.id && x.startFrame >= c.startFrame + c.durationFrames,
          );
      if (!next) throw Error("這是此軌最後一句，沒有下一句可以合併");
      await edSubEdit(p, () => {
        const a = edSubAbs(c),
          b = edSubAbs(next);
        c.text = TranscriptWords.joinWords([c.text, next.text]);
        edSubSet(p, c, c.start, edSubEnd(next), a && b ? [...a, ...b] : null);
        if (next.needsReview) c.needsReview = true;
        p.clips = p.clips.filter((x) => x !== next);
      });
    },
    "sub-delete:": async (action, p) => {
      const id = action.slice(11);
      await edSubEdit(p, () => {
        p.clips = p.clips.filter((x) => x.id !== id);
        if (ed.selected === id) ed.selected = null;
      });
    },
    "sub-srt": async (action, p) => {
      const t = edSubTrack(p),
        cues = t
          ? edSubCues(p, t.id)
              .filter((c) => c.text.trim())
              .map((c) => ({
                startMs: Math.round(c.start * 1000),
                endMs: Math.round(edSubEnd(c) * 1000),
                text: c.text,
              }))
          : [];
      if (!cues.length) throw Error("這一軌沒有字幕可以匯出");
      const result = await VideoWorkbench.request("/subtitles/export", {
          format: "srt",
          cues,
        }),
        a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([result.content], { type: "text/plain;charset=utf-8" }),
      );
      a.download = `${p.title}-${edSubLabel(t)}.srt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    },
    "sub-style:": async (action, p) => {
      const t = edSubTrack(p),
        style = action.slice(10);
      if (!t || !edSubStyles.includes(style)) return;
      // 品牌色 = the brand kit's first colour (text.js, edited in 貼圖), else the theme accent; 色塊標題's block too.
      const brand = edTextKit().colors[0] || edTokenHex("--accent");
      await edSubEdit(p, () => {
        for (const c of edSubCues(p, t.id)) {
          c.subtitleStyle = style;
          if (style === "品牌色") c.color = brand;
          if (style === "色塊標題") c.backgroundColor = brand;
        }
      });
    },
    "sub-lang:": async (action) => {
      edSubUi.language = action.slice(9);
      edSubUi.quote = null;
      edRedraw();
    },
    "sub-quote": async (action, p) => {
      const settings = edSubSettings(p),
        q = await VideoWorkbench.request("/editor/transcriptions/quote", {
          settings,
        });
      edSubUi.quote = { ...q, key: JSON.stringify(settings) };
      edRedraw();
    },
    // Sent only with the price on screen for exactly this plan; a timeline or language change asks for a new price.
    "sub-run": async (action, p) => {
      const settings = edSubSettings(p);
      if (edSubUi.quote?.key !== JSON.stringify(settings)) {
        edSubUi.quote = null;
        edRedraw();
        throw Error("時間軸或語言改過了，請重新查看費用");
      }
      if (!edSubPriced(edSubUi.quote.costUsd))
        throw Error("價格還沒載入，請稍候再按");
      const job = await VideoWorkbench.request("/editor/transcriptions", {
        settings,
        idempotencyKey: crypto.randomUUID(),
      });
      edSubUi.quote = null;
      edSubUi.job = {
        id: job.id,
        projectId: p.id,
        status: job.status,
        progress: 0,
      };
      edRedraw();
      edSubWatch(job.id).catch(VideoWorkbench.reportError);
    },
    "sub-results": async (action, p) => {
      edSubUi.results =
        (
          await VideoWorkbench.request(
            "/editor/transcriptions?projectId=" + encodeURIComponent(p.id),
            undefined,
            "GET",
          )
        ).results || [];
      edRedraw();
    },
    "sub-apply:": async (action) => edSubApply(action.slice(10)),
    "sub-import": async (action, p) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".srt,.vtt,text/plain";
      input.onchange = async () => {
        try {
          if (!input.files?.[0] || edProject() !== p) return;
          const cues = SubtitleParse.parse(await input.files[0].text());
          await edSubEdit(p, () => {
            const id = edSubTrack(p)?.id || edSubNewTrack(p, "原文", false);
            edSubFill(
              p,
              id,
              cues.map((q) => ({
                start: q.startMs / 1000,
                end: q.endMs / 1000,
                text: q.text,
              })),
              edSubLook(p, id),
              edSubLimit(p),
            );
            edSubUi.track = id;
          });
        } catch (e) {
          VideoWorkbench.reportError(e);
        }
      };
      input.click();
    },
    "sub-from:": async (action) => {
      edSubUi.from = action.slice(9);
      edRedraw();
    },
    // Every batch must come back before anything changes; a source edited meanwhile keeps the timeline as it is.
    "sub-translate:": async (action, p) => {
      const language = action.slice(14),
        from = edSubFrom(p, edSubTrack(p));
      if (
        !from ||
        !edSubCues(p, from.id).length ||
        !edSubLangs.includes(language) ||
        edSubUi.busy
      )
        return;
      const cues = edSubCues(p, from.id),
        sig = () =>
          JSON.stringify(
            edSubCues(p, from.id).map((c) => [
              c.id,
              c.text,
              c.startFrame,
              c.durationFrames,
            ]),
          ),
        before = sig(),
        out = {};
      edSubUi.busy = true;
      edRedraw();
      try {
        for (const batch of edSubBatches(cues)) {
          const result = await VideoWorkbench.request(
            "/tools/subtitles/translate",
            { language, cues: batch.map((c) => ({ id: c.id, text: c.text })) },
          );
          for (const r of result.cues) out[r.id] = r.text;
        }
        if (edProject() !== p || sig() !== before)
          throw Error("翻譯期間來源字幕改過了，時間軸保持原樣，請重新翻譯");
        await edSubEdit(p, () => {
          const id =
            edSubTracks(p).find(
              (x) => x.language === language && x.translatedFrom === from.id,
            )?.id || edSubNewTrack(p, language, true, from.id);
          edSubFill(
            p,
            id,
            cues.map((c) => ({
              start: c.start,
              end: edSubEnd(c),
              text: out[c.id],
            })),
            edSubLook(p, from.id),
          );
          edSubUi.track = id;
        });
        VideoWorkbench.notify(
          `已翻譯成 ${language}（${cues.length} 句），新的字幕軌預設隱藏，可在時間軸顯示`,
        );
      } finally {
        edSubUi.busy = false;
        if (tool === "edit") edRedraw();
      }
    },
  },
});
// Cue start / end / text: one undo step per change; the line's word times follow the new range.
document.addEventListener("change", (e) => {
  const key = e.target.dataset?.edSub,
    p = edProject();
  if (!key || !p) return;
  const [id, field] = key.split(":"),
    c = p.clips.find((x) => x.id === id);
  if (!c) return;
  edSubEdit(p, () => {
    if (field === "text") {
      if (!e.target.value.trim())
        throw Error("字幕文字不能空白，要刪除請按「刪除此句」");
      c.text = e.target.value;
      return;
    }
    const v = Number(e.target.value),
      start = field === "start" ? v : c.start,
      end = field === "end" ? v : edSubEnd(c);
    if (
      !Number.isFinite(v) ||
      start < 0 ||
      end - start < 1 / Timebase.fps(p.timebase)
    )
      throw Error("起點要大於等於 0，且早於終點");
    edSubSet(p, c, start, end);
  }).catch((error) => {
    VideoWorkbench.reportError(error);
    edRender();
  });
});
// 字級／垂直位置 sliders: the number follows while dragging; the change lands on the whole track as one undo step.
document.addEventListener("input", (e) => {
  const key = e.target.dataset?.edSubStyle,
    out = key && document.querySelector(`[data-ed-sub-out="${key}"]`);
  if (out) out.textContent = e.target.value + (key === "y" ? "%" : "");
});
document.addEventListener("change", (e) => {
  const key = e.target.dataset?.edSubStyle,
    p = edProject(),
    t = key && p && edSubTrack(p);
  if (!t) return;
  const v = Number(e.target.value);
  edSubEdit(p, () => {
    for (const c of edSubCues(p, t.id)) c[key] = v;
  }).catch(VideoWorkbench.reportError);
});

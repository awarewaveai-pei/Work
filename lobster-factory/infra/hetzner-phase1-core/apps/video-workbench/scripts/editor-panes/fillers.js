// Card ED.11: the 「剪贅字」 left pane (spec §1.3 剪贅字, §3 檔案歸屬: ED.11). Registered with edRegisterPane in
// tools-editor.js. FillerCut (below) is the whole cut as pure functions on a project; the page runs it once on the
// project, so the preview and the export both read the same cut clips. tests/ed11-fillers.cjs require()s this file.
const FillerCut = (() => {
  const node = typeof module === "object" && module.exports;
  const EM = node ? require("../../shared/editor-model.js") : EditorModel,
    TW = node ? require("../../shared/transcript-words.js") : TranscriptWords,
    TB = node ? require("../../shared/timebase.js") : Timebase;
  // The hidden text track recognition fills when the project has no word times (spec: 結果成隱藏字幕軌).
  const TRACK = "逐字時間（剪贅字）";
  const sec = (p, frames) => TB.toSeconds(frames, p.timebase);
  // Clip seconds are derived from frames (the page strips them on save; tools-editor.js edTime keeps both).
  function times(p, c) {
    c.start = sec(p, c.startFrame);
    c.duration = sec(p, c.durationFrames);
    c.sourceStart = sec(p, c.sourceStartFrame || 0);
    return c;
  }
  // 配樂 = every audio track except 旁白 A1: never cut, so it plays on without a jump.
  const music = (p, c) => c.kind === "audio" && c.track !== EM.NARRATION;
  const recordings = (p) => {
    const main = EM.mainTrack(p.tracks);
    return p.clips.filter((c) => (c.track === main || c.track === EM.NARRATION) && ["video", "audio"].includes(c.kind));
  };
  // Word times on the timeline (seconds): the text track whose cues carry the most words that still spell their line
  // (TranscriptWords.spells, the exporter's rule). Each word's recording = the 旁白 or 主視訊 clip playing at its middle
  // (narration first), so a pause is never measured across two recordings.
  function words(p) {
    let best = { track: null, words: [] };
    for (const t of p.tracks.filter((x) => x.kind === "text")) {
      const list = p.clips
        .filter((c) => c.track === t.id && c.kind === "text" && TW.spells(c.words, c.text))
        .flatMap((c) => c.words.map((w) => ({ start: c.start + w.start, end: c.start + w.end, text: w.text })));
      if (list.length > best.words.length) best = { track: t, words: list };
    }
    const clips = recordings(p).sort((a, b) => (b.track === EM.NARRATION) - (a.track === EM.NARRATION));
    for (const w of best.words) {
      const mid = (w.start + w.end) / 2,
        clip = clips.find((c) => mid >= c.start && mid < c.start + c.duration);
      w.source = clip ? clip.id : null;
    }
    best.words = best.words.filter((w) => w.source !== null); // a word over no recording has nothing to cut
    return best;
  }
  // What 剪掉 would remove: { ranges: [[fromFrame, toFrame]] merged, fillers, pauses, seconds }.
  function plan(p, { maxPause = 0.5, fillers = true } = {}) {
    const list = words(p).words,
      marked = TW.annotate(list),
      ranges = [];
    for (const [a, b] of TW.cutRanges(list, { maxPause, fillers })) {
      const from = TB.toFrames(a, p.timebase), to = TB.toFrames(b, p.timebase), last = ranges.at(-1);
      if (to <= from) continue;
      if (last && from <= last[1]) last[1] = Math.max(last[1], to);
      else ranges.push([from, to]);
    }
    const frames = ranges.reduce((n, [a, b]) => n + b - a, 0);
    return {
      ranges,
      mediaClips: mediaAfter(p, ranges),
      fillers: fillers ? marked.filter((w) => w.filler).length : 0,
      pauses: marked.filter((w) => w.pauseAfter != null && w.pauseAfter > maxPause).length,
      seconds: sec(p, frames),
    };
  }
  // Keys inside [from, to) of a clip rebased to `from`, with a pinned key at an edge only when keys lie at or beyond it
  // (= tools-editor.js edWindow, which a page script cannot share with this file's Node test).
  const windowKeys = (keys, from, to, valueAt) => [
    ...(keys.some((k) => k.frame <= from) ? [{ frame: 0, ...valueAt(from) }] : []),
    ...keys.filter((k) => k.frame > from && k.frame < to).map((k) => ({ ...k, frame: k.frame - from })),
    ...(keys.some((k) => k.frame >= to) ? [{ frame: to - from, ...valueAt(to) }] : []),
  ];
  // = backend/editor-export.cjs validateProject's limit on non-text clips (tests/ed11-fillers.cjs checks the two agree):
  // a cut that would split the timeline past it is refused before anything changes, so the project always exports.
  const MEDIA_CLIPS = 64;
  // The parts of [s, e) outside the ranges.
  function keep(s, e, ranges) {
    const pieces = [];
    let from = s;
    for (const [a, b] of ranges) {
      if (b <= from || a >= e) continue;
      if (a > from) pieces.push([from, a]);
      from = Math.max(from, b);
    }
    if (from < e) pieces.push([from, e]);
    return pieces;
  }
  // Picture and sound clips the project would hold after the cut (music is never split).
  const mediaAfter = (p, ranges) =>
    p.clips.filter((c) => c.kind !== "text").reduce((n, c) => n + (music(p, c) ? 1 : keep(c.startFrame, c.startFrame + c.durationFrames, ranges).length), 0);
  // Cuts frame ranges out of the project in place: 主視訊, overlays, 旁白 and every text track are cut and close up;
  // 配樂 keeps its clips untouched (only shortened where it ran to the old end of the picture); markers move with the
  // picture. newId() names the second and later pieces of a clip a range splits. Throws, changing nothing, past
  // MEDIA_CLIPS.
  function apply(p, ranges, newId) {
    if (!ranges.length) return p;
    const count = mediaAfter(p, ranges);
    if (count > MEDIA_CLIPS)
      throw Error(`剪完會有 ${count} 段影音片段，超過匯出上限 ${MEDIA_CLIPS} 段；請把「停頓最多保留」調長，或先分成幾個專案`);
    const removedBefore = (f) => ranges.reduce((n, [a, b]) => n + Math.max(0, Math.min(f, b) - a), 0),
      inCut = (f) => ranges.some(([a, b]) => f >= a && f < b),
      main = EM.mainTrack(p.tracks),
      pictureEnd = () => Math.max(0, ...p.clips.filter((c) => c.track === main).map((c) => c.startFrame + c.durationFrames)),
      oldEnd = pictureEnd(),
      out = [];
    for (const c of p.clips) {
      if (music(p, c)) {
        out.push(c);
        continue;
      }
      const s = c.startFrame, pieces = keep(s, s + c.durationFrames, ranges);
      if (!pieces.length) continue;
      if (c.kind === "text") {
        // A line stays one clip, shortened by what was cut inside it; its words move with their sound. A line its words
        // spell drops the words cut away (a filler leaves the subtitle with it) and goes when none is left.
        const fps = c.durationFrames / c.duration,
          kept = (c.words || []).filter((w) => !inCut(Math.floor(s + ((w.start + w.end) / 2) * fps))),
          spelled = TW.spells(c.words, c.text);
        if (spelled && !kept.length) continue;
        const start = s - removedBefore(s),
          next = times(p, Object.assign(c, { startFrame: start, durationFrames: pieces.reduce((n, [a, b]) => n + b - a, 0) })),
          at = (t) => {
            const f = s + Math.round(t * fps);
            return Math.min(next.duration, Math.max(0, sec(p, f - removedBefore(f) - start)));
          };
        if (spelled && kept.length < c.words.length) next.text = TW.joinWords(kept.map((w) => w.text));
        if (kept.length) next.words = kept.map((w) => ({ ...w, start: at(w.start), end: at(w.end) }));
        else delete next.words;
        out.push(next);
        continue;
      }
      // Every piece is read from the clip as it was (the first piece reuses the clip object and is written last).
      const src = structuredClone(c),
        speed = Number(src.speed) || 1;
      pieces.forEach(([a, b], i) => {
        const piece = i ? structuredClone(src) : c,
          offset = a - s,
          len = b - a;
        if (i) piece.id = newId();
        piece.startFrame = a - removedBefore(a);
        piece.durationFrames = len;
        piece.sourceStartFrame = (src.sourceStartFrame || 0) + Math.round(offset * speed);
        if (src.volumeKeys?.length) piece.volumeKeys = windowKeys(src.volumeKeys, offset, offset + len, (f) => ({ gain: EM.gainAt(src.volumeKeys, f) }));
        if (src.transformKeys?.length) piece.transformKeys = windowKeys(src.transformKeys, offset, offset + len, (f) => EM.transformAt(src.transformKeys, f));
        if (i) {
          delete piece.transition;
          delete piece.transitionFrames;
          piece.fadeIn = 0;
        }
        if (i < pieces.length - 1) piece.fadeOut = 0;
        out.push(times(p, piece));
      });
    }
    p.clips = out;
    // Music that ran to the end of the picture ends with it now; music already longer than the picture stays as it was.
    const end = pictureEnd();
    p.clips = p.clips.filter((c) => {
      if (!music(p, c)) return true;
      const e = c.startFrame + c.durationFrames;
      if (e <= end || e > oldEnd) return true;
      if (c.startFrame >= end) return false;
      c.durationFrames = end - c.startFrame;
      if (c.volumeKeys?.length) c.volumeKeys = windowKeys(c.volumeKeys, 0, c.durationFrames, (f) => ({ gain: EM.gainAt(c.volumeKeys, f) }));
      times(p, c);
      c.fadeOut = Math.min(Number(c.fadeOut) || 0, c.duration / 2);
      return true;
    });
    if (Array.isArray(p.markers))
      p.markers = p.markers.map((m) => {
        const f = TB.toFrames(m, p.timebase);
        return Number(sec(p, f - removedBefore(f)).toFixed(2));
      });
    return p;
  }
  return { TRACK, MEDIA_CLIPS, words, plan, apply, mediaAfter };
})();
if (typeof module === "object" && module.exports) module.exports = FillerCut;
else {
  // ---- the pane (page only) ----
  const fcLangs = ["自動偵測", "繁體中文", "簡體中文", "English", "日本語", "한국어", "ภาษาไทย"],
    fcUi = { projectId: null, maxPause: 0.5, fillers: true, language: "自動偵測", quote: null, job: null };
  const fcState = (p) => {
    if (fcUi.projectId !== p.id) Object.assign(fcUi, { projectId: p.id, quote: null });
    return fcUi;
  };
  const fcSeconds = (s) => (Math.round(s * 10) / 10).toFixed(1);
  const fcJobText = () =>
    ({ queued: "排隊中…", running: `辨識中 ${fcUi.job.progress || 0}%`, failed: "辨識失敗：" + (fcUi.job.error || ""), cancelled: "已取消" })[
      fcUi.job.status
    ] || "";
  // Recognition = the same whole-project job as 字幕 (V1 + A1 sound, priced first); its result fills the hidden track.
  function fcRecognise(p, ui) {
    const running = ["queued", "running"].includes(ui.job?.status),
      q = ui.quote;
    return `<p class="note">這個專案還沒有逐字時間碼，要先辨識主視訊 V1 與旁白 A1（另計）。結果放進隱藏字幕軌「${esc(FillerCut.TRACK)}」，之後改停頓秒數重剪不必再辨識。</p><label>說話語言</label>${edChoices("說話語言", "fc-lang", ui.language, fcLangs)}${
      q
        ? `<p class="ed-fc-quote">${q.segments} 段有聲片段，共 ${Math.round(q.seconds)} 秒 · ${esc(edSubPrice(q.costUsd))}</p>${edButton(`開始辨識（${edSubPrice(q.costUsd)}）`, "fc-run", running || !edSubPriced(q.costUsd))}`
        : edButton("查看費用", "fc-quote", running)
    }${ui.job && ui.job.projectId === p.id ? `<p class="note" data-ed-fc-job>${esc(fcJobText())}</p>` : ""}`;
  }
  function fcPane(p) {
    const ui = fcState(p),
      found = FillerCut.words(p),
      plan = found.words.length ? FillerCut.plan(p, ui) : null;
    const controls = `<label>停頓最多保留 <b data-ed-fc-out>${ui.maxPause.toFixed(1)} 秒</b><input type="range" min="0" max="2" step="0.1" aria-label="停頓最多保留（秒）" data-ed-fc-pause value="${ui.maxPause}"></label><label class="ed-fc-check"><input type="checkbox" data-ed-fc-fillers ${ui.fillers ? "checked" : ""}> 剪掉贅字（嗯、呃、um、uh）</label>`;
    const body = plan
      ? `<p class="note">用「${esc(found.track.language || found.track.name)}」軌的逐字時間：${found.words.length} 個字。</p><p class="ed-fc-summary">${
          plan.ranges.length ? `會剪掉 ${plan.ranges.length} 處（贅字 ${plan.fillers} 個、停頓 ${plan.pauses} 段），共 ${fcSeconds(plan.seconds)} 秒 · 免費` : "沒有要剪的贅字或過長停頓"
        }</p>${plan.mediaClips > FillerCut.MEDIA_CLIPS ? `<p class="note">剪完會有 ${plan.mediaClips} 段影音片段，超過匯出上限 ${FillerCut.MEDIA_CLIPS} 段；請把停頓秒數調長，或先分成幾個專案。</p>` : ""}${edButton("剪掉", "fc-cut", !plan.ranges.length || plan.mediaClips > FillerCut.MEDIA_CLIPS)}`
      : fcRecognise(p, ui);
    return `<h3>剪贅字</h3><p class="note">找出語氣詞和過長的停頓，主影片、旁白、字幕一起剪掉並補上空隙；配樂不剪，照常連續播放。只在同一段錄音內剪，可復原。</p>${controls}${body}`;
  }
  async function fcWatch(jobId) {
    while (fcUi.job?.id === jobId) {
      const v = await VideoWorkbench.generations.get(jobId);
      if (fcUi.job?.id !== jobId) return;
      Object.assign(fcUi.job, { status: v.status, progress: v.progress, error: v.error });
      const line = document.querySelector("[data-ed-fc-job]");
      if (line) line.textContent = fcJobText();
      if (v.status === "succeeded") {
        const t = await VideoWorkbench.request("/editor/transcriptions/" + encodeURIComponent(jobId), undefined, "GET"),
          p = edProject();
        fcUi.job = null;
        // Placed only into its own project while it is open; otherwise 字幕 › 找回已完成的字幕結果 has it.
        if (p && p.id === t.projectId)
          await edSubEdit(p, () => {
            const id = edSubTracks(p).find((x) => x.language === FillerCut.TRACK)?.id || edSubNewTrack(p, FillerCut.TRACK, true);
            edSubFill(p, id, (t.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text, words: s.words })));
          });
        else if (tool === "edit") edRedraw();
        return;
      }
      if (!["queued", "running"].includes(v.status)) return tool === "edit" && edRedraw();
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const fcSettings = (p) => ({ ...edSubSettings(p), language: fcUi.language });
  edRegisterPane("fillers", {
    title: "剪贅字",
    icon: "✂",
    render: (p) => fcPane(p),
    actions: {
      "fc-lang:": async (action) => {
        fcUi.language = action.slice(8);
        fcUi.quote = null;
        edRedraw();
      },
      "fc-quote": async (action, p) => {
        const settings = fcSettings(p);
        fcUi.quote = { ...(await VideoWorkbench.request("/editor/transcriptions/quote", { settings })), key: JSON.stringify(settings) };
        edRedraw();
      },
      // Sent only with the price on screen and for the plan that was priced (a timeline edited since is re-priced).
      "fc-run": async (action, p) => {
        const settings = fcSettings(p);
        if (fcUi.quote?.key !== JSON.stringify(settings)) {
          fcUi.quote = null;
          edRedraw();
          throw Error("時間軸改過了，請重新查看費用");
        }
        if (!edSubPriced(fcUi.quote.costUsd)) return;
        const job = await VideoWorkbench.request("/editor/transcriptions", { settings, idempotencyKey: crypto.randomUUID() });
        fcUi.quote = null;
        fcUi.job = { id: job.id, projectId: p.id, status: job.status, progress: job.progress || 0 };
        edRedraw();
        fcWatch(job.id).catch(VideoWorkbench.reportError);
      },
      "fc-cut": async (action, p) => {
        const plan = FillerCut.plan(p, fcUi);
        if (!plan.ranges.length) return;
        edCheckpoint();
        FillerCut.apply(p, plan.ranges, () => crypto.randomUUID());
        ed.selected = null;
        ed.picks.clear();
        // The cut already closes up every track it touched; 磁性主軌 would re-lay V1 alone and break its sync with A1.
        ed.skipMagnet = true;
        await edCommit(p);
        VideoWorkbench.notify(`已剪掉 ${plan.ranges.length} 處，共 ${fcSeconds(plan.seconds)} 秒（可復原）`);
      },
    },
  });
  document.addEventListener("input", (e) => {
    if (!e.target.matches?.("[data-ed-fc-pause]")) return;
    const out = document.querySelector("[data-ed-fc-out]");
    if (out) out.textContent = Number(e.target.value).toFixed(1) + " 秒";
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches?.("[data-ed-fc-pause]")) fcUi.maxPause = Number(e.target.value);
    else if (e.target.matches?.("[data-ed-fc-fillers]")) fcUi.fillers = e.target.checked;
    else return;
    edRedraw();
  });
}

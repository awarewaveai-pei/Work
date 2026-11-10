// Card ED.0: the 「字幕」 left pane (spec §3 檔案歸屬: ED.10). Registered with edRegisterPane in tools-editor.js.
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
edRegisterPane("subtitles", {
  title: "字幕",
  icon: "☰",
  render: (p, c) => `<h3>字幕</h3>${edButton("匯入 SRT／VTT", "subtitles-import")}${edButton("下載 SRT", "subtitles-download:srt")}${edButton("下載 VTT", "subtitles-download:vtt")}${edButton("前往字幕工具", "subtitles-tool")}<p class="note">每段字幕為文字軌片段，可逐段修改。時間重疊的字幕分放在不同文字軌；下載時重疊部分合併成同一段（多行）。辨識與翻譯請至字幕工具處理後匯入。</p>`,
  actions: {
    "subtitles-tool": async (action, p, c) => {
      tool = "subtitle";
      restoreToolDraft();
      setToolHash("#subtitle");
      edRender();
      return;
    },
    "subtitles-import": async (action, p, c) => {
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
    },
    "subtitles-download": async (action, p, c) => {
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
    },
  },
});

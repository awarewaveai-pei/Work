let shortPending = false;
function toolShortResults() {
  return `<section class="side"><h3>挑選與校對段落</h3><p class="note">可預覽並調整每段時間。匯出採固定中央 9:16 裁切，不包含人物自動追蹤。</p>${(values.shortClips || []).map((c, i) => `<div class="subtitle-cues"><label class="check"><input type="checkbox" data-short-index="${i}" data-short-field="selected" ${c.selected ? "checked" : ""}>${esc(c.title)}</label><label>開始（秒）<input class="text-input" type="number" min="0" step="0.1" value="${c.start}" data-short-index="${i}" data-short-field="start"></label><label>結束（秒）<input class="text-input" type="number" min="0" step="0.1" value="${c.end}" data-short-index="${i}" data-short-field="end"></label>${wfButton("預覽此段", "short-preview:" + i)}</div>`).join("")}${wfButton("手動新增一段", "short-add")}${wfButton(values.shortMode === "一支精華" ? "合成勾選段落" : "輸出勾選短片", "short-export", !(values.shortClips || []).some((c) => c.selected))}</section>`;
}
async function toolShortAnalyze() {
  if (shortPending) return;
  if (!files.src) throw Error("請先選擇影片");
  if (values.shortVisual)
    throw Error(
      "畫面辨識分析尚未接入；可取消此選項並依語音字幕分析，或手動選段",
    );
  const draft = values,
    source = files.src,
    fingerprint = JSON.stringify({
      source,
      settings: [
        values.shortPrompt,
        values.shortLength,
        values.shortCount,
        values.shortMode,
      ],
    });
  shortPending = true;
  const button = document.querySelector('[data-flow-action="short-analyze"]');
  if (button) {
    button.disabled = true;
    button.textContent = "分析中…";
  }
  try {
    const duration = Number(source.duration);
    if (!duration || duration > 1200)
      throw Error("語音分析單次最長 20 分鐘，請先裁短影片");
    let cues = String(values.subtitleText || "").trim()
      ? toolSubtitleParse(values.subtitleText)
      : [];
    if (!cues.length) {
      const response = await VideoWorkbench.request("/transcriptions", {
        source,
        language: values.shortLanguage,
      });
      cues = toolSubtitleParse(response.srt);
    }
    if (!cues.length)
      throw Error("沒有可分析的字幕，請匯入 SRT 或手動新增片段");
    const result = await VideoWorkbench.request("/tools/short/analyze", {
      cues: cues.map(({ start, end, text }) => ({ start, end, text })),
      duration,
      count: Number((draft.shortCount || "5").match(/\d+/)?.[0] || 5),
      prompt: draft.shortPrompt || "",
      length:
        draft.shortMode === "一支精華"
          ? draft.shortHighlightLength
          : draft.shortLength,
    });
    if (
      values !== draft ||
      files.src !== source ||
      fingerprint !==
        JSON.stringify({
          source: files.src,
          settings: [
            values.shortPrompt,
            values.shortLength,
            values.shortCount,
            values.shortMode,
          ],
        })
    ) {
      VideoWorkbench.notify("來源或設定已變更，保留目前草稿，請重新分析");
      return;
    }
    draft.shortCues = cues;
    draft.shortClips = result.clips.map((c) => ({ ...c, selected: true }));
    saveDraft();
    if (tool === "short") render();
  } finally {
    shortPending = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = "開始分析";
    }
  }
}
async function toolShortAction(action) {
  if (
    !action?.startsWith("short-") ||
    action === "short-analyze" ||
    action.startsWith("short-preset:")
  )
    return;
  if (action === "short-add") {
    const start = Number(
        document.querySelector('[data-flow-media="src"]')?.currentTime || 0,
      ),
      duration = Number(files.src?.duration || 0);
    if (duration <= start) throw Error("請先選擇有效影片");
    (values.shortClips ||= []).push({
      title: "手動片段",
      start,
      end: Math.min(start + 30, duration),
      selected: true,
    });
    saveDraft();
    render();
  }
  if (action.startsWith("short-preview:")) {
    const c = values.shortClips?.[Number(action.slice(14))],
      m = document.querySelector('[data-flow-media="src"]');
    if (c && m) {
      m.currentTime = c.start;
      m.ontimeupdate = () => {
        if (m.currentTime >= c.end) {
          m.pause();
          m.ontimeupdate = null;
        }
      };
      await m.play();
    }
  }
  if (action === "short-export") {
    const source = structuredClone(files.src),
      settings = structuredClone(values),
      chosen = (settings.shortClips || []).filter((c) => c.selected);
    if (!chosen.length) throw Error("請勾選片段");
    if (
      chosen.some(
        (c) =>
          !Number.isFinite(c.start) ||
          !Number.isFinite(c.end) ||
          c.start < 0 ||
          c.end <= c.start ||
          c.end > source.duration + 0.1,
      )
    )
      throw Error("片段時間需位於來源範圍內");
    let cues =
      settings.shortCues ||
      (String(settings.subtitleText || "").trim()
        ? toolSubtitleParse(settings.subtitleText)
        : []);
    if (settings.shortCaption && !cues.length)
      throw Error("加入字幕前請先匯入或辨識字幕");
    const groups =
      settings.shortMode === "一支精華" ? [chosen] : chosen.map((c) => [c]);
    for (const group of groups) {
      let at = 0;
      const clips = [];
      for (const part of group) {
        const duration = part.end - part.start;
        clips.push({
          id: crypto.randomUUID(),
          kind: "video",
          track: "V1",
          fit: "裁切",
          asset: source,
          start: at,
          duration,
          sourceStart: part.start,
          speed: 1,
        });
        if (settings.shortCaption)
          for (const cue of cues) {
            const start = Math.max(cue.start, part.start),
              end = Math.min(cue.end, part.end);
            if (end > start)
              clips.push({
                ...edText(cue.text, at + start - part.start, end - start, null),
                y: 88,
              });
          }
        at += duration;
      }
      const job = await VideoWorkbench.generations.create({
        type: "video",
        operation: "editor-export",
        settings: {
          quality: "720p",
          // Same stored form as the editor (card M3): frames at the project timebase, seconds stripped.
          project: edNative(edNormalizeProject({ title: group[0].title, ratio: "9:16", timebase: { ...Timebase.DEFAULT }, clips, tracks: {} })),
        },
      });
      VideoWorkbench.showJob(job);
    }
  }
}
document.addEventListener("change", (event) => {
  const input = event.target,
    index = Number(input.dataset.shortIndex),
    key = input.dataset.shortField;
  if (!key) return;
  const c = values.shortClips?.[index];
  if (!c) return;
  c[key] = input.type === "checkbox" ? input.checked : Number(input.value);
  saveDraft();
});

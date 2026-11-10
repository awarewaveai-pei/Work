// Card ED.0: the 「轉場」 left pane (spec §3 檔案歸屬: ED.7). Registered with edRegisterPane in tools-editor.js.
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
edRegisterPane("transition", {
  title: "轉場",
  icon: "⧉",
  render: (p, c) => edTransitionPane(p, c),
  actions: {
    "transition:": async (action, p, c) => {
      edCheckpoint();
      if (c) {
        const name = EditorModel.transitionName(action.slice(11));
        if (name === null) throw Error("轉場不存在");
        c.transition = name;
        c.transitionFrames = EditorModel.transitionFrames(c, p.timebase);
        delete c.transitionDuration;
      }
      await edCommit(p);
    },
  },
});

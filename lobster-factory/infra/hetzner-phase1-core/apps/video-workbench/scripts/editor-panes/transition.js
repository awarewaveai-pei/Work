// Card ED.0/ED.7: the 「轉場」 left pane (spec §1.3 轉場). Registered with edRegisterPane in tools-editor.js.
// A transition belongs to the later clip of a cut between two touching V1 clips; only a clicked cut (the ⧉ button on
// the timeline) can take one. The export repeats the edge frame for any missing handle frames.
const edTrEffects = [
    ["融接", "溶解"],
    ["淡入淡出", "黑場"],
    ["向左擦除", "向左擦除"],
    ["向右擦除", "向右擦除"],
    ["圓形裁切", "圓形展開"],
  ],
  edTrCurves = ["線性", "平滑", "加速"],
  // Slides keep working on old projects but have no curved form in the export (backend/editor-export.cjs).
  edTrNoCurve = ["向左推移", "向右推移"],
  // The cut the user clicked (the later clip's id) and the values 套用全部剪點 uses.
  edTr = {
    cut: null,
    draft: { name: "溶解", curve: "線性", seconds: 0.5 },
    timer: null,
  };
document.addEventListener(
  "click",
  (e) => {
    const cut = e.target.closest?.(".editor-cut");
    if (cut) edTr.cut = String(cut.dataset.edAction || "").slice(4);
  },
  true,
);
document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.target.closest?.("[data-ed-clip]")) edTr.cut = null;
  },
  true,
);
const edTrCuts = (p) =>
  p.clips
    .filter((x) => x.track === edMain(p) && edPrevious(p, x))
    .sort((a, b) => a.startFrame - b.startFrame);
// Frames the length can take at this cut: 0.1 s .. 2 s, and never more than either neighbour (half of each on its side).
function edTrRange(p, c) {
  const fps = Timebase.fps(p.timebase),
    model = EditorModel.transitionLimits(p.timebase),
    previous = edPrevious(p, c);
  const max = Math.min(
    model.max,
    previous ? previous.durationFrames : model.max,
    c.durationFrames,
  );
  // A neighbour shorter than 0.1 s: the shorter length wins; below the model's 2 frames no transition fits (ok = false).
  return {
    min: Math.min(max, Math.max(model.min, Math.ceil(0.1 * fps - 1e-9))),
    max,
    fps,
    ok: max >= model.min,
  };
}
const edTrActive = (p, c) =>
  !!c && c.id === edTr.cut && c.track === edMain(p) && !!edPrevious(p, c);
const edTrHas = (c) => EditorModel.transitionName(c.transition) !== "無";
// What the pane shows: the cut's own transition once it has one, else the values the next choice will use.
const edTrLook = (c) => ({
  name: edTrHas(c) ? EditorModel.transitionName(c.transition) : edTr.draft.name,
  curve: edTrHas(c) ? c.transitionCurve || "線性" : edTr.draft.curve,
});
function edTrSet(p, c, name, curve, seconds) {
  const { min, max, fps, ok } = edTrRange(p, c);
  if (!ok) throw Error("片段太短，放不下轉場");
  c.transition = name;
  c.transitionFrames = Math.max(min, Math.min(max, Math.round(seconds * fps)));
  c.transitionCurve = edTrNoCurve.includes(name) ? "線性" : curve;
  delete c.transitionDuration;
}
function edTrButtons(label, action, value, options, text, disabled) {
  return `<div class="flow-choices" role="group" aria-label="${esc(label)}">${options
    .map(
      (o) =>
        `<button type="button" class="btn small ${o === value ? "selected" : ""}" data-ed-action="${esc(action + ":" + o)}" aria-pressed="${o === value}" ${disabled ? "disabled" : ""}>${esc(text(o))}</button>`,
    )
    .join("")}</div>`;
}
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
  const active = edTrActive(p, c),
    cuts = edTrCuts(p),
    has = active && edTrHas(c),
    look = active ? edTrLook(c) : edTr.draft,
    range = active
      ? edTrRange(p, c)
      : { min: 3, max: 60, fps: Timebase.fps(p.timebase) },
    seconds = has
      ? EditorModel.transitionFrames(c, p.timebase) / range.fps
      : edTr.draft.seconds,
    shown = Number(
      Math.max(
        range.min / range.fps,
        Math.min(range.max / range.fps, seconds),
      ).toFixed(3),
    ),
    issue = has ? edTransitionIssue(p, c) : "",
    names = [
      ...edTrEffects.map(([, stored]) => stored),
      ...(edTrNoCurve.includes(look.name) ? [look.name] : []),
    ],
    label = (stored) =>
      edTrEffects.find(([, s]) => s === stored)?.[0] || stored;
  return (
    `<h3>轉場</h3><p class="note" data-ed-transition-hint>${active ? `已選剪點：${c.start.toFixed(2)} 秒。轉場以剪點為中心，前段與後段各占一半，總長度不變。預覽以透明度近似，輸出為準。` : "請先點選 V1 相鄰片段之間的剪點"}</p>` +
    edTrButtons(
      "轉場",
      "transition",
      has ? look.name : "",
      names,
      label,
      !active,
    ) +
    `<label class="editor-transition-length">長度（秒）<input class="text-input" type="number" aria-label="轉場秒數" data-ed-tr-seconds min="0.1" max="${(range.max / range.fps).toFixed(3)}" step="0.1" value="${shown}" ${active ? "" : "disabled"}></label>` +
    `<p class="note">0.1–2 秒，不超過左右片段各半${active ? `（此處最長 ${(range.max / range.fps).toFixed(2)} 秒）` : ""}</p>` +
    edTrButtons(
      "轉場曲線",
      "transition-curve",
      look.curve,
      edTrCurves,
      (o) => o,
      !active || edTrNoCurve.includes(look.name),
    ) +
    `<div class="editor-transition-actions">${edButton(`套用全部剪點 (${cuts.length})`, "transition-all", !cuts.length)}${edButton("預覽剪點", "transition-preview", !has)}${edButton("移除轉場", "transition-remove", !has)}</div>` +
    (issue ? `<p class="note" data-ed-transition-issue>${esc(issue)}</p>` : "")
  );
}
function edTrStopPreview() {
  clearInterval(edTr.timer);
  edTr.timer = null;
}
edRegisterPane("transition", {
  title: "轉場",
  icon: "⧉",
  render: (p, c) => edTransitionPane(p, c),
  actions: {
    "transition:": async (action, p, c) => {
      if (!edTrActive(p, c)) return;
      const name = EditorModel.transitionName(action.slice(11));
      if (name === null || name === "無") throw Error("轉場不存在");
      if (!edTrRange(p, c).ok) throw Error("片段太短，放不下轉場");
      edCheckpoint();
      const had = edTrHas(c);
      if (had)
        edTr.draft.seconds =
          EditorModel.transitionFrames(c, p.timebase) /
          Timebase.fps(p.timebase);
      edTr.draft.name = name;
      edTrSet(
        p,
        c,
        name,
        had ? c.transitionCurve || "線性" : edTr.draft.curve,
        edTr.draft.seconds,
      );
      await edCommit(p);
    },
    "transition-curve:": async (action, p, c) => {
      const curve = action.slice(17);
      if (!edTrActive(p, c) || !edTrCurves.includes(curve)) return;
      edCheckpoint();
      edTr.draft.curve = curve;
      if (edTrHas(c)) c.transitionCurve = curve;
      await edCommit(p);
    },
    "transition-all": async (action, p) => {
      const cuts = edTrCuts(p);
      if (!cuts.length) return;
      edCheckpoint();
      for (const x of cuts.filter((y) => edTrRange(p, y).ok))
        edTrSet(p, x, edTr.draft.name, edTr.draft.curve, edTr.draft.seconds);
      await edCommit(p);
    },
    "transition-remove": async (action, p, c) => {
      if (!edTrActive(p, c)) return;
      edCheckpoint();
      c.transition = "無";
      delete c.transitionCurve;
      await edCommit(p);
    },
    "transition-preview": async (action, p, c) => {
      if (!edTrActive(p, c)) return;
      const end =
        c.start +
        EditorModel.transitionFrames(c, p.timebase) / Timebase.fps(p.timebase) +
        1;
      edTrStopPreview();
      ed.time = Math.max(0, c.start - 1);
      edPlay(1);
      edTr.timer = setInterval(() => {
        if (ed.playing && ed.time < end) return;
        edTrStopPreview();
        edStop();
        edPaint();
      }, 50);
    },
  },
});
// The length box: clamped to 0.1 s .. 2 s and to the neighbours; it is the value 套用全部剪點 uses next.
document.addEventListener("change", async (e) => {
  if (!e.target.matches?.("[data-ed-tr-seconds]")) return;
  const p = edProject(),
    c = edClip();
  if (!p || !edTrActive(p, c)) return;
  const { min, max, fps } = edTrRange(p, c),
    value = Number(e.target.value);
  if (!Number.isFinite(value)) return edRender();
  edCheckpoint();
  edTr.draft.seconds =
    Math.max(min, Math.min(max, Math.round(value * fps))) / fps;
  if (edTrHas(c))
    edTrSet(
      p,
      c,
      c.transition,
      c.transitionCurve || "線性",
      edTr.draft.seconds,
    );
  await edCommit(p);
});

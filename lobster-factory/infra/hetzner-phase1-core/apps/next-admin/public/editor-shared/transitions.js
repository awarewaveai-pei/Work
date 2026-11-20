// The transitions module (card R2 item 11, 「一個小積木」): the one list of transitions, the one way to read a stored
// name, what each one becomes on output, and the one picker. Every caller uses it and keeps no list of its own -- the
// editor's 轉場 pane and its export (video-workbench shared/editor-model.js, backend/transitions.cjs), the intro form, the
// episode's 片頭／片尾 (shared/episode-spine.js, shared/bookends.js), automatic videos, the main system's site settings.
// tests/r2-transitions-one-list.cjs fails on a transition name written anywhere else.
// One file for both apps (like video-styles.js / intro-styles.js): the workbench reads it from the main system's copy
// (awarewave-files.txt; its pages load it as /awarewave/editor-shared/transitions.js, served by video-workbench server.cjs
// from its own copy) and the
// main system imports it. A classic script (global `Transitions`) and a CommonJS module at once.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Transitions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // (a) The list (operator 2026-11-20: six choices; 交叉淡化 is 溶解 and 淡黑 is 黑場, one name each, the old name as a
  // note). xfade = FFmpeg's transition: the editor's export makes it, and video-service joins 片頭／片尾 and automatic
  // videos with the same name (server.py reads FFmpeg's own xfade list), so every choice works in every place.
  const LIST = [
    { id: "無", note: "直接切", xfade: null, timeline: null },
    { id: "溶解", note: "＝交叉淡化", xfade: "fade", timeline: "fade" },
    { id: "黑場", note: "＝淡黑", xfade: "fadeblack", timeline: "fade" },
    { id: "向左擦除", note: "", xfade: "wipeleft", timeline: "slide_left" },
    { id: "向右擦除", note: "", xfade: "wiperight", timeline: "slide_right" },
    { id: "圓形展開", note: "", xfade: "circleopen", timeline: null },
  ];
  // Slides keep working on projects that have them; not offered, and no curved form in the export.
  const KEPT = [
    { id: "向左推移", xfade: "slideleft", timeline: "slide_left" },
    { id: "向右推移", xfade: "slideright", timeline: "slide_right" },
  ];
  // timeline = the Timeline v1 kind a transition exports as (video-workbench backend/timeline-export.cjs); null = none
  // there (reported as a loss).
  // Stored name -> FFmpeg xfade transition (every name the editor's export can make).
  const XFADE = Object.fromEntries([...LIST, ...KEPT].filter((t) => t.xfade).map((t) => [t.id, t.xfade]));
  const TIMELINE = Object.fromEntries([...LIST, ...KEPT].filter((t) => t.timeline).map((t) => [t.id, t.timeline]));
  // The 轉場 pane's buttons in order: [button label, stored name] (無 = its 移除轉場 button).
  const PICKER = LIST.filter((t) => t.xfade).map((t) => [t.id, t.id]);
  // (d) Old names: the editor's pre-P2 names and the 片頭／片尾 names stored before card R2 (video-service's old names).
  const LEGACY = { 融接: "溶解", 淡入淡出: "黑場", 圓形裁切: "圓形展開", crossfade: "溶解", "fade-black": "黑場", none: "無" };
  // An FFmpeg name read back as its transition (a wire value: fade -> 溶解).
  const BY_XFADE = Object.fromEntries(Object.entries(XFADE).map(([id, x]) => [x, id]));
  const NO_CURVE = KEPT.map((t) => t.id);
  // Card ED.7.3: a curve is one formula of the linear progress T (0 -> 1); the export writes it into FFmpeg's xfade
  // expression and the preview evaluates the same text.
  const CURVES = { 線性: "T", 平滑: "T*T*(3-2*T)", 加速: "T*T" };
  // null = unknown name (the export refuses it); "無" = no transition.
  function name(v) {
    if (v === undefined || v === null || v === "" || v === "無") return "無";
    if (Object.hasOwn(XFADE, v)) return v;
    if (Object.hasOwn(LEGACY, v)) return LEGACY[v];
    return Object.hasOwn(BY_XFADE, v) ? BY_XFADE[v] : null;
  }
  // Integer frames: 2 frames .. 2 s.
  const limits = (tb) => ({ min: 2, max: Math.floor((2 * tb.num) / tb.den) });
  // (b) What video-service gets for a 片頭／片尾 / automatic-video transition: "none" or the FFmpeg name; null = unknown.
  function wire(v) {
    const n = name(v);
    return n === null ? null : n === "無" ? "none" : XFADE[n];
  }
  // An automatic video's transition when its site chose none (card R2 item 11).
  const AUTO = { id: "溶解", seconds: 0.5 };
  // (c) The picker: one button per transition, the current one pressed; knows nothing of the page it is on. why(id) =
  // a reason the button cannot be pressed (shown under it); esc = the page's HTML escaper; attrs(id) = the page's own
  // attributes for its click handling (default data-transition="<id>"); look(on) = the page's button classes.
  function buttons({ label, value, ids = LIST.map((t) => t.id), esc, disabled = false, why = () => "",
    attrs = (id) => `data-transition="${esc(id)}"`, look = (on) => "btn small" + (on ? " selected" : "") }) {
    const on = name(value);
    return `<div class="flow-choices row" role="group" aria-label="${esc(label)}">${ids
      .map((id) => {
        const t = LIST.find((x) => x.id === id), off = why(id), note = off || t?.note || "";
        return `<button type="button" class="${look(id === on)}" ${attrs(id)} aria-pressed="${id === on}"${disabled || off ? " disabled" : ""}${off ? ` title="${esc(off)}"` : ""}>${esc(id)}${note ? `<small> ${esc(note)}</small>` : ""}</button>`;
      })
      .join("")}</div>`;
  }
  return { LIST, KEPT, XFADE, TIMELINE, PICKER, LEGACY, NO_CURVE, CURVES, name, limits, wire, AUTO, buttons };
});

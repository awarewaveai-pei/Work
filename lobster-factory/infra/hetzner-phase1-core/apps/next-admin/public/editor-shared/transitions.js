// The transitions module (card R2 item 11, 「一個小積木」): the one list of transitions and the one way to read a stored
// name. Every caller uses it and keeps no list of its own -- the editor's 轉場 pane and its export (video-workbench
// shared/editor-model.js, backend/transitions.cjs), the intro form, automatic videos, the main system's site settings.
// One file for both apps (like video-styles.js / intro-styles.js): the workbench reads it from the main system's copy
// (awarewave-files.txt; its pages load it as /editor-shared/transitions.js, served by video-workbench server.cjs) and the
// main system imports it. A classic script (global `Transitions`) and a CommonJS module at once.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Transitions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Stored name (what a clip keeps) -> FFmpeg xfade transition. The editor's names; slides stay for old projects only.
  const XFADE = {
    溶解: "fade",
    黑場: "fadeblack",
    向左擦除: "wipeleft",
    向右擦除: "wiperight",
    向左推移: "slideleft",
    向右推移: "slideright",
    圓形展開: "circleopen",
  };
  // The 轉場 pane's buttons in order: [button label, stored name].
  const PICKER = [
    ["融接", "溶解"],
    ["淡入淡出", "黑場"],
    ["向左擦除", "向左擦除"],
    ["向右擦除", "向右擦除"],
    ["圓形裁切", "圓形展開"],
  ];
  // Names stored before P2 (read as their new name on load and at export).
  const LEGACY = { 融接: "溶解", 淡入淡出: "黑場", 圓形裁切: "圓形展開" };
  // Slides keep working on old projects but have no curved form in the export.
  const NO_CURVE = ["向左推移", "向右推移"];
  // Card ED.7.3: a curve is one formula of the linear progress T (0 -> 1); the export writes it into FFmpeg's xfade
  // expression and the preview evaluates the same text.
  const CURVES = { 線性: "T", 平滑: "T*T*(3-2*T)", 加速: "T*T" };
  // null = unknown name (the export refuses it); "無" = no transition.
  function name(v) {
    if (v === undefined || v === null || v === "" || v === "無") return "無";
    if (Object.hasOwn(XFADE, v)) return v;
    return Object.hasOwn(LEGACY, v) ? LEGACY[v] : null;
  }
  // Integer frames: 2 frames .. 2 s.
  const limits = (tb) => ({ min: 2, max: Math.floor((2 * tb.num) / tb.den) });
  return { XFADE, PICKER, LEGACY, NO_CURVE, CURVES, name, limits };
});

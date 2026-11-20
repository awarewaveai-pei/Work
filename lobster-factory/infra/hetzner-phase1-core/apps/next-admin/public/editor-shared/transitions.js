// The transitions module (card R2 item 11, 「一個小積木」; card R4 filled it): the one list of transitions, the one way to
// read a stored name, what each one becomes on output, and the one picker. Every caller uses it and keeps no list of
// its own -- the editor's 轉場 pane and its export (video-workbench shared/editor-model.js, backend/transitions.cjs), the
// intro form, the episode's 片頭／片尾 (shared/episode-spine.js, shared/bookends.js), automatic videos, the main system's
// site settings. tests/r2-transitions-one-list.cjs fails on a transition name written anywhere else.
// One file for both apps (like video-styles.js / intro-styles.js): the workbench reads it from the main system's copy
// (awarewave-files.txt; its pages load it as /awarewave/editor-shared/transitions.js, served by video-workbench server.cjs
// from its own copy) and the main system imports it. A classic script (global `Transitions`) and a CommonJS module.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Transitions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // (a) Every transition FFmpeg's xfade filter has built in (card R4: `ffmpeg -h filter=xfade`, 58 without "custom", the
  // same on the workbench's ffmpeg-static 6.1.1 and video-service's 7.1), one entry each: id = what a clip stores (the
  // six named before card R4 keep their Chinese ids so saved projects read unchanged; every other id is the FFmpeg
  // name), label = the button's words, group = its button row, curved = the export has a curved form for it
  // (backend/transitions.cjs CURVED_TRANSITIONS), timeline = its Timeline v1 kind (timeline-export.cjs; none = a loss).
  // Only the ones in VERIFIED below are offered. xfade = FFmpeg's name: the editor's export makes it and video-service
  // joins 片頭／片尾 and automatic videos with it (server.py checks FFmpeg's own list).
  const GROUPS = ["淡化", "擦除", "推移", "形狀", "特效"];
  const t = (id, xfade, label, group, extra = {}) => ({ id, xfade, label, group, note: "", curved: false, timeline: null, ...extra });
  const CATALOG = [
    t("溶解", "fade", "溶解", "淡化", { note: "＝交叉淡化", curved: true, timeline: "fade" }),
    t("黑場", "fadeblack", "黑場", "淡化", { note: "＝淡黑", curved: true, timeline: "fade" }),
    t("fadewhite", "fadewhite", "白場", "淡化"),
    t("fadegrays", "fadegrays", "灰階淡化", "淡化"),
    t("fadefast", "fadefast", "快速溶解", "淡化"),
    t("fadeslow", "fadeslow", "慢速溶解", "淡化"),
    t("dissolve", "dissolve", "顆粒溶解", "淡化"),
    t("distance", "distance", "色差溶解", "淡化"),
    t("向左擦除", "wipeleft", "向左擦除", "擦除", { curved: true, timeline: "slide_left" }),
    t("向右擦除", "wiperight", "向右擦除", "擦除", { curved: true, timeline: "slide_right" }),
    t("wipeup", "wipeup", "向上擦除", "擦除"),
    t("wipedown", "wipedown", "向下擦除", "擦除"),
    t("wipetl", "wipetl", "往左上擦除", "擦除"),
    t("wipetr", "wipetr", "往右上擦除", "擦除"),
    t("wipebl", "wipebl", "往左下擦除", "擦除"),
    t("wipebr", "wipebr", "往右下擦除", "擦除"),
    t("smoothleft", "smoothleft", "柔邊向左擦除", "擦除"),
    t("smoothright", "smoothright", "柔邊向右擦除", "擦除"),
    t("smoothup", "smoothup", "柔邊向上擦除", "擦除"),
    t("smoothdown", "smoothdown", "柔邊向下擦除", "擦除"),
    t("diagtl", "diagtl", "斜角擦除（左上）", "擦除"),
    t("diagtr", "diagtr", "斜角擦除（右上）", "擦除"),
    t("diagbl", "diagbl", "斜角擦除（左下）", "擦除"),
    t("diagbr", "diagbr", "斜角擦除（右下）", "擦除"),
    t("向左推移", "slideleft", "向左推移", "推移", { timeline: "slide_left" }),
    t("向右推移", "slideright", "向右推移", "推移", { timeline: "slide_right" }),
    t("slideup", "slideup", "向上推移", "推移"),
    t("slidedown", "slidedown", "向下推移", "推移"),
    t("coverleft", "coverleft", "向左覆蓋", "推移"),
    t("coverright", "coverright", "向右覆蓋", "推移"),
    t("coverup", "coverup", "向上覆蓋", "推移"),
    t("coverdown", "coverdown", "向下覆蓋", "推移"),
    t("revealleft", "revealleft", "向左揭開", "推移"),
    t("revealright", "revealright", "向右揭開", "推移"),
    t("revealup", "revealup", "向上揭開", "推移"),
    t("revealdown", "revealdown", "向下揭開", "推移"),
    t("squeezeh", "squeezeh", "橫向擠壓", "推移"),
    t("squeezev", "squeezev", "縱向擠壓", "推移"),
    t("圓形展開", "circleopen", "圓形展開", "形狀", { curved: true }),
    t("circleclose", "circleclose", "圓形收合", "形狀"),
    t("circlecrop", "circlecrop", "圓形遮罩", "形狀"),
    t("rectcrop", "rectcrop", "方形遮罩", "形狀"),
    t("vertopen", "vertopen", "開門（上下）", "形狀"),
    t("vertclose", "vertclose", "關門（上下）", "形狀"),
    t("horzopen", "horzopen", "開門（左右）", "形狀"),
    t("horzclose", "horzclose", "關門（左右）", "形狀"),
    t("radial", "radial", "時鐘掃描", "形狀"),
    t("hlslice", "hlslice", "向左百葉", "形狀"),
    t("hrslice", "hrslice", "向右百葉", "形狀"),
    t("vuslice", "vuslice", "向上百葉", "形狀"),
    t("vdslice", "vdslice", "向下百葉", "形狀"),
    t("pixelize", "pixelize", "像素化", "特效"),
    t("hblur", "hblur", "橫向模糊", "特效"),
    t("zoomin", "zoomin", "放大進入", "特效"),
    t("hlwind", "hlwind", "向左風吹", "特效"),
    t("hrwind", "hrwind", "向右風吹", "特效"),
    t("vuwind", "vuwind", "向上風吹", "特效"),
    t("vdwind", "vdwind", "向下風吹", "特效"),
  ];
  // The entries whose table test passed (an export renders with the right length, its preview within PREVIEW_MS) on
  // the ffmpeg production exports with: the workbench image's ffmpeg-static (release b6.1.1, whose Linux binary is
  // VERIFIED_ON; the image's /usr/bin/ffmpeg 5.1 is only its ffprobe and makes no video). Written by
  // video-workbench tests/r4-transitions-table.cjs --print run in the image, pasted here; the image's gate fails when
  // an offered kind does not pass there. A kind that fails is not offered anywhere (operator 2026-11-20: 做不到的不放).
  // @verified-begin
  const VERIFIED = [
    "溶解",
    "黑場",
    "fadewhite",
    "fadegrays",
    "fadefast",
    "fadeslow",
    "dissolve",
    "distance",
    "向左擦除",
    "向右擦除",
    "wipeup",
    "wipedown",
    "wipetl",
    "wipetr",
    "wipebl",
    "wipebr",
    "smoothleft",
    "smoothright",
    "smoothup",
    "smoothdown",
    "diagtl",
    "diagtr",
    "diagbl",
    "diagbr",
    "向左推移",
    "向右推移",
    "slideup",
    "slidedown",
    "coverleft",
    "coverright",
    "coverup",
    "coverdown",
    "revealleft",
    "revealright",
    "revealup",
    "revealdown",
    "squeezeh",
    "squeezev",
    "圓形展開",
    "circleclose",
    "circlecrop",
    "rectcrop",
    "vertopen",
    "vertclose",
    "horzopen",
    "horzclose",
    "radial",
    "hlslice",
    "hrslice",
    "vuslice",
    "vdslice",
    "pixelize",
    "hblur",
    "zoomin",
    "hlwind",
    "hrwind",
    "vuwind",
    "vdwind",
  ];
  // @verified-end
  const VERIFIED_ON = "7.0.2";
  // Offered kinds another ffmpeg build cannot always make, by "platform:version": the laptop's Windows ffmpeg-static
  // (same release, 6.1.1) crashes on squeezev at some lengths (0.3 s; 0.5 s and up work -- critic 2026-11-20); it passes
  // on VERIFIED_ON. There its preview says so plainly. The image's gate runs on Linux, where no exception applies.
  const NOT_ON = { "win32:6.1.1": ["squeezev"] };
  // Card R4 item 3: a preview of one transition (rendered by the export's own ffmpeg) may take this long on the laptop.
  const PREVIEW_MS = 2000;
  const NONE = { id: "無", xfade: null, label: "無", group: null, note: "直接切", curved: false, timeline: null };
  const LIST = [NONE, ...CATALOG.filter((x) => VERIFIED.includes(x.id))];
  // Stored name -> FFmpeg xfade transition (every catalogue name: a saved project still exports what it has).
  const XFADE = Object.fromEntries(CATALOG.map((x) => [x.id, x.xfade]));
  const TIMELINE = Object.fromEntries(CATALOG.filter((x) => x.timeline).map((x) => [x.id, x.timeline]));
  // The 轉場 pane's buttons in order: [button label, stored name] (無 = its 移除轉場 button).
  const PICKER = LIST.filter((x) => x.xfade).map((x) => [x.label, x.id]);
  // (d) Old names: the editor's pre-P2 names and the 片頭／片尾 names stored before card R2 (video-service's old names).
  const LEGACY = { 融接: "溶解", 淡入淡出: "黑場", 圓形裁切: "圓形展開", crossfade: "溶解", "fade-black": "黑場", none: "無" };
  // An FFmpeg name read back as its transition (a wire value: fade -> 溶解).
  const BY_XFADE = Object.fromEntries(CATALOG.map((x) => [x.xfade, x.id]));
  // Transitions the export has no curved form for (card R4 item 4: the curve buttons are off for them, with the reason).
  const NO_CURVE = CATALOG.filter((x) => !x.curved).map((x) => x.id);
  const NO_CURVE_WHY = "這種轉場是 FFmpeg 內建的固定動態，沒有曲線可調";
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
  // A transition that may be newly set (the offered list); a saved one outside it still reads and exports (name, XFADE).
  const offered = (v) => LIST.some((x) => x.id === name(v));
  const label = (v) => (name(v) === "無" ? NONE.label : CATALOG.find((x) => x.id === name(v))?.label ?? null);
  // Integer frames: 2 frames .. 2 s.
  const limits = (tb) => ({ min: 2, max: Math.floor((2 * tb.num) / tb.den) });
  // (b) What video-service gets for a 片頭／片尾 / automatic-video transition: "none" or the FFmpeg name; null = unknown.
  function wire(v) {
    const n = name(v);
    return n === null ? null : n === "無" ? "none" : XFADE[n];
  }
  // An automatic video's transition when its site chose none (card R2 item 11).
  const AUTO = { id: "溶解", seconds: 0.5 };
  // (c) The picker: the transitions in their button rows (no dropdown, no search), the current one pressed; knows
  // nothing of the page it is on. ids = which to show (default every offered one); why(id) = a reason a button cannot be
  // pressed (shown under it); esc = the page's HTML escaper; attrs(id) = the page's own attributes for its click
  // handling (default data-transition="<id>"); look(on) = the page's button classes.
  function buttons({ label: aria, value, ids = LIST.map((x) => x.id), esc, disabled = false, why = () => "",
    attrs = (id) => `data-transition="${esc(id)}"`, look = (on) => "btn small" + (on ? " selected" : "") }) {
    const on = name(value);
    const button = (id) => {
      const x = id === "無" ? NONE : CATALOG.find((c) => c.id === id), off = why(id), note = off || x?.note || "";
      return `<button type="button" class="${look(id === on)}" ${attrs(id)} aria-pressed="${id === on}"${disabled || off ? " disabled" : ""}${off ? ` title="${esc(off)}"` : ""}>${esc(x?.label ?? id)}${note ? `<small> ${esc(note)}</small>` : ""}</button>`;
    };
    const rows = [[null, ids.filter((id) => !CATALOG.some((c) => c.id === id))],
      ...GROUPS.map((g) => [g, ids.filter((id) => CATALOG.find((c) => c.id === id)?.group === g)])].filter(([, row]) => row.length);
    return `<div role="group" aria-label="${esc(aria)}">${rows
      .map(([g, row]) => `${g ? `<p class="note">${esc(g)}</p>` : ""}<div class="flow-choices row"${g ? ` role="group" aria-label="${esc(g)}"` : ""}>${row.map(button).join("")}</div>`)
      .join("")}</div>`;
  }
  return { GROUPS, CATALOG, VERIFIED, VERIFIED_ON, NOT_ON, PREVIEW_MS, LIST, XFADE, TIMELINE, PICKER, LEGACY, NO_CURVE, NO_CURVE_WHY, CURVES, name, offered, label, limits, wire, AUTO, buttons };
});

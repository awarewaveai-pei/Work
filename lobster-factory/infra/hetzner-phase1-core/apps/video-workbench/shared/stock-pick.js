// Card B25: a stock clip is checked for a frozen stretch BEFORE it is put on a shot (U11.5 level 3: a still Pexels clip
// came back as 「畫面凍結」 at review and the person had to swap and render again). Pure and shared: the backend
// (backend/stock-freeze.cjs) measures, the page (scripts/projects-0.js stockShot) decides what to ask for next.
// The measure is the review's own: ../video-service/server.py _signal_probe runs freezedetect=n=-60dB:d=0.5 and
// counts every freeze span; quality.py raises picture.freeze for freezeEvents > 0. tests/b25-stock-freeze.cjs
// fails when the filter below drifts from server.py.
(function (root) {
  const FREEZE_FILTER = "freezedetect=n=-60dB:d=0.5";
  // Time bound: one check = download (5-40 MB) + one decode of the clip; three candidates at most, then a picture.
  const MAX_CANDIDATES = 3;

  // [start, end] seconds of every frozen span in an ffmpeg log; a freeze still open at the end runs to the last frame.
  function freezeSpans(log, duration) {
    const spans = [];
    let start = null;
    for (const [, kind, value] of String(log || "").matchAll(/freeze_(start|end):\s*([0-9.]+)/g)) {
      if (kind === "start") start = Number(value);
      else if (start !== null) { spans.push([start, Number(value)]); start = null; }
    }
    if (start !== null && Number.isFinite(duration) && duration > start) spans.push([start, duration]);
    return spans;
  }
  // The record kept on the asset (origin.freeze). checked:false = the check could not run (never counts as frozen).
  function freezeRecord({ log, duration, ms, now }) {
    const spans = freezeSpans(log, duration).map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
    return { v: 1, checked: true, frozen: spans.length > 0, count: spans.length, spans, durationS: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null, filter: FREEZE_FILTER, ms: Math.round(ms), checkedAt: new Date(now ?? Date.now()).toISOString() };
  }
  const unchecked = (reason, ms, now) => ({ v: 1, checked: false, frozen: false, count: 0, spans: [], reason: String(reason).slice(0, 120), filter: FREEZE_FILTER, ms: Math.round(ms || 0), checkedAt: new Date(now ?? Date.now()).toISOString() });
  // An asset with no record (imported before B25) or an unchecked one is never claimed frozen.
  const isFrozen = (record) => !!record && record.checked === true && record.frozen === true;

  // What stockShot asks for next. tried = the clip URLs already found frozen (they are excluded from the next search).
  // Every video request ends: a clip that passes, or MAX_CANDIDATES frozen ones -> a picture.
  function nextAction({ kind, tried = [] }) {
    if (kind !== "video") return { do: "photo" };
    if (tried.length >= MAX_CANDIDATES) return { do: "photo" };
    return { do: "video", exclude: [...tried] };
  }
  // Said in the dialog when something was swapped without the person asking. importedKind = what landed on the shot: the
  // search itself answers a picture once no (other) clip is left (next-admin video-pipeline.ts pexels-video fallback),
  // so a picture after a video request is said whichever way it came.
  function resultNote({ kind, tried = [], importedKind }) {
    const n = tried.length;
    if (kind === "video" && importedKind !== "video") return n > 0 ? `已略過 ${n} 支有靜止片段的影片，找不到其他可用的影片，改放圖片` : "找不到影片，改放圖片";
    return n > 0 ? `已略過 ${n} 支有靜止片段的影片` : "";
  }

  const api = { FREEZE_FILTER, MAX_CANDIDATES, freezeSpans, freezeRecord, unchecked, isFrozen, nextAction, resultNote };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StockPick = api;
})(typeof self === "undefined" ? globalThis : self);

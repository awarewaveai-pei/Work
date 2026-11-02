// Card P2: SRT / VTT export through the main system's caption contract (toSrt / toVtt, imported, never copied).
// That contract refuses overlapping segments, so overlaps are merged first: the timeline is split at every cue
// boundary and each piece carries the texts of every cue covering it, joined with "\n" in time order.
const path = require("node:path"),
  { pathToFileURL } = require("node:url");
const contractFile = path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/content/video/caption-formats.ts");
let contract = null;
const loadContract = () => (contract ||= import(pathToFileURL(contractFile).href));
const bad = (message) => Object.assign(Error(message), { status: 400 });
const MAX_CUES = 2000,
  MAX_MS = 24 * 3600 * 1000;
function checkCues(cues) {
  if (!Array.isArray(cues) || !cues.length || cues.length > MAX_CUES) throw bad(`字幕需有 1 到 ${MAX_CUES} 段`);
  return cues.map((cue, i) => {
    const n = i + 1;
    if (!cue || !Number.isSafeInteger(cue.startMs) || !Number.isSafeInteger(cue.endMs) || cue.startMs < 0 || cue.endMs > MAX_MS || cue.endMs <= cue.startMs)
      throw bad(`第 ${n} 段字幕時間無效`);
    if (typeof cue.text !== "string" || !cue.text.trim() || cue.text.length > 4000) throw bad(`第 ${n} 段字幕文字無效`);
    return { startMs: cue.startMs, endMs: cue.endMs, text: cue.text.replace(/\r\n?/g, "\n").trim(), order: i };
  });
}
// Pure: [{startMs, endMs, text}] (any order, may overlap) -> non-overlapping, time-ordered segments.
function mergeOverlaps(input) {
  const cues = [...input].sort((a, b) => a.startMs - b.startMs || (a.order ?? 0) - (b.order ?? 0)),
    edges = [...new Set(cues.flatMap((c) => [c.startMs, c.endMs]))].sort((a, b) => a - b),
    out = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i],
      to = edges[i + 1],
      text = cues.filter((c) => c.startMs < to && c.endMs > from).map((c) => c.text).join("\n");
    if (!text) continue;
    const last = out.at(-1);
    if (last && last.endMs === from && last.text === text) last.endMs = to;
    else out.push({ startMs: from, endMs: to, text });
  }
  return out;
}
async function exportSubtitles(input) {
  if (!input || !["srt", "vtt"].includes(input.format)) throw bad("字幕格式只支援 srt 或 vtt");
  const segments = mergeOverlaps(checkCues(input.cues)),
    { toSrt, toVtt } = await loadContract(),
    rows = segments.map((s, i) => ({ id: String(i + 1), ...s }));
  return { format: input.format, content: (input.format === "srt" ? toSrt : toVtt)(rows), cues: segments, merged: input.cues.length !== segments.length || segments.some((s, i) => s.text !== input.cues[i]?.text) };
}
module.exports = { exportSubtitles, mergeOverlaps };

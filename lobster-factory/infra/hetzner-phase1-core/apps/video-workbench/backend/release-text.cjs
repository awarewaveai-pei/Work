// The words a finished render shows, for the main system's release checks (title + script -> editorial QA, on-screen
// text timeline -> caption QA). Taken only from the job's own record; a render with no words (AI video, template,
// Blender) returns null and nothing is invented for it. Pure: no files, no network.
const Timebase = require("../shared/timebase.js");

const MAX_TITLE = 200, MAX_SCRIPT = 100000, MAX_CUE_TEXT = 4000;

// Cut the visible pieces at every start/end; each interval's text = every piece showing in it (given order),
// equal neighbours merged. The result never overlaps, so it satisfies the caption order rule by construction.
function timeline(pieces) {
  const marks = [...new Set(pieces.flatMap((p) => [p.startMs, p.endMs]))].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const startMs = marks[i], endMs = marks[i + 1];
    const text = pieces.filter((p) => p.startMs <= startMs && p.endMs >= endMs).map((p) => p.text).join("\n").slice(0, MAX_CUE_TEXT);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.endMs === startMs && last.text === text) last.endMs = endMs;
    else out.push({ startMs, endMs, text });
  }
  return out;
}

function fromEditor(settings) {
  const project = require("./editor-export.cjs").validateProject(settings.project, settings.quality),
    index = new Map(project.tracks.map((t, i) => [t.id, i])),
    hidden = new Map(project.tracks.map((t) => [t.id, t.hidden])),
    ms = (frames) => Math.round(Timebase.toSeconds(frames, project.timebase) * 1000);
  const pieces = project.clips
    // Only text the render shows: hidden pieces/tracks and fully transparent text (opacity 0) never reach the picture.
    .filter((c) => c.kind === "text" && !c.hidden && !hidden.get(c.track) && c.opacity > 0 && c.text.trim())
    .sort((a, b) => index.get(a.track) - index.get(b.track) || a.startFrame - b.startFrame)
    .map((c) => ({ startMs: ms(c.startFrame), endMs: ms(c.startFrame + c.durationFrames), text: c.text.trim() }));
  return { title: String(settings.project.title ?? ""), pieces };
}

function fromCues(job) {
  const cues = job.input.settings.cues;
  const pieces = cues.map((c) => ({ startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000), text: String(c.text).trim() })).filter((p) => p.text);
  return { title: String(job.input.references?.src?.name ?? ""), pieces };
}

function releaseText(job) {
  const op = job?.input?.operation;
  if (op !== "editor-export" && op !== "subtitle-burn") return null;
  const { title, pieces } = op === "editor-export" ? fromEditor(job.input.settings || {}) : fromCues(job);
  const script = [...new Set([...pieces].sort((a, b) => a.startMs - b.startMs).map((p) => p.text))].join("\n").slice(0, MAX_SCRIPT);
  return { title: title.trim().slice(0, MAX_TITLE), script, captions: timeline(pieces) };
}

module.exports = { releaseText };

// The transitions module's output side (card R2 item 11, card R4): how a stored transition becomes an FFmpeg
// instruction, and the transition preview. The list itself is next-admin public/editor-shared/transitions.js (read
// through shared/editor-model.js); nothing here names a transition by its stored name.
// Card R4 item 3: the export (backend/editor-export.cjs) and the preview both build their xfade step with xfadeSteps,
// on the same ffmpeg (backend/media.cjs ffmpeg-static), so a preview cannot show one thing and the export another.
const path = require("node:path"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  EditorModel = require("../shared/editor-model.js"),
  Transitions = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "public/editor-shared/transitions.js"));

// Card ED.7 轉場曲線 (formula in EditorModel.TRANSITION_CURVES, shared with the preview): xfade progress P runs 1 -> 0,
// so T = 1 - P is the linear 0 -> 1 progress the formula reads.
// Each effect is xfade's own, re-stated with the curved progress S (a hard-edged circle). The catalogue marks these
// as curved (transitions.js curved); every other built-in has no curved form (its curve buttons are off).
const CURVED_TRANSITIONS = {
  fade: (s) => `A*(1-${s})+B*${s}`,
  fadeblack: (s) => {
    const k = "if(between(PLANE,1,2),128,16)";
    return `if(lt(${s},0.5),A*(1-2*${s})+${k}*2*${s},${k}*(2-2*${s})+B*(2*${s}-1))`;
  },
  wipeleft: (s) => `if(lt(X,W*${s}),B,A)`,
  wiperight: (s) => `if(gt(X,W*(1-${s})),B,A)`,
  circleopen: (s) => `if(lte(hypot(X-W/2,Y-H/2),hypot(W/2,H/2)*${s}),B,A)`,
};
const curvedTransition = (type, curve) => CURVED_TRANSITIONS[type](`(${EditorModel.TRANSITION_CURVES[curve]})`).replaceAll("T", "(1-P)");

/** One xfade step as FFmpeg graph statements: a and b = the input labels, out = the output label, timing =
 *  "duration=..:offset=..", tag = unique per step. Linear = xfade's own transition; a curve re-states it. */
function xfadeSteps({ type, curve = "線性", timing, a, b, out, tag }) {
  if (curve === "線性") return [`${a}${b}xfade=transition=${type}:${timing}${out}`];
  if (!Object.hasOwn(CURVED_TRANSITIONS, type)) throw Error("此轉場效果不支援曲線，請把曲線改回「線性」");
  return [`${a}format=yuv420p[xa${tag}]`, `${b}format=yuv420p[xb${tag}]`,
    `[xa${tag}][xb${tag}]xfade=transition=custom:${timing}:expr='${curvedTransition(type, curve)}'${out}`];
}

// A 片頭／片尾 transition as video-service joins it (backend/quick-render.cjs; the main system's automatic videos use the
// same Transitions.wire): any stored name, old ones included -> "none" or the FFmpeg xfade name. Unknown = refused.
function bookendTransition(v) {
  const wire = Transitions.wire(v);
  if (wire === null) throw Object.assign(Error("轉場設定無效"), { status: 400 });
  return wire;
}

// ---- Card R4 item 3: the transition preview ----
// A short low-resolution video of one transition: SIDE seconds of the outgoing picture, the transition, SIDE seconds of
// the incoming one. Sources: the two clips around a cut ({ file, at, image }) or, for the picker, two fixed test
// patterns. Kept in `dir` named by the hash of everything that decides its pixels, so the same request is made once.
const PREVIEW = { short: 180, fps: 24, side: 0.6, keep: 300, parallel: 2 };
// The renderer and this file decide a preview's pixels: a new ffmpeg or a changed step is a new key (never an old file).
const VERSION = (() => {
  const binary = require("ffmpeg-static"), st = (() => { try { return fs.statSync(binary); } catch { return { size: 0, mtimeMs: 0 }; } })();
  return crypto.createHash("sha1").update(fs.readFileSync(__filename)).update(String(st.size) + ":" + st.mtimeMs).digest("hex").slice(0, 12);
})();
const RATIOS = ["16:9", "9:16", "4:5", "1:1", "4:3"];
const inFlight = new Map();
let running = 0;
const waiting = [];
async function slot(work) {
  while (running >= PREVIEW.parallel) await new Promise((r) => waiting.push(r));
  running++;
  try { return await work(); } finally { running--; waiting.shift()?.(); }
}
// Previews are the only 40-hex names in the folder (every other file there is a uuid): the oldest go past `keep`.
function prune(dir) {
  const mine = fs.readdirSync(dir).filter((f) => /^[0-9a-f]{40}\.mp4$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }));
  if (mine.length <= PREVIEW.keep) return;
  for (const x of mine.sort((a, b) => a.t - b.t).slice(0, mine.length - PREVIEW.keep)) fs.rmSync(path.join(dir, x.f), { force: true });
}
function previewSize(ratio) {
  const [w, h] = String(ratio || "16:9").split(":").map(Number), even = (n) => Math.round(n / 2) * 2;
  if (!(w > 0 && h > 0)) return [320, 180];
  return w >= h ? [even((PREVIEW.short * w) / h), PREVIEW.short] : [PREVIEW.short, even((PREVIEW.short * h) / w)];
}
const sourceArgs = (s, length, pattern, w, h) =>
  !s ? ["-f", "lavfi", "-i", `${pattern}=size=${w}x${h}:rate=${PREVIEW.fps}:duration=${length}`]
    : s.image ? ["-loop", "1", "-t", String(length), "-i", s.file]
      : ["-ss", Math.max(0, Number(s.at) || 0).toFixed(3), "-t", String(length), "-i", s.file];

/** { transition, curve, seconds, ratio, a?, b? } -> { file, name, cached }. a / b = { file, at, image, key } (key = what
 *  identifies the source in the cache, e.g. its url). Throws on an unknown transition, a curve it has no form for. */
async function preview({ transition, curve = "線性", seconds = 0.5, ratio = "16:9", a = null, b = null }, { run, dir, signal }) {
  const name = Transitions.name(transition);
  if (name === null || name === "無") throw Object.assign(Error("轉場不存在"), { status: 400 });
  if (!Object.hasOwn(EditorModel.TRANSITION_CURVES, curve)) throw Object.assign(Error("轉場曲線不存在"), { status: 400 });
  if (curve !== "線性" && !Transitions.CATALOG.find((x) => x.id === name)?.curved) throw Object.assign(Error(Transitions.NO_CURVE_WHY), { status: 400 });
  // bounded inputs: the length to a tenth of a second, a source time to a tenth, the ratio one the editor has
  const type = Transitions.XFADE[name], t = Math.round(Math.max(0.1, Math.min(2, Number(seconds) || 0.5)) * 10) / 10;
  const at = (s) => s && { ...s, at: Math.round(Math.max(0, Number(s.at) || 0) * 10) / 10 };
  a = at(a);
  b = at(b);
  const [w, h] = previewSize(RATIOS.includes(ratio) ? ratio : "16:9"), length = Number((PREVIEW.side + t).toFixed(3));
  const key = crypto.createHash("sha1").update(JSON.stringify([VERSION, type, curve, t, w, h, a && [a.key, a.at, !!a.image], b && [b.key, b.at, !!b.image]])).digest("hex");
  const file = path.join(dir, key + ".mp4");
  if (fs.existsSync(file)) return { file, name: key + ".mp4", cached: true };
  if (inFlight.has(file)) return inFlight.get(file);
  const made = slot(() => render({ type, curve, t, w, h, length, a, b, file, dir, signal, run })).then(() => ({ file, name: key + ".mp4", cached: false }));
  inFlight.set(file, made);
  try { return await made; } finally { inFlight.delete(file); }
}
async function render({ type, curve, t, w, h, length, a, b, file, dir, signal, run }) {
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${PREVIEW.fps},setsar=1,format=yuv420p,trim=duration=${length},setpts=PTS-STARTPTS`;
  const graph = [`[0:v]${fit}[pa]`, `[1:v]${fit}[pb]`,
    ...xfadeSteps({ type, curve, timing: `duration=${t}:offset=${PREVIEW.side}`, a: "[pa]", b: "[pb]", out: "[pv]", tag: "p" })];
  const tmp = path.join(dir, crypto.randomUUID() + ".part.mp4");
  try {
    await run(["-y", "-hide_banner", ...sourceArgs(a, length, "testsrc2", w, h), ...sourceArgs(b, length, "smptehdbars", w, h),
      "-filter_complex", graph.join(";"), "-map", "[pv]", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp], signal);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  prune(dir);
}

module.exports = { Transitions, CURVED_TRANSITIONS, curvedTransition, xfadeSteps, bookendTransition, preview, previewSize, PREVIEW };

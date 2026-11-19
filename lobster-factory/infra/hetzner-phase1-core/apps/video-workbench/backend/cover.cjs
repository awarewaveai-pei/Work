// Card VD.1 (docs/video-deliverable-pack-spec-20261114.md §2): free cover candidates for a finished video. Frames are
// sampled once a second from 1 s to min(duration, 120 s); black (YAVG < 24) and white (YAVG > 235) frames are dropped
// and the rest ranked by contrast (YHIGH - YLOW), at least 2 s apart. None left (a dark or very short video) = the
// middle frame. The title is drawn by the cover template (card R1: remotion-service src/compositions/Cover.tsx, the 片頭
// look, in the ratio's safe area); when that service is not set up, fails or runs out of time, by the subtitle burner's
// own ASS (pinned 思源黑體, missing glyphs refused) and the caller records why. Never by an AI model. Each JPEG is the
// video's own size and <= 2 MB (YouTube's mobile thumbnail limit).
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { buildAss, filterPath } = require("./subtitle-burn.cjs");

const MAX_BYTES = 2 * 1024 * 1024,
  SAMPLE_UNTIL = 120,
  MIN_GAP = 2,
  DARK = 24,
  BRIGHT = 235;

// lavfi metadata=print output: "frame:N pts:P pts_time:T" lines followed by "lavfi.signalstats.KEY=V" lines.
function parseStats(text) {
  const frames = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) frames.push((cur = { t: Number(t[1]) }));
    const kv = /lavfi\.signalstats\.(YAVG|YLOW|YHIGH)=([\d.]+)/.exec(line);
    if (kv && cur) cur[kv[1]] = Number(kv[2]);
  }
  return frames.filter((f) => Number.isFinite(f.YAVG));
}

// Pure: the times (seconds in the video) of up to `count` frames worth showing, BEST FIRST (index 0 = the default cover,
// next-admin lib/content/video/cover.ts candidate 0); [] = none passed.
function pickTimes(frames, count, offset = 0) {
  const ranked = frames
    .filter((f) => f.YAVG >= DARK && f.YAVG <= BRIGHT)
    .map((f) => ({ t: f.t + offset, score: (f.YHIGH ?? f.YAVG) - (f.YLOW ?? f.YAVG) }))
    .sort((a, b) => b.score - a.score || a.t - b.t);
  const out = [];
  for (const f of ranked) {
    if (out.length >= count) break;
    if (out.every((t) => Math.abs(t - f.t) >= MIN_GAP)) out.push(f.t);
  }
  return out;
}

// ASS font size is per-mille of the height (subtitle-burn.cjs buildAss): 8 % of the short side, clamped to its range.
const titleSize = (width, height) => Math.max(20, Math.min(100, Math.round((1000 * Math.min(width, height) * 0.08) / height)));

/**
 * autoCovers({ file, duration, width, height, title, dir, signal, templateMs }, { run, fontDir, template, onFallback }) -> [{ file, t, by }]
 * run = backend/media.cjs run (ffmpeg); fontDir = editor-export.cjs fontDir (throws when the pinned fonts are missing).
 * template({ frame, title, width, height, signal }) -> JPEG bytes (backend/remotion.cjs coverStill); absent = ASS title.
 * templateMs = how long the template may take over ALL candidates (the rest of the budget is the ASS fallback's); its
 * first failure is onFallback(error) and the remaining candidates go straight to the ASS title. by = "template" | "ass".
 * Files are written into `dir`; the caller stores them (media-store ingest) and removes them.
 */
async function autoCovers({ file, duration, width, height, title = "", dir, signal, count = 3, templateMs = 0 }, { run, fontDir, template, onFallback }) {
  if (!(width > 0 && height > 0)) throw Error("封面需要影片尺寸");
  const id = crypto.randomUUID(),
    stats = path.join(dir, `cover-${id}-stats.txt`),
    assFile = path.join(dir, `cover-${id}.ass`);
  const made = [];
  let writing = null; // the JPEG ffmpeg is writing now: removed too when a run fails or is stopped mid-way
  try {
    let times = [];
    const span = Math.min(Number(duration) || 0, SAMPLE_UNTIL) - 1;
    if (span > 0) {
      await run(["-y", "-hide_banner", "-ss", "1", "-t", String(span), "-i", file, "-an",
        "-vf", `fps=1,scale=160:-2,signalstats,metadata=print:file='${filterPath(stats)}'`, "-f", "null", "-"], signal);
      times = pickTimes(parseStats(fs.existsSync(stats) ? fs.readFileSync(stats, "utf8") : ""), count, 1);
    }
    if (!times.length) times = [Math.max(0, (Number(duration) || 0) / 2)];
    const until = Date.now() + templateMs;
    let use = template, reported = false; // dropped after its first failure: one slow or broken service costs the budget once, not per frame
    const fellBack = (e) => {
      use = null;
      if (!reported) (reported = true), onFallback?.(e); // the first reason only (later frames would say "未設定")
    };
    for (const t of times) {
      const out = (writing = path.join(dir, `cover-${id}-${made.length}.jpg`));
      const by = await titledJpeg({ input: file, seek: t, width, height, title, out, assFile, signal, until }, { run, fontDir, template: use, onFallback: fellBack });
      if (!by) continue;
      made.push({ file: out, t, by });
      writing = null;
    }
    return made;
  } catch (error) {
    for (const m of made) fs.rmSync(m.file, { force: true });
    if (writing) fs.rmSync(writing, { force: true });
    throw error;
  } finally {
    fs.rmSync(stats, { force: true });
    fs.rmSync(assFile, { force: true });
  }
}

// One cover JPEG from `input` (a video at `seek` seconds, or an image): scaled into width x height (padded, never
// cropped), the title drawn when there is one, stepped down in quality until <= 2 MB. false = it cannot fit (removed).
async function stillJpeg({ input, seek, width, height, title = "", out, assFile, signal }, { run, fontDir }) {
  const text = String(title || "").trim().slice(0, 200);
  if (text && !fs.existsSync(assFile)) fs.writeFileSync(assFile, buildAss({ cues: [{ start: 0, end: 3600, text }], width, height, size: titleSize(width, height), style: "半透明底框", position: "下方" }));
  const vf = [`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`];
  if (text) vf.push(`ass=filename='${filterPath(assFile)}':fontsdir='${filterPath(fontDir())}'`);
  // q 3 is near-lossless; a busy 4K-ish frame can pass 2 MB, so the quality steps down until it fits.
  for (const q of [3, 5, 8, 12, 18, 25, 31]) {
    await run(["-y", "-hide_banner", ...(seek === undefined ? [] : ["-ss", Number(seek).toFixed(3)]), "-i", input, "-frames:v", "1", "-an", "-vf", vf.join(","), "-q:v", String(q), out], signal);
    if (fs.statSync(out).size <= MAX_BYTES) return true;
  }
  fs.rmSync(out, { force: true });
  return false;
}

// Card R1: one titled cover JPEG. The cover template draws the title when there is one; with no `template` (service not
// set up) or when it throws, stillJpeg's ASS title does and onFallback(error) says why. A stop of `signal` is never a
// fallback, it throws. The template step (frame + render + rescale) may run until `until` (ms epoch).
// -> "template" | "ass" | false (cannot fit 2 MB).
async function titledJpeg({ input, seek, width, height, title = "", out, assFile, signal, until }, { run, fontDir, template, onFallback }) {
  const text = String(title || "").trim().slice(0, 200);
  if (text && !template) onFallback?.(Error("封面模板服務未設定"));
  if (text && template) {
    try {
      if (await templateJpeg({ input, seek, width, height, title: text, out, signal, until, template }, { run })) return "template";
      throw Error("封面模板產生的圖超過 2 MB");
    } catch (error) {
      if (signal?.aborted) throw error;
      onFallback?.(/^(TimeoutError|AbortError)$/.test(error?.name) ? Error("封面模板在時限內沒有完成") : error);
    }
  }
  return (await stillJpeg({ input, seek, width, height, title: text, out, assFile, signal }, { run, fontDir })) ? "ass" : false;
}

// The frame at `seek` without a title (the video's size, <= 2 MB) -> template -> scaled back to the video's size, <= 2 MB.
// The whole step shares one window ending at `until`, so a slow frame extraction cannot eat the ASS fallback's time.
async function templateJpeg({ input, seek, width, height, title, out, signal, until, template }, { run }) {
  const left = Number(until) - Date.now();
  if (!(left > 0)) throw Error("封面模板的時間已用完");
  const frame = out + ".frame.jpg", drawn = out + ".template.jpg",
    window = signal ? AbortSignal.any([signal, AbortSignal.timeout(left)]) : AbortSignal.timeout(left);
  try {
    if (!(await stillJpeg({ input, seek, width, height, title: "", out: frame, signal: window }, { run }))) throw Error("封面畫格超過 2 MB");
    const bytes = await template({ frame: fs.readFileSync(frame), title, width, height, signal: window });
    fs.writeFileSync(drawn, bytes);
    return await stillJpeg({ input: drawn, width, height, title: "", out, signal: window }, { run });
  } finally {
    fs.rmSync(frame, { force: true });
    fs.rmSync(drawn, { force: true });
  }
}

// Card VD.4: the AI cover's input -- the frame at `seek` WITHOUT a title (the model must not see or redraw text), as a PNG
// of at most 1280 px on the long side (the models bill or cap by megapixels; ~0.9 MP for 16:9).
async function framePng({ file, seek, width, height, out, signal }, { run }) {
  const long = 1280, w = width >= height ? long : Math.round((long * width) / height / 2) * 2, h = width >= height ? Math.round((long * height) / width / 2) * 2 : long;
  await run(["-y", "-hide_banner", "-ss", Number(seek || 0).toFixed(3), "-i", file, "-frames:v", "1", "-an", "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`, out], signal);
  return { width: w, height: h };
}

// Time the covers may take (ms), 0 = none: at most COVER_MS, ending COVER_SLACK_MS before the job's deadline (the
// browser stops watching a job then, shared/runtime.js); under COVER_MIN_MS left = not worth starting. No deadline = COVER_MS.
const COVER_MS = 120000, COVER_SLACK_MS = 5000, COVER_MIN_MS = 3000;
function coverBudget(deadlineAt, now) {
  const left = deadlineAt ? Date.parse(deadlineAt) - now - COVER_SLACK_MS : COVER_MS,
    budget = Math.min(COVER_MS, left);
  return budget >= COVER_MIN_MS ? budget : 0;
}

module.exports = { autoCovers, titledJpeg, stillJpeg, framePng, pickTimes, parseStats, titleSize, coverBudget, MAX_BYTES };

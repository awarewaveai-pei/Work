// Card ED.10: speech recognition with word times and a confidence score, for one file (/transcriptions words:true) and
// for a whole editor project (the audible V1 + A1 clips mixed into one audio file, then mapped back to timeline time).
// Provider = OpenAI whisper-1 (the only transcription model next-admin's cost model prices: TRANSCRIBE_RATES).
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const TranscriptWords = require("../shared/transcript-words.js");

const MODEL = "whisper-1";
const LANGUAGES = { 繁體中文: "zh", 簡體中文: "zh", English: "en", 日本語: "ja", 한국어: "ko", ภาษาไทย: "th" };
// OpenAI's upload limit is 25 MB; a little under it so the multipart overhead never tips a chunk over.
const UPLOAD_BYTES = 24 * 1024 * 1024;
const GAP = 1; // seconds of silence between two separate stretches of sound in the mixed file
const MERGE = 0.3; // clips closer than this on the timeline are one stretch (a cut between two clips is not a pause)

const round = (n) => Math.round(n * 1000) / 1000;
const bad = (message) => Object.assign(Error(message), { status: 400 });

function languageCode(language) {
  if (!language || language === "自動偵測") return null;
  if (!Object.hasOwn(LANGUAGES, language)) throw bad("語音辨識語言無效");
  return LANGUAGES[language];
}
// whisper-1 gives no per-word probability; the segment's average log-probability is the signal. Score 0.8 (the spec's
// 需校對 line) = avg_logprob -1.0, whisper's own logprob_threshold for a failed decode. A segment whisper itself would
// flag as repetition (compression_ratio > 2.4) or as probably no speech (no_speech_prob > 0.6) never scores above 0.5.
function scoreOf(segment) {
  const logprob = Number(segment?.avg_logprob);
  if (!Number.isFinite(logprob)) return null;
  let score = Math.min(1, Math.max(0, 1 + logprob / 5));
  if (Number(segment.compression_ratio) > 2.4 || Number(segment.no_speech_prob) > 0.6) score = Math.min(score, 0.5);
  return Math.round(score * 100) / 100;
}
// whisper verbose_json -> { language, duration, segments: [{ start, end, text, score, needsReview, words }], words }.
// map(t, anchor) turns a time in the sent file into the time the caller wants (timeline seconds); null = drop it. anchor
// = the middle of the word or segment, so both ends of one word land in the same stretch of sound.
function normalize(verbose, map = (t) => t) {
  const segments = [], words = [];
  for (const s of Array.isArray(verbose?.segments) ? verbose.segments : []) {
    const mid = (Number(s.start) + Number(s.end)) / 2,
      start = map(Number(s.start), mid), end = map(Number(s.end), mid), text = String(s.text ?? "").trim();
    if (!text || start == null || end == null || !(end > start)) continue;
    const score = scoreOf(s);
    segments.push({ start: round(start), end: round(end), text, score, needsReview: score === null || score < TranscriptWords.REVIEW_THRESHOLD, words: [], fileStart: Number(s.start), fileEnd: Number(s.end) });
  }
  for (const w of Array.isArray(verbose?.words) ? verbose.words : []) {
    const fileStart = Number(w.start), fileEnd = Number(w.end), text = String(w.word ?? "").trim();
    const mid = (fileStart + fileEnd) / 2, start = map(fileStart, mid), end = map(fileEnd, mid);
    if (!text || start == null || end == null || !(end >= start)) continue;
    // A word belongs to the segment its middle falls in (file time; the nearest one when it falls between segments).
    const owner = segments.find((s) => mid >= s.fileStart && mid <= s.fileEnd) ||
        segments.reduce((best, s) => (!best || Math.min(Math.abs(mid - s.fileStart), Math.abs(mid - s.fileEnd)) < Math.min(Math.abs(mid - best.fileStart), Math.abs(mid - best.fileEnd)) ? s : best), null);
    const word = { start: round(start), end: round(end), text, ...(owner ? { score: owner.score } : {}) };
    words.push(word);
    owner?.words.push(word);
  }
  for (const s of segments) {
    delete s.fileStart;
    delete s.fileEnd;
  }
  return { language: typeof verbose?.language === "string" ? verbose.language : null, segments, words };
}
function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
const toSrt = (segments) => segments.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join("\n");

// One whisper-1 call. words=false keeps the old answer (SRT text); words=true asks for verbose_json with word and
// segment timestamps and returns the parsed JSON.
async function whisper({ buffer, filename, mime, language, words, key, fetchImpl, signal }) {
  if (buffer.length > 25 * 1024 * 1024) throw bad("語音辨識的檔案上限為25MB，請先裁短片段");
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime || "audio/mpeg" }), filename);
  form.append("model", MODEL);
  form.append("response_format", words ? "verbose_json" : "srt");
  if (words) {
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
  }
  const code = languageCode(language);
  if (code) form.append("language", code);
  const r = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key },
    body: form,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(180000),
  });
  if (!r.ok) throw Error("語音辨識失敗：" + r.status);
  if (!words) return r.text();
  const value = await r.json().catch(() => null);
  if (!value || !Array.isArray(value.segments)) throw Error("語音辨識回覆格式無效");
  return value;
}

// ---- Whole project ---------------------------------------------------------------------------------------------
// settings.segments = the audible clips of V1 (主視訊) and A1 (旁白): { url, sourceStart, duration, start, speed?, track?,
// clipId? }; start/duration in timeline seconds, sourceStart in source seconds; speed as the clip plays (source seconds
// per timeline second). Returns the checked list and the stretches of sound as they sit in the mixed file.
function plan(settings) {
  const list = settings?.segments;
  if (!Array.isArray(list) || !list.length || list.length > 128) throw bad("整片辨識需要 1 到 128 個有聲片段");
  const segments = list.map((s, index) => {
    const n = (v, fallback) => (v === undefined || v === null ? fallback : Number(v));
    const seg = {
      index,
      url: String(s?.url ?? ""),
      sourceStart: n(s?.sourceStart, 0),
      duration: n(s?.duration),
      start: n(s?.start),
      speed: n(s?.speed, 1),
      track: typeof s?.track === "string" ? s.track.slice(0, 20) : null,
      clipId: typeof s?.clipId === "string" ? s.clipId.slice(0, 100) : null,
      // = editor-export gainOf: muted clip / muted or hidden track, or volume 0, is silent in the export.
      silent: s?.muted === true || s?.hidden === true || Number(s?.volume ?? 1) === 0,
    };
    if (!(seg.sourceStart >= 0) || !(seg.duration > 0) || !(seg.start >= 0) || seg.start + seg.duration > 3600 || !(seg.speed >= 0.25 && seg.speed <= 4))
      throw bad("有聲片段的時間或速度無效（第 " + (index + 1) + " 段）");
    return seg;
  });
  if (settings.projectId !== undefined && !(typeof settings.projectId === "string" && /^[\w:.-]{1,100}$/.test(settings.projectId)))
    throw bad("剪輯專案識別碼無效");
  languageCode(settings.language);
  return segments;
}
// Stretches of sound on the timeline (overlapping or nearly touching clips merged), each placed in the mixed file after
// the previous one plus GAP seconds of silence. offset = where the stretch starts in the file.
function layout(segments) {
  const groups = [];
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const last = groups.at(-1);
    if (last && s.start <= last.end + MERGE) {
      last.end = Math.max(last.end, s.start + s.duration);
      last.members.push(s);
    } else groups.push({ start: s.start, end: s.start + s.duration, members: [s] });
  }
  let offset = 0;
  for (const g of groups) {
    g.offset = offset;
    offset += g.end - g.start + GAP;
  }
  return { groups, seconds: round(Math.max(0, offset - GAP)) };
}
// File time -> timeline time, inside the stretch nearest to anchor (default t): linear inside it, clamped to its edges
// (whisper sometimes stretches a word end into the silence between two stretches).
function timelineOf(groups, t, anchor = t) {
  let best = null, distance = Infinity;
  for (const g of groups) {
    const a = g.offset, b = g.offset + (g.end - g.start);
    const d = anchor < a ? a - anchor : anchor > b ? anchor - b : 0;
    if (d < distance) [best, distance] = [g, d];
  }
  if (!best) return null;
  return best.start + Math.min(Math.max(t - best.offset, 0), best.end - best.start);
}
// Chunk boundaries (file seconds) so each chunk encodes under maxBytes: cut in the silence between stretches when one is
// near enough, else at the length limit.
function chunks(groups, seconds, bytes, maxBytes) {
  if (bytes <= maxBytes) return [[0, seconds]];
  const maxLen = Math.max(1, (seconds * maxBytes) / bytes * 0.9),
    gaps = groups.slice(1).map((g) => g.offset - GAP / 2),
    out = [];
  let from = 0;
  while (seconds - from > maxLen) {
    const limit = from + maxLen,
      cut = gaps.filter((t) => t > from + maxLen / 2 && t <= limit).at(-1) ?? limit;
    out.push([round(from), round(cut)]);
    from = cut;
  }
  out.push([round(from), seconds]);
  return out;
}
const tempo = (speed) => require("./editor-export.cjs").tempo(speed);

// Checks every clip against the files this server holds and drops clips whose source has no sound. Free: no provider
// call. The quote and the job use this same function, so the charged seconds are the quoted ones.
async function prepare(settings, { localFile, inspect, signal }) {
  const segments = plan(settings), audible = [], skipped = [];
  const probes = new Map();
  for (const s of segments) {
    const file = localFile(s.url);
    if (!file || !fs.existsSync(file)) throw bad("素材不在工作台：" + s.url.slice(0, 120));
    if (s.silent) {
      skipped.push({ index: s.index, clipId: s.clipId, reason: "已靜音" });
      continue;
    }
    if (!probes.has(file)) probes.set(file, await inspect(file, signal).catch(() => null));
    const info = probes.get(file);
    if (!info?.audio) {
      skipped.push({ index: s.index, clipId: s.clipId, reason: "沒有聲音" });
      continue;
    }
    audible.push({ ...s, file });
  }
  if (!audible.length) throw bad("沒有有聲片段可以辨識");
  return { audible, skipped, ...layout(audible) };
}
function quote(prepared, costs, maxBytes = UPLOAD_BYTES) {
  // Mono 16 kHz MP3 at 32 kbit/s = 4000 bytes per second: the chunk count before the file exists.
  const estimated = prepared.seconds * 4000;
  return {
    seconds: prepared.seconds,
    costUsd: costs.transcribeUsd(MODEL, prepared.seconds),
    chunks: chunks(prepared.groups, prepared.seconds, estimated, maxBytes).length,
    segments: prepared.audible.length,
    skipped: prepared.skipped,
    model: MODEL,
  };
}
// Mixes the stretches into one mono 16 kHz MP3 (each clip delayed to its place in the file), splits it under the upload
// limit, transcribes every chunk and maps every time back to the timeline.
async function transcribeProject(settings, { localFile, inspect, run, tmpDir, key, fetchImpl, signal, costs, maxBytes = UPLOAD_BYTES, onProgress = () => {} }) {
  const prepared = await prepare(settings, { localFile, inspect, signal });
  const { audible, groups, seconds } = prepared;
  const stamp = crypto.randomUUID(), temporary = [];
  const tmp = (name) => {
    const file = path.join(tmpDir, `tmp-transcribe-${stamp}-${name}`);
    temporary.push(file);
    return file;
  };
  try {
    const mixed = tmp("mix.mp3"), inputs = [], graph = [];
    audible.forEach((s, i) => {
      const group = groups.find((g) => g.members.includes(s)),
        at = group.offset + (s.start - group.start);
      inputs.push("-ss", String(s.sourceStart), "-t", String(round(s.duration * s.speed)), "-i", s.file);
      graph.push(`[${i}:a:0]aresample=16000,aformat=channel_layouts=mono,asetpts=PTS-STARTPTS${s.speed !== 1 ? "," + tempo(s.speed) : ""},adelay=${Math.round(at * 1000)}:all=1[a${i}]`);
    });
    graph.push(`${audible.map((_, i) => `[a${i}]`).join("")}amix=inputs=${audible.length}:duration=longest:normalize=0,apad=whole_dur=${seconds},atrim=duration=${seconds}[out]`);
    await run(["-y", "-hide_banner", ...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", mixed], signal);
    const parts = chunks(groups, seconds, fs.statSync(mixed).size, maxBytes);
    const segments = [], words = [];
    let language = null;
    for (const [i, [from, to]] of parts.entries()) {
      let file = mixed;
      if (parts.length > 1) {
        file = tmp(`part-${i}.mp3`);
        await run(["-y", "-hide_banner", "-ss", String(from), "-t", String(round(to - from)), "-i", mixed, "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", file], signal);
      }
      const verbose = await whisper({ buffer: fs.readFileSync(file), filename: `project-${i}.mp3`, mime: "audio/mpeg", language: settings.language, words: true, key, fetchImpl, signal });
      const part = normalize(verbose, (t, mid) => (Number.isFinite(t) && Number.isFinite(mid) ? timelineOf(groups, from + t, from + mid) : null));
      language ||= part.language;
      segments.push(...part.segments);
      words.push(...part.words);
      onProgress(Math.round(((i + 1) / parts.length) * 95));
    }
    // Which clip each word came from (the first one playing at its middle; overlapping clips are mixed): ED.11 measures
    // pauses only inside one recording.
    for (const w of words) {
      const mid = (w.start + w.end) / 2,
        clip = audible.find((s) => mid >= s.start && mid <= s.start + s.duration) ||
          audible.reduce((best, s) => (!best || Math.abs(mid - (s.start + s.duration / 2)) < Math.abs(mid - (best.start + best.duration / 2)) ? s : best), null);
      w.source = clip.index;
      if (clip.track) w.track = clip.track;
      if (clip.clipId) w.clipId = clip.clipId;
    }
    const annotated = TranscriptWords.annotate(words);
    // annotate copies the words: the segment word lists get the same filler / pause / source fields.
    const byKey = new Map(annotated.map((w) => [w.start + "|" + w.end + "|" + w.text, w]));
    for (const s of segments) s.words = s.words.map((w) => byKey.get(w.start + "|" + w.end + "|" + w.text) || w);
    segments.sort((a, b) => a.start - b.start);
    return {
      language,
      seconds,
      chunks: parts.length,
      costUsd: costs.transcribeUsd(MODEL, seconds),
      skipped: prepared.skipped,
      segments,
      words: annotated,
      srt: toSrt(segments),
    };
  } finally {
    for (const file of temporary) fs.rmSync(file, { force: true });
  }
}

module.exports = { MODEL, LANGUAGES, UPLOAD_BYTES, GAP, scoreOf, normalize, toSrt, whisper, plan, layout, timelineOf, chunks, prepare, quote, transcribeProject };

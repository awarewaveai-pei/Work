// Card ED.10: speech recognition with word times and a confidence score, for one file (/transcriptions words:true) and
// for a whole editor project (the audible V1 + A1 clips mixed into one audio file, then mapped back to timeline time).
// Engines = the one list of speech-to-text connectors (like next-admin video-motion-models.ts for video); pages draw them as
// buttons from /capabilities (transcribe.engines). Adding or removing a vendor = one row + its call below. A row whose
// next-admin registry retireOn (cost-model.ts MEDIA_MODELS) has come leaves the list and a job naming it is refused.
// Order and default: backend/providers.cjs (free first) -- our own whisper is free (2026-11-10 A/B, docs/vendor-alternatives-20261110.md). Every connector answers whisper verbose_json shape, so normalize() reads all.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const TranscriptWords = require("../shared/transcript-words.js");
const { vwEnv } = require("./env-compat.cjs");
const providers = require("./providers.cjs");
const { transcribePrice } = require("./provider-cost.cjs");
const elevenlabs = require("./elevenlabs.cjs");
const source = require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const rates = require(path.join(source, "lib/ai/cost-model.ts"));
// The house S->T converter (next-admin, opencc-js cn->t + Taiwan preferences); loaded on the first Chinese answer.
let houseTraditional = null;
const toTraditional = (s) => (houseTraditional ||= require(path.join(source, "lib/ai/to-traditional.ts")).toTraditional)(s);

const LANGUAGES = { 繁體中文: "zh", 簡體中文: "zh", English: "en", 日本語: "ja", 한국어: "ko", ภาษาไทย: "th" };
// OpenAI's upload limit is 25 MB; a little under it so the multipart overhead never tips a chunk over.
const UPLOAD_BYTES = 24 * 1024 * 1024;
// The host worker runs ~0.65x real time on CPU (2026-11-10 A/B, 8 threads): chunks of ~5 min of the 32 kbit/s mix keep one
// request near 8 minutes; HOST_SECONDS_PER_AUDIO_SECOND sizes the job limit.
const HOST_UPLOAD_BYTES = 300 * 4000;
const HOST_SECONDS_PER_AUDIO_SECOND = 2;
// Gemini: word timestamps are limited to 30 minutes of audio per request (aistudio.google.com/docs/transcription): ~25 min.
const GEMINI_UPLOAD_BYTES = 1500 * 4000;
// note = what the page says beside the button (pros and cons, 2026-11-10 A/B with three Traditional-Chinese samples).
const ENGINES = Object.freeze([
  Object.freeze({ id: "host", model: "host-whisper-large-v3", provider: "AwareWave 主機", label: "自家主機 Whisper", uploadBytes: HOST_UPLOAD_BYTES,
    note: "免費、較慢：要等約影片長度的 1.5 倍。聲音不送出主機、繁體輸出、逐字時間；「嗯、呃」多半不會寫進字幕。" }),
  // Free-plan check 2026-11-13: a 5 s clip, 200, 3 credits. Second: on a paid plan its list price is the lowest paid one.
  Object.freeze({ id: "elevenlabs", model: "scribe_v2", provider: "ElevenLabs", label: "ElevenLabs Scribe", uploadBytes: UPLOAD_BYTES,
    note: "快、逐字時間、每字信心分數；聲音送到 ElevenLabs。免費方案每月有額度，用完會失敗、不收費。" }),
  Object.freeze({ id: "gemini", model: "gemini-3.5-transcribe", provider: "Google", label: "Gemini 辨識", uploadBytes: GEMINI_UPLOAD_BYTES,
    note: "快（30 秒的片約 10 秒）、逐字時間。沒有信心分數（每句都標需校對）；聲音送到 Google，尖峰時段可能忙線。" }),
  Object.freeze({ id: "openai", model: "whisper-1", provider: "OpenAI", label: "OpenAI Whisper", uploadBytes: UPLOAD_BYTES,
    note: "快、依分鐘計費、聲音送到 OpenAI。OpenAI 2027-02-26 停止服務。" }),
]);
const day = (at) => new Date(at ?? Date.now()).toISOString().slice(0, 10);
const retireOn = (e) => rates.MEDIA_MODELS[e.model]?.retireOn || null;
const live = (at) => ENGINES.filter((e) => !retireOn(e) || retireOn(e) > day(at));
// Live rows with what providers.cjs decides by (order and default, free first; VW_TRANSCRIBE_ENGINE names the wanted row).
const rows = (env, at) => live(at).map((e) => {
  const price = transcribePrice(e.model);
  return { e, id: e.id, available: available(e, env), free: price?.usd === 0, price };
});
const defaultEngine = (env = process.env, at) => providers.choose(rows(env, at), vwEnv(env, "TRANSCRIBE_ENGINE"))?.e;
// The engine a job runs: its named live row, else the default. A retired or unknown name is refused, never swapped.
function pick(id, env = process.env, at) {
  if (id === undefined || id === null || id === "") return defaultEngine(env, at);
  const e = live(at).find((x) => x.id === id);
  if (!e) throw Object.assign(Error(ENGINES.some((x) => x.id === id) ? "此辨識服務已停止，請改選其他辨識方式" : "語音辨識方式無效"), { status: 400 });
  return e;
}
const available = (engine, env) => { try { auth(engine, env); return true; } catch { return false; } };
// What one call needs, checked before a job is recorded (503 = never sent).
function auth(engine, env = process.env) {
  const missing = (name) => Object.assign(Error("此電腦尚未設定 " + name + "；請先設定服務。"), { status: 503 });
  if (engine.id === "elevenlabs") return { key: elevenlabs.key(env) };
  if (engine.id === "openai" || engine.id === "gemini") {
    const name = engine.id === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
    if (!env[name]) throw missing(name);
    return { key: env[name] };
  }
  const url = String(vwEnv(env, "TRANSCRIBE_WORKER_URL") || "").trim().replace(/\/+$/, ""),
    token = String(vwEnv(env, "TRANSCRIBE_WORKER_TOKEN") || "").trim();
  if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(url)) throw missing("VW_TRANSCRIBE_WORKER_URL");
  if (!token) throw missing("VW_TRANSCRIBE_WORKER_TOKEN");
  return { url, token };
}
// /capabilities: the live rows in providers.cjs order; price = provider-cost.cjs transcribePrice (same rule as the charge).
function capability(env, at) {
  const list = rows(env, at);
  return {
    defaultEngine: providers.choose(list, vwEnv(env, "TRANSCRIBE_ENGINE"))?.id,
    engines: providers.order(list).map(({ e, available, free, price }) => ({ id: e.id, model: e.model, provider: e.provider, label: e.label, note: e.provider === "ElevenLabs" && elevenlabs.creditsNote() ? e.note + " " + elevenlabs.creditsNote() : e.note, retireOn: retireOn(e), available, free, price })),
  };
}
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

// One call to the engine: whisper verbose_json shape { language, segments, words, usage? } from every connector.
// Every answer leaves here under one rule: Chinese is Traditional unless the chosen language is 簡體中文 (traditional()).
async function recognize({ engine = ENGINES[0], buffer, filename, mime, language, auth, fetchImpl, signal }) {
  if (buffer.length > 25 * 1024 * 1024) throw bad("語音辨識的檔案上限為25MB，請先裁短片段");
  // The host worker converts on its own (traditional=1/0 below): its answer passes as is.
  if (engine.id === "host") return host({ buffer, language, auth, fetchImpl, signal });
  if (engine.id === "gemini") return traditional(await gemini({ engine, buffer, mime, language, auth, fetchImpl, signal }), language);
  if (engine.id === "elevenlabs") return traditional(fromScribe(await elevenlabs.transcribe({ apiKey: auth.key, model: engine.model, buffer, filename, mime, language: languageCode(language), fetchImpl, signal }), languageCode(language)), language);
  return traditional(await whisper({ engine, buffer, filename, mime, language, key: auth.key, fetchImpl, signal }), language);
}
// Language names the vendors answer for Chinese (whisper "chinese", Scribe ISO 639-3 "zho"/"cmn"/"yue", BCP-47 "zh-…").
const CHINESE = /^(zh|zho|chi|cmn|yue|chinese|mandarin|cantonese)(\b|[-_])/i;
const KANA_HANGUL = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// Chinese answer -> Traditional, times untouched. opencc cn->t keeps every string's length in code points (all 49,276
// STPhrases and 3,882 STCharacters pairs checked 2026-11-14), so the words are converted as one joined string (phrase
// context as in the sentence) and cut back at their own lengths; a length change would fall back to word by word.
function traditional(verbose, language) {
  if (language === "簡體中文" || !verbose) return verbose;
  const code = languageCode(language);
  if (code && code !== "zh") return verbose;
  const segments = Array.isArray(verbose.segments) ? verbose.segments : [], words = Array.isArray(verbose.words) ? verbose.words : [];
  if (!code) {
    // 自動偵測: the vendor's language when it names one; else Han text without kana or hangul.
    const named = typeof verbose.language === "string" && verbose.language ? verbose.language : null;
    const text = segments.map((s) => String(s?.text ?? "")).join("") + words.map((w) => String(w?.word ?? "")).join("");
    if (named ? !CHINESE.test(named) : !/\p{Script=Han}/u.test(text) || KANA_HANGUL.test(text)) return verbose;
  }
  const texts = words.map((w) => String(w?.word ?? "")), joined = [...toTraditional(texts.join(""))];
  let at = 0;
  const converted = joined.length === [...texts.join("")].length
    ? texts.map((t) => { const n = [...t].length, piece = joined.slice(at, at + n).join(""); at += n; return piece; })
    : texts.map(toTraditional);
  return {
    ...verbose,
    segments: segments.map((s) => (s && typeof s.text === "string" ? { ...s, text: toTraditional(s.text) } : s)),
    words: words.map((w, i) => (w && typeof w.word === "string" ? { ...w, word: converted[i] } : w)),
  };
}
async function host({ buffer, language, auth, fetchImpl, signal }) {
  const query = new URLSearchParams({ language: languageCode(language) || "", traditional: language === "簡體中文" ? "0" : "1" });
  // The worker takes one request at a time (next-admin's caption jobs share it) and one may carry 25 MB: a long wait.
  const r = await fetchImpl(auth.url + "/v1/transcribe?" + query, {
    method: "POST",
    headers: { Authorization: "Bearer " + auth.token, "Content-Type": "application/octet-stream" },
    body: buffer,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3600000)]) : AbortSignal.timeout(3600000),
  });
  if (!r.ok) throw Error("語音辨識失敗：主機 " + r.status);
  const value = await r.json().catch(() => null);
  if (!value || !Array.isArray(value.segments)) throw Error("語音辨識回覆格式無效");
  return value;
}
// Google lists Mandarin only as cmn-Hans-CN (Simplified): 繁體中文 and 自動偵測 send no code.
const GEMINI_LANGUAGES = { en: "en-US", ja: "ja-JP", ko: "ko-KR", th: "th-TH" };
async function gemini({ engine, buffer, mime, language, auth, fetchImpl, signal }) {
  const code = languageCode(language), lang = language === "簡體中文" ? "cmn-Hans-CN" : GEMINI_LANGUAGES[code];
  const body = JSON.stringify({
    model: "models/" + engine.model,
    input: [{ type: "audio", data: buffer.toString("base64"), mime_type: mime || "audio/mpeg" }],
    generation_config: { transcription_config: { mode: { type: "verbatim", timestamp_granularities: ["word"] }, ...(lang ? { language_codes: [lang] } : {}) } },
  });
  // 503 "high demand" / 429 came often on 2026-11-10 and passed within a minute: two more tries, 10 s then 20 s apart.
  let r;
  for (const wait of [0, 10000, 20000]) {
    if (wait) await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, wait);
      signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
    });
    r = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": auth.key, "Content-Type": "application/json" },
      body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(900000)]) : AbortSignal.timeout(900000),
    });
    if (r.status !== 503 && r.status !== 429) break;
  }
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Error("語音辨識失敗：Google " + r.status);
  return fromGemini(value, code);
}
// Gemini answers text + word annotations ("0.100s" offsets, start_index/end_index into the text), no segments and no
// confidence: a segment ends at sentence punctuation, a pause over 1 s, or 15 s; its text is the slice of the answer.
function fromGemini(value, code) {
  const part = (value?.steps || []).flatMap((s) => s?.content || []).find((c) => c?.type === "text");
  if (!part) throw Error("語音辨識回覆格式無效");
  // start_index / end_index are UTF-8 byte offsets (2026-11-10 reply: one CJK character = 3).
  const bytes = Buffer.from(String(part.text || ""), "utf8"), slice = (from, to) => bytes.subarray(from, to).toString("utf8"),
    sec = (v) => Number(String(v ?? "").replace(/s$/, ""));
  const words = (part.annotations || []).filter((a) => a?.type === "word_info")
    .map((a) => ({ word: String(a.text ?? ""), start: sec(a.start_offset), end: sec(a.end_offset), from: a.start_index, to: a.end_index }))
    .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
  const segments = [];
  let current = null;
  for (const w of words) {
    if (current && (w.start - current.end > 1 || w.end - current.start > 15)) current = null;
    if (!current) segments.push((current = { start: w.start, end: w.end, words: [] }));
    current.end = w.end;
    current.words.push(w);
    // Punctuation lives in the text, not in the word annotations: look right after the word.
    if (/[。！？.!?]$/.test(w.word) || (Number.isInteger(w.to) && /^\s*[。！？.!?]/.test(slice(w.to, w.to + 8)))) current = null;
  }
  return {
    language: code,
    usage: value.usage || null,
    segments: segments.map((g) => {
      // The sentence's slice of the text, with the punctuation that closes it.
      const first = g.words[0], last = g.words.at(-1),
        mark = Number.isInteger(last.to) ? /^[。！？.!?，,]/.exec(slice(last.to, last.to + 8))?.[0] || "" : "",
        end = Number.isInteger(last.to) ? last.to + Buffer.byteLength(mark) : 0,
        sliced = Number.isInteger(first.from) && end > first.from ? slice(first.from, end).trim() : "";
      return { start: g.start, end: g.end, text: sliced || g.words.map((w) => w.word).join("") };
    }),
    words: words.map(({ word, start, end }) => ({ word, start, end })),
  };
}
// ElevenLabs Scribe answers tokens (word / spacing / audio_event; punctuation is a "word" of its own) with a logprob each,
// no segments: a segment ends at sentence punctuation, a pause over 1 s, or 15 s (as fromGemini); its text = its tokens
// joined; avg_logprob = the mean of its words' logprob, so scoreOf() reads it like whisper's.
function fromScribe(value, code) {
  const tokens = (Array.isArray(value?.words) ? value.words : []).filter((t) => t && (t.type === "word" || t.type === "spacing") && Number.isFinite(Number(t.start)) && Number.isFinite(Number(t.end)));
  const mark = (t) => /^[\s。！？.!?，,、；;：:]+$/.test(String(t.text));
  const segments = [];
  let current = null;
  for (const t of tokens) {
    const start = Number(t.start), end = Number(t.end), isWord = t.type === "word" && !mark(t);
    if (isWord && current && (start - current.end > 1 || end - current.start > 15)) current = null;
    if (!current) {
      if (!isWord) continue; // spacing or punctuation before any word
      segments.push((current = { start, end, text: "", logprobs: [], words: [] }));
    }
    current.text += String(t.text);
    if (t.type !== "word") continue;
    current.end = Math.max(current.end, end);
    if (Number.isFinite(Number(t.logprob))) current.logprobs.push(Number(t.logprob));
    if (isWord) current.words.push({ word: String(t.text), start, end });
    else if (/[。！？.!?]/.test(String(t.text))) current = null;
  }
  return {
    language: code || (typeof value?.language_code === "string" ? value.language_code : null),
    segments: segments.map((g) => ({ start: g.start, end: g.end, text: g.text.trim(), ...(g.logprobs.length ? { avg_logprob: g.logprobs.reduce((a, b) => a + b, 0) / g.logprobs.length } : {}) })),
    words: segments.flatMap((g) => g.words),
  };
}
// whisper-1 (OpenAI, until 2027-02-26).
async function whisper({ engine, buffer, filename, mime, language, key, fetchImpl, signal }) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime || "audio/mpeg" }), filename);
  form.append("model", engine.model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const code = languageCode(language);
  if (code) form.append("language", code);
  const r = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key },
    body: form,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(180000),
  });
  if (!r.ok) throw Error("語音辨識失敗：" + r.status);
  const value = await r.json().catch(() => null);
  if (!value || !Array.isArray(value.segments)) throw Error("語音辨識回覆格式無效");
  return value;
}
// Usage summed over chunks; one chunk without usage = null (the charge then uses the published estimate).
function addUsage(total, usage) {
  if (total === null || !usage || !Number.isFinite(Number(usage.total_output_tokens))) return null;
  return { total_input_tokens: total.total_input_tokens + (Number(usage.total_input_tokens) || 0), total_output_tokens: total.total_output_tokens + Number(usage.total_output_tokens) };
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
// Seconds of audio a whole-project run sends (0 for an invalid plan; start() rejects it anyway).
function audioSeconds(settings) {
  try { return layout(plan(settings)).seconds; } catch { return 0; }
}
// Job limit of a whole-project run (api.cjs jobTimeoutMs): 30 min, longer when the host worker needs it. The worker takes
// one request at a time, so aheadSeconds = audio of the host runs already queued or running here waits first.
function timeoutMs(settings, engine = ENGINES[0], aheadSeconds = 0) {
  const base = 1800000;
  if (engine.id !== "host") return base;
  return Math.max(base, Math.ceil((audioSeconds(settings) + aheadSeconds) * HOST_SECONDS_PER_AUDIO_SECOND * 1000) + 600000);
}
function quote(prepared, costs, maxBytes = UPLOAD_BYTES, engine = ENGINES[0]) {
  // Mono 16 kHz MP3 at 32 kbit/s = 4000 bytes per second: the chunk count before the file exists.
  const estimated = prepared.seconds * 4000;
  return {
    seconds: prepared.seconds,
    costUsd: costs.transcribeUsd(engine.model, prepared.seconds),
    chunks: chunks(prepared.groups, prepared.seconds, estimated, maxBytes).length,
    segments: prepared.audible.length,
    skipped: prepared.skipped,
    model: engine.model,
  };
}
// Mixes the stretches into one mono 16 kHz MP3 (each clip delayed to its place in the file), splits it under the upload
// limit, transcribes every chunk and maps every time back to the timeline.
async function transcribeProject(settings, { localFile, inspect, run, tmpDir, engine = ENGINES[0], auth, fetchImpl, signal, costs, maxBytes = engine.uploadBytes, onProgress = () => {} }) {
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
    let language = null, usage = { total_input_tokens: 0, total_output_tokens: 0 };
    for (const [i, [from, to]] of parts.entries()) {
      let file = mixed;
      if (parts.length > 1) {
        file = tmp(`part-${i}.mp3`);
        await run(["-y", "-hide_banner", "-ss", String(from), "-t", String(round(to - from)), "-i", mixed, "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", file], signal);
      }
      const verbose = await recognize({ engine, buffer: fs.readFileSync(file), filename: `project-${i}.mp3`, mime: "audio/mpeg", language: settings.language, auth, fetchImpl, signal });
      usage = addUsage(usage, verbose.usage);
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
      costUsd: costs.transcribeUsd(engine.model, seconds, usage),
      skipped: prepared.skipped,
      segments,
      words: annotated,
      srt: toSrt(segments),
    };
  } finally {
    for (const file of temporary) fs.rmSync(file, { force: true });
  }
}

module.exports = { ENGINES, live, pick, defaultEngine, auth, capability, LANGUAGES, UPLOAD_BYTES, HOST_UPLOAD_BYTES, GAP, scoreOf, normalize, toSrt, recognize, traditional, fromGemini, fromScribe, plan, layout, timelineOf, chunks, prepare, audioSeconds, timeoutMs, quote, transcribeProject };

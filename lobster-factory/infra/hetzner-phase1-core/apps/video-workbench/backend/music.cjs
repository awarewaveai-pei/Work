// Music generation: the one list of music models (shaped like backend/speech.cjs). Each row = vendor, key, what it accepts,
// call. Pages draw the rows as buttons from /capabilities (music.models); prices come only from next-admin cost-model.ts
// MUSIC_RATES (provider-cost.cjs musicUsd). A row whose MEDIA_MODELS retireOn has come leaves the list; a row without its
// key is listed available:false and refused (503). No Chinese-origin model is ever listed (docs/tools-reference-audit-20261101.md:17).
const path = require("node:path");
const { vwEnv } = require("./env-compat.cjs");
const { musicPrice } = require("./provider-cost.cjs");
const rates = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));

// Google Lyria through the Interactions API (aistudio.google.com/docs/music-generation, 2026-11-13): { model, input }, MP3 by
// default; the audio is the base64 `data` of an audio content block.
async function lyria({ model, prompt, apiKey, fetchImpl, signal }) {
  const r = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Api-Revision": "2026-05-20", "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt }),
    signal: signal || AbortSignal.timeout(300000),
  });
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(Error("Google " + r.status + ": " + String(value?.error?.message || "").slice(0, 450)), { status: r.status });
  const content = (value?.steps || []).flatMap((s) => s?.content || []);
  const part = content.find((c) => c?.type === "audio" && typeof c.data === "string" && c.data);
  if (!part) throw Object.assign(Error("音樂服務沒有回傳音訊"), { status: 502 });
  const ext = /wav/.test(String(part.mime_type || "")) ? "wav" : "mp3";
  return { audio: Buffer.from(part.data, "base64"), ext };
}
// ElevenLabs Eleven Music (elevenlabs.io/docs/api-reference/music/compose, 2026-11-13): POST /v1/music, xi-api-key, the song
// as MP3 bytes. Lyrics go in the prompt (music best-practices page); force_instrumental only works with prompt.
async function elevenMusic({ model, prompt, instrumental, seconds, apiKey, fetchImpl, signal }) {
  const r = await fetchImpl("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model_id: model, music_length_ms: Math.round(seconds * 1000), force_instrumental: !!instrumental }),
    signal: signal || AbortSignal.timeout(600000),
  });
  if (!r.ok) {
    const value = await r.json().catch(() => null), detail = value?.detail;
    throw Object.assign(Error("ElevenLabs " + r.status + ": " + String(detail?.message || detail?.status || (typeof detail === "string" ? detail : "")).slice(0, 450)), { status: r.status });
  }
  const audio = Buffer.from(await r.arrayBuffer());
  if (!audio.length) throw Object.assign(Error("音樂服務沒有回傳音訊"), { status: 502 });
  return { audio, ext: "mp3" };
}
const keyed = (name) => (env) => String(env[name] || "").trim() || null;

// lyrics = the page shows the lyrics field and the prompt carries them (clip preview: Google documents custom lyrics for
// Lyria 3.5 only, so it gets none). seconds = the lengths a page can ask for; none = the model decides (Lyria 3.5: "a couple
// of minutes"; clip: always 30 s). Eleven's documented cap is 5 min (two pages say 10; the shorter one is kept).
// aliases = names older drafts saved for this row (the form saved the label "Lyria 3.5" before 2026-11-13).
const MODELS = Object.freeze([
  Object.freeze({ id: "lyria-3.5", vendor: "Google", label: "Lyria 3.5", aliases: ["Lyria 3.5"], credentialName: "GEMINI_API_KEY", credential: keyed("GEMINI_API_KEY"), call: lyria,
    lyrics: true, seconds: null, note: "完整歌曲（約兩三分鐘，長度由提示詞決定）；可唱自訂歌詞，也可純器樂。每首固定價。" }),
  Object.freeze({ id: "lyria-3-clip-preview", vendor: "Google", label: "Lyria 3 Clip", aliases: ["Lyria Clip Preview"], credentialName: "GEMINI_API_KEY", credential: keyed("GEMINI_API_KEY"), call: lyria,
    lyrics: false, seconds: null, note: "30 秒短片段，適合試曲風或片頭片尾；不接受自訂歌詞。每段固定價。" }),
  Object.freeze({ id: "music_v2_5", vendor: "ElevenLabs", label: "Eleven Music", aliases: [], credentialName: "ELEVENLABS_API_KEY", credential: keyed("ELEVENLABS_API_KEY"), call: elevenMusic,
    lyrics: true, seconds: Object.freeze([15, 30, 60, 120, 180, 300]), note: "可指定長度（最長 5 分鐘），可唱自訂歌詞；依分鐘計費。" }),
]);

const day = (at) => new Date(at ?? Date.now()).toISOString().slice(0, 10);
const retireOn = (id) => rates.MEDIA_MODELS[id]?.retireOn || null;
const live = (at) => MODELS.filter((m) => !retireOn(m.id) || retireOn(m.id) > day(at));
// Default = VW_MUSIC_MODEL when live and configured, else the first configured row, else the first row.
function defaultModel(env, at) {
  const list = live(at), wanted = vwEnv(env, "MUSIC_MODEL");
  return list.find((m) => m.id === wanted && m.credential(env)) || list.find((m) => m.credential(env)) || list[0];
}
// The row a job runs: its id or an alias; none = the default. A retired or unknown name is refused, never swapped.
function pick(id, env = process.env, at) {
  if (id === undefined || id === null || id === "") return defaultModel(env, at);
  const m = live(at).find((x) => x.id === id || x.aliases.includes(id));
  if (!m) throw Object.assign(Error(MODELS.some((x) => x.id === id) ? "此音樂模型已停止，請改選其他模型" : "音樂模型無效"), { status: 400 });
  return m;
}
function key(model, env) {
  const credential = model.credential(env);
  if (!credential) throw Object.assign(Error("此電腦尚未設定 " + model.credentialName + "；請先設定服務。"), { status: 503 });
  return credential;
}
// The job's checked request: { model, prompt (lyrics folded in when the row takes them), instrumental, seconds }.
function request(input, env = process.env, at) {
  const model = pick(input?.musicModel, env, at), s = input?.settings || {};
  const style = String(input?.prompt || "").trim(), instrumental = s.instrumental === true, lyrics = model.lyrics && !instrumental ? String(s.lyrics || "").trim() : "";
  if (!style && !lyrics) throw Object.assign(Error("請先輸入音樂提示詞"), { status: 400 });
  if (style.length > 4000 || lyrics.length > 10000) throw Object.assign(Error("提示詞最多 4000 字、歌詞最多 10000 字"), { status: 400 });
  let seconds = null;
  if (model.seconds) {
    seconds = Number(s.seconds ?? model.seconds[1]);
    if (!model.seconds.includes(seconds)) throw Object.assign(Error("音樂長度無效"), { status: 400 });
  }
  const prompt = [style, instrumental ? "Instrumental only, no vocals." : "", lyrics ? "Lyrics:\n" + lyrics : ""].filter(Boolean).join("\n\n");
  return { model, prompt, instrumental, seconds };
}
// /capabilities: the live rows, cheapest published price first (operator 2026-11-13; a price change reorders by itself;
// unpriced last); price = provider-cost.cjs musicPrice (same function as the charge).
function capability(env, at) {
  const usd = (m) => musicPrice(m.id)?.usd ?? Number.MAX_VALUE;
  return {
    defaultModel: defaultModel(env, at)?.id,
    models: [...live(at)].sort((a, b) => usd(a) - usd(b)).map((m) => ({ id: m.id, vendor: m.vendor, label: m.label, note: m.note, aliases: m.aliases, retireOn: retireOn(m.id), available: !!m.credential(env), lyrics: m.lyrics, seconds: m.seconds, price: musicPrice(m.id) })),
  };
}
async function generate({ model, prompt, instrumental, seconds }, { env, fetchImpl, signal }) {
  return model.call({ model: model.id, prompt, instrumental, seconds, apiKey: key(model, env), fetchImpl, signal });
}

module.exports = { MODELS, live, pick, defaultModel, key, request, capability, generate };

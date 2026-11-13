// Text to speech: the one list of speech models (like next-admin video-motion-models.ts for video). Each row is one
// connector -- vendor, key, voices, call; adding or removing a vendor = one row. Pages draw the rows as buttons from
// /capabilities (speech.models). A row whose next-admin registry retireOn (cost-model.ts MEDIA_MODELS) has come leaves
// the list and a job naming it is refused. A row without its credential is listed available:false and refused (503).
// Order and default (VW_TTS_MODEL names the wanted row): backend/providers.cjs, free first -- Edge when configured.
const path = require("node:path");
const { vwEnv } = require("./env-compat.cjs");
const providers = require("./providers.cjs");
const { speechPrice } = require("./provider-cost.cjs");
const elevenlabs = require("./elevenlabs.cjs");
const rates = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));

// aistudio.google.com/docs/speech-generation, 2026-11-10: the 30 prebuilt voices and Google's one-word description.
const GEMINI_VOICES = Object.freeze([
  ["Kore", "堅定"], ["Charon", "資訊感"], ["Sulafat", "溫暖"], ["Puck", "輕快"], ["Leda", "年輕"], ["Aoede", "輕盈"],
  ["Zephyr", "明亮"], ["Fenrir", "興奮"], ["Orus", "堅定"], ["Callirrhoe", "隨和"], ["Autonoe", "明亮"], ["Enceladus", "氣音"],
  ["Iapetus", "清晰"], ["Umbriel", "隨和"], ["Algieba", "圓潤"], ["Despina", "圓潤"], ["Erinome", "清晰"], ["Algenib", "沙啞"],
  ["Rasalgethi", "資訊感"], ["Laomedeia", "輕快"], ["Achernar", "柔和"], ["Alnilam", "堅定"], ["Schedar", "平穩"], ["Gacrux", "成熟"],
  ["Pulcherrima", "直率"], ["Achird", "友善"], ["Zubenelgenubi", "隨性"], ["Vindemiatrix", "溫柔"], ["Sadachbia", "活潑"], ["Sadaltager", "知性"],
].map(([id, tone]) => Object.freeze({ id, label: id + " · " + tone })));
const OPENAI_VOICES = Object.freeze(["coral", "alloy", "echo", "fable", "onyx", "nova", "shimmer"].map((id) => Object.freeze({ id, label: id })));
// The four Edge voices the old app offered (next-admin VideoStudio.tsx VOICE_MODELS); 台灣腔 = zh-TW.
const EDGE_VOICES = Object.freeze([
  ["zh-TW-HsiaoChenNeural", "繁中女聲（曉臻）"], ["zh-TW-YunJheNeural", "繁中男聲（雲哲）"], ["en-US-JennyNeural", "English F（Jenny）"], ["en-US-GuyNeural", "English M（Guy）"],
].map(([id, label]) => Object.freeze({ id, label })));
// ElevenLabs premade voices (GET /v1/voices on the free plan, 2026-11-13): four women, four men, one neutral.
const ELEVEN_VOICES = Object.freeze([
  ["EXAVITQu4vr4xnSDxMaL", "Sarah · 沉穩女聲"], ["Xb7hH8MSUJpSbSDYk0k2", "Alice · 清晰女聲"], ["cgSgspJ2msm6clMCkdW9", "Jessica · 明亮女聲"], ["pFZP5JQG7iQjIQuC4Bku", "Lily · 柔和女聲"],
  ["JBFqnCBsd6RMkjVDRZzb", "George · 溫暖男聲"], ["onwK4e9ZLuTAKqWW03F9", "Daniel · 播報男聲"], ["nPczCjzI2devNBz1zQrb", "Brian · 低沉男聲"], ["iP95p4xoKVk53GoZ742B", "Chris · 親切男聲"],
  ["SAz9YHcvj6GT2YYXdXww", "River · 中性"],
].map(([id, label]) => Object.freeze({ id, label })));
// A voice saved under another model (old drafts, projects, retries, an Edge job falling back) speaks as its nearest counterpart.
const OPENAI_TO_GEMINI = Object.freeze({ coral: "Sulafat", alloy: "Zephyr", echo: "Puck", fable: "Iapetus", onyx: "Charon", nova: "Leda", shimmer: "Aoede" });
const TO_GEMINI = Object.freeze({ ...OPENAI_TO_GEMINI, "zh-TW-HsiaoChenNeural": "Sulafat", "zh-TW-YunJheNeural": "Charon", "en-US-JennyNeural": "Aoede", "en-US-GuyNeural": "Puck" });
// To Edge: male voices to 雲哲, everything else to the default 曉臻.
const TO_EDGE = Object.freeze(Object.fromEntries(["Charon", "Puck", "Fenrir", "Orus", "Iapetus", "Algenib", "Alnilam", "Gacrux", "onyx", "echo"].map((v) => [v, "zh-TW-YunJheNeural"])));
// To ElevenLabs: the male voices above (and Edge's two men) to George, everything else to the default Sarah.
const TO_ELEVEN = Object.freeze(Object.fromEntries([...Object.keys(TO_EDGE), "zh-TW-YunJheNeural", "en-US-GuyNeural"].map((v) => [v, "JBFqnCBsd6RMkjVDRZzb"])));
// Gemini -> OpenAI: the inverse above plus the voices the generator's persona cards send (scripts/index-0.js spokenVoiceIds),
// each to the OpenAI voice that persona used before 2026-11-10.
const TO_OPENAI = Object.freeze({ ...Object.fromEntries(Object.entries(OPENAI_TO_GEMINI).map(([openai, gemini]) => [gemini, openai])), Kore: "coral", Puck: "nova", Fenrir: "alloy", Sulafat: "shimmer", Leda: "coral" });
const DEFAULT_STYLE = "請以自然的繁體中文語氣朗讀。";

// Gemini (Interactions API): { audio: WAV 24 kHz mono 16-bit, usage } -- usage = Google's token counts, which the charge reads.
async function gemini({ model, text, voice, style, apiKey, fetchImpl, signal }) {
  const r = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] },
    }),
    signal: signal || AbortSignal.timeout(180000),
  });
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(Error("Google " + r.status + ": " + String(value?.error?.message || "").slice(0, 450)), { status: r.status });
  const part = (value?.steps || []).flatMap((s) => s?.content || []).find((c) => typeof c?.data === "string" && c.data);
  if (!part) throw Object.assign(Error("配音服務沒有回傳音訊"), { status: 502 });
  return { audio: Buffer.from(part.data, "base64"), ext: "wav", usage: value.usage || null };
}
// OpenAI /audio/speech: MP3 bytes, no usage (priced from characters + audio length).
async function openai({ model, text, voice, style, apiKey, fetchImpl, signal }) {
  const r = await fetchImpl("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text, voice, instructions: style, response_format: "mp3" }),
    signal: signal || AbortSignal.timeout(180000),
  });
  if (!r.ok) {
    const value = await r.json().catch(() => null);
    throw Object.assign(Error("OpenAI " + r.status + ": " + String(value?.error?.message || "").slice(0, 450)), { status: r.status });
  }
  return { audio: Buffer.from(await r.arrayBuffer()), ext: "mp3", usage: null };
}

// Edge TTS through our video-service (apps/video-service server.py POST /tts, the same Edge path its renders use): MP3, free.
async function edge({ text, voice, credential, fetchImpl, signal }) {
  const r = await fetchImpl(credential.url + "/tts", {
    method: "POST",
    headers: { "X-Render-Token": credential.token, "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
  });
  // Only the service failing (5xx) may fall back to a paid row; a refused request (4xx, e.g. text over 2000) does not.
  if (!r.ok) throw Object.assign(Error("Edge 配音失敗：" + r.status), { status: r.status >= 500 ? 502 : 400, fallback: r.status >= 500 });
  const audio = Buffer.from(await r.arrayBuffer());
  if (!audio.length) throw Object.assign(Error("Edge 配音沒有回傳音訊"), { status: 502, fallback: true });
  return { audio, ext: "mp3", usage: null };
}
// ElevenLabs (backend/elevenlabs.cjs speak): MP3; no style control (the row's note says so).
async function eleven({ model, text, voice, apiKey, fetchImpl, signal }) {
  return { audio: await elevenlabs.speak({ apiKey, model, voice, text, fetchImpl: fetchImpl || fetch, signal }), ext: "mp3", usage: null };
}
const keyed = (name) => (env) => env[name] || null;
function edgeService(env) {
  const url = String(vwEnv(env, "TTS_SERVICE_URL") || "").trim().replace(/\/+$/, ""), token = String(vwEnv(env, "TTS_SERVICE_TOKEN") || "").trim();
  return /^https?:\/\/[\w.-]+(:\d+)?$/.test(url) && token ? { url, token } : null;
}

// note = what the page says beside the button (pros and cons; tests in docs/vendor-alternatives-20261110.md).
// fallback = the row a failed call is retried on once (Edge is an unofficial interface Microsoft may block at any time);
// the job is then labelled and charged as that row.
const MODELS = Object.freeze([
  Object.freeze({ id: "edge-tts", vendor: "Microsoft Edge", label: "Edge 免費語音", credentialName: "VW_TTS_SERVICE_URL / VW_TTS_SERVICE_TOKEN", credential: edgeService, voices: EDGE_VOICES, toVoice: TO_EDGE, call: edge,
    fallback: "gemini-3.8-flash-lite-tts",
    note: "免費、台灣腔繁中；女聲中英夾雜念得清楚，男聲的英文較弱；語氣描述不生效。非官方介面，微軟可能隨時擋：擋了自動改用 Gemini，照 Gemini 收費。" }),
  Object.freeze({ id: "gemini-3.8-flash-lite-tts", vendor: "Google", label: "Gemini 語音", credentialName: "GEMINI_API_KEY", credential: keyed("GEMINI_API_KEY"), voices: GEMINI_VOICES, toVoice: TO_GEMINI, call: gemini,
    note: "30 種聲線、繁中自然、語氣用一句話描述；長數字可能逐位念。2027 起價格加倍。" }),
  Object.freeze({ id: "gpt-4o-mini-tts", vendor: "OpenAI", label: "OpenAI 語音", credentialName: "OPENAI_API_KEY", credential: keyed("OPENAI_API_KEY"), voices: OPENAI_VOICES, toVoice: TO_OPENAI, call: openai,
    note: "英文最自然、7 種聲線；繁中腔調偏大陸。OpenAI 2027-01-06 停止服務。" }),
  Object.freeze({ id: "eleven_multilingual_v2", vendor: "ElevenLabs", label: "ElevenLabs 語音", credentialName: "ELEVENLABS_API_KEY", credential: elevenlabs.keyOf, voices: ELEVEN_VOICES, toVoice: TO_ELEVEN, call: eleven,
    // Last: on a paid plan its per-character price is above Gemini's; on the free plan providers.cjs puts it right after Edge.
    note: "9 種聲線、中英文都能念；語氣描述不生效；聲音送到 ElevenLabs。免費方案每月有額度，用完會失敗、不收費。" }),
]);

const day = (at) => new Date(at ?? Date.now()).toISOString().slice(0, 10);
const retireOn = (id) => rates.MEDIA_MODELS[id]?.retireOn || null;
const live = (at) => MODELS.filter((m) => !retireOn(m.id) || retireOn(m.id) > day(at));
// Live rows with what providers.cjs decides by: can it run here, is it free (its button price is 0).
const rows = (env, at) => live(at).map((m) => {
  const price = speechPrice(m.id);
  return { m, id: m.id, available: !!m.credential(env), free: price?.usd === 0, price };
});
const defaultModel = (env, at) => providers.choose(rows(env, at), vwEnv(env, "TTS_MODEL"))?.m;
// The model a job runs: its named live row, else the default. A retired or unknown name is refused, never swapped.
function pick(id, env = process.env, at) {
  if (id === undefined || id === null || id === "") return defaultModel(env, at);
  const m = live(at).find((x) => x.id === id);
  if (!m) throw Object.assign(Error(MODELS.some((x) => x.id === id) ? "此配音服務已停止，請改選其他配音" : "配音服務無效"), { status: 400 });
  return m;
}
function voiceFor(model, id) {
  return (model.voices.find((v) => v.id === id) || model.voices.find((v) => v.id === model.toVoice[id]) || model.voices[0]).id;
}
function key(model, env) {
  const credential = model.credential(env);
  if (!credential) throw Object.assign(Error("此電腦尚未設定 " + model.credentialName + "；請先設定服務。"), { status: 503 });
  return credential;
}
// An ElevenLabs row's note ends with the free credits left this month (backend/elevenlabs.cjs, cached plan).
const withCredits = (m) => (m.vendor === "ElevenLabs" && elevenlabs.creditsNote() ? m.note + " " + elevenlabs.creditsNote() : m.note);
// /capabilities: the live rows in providers.cjs order; price = provider-cost.cjs speechPrice (same rule as the charge).
function capability(env, at) {
  const list = rows(env, at);
  return {
    defaultModel: providers.choose(list, vwEnv(env, "TTS_MODEL"))?.id,
    models: providers.order(list).map(({ m, available, free, price }) => ({ id: m.id, vendor: m.vendor, label: m.label, note: withCredits(m), retireOn: retireOn(m.id), available, free, voices: m.voices, defaultVoice: m.voices[0].id, price })),
  };
}
// Answers { audio, ext, usage, model: the row that spoke, fallbackFrom? }. A call that failed because the service did (the
// connector marks error.fallback, or the network threw) is tried once on the row's fallback when it is live and configured,
// never for a refused request or a cancelled job; the caller labels and charges `model`.
async function synthesize(model, { text, voice, style, env, fetchImpl, signal, at }) {
  const once = (m) => { const credential = key(m, env); return m.call({ model: m.id, text, voice: voiceFor(m, voice), style: style || DEFAULT_STYLE, apiKey: credential, credential, fetchImpl, signal }); };
  try {
    return { ...(await once(model)), model };
  } catch (error) {
    const serviceFailed = error?.fallback === true || error?.status === undefined;
    const backup = model.fallback && serviceFailed && !signal?.aborted && live(at).find((m) => m.id === model.fallback && m.credential(env));
    if (!backup) throw error;
    return { ...(await once(backup)), model: backup, fallbackFrom: model.id };
  }
}

module.exports = { MODELS, GEMINI_VOICES, OPENAI_VOICES, EDGE_VOICES, ELEVEN_VOICES, DEFAULT_STYLE, live, pick, defaultModel, voiceFor, key, capability, synthesize };

// Text to speech: the one list of speech models (like next-admin video-motion-models.ts for video). Each row is one
// connector -- vendor, key, voices, call; adding or removing a vendor = one row. Pages draw the rows as buttons from
// /capabilities (speech.models). A row whose next-admin registry retireOn (cost-model.ts MEDIA_MODELS) has come leaves
// the list and a job naming it is refused. A row without its key is listed available:false and refused (503). Default =
// VW_TTS_MODEL when it names a live row with its key, else the first live row with its key (no GEMINI_API_KEY = OpenAI).
const path = require("node:path");
const { vwEnv } = require("./env-compat.cjs");
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
// A voice saved under another model (old drafts, projects, retries) speaks as its nearest counterpart.
const TO_GEMINI = Object.freeze({ coral: "Sulafat", alloy: "Zephyr", echo: "Puck", fable: "Iapetus", onyx: "Charon", nova: "Leda", shimmer: "Aoede" });
// Gemini -> OpenAI: the inverse above plus the voices the generator's persona cards send (scripts/index-0.js spokenVoiceIds),
// each to the OpenAI voice that persona used before 2026-11-10.
const TO_OPENAI = Object.freeze({ ...Object.fromEntries(Object.entries(TO_GEMINI).map(([openai, gemini]) => [gemini, openai])), Kore: "coral", Puck: "nova", Fenrir: "alloy", Sulafat: "shimmer", Leda: "coral" });
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

// note = what the page says beside the button (pros and cons; 2026-11-10 test, docs/vendor-alternatives-20261110.md).
const MODELS = Object.freeze([
  Object.freeze({ id: "gemini-3.8-flash-lite-tts", vendor: "Google", label: "Gemini 語音", keyName: "GEMINI_API_KEY", voices: GEMINI_VOICES, toVoice: TO_GEMINI, call: gemini,
    note: "30 種聲線、繁中自然、語氣用一句話描述；長數字可能逐位念。2027 起價格加倍。" }),
  Object.freeze({ id: "gpt-4o-mini-tts", vendor: "OpenAI", label: "OpenAI 語音", keyName: "OPENAI_API_KEY", voices: OPENAI_VOICES, toVoice: TO_OPENAI, call: openai,
    note: "英文最自然、7 種聲線；繁中腔調偏大陸。OpenAI 2027-01-06 停止服務。" }),
]);

const day = (at) => new Date(at ?? Date.now()).toISOString().slice(0, 10);
const retireOn = (id) => rates.MEDIA_MODELS[id]?.retireOn || null;
const live = (at) => MODELS.filter((m) => !retireOn(m.id) || retireOn(m.id) > day(at));
function defaultModel(env, at) {
  const list = live(at), wanted = vwEnv(env, "TTS_MODEL");
  return list.find((m) => m.id === wanted && env[m.keyName]) || list.find((m) => env[m.keyName]) || list[0];
}
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
  if (!env[model.keyName]) throw Object.assign(Error("此電腦尚未設定 " + model.keyName + "；請先設定服務。"), { status: 503 });
  return env[model.keyName];
}
// /capabilities: the live rows as the page needs them; price = provider-cost.cjs speechPrice (same rule as the charge).
function capability(env, priceOf, at) {
  return {
    defaultModel: defaultModel(env, at).id,
    models: live(at).map((m) => ({ id: m.id, vendor: m.vendor, label: m.label, note: m.note, retireOn: retireOn(m.id), available: !!env[m.keyName], voices: m.voices, defaultVoice: m.voices[0].id, price: priceOf(m.id) })),
  };
}
async function synthesize(model, { text, voice, style, env, fetchImpl, signal }) {
  return model.call({ model: model.id, text, voice: voiceFor(model, voice), style: style || DEFAULT_STYLE, apiKey: key(model, env), fetchImpl, signal });
}

module.exports = { MODELS, GEMINI_VOICES, OPENAI_VOICES, DEFAULT_STYLE, live, pick, defaultModel, voiceFor, key, capability, synthesize };

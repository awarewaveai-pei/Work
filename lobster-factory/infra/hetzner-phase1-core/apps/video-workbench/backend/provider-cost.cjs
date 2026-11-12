// USD of one provider call, priced only from next-admin lib/ai/cost-model.ts (required like generation-policy.cjs,
// never copied). Invariant: every paid success reports its real provider cost -- from the response's usage where the
// provider returns it, else the model's fixed rate; a model with no price is refused before the call (priceOf throws).
const path = require("node:path");
const rates = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));

const unpriced = (what) => Object.assign(Error("此模型尚無價目，暫停付費功能：" + what), { status: 503 });
const tok = (n) => Math.max(0, Number(n) || 0);
const round = (usd) => Math.round(usd * 1e6) / 1e6;

function textRate(model) {
  const rate = rates.TEXT_RATES[model] || rates.TEXT_RATES[String(model).replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, "")];
  if (!rate) throw unpriced(model);
  return rate;
}
// OpenAI Responses usage: input_tokens (incl. cached), output_tokens. No usage = the request's upper bound
// (prompt chars / 2 as tokens + the max_output_tokens cap), never 0.
function textUsd(model, usage, bound = {}) {
  const rate = textRate(model);
  if (!usage || !Number.isFinite(Number(usage.input_tokens))) {
    return round((tok(bound.inputChars) / 2) * rate.inputPerM / 1e6 + tok(bound.maxOutputTokens) * rate.outputPerM / 1e6);
  }
  const cached = Math.min(tok(usage.input_tokens_details?.cached_tokens), tok(usage.input_tokens));
  return round(((tok(usage.input_tokens) - cached) + cached * rate.cacheReadMult) * rate.inputPerM / 1e6 + tok(usage.output_tokens) * rate.outputPerM / 1e6);
}
// Token-billed OpenAI image models (OPENAI_TOKEN_PRICED_IMAGE_MODELS; a dated snapshot = its base id); no usage = the
// highest per-image estimate. A model only priced by name resemblance is refused.
function imageUsd(model, usage) {
  const base = String(model).replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (!rates.OPENAI_TOKEN_PRICED_IMAGE_MODELS.includes(base)) throw unpriced(model);
  const r = rates.OPENAI_IMAGE_TOKEN_RATES;
  if (!usage || !Number.isFinite(Number(usage.output_tokens))) return rates.IMAGE_RATES["openai-high"].usd;
  const d = usage.input_tokens_details || {},
    text = d.text_tokens ?? (d.image_tokens === undefined ? usage.input_tokens : tok(usage.input_tokens) - tok(d.image_tokens));
  return round((tok(text) * r.textInPerM + tok(d.image_tokens) * r.imageInPerM + tok(usage.output_tokens) * r.imageOutPerM) / 1e6);
}
// next-admin video-motion ids (veo-3-1-fast...): per output second. Gemini video (GEMINI_VIDEO_RATES): the finished
// interaction's usage (cost-model.ts geminiMediaUsd); no usage = seconds x the 720p video tokens per second.
function videoUsd(model, seconds, usage = null) {
  if (Object.hasOwn(rates.VIDEO_MOTION_RATES, model)) return round(rates.VIDEO_MOTION_RATES[model].usdPerSec * tok(seconds));
  const rate = rates.GEMINI_VIDEO_RATES[model];
  if (!rate) throw unpriced(model);
  if (usage && Number.isFinite(Number(usage.total_output_tokens))) return round(rates.geminiMediaUsd(rate, usage));
  return round(tok(seconds) * rate.videoTokensPerSec * rate.outputPerM / 1e6);
}
// Gemini speech (cost-model.ts GEMINI_TTS_RATES): the reply's own token counts; no usage = the same published rules as
// below (text <= 1 token per character, audio tokens per second). Price row = the day the call was made.
function geminiSpeechUsd(rate, chars, audioSec, usage, at) {
  const day = new Date(at ?? Date.now()).toISOString().slice(0, 10),
    price = rate.prices.filter((p) => p.from <= day).at(-1) || rate.prices[0];
  const counted = usage && Number.isFinite(Number(usage.total_output_tokens)),
    seconds = Number(audioSec) > 0 ? Number(audioSec) : tok(chars) * 0.5,
    textIn = counted ? tok(usage.total_input_tokens) : tok(chars),
    audioOut = counted ? tok(usage.total_output_tokens) : seconds * rate.audioTokensPerSec;
  return round((textIn * price.textInPerM + audioOut * price.audioOutPerM) / 1e6);
}
// Per-character models: chars only. Token-billed gpt-4o-mini-tts (cost-model.ts OPENAI_TTS_RATES): the published rules,
// text <= 1 token per character + audio out per second of the returned audio. No measured duration (ffprobe failed) =
// 0.5 s per character, above any normal reading pace.
function speechUsd(model, chars, audioSec, usage = null, at = undefined) {
  if ((rates.FREE_TTS_MODELS || []).includes(model)) return 0;
  if (Object.hasOwn(rates.GEMINI_TTS_RATES, model)) return geminiSpeechUsd(rates.GEMINI_TTS_RATES[model], chars, audioSec, usage, at);
  const rate = rates.OPENAI_TTS_RATES[model];
  if (!rate) throw unpriced(model);
  if ("usdPerMChars" in rate) return round(rate.usdPerMChars * tok(chars) / 1e6);
  const seconds = Number(audioSec) > 0 ? Number(audioSec) : tok(chars) * 0.5;
  return round((tok(chars) * rate.textInPerM + seconds * rate.audioOutPerM * rate.audioTokensPerSec) / 1e6);
}
// Per audio minute (TRANSCRIBE_RATES: whisper-1, our host worker = 0), or token-billed Gemini (GEMINI_TRANSCRIBE_RATES):
// the replies' usage when given (summed over chunks), else the published estimate (audio tokens per second in, text
// tokens per minute out).
function transcribeUsd(model, seconds, usage = null) {
  const g = rates.GEMINI_TRANSCRIBE_RATES[model];
  if (g) {
    const counted = usage && Number.isFinite(Number(usage.total_output_tokens)),
      audioIn = counted ? tok(usage.total_input_tokens) : tok(seconds) * g.audioTokensPerSec,
      textOut = counted ? tok(usage.total_output_tokens) : (tok(seconds) / 60) * g.textTokensPerMin;
    return round((audioIn * g.audioInPerM + textOut * g.textOutPerM) / 1e6);
  }
  const rate = rates.TRANSCRIBE_RATES[model];
  if (!rate) throw unpriced(model);
  return round(rate.usdPerMin * tok(seconds) / 60);
}
const toolUsd = (key) => {
  if (!rates.TOOL_RATES[key]) throw unpriced(key);
  return rates.TOOL_RATES[key].usd;
};

// Before a paid job starts: its model must have a price (same tables the charge reads).
function priceOf(kind, model) {
  if (kind === "text") textRate(model);
  else if (kind === "image") imageUsd(model);
  else if (kind === "video") videoUsd(model, 0);
  else if (kind === "audio") speechUsd(model, 0);
  else if (kind === "transcribe") transcribeUsd(model, 0);
  else if (kind === "remove-bg") toolUsd("bg-remove");
  else if (kind === "3d") toolUsd(model); // card S4b: model = the TOOL_RATES key of the image -> 3D way
  else throw unpriced(kind);
}

const at = (f) => { try { return f(); } catch { return null; } };
// One speech / transcription model's button price (capabilities speech.models[].price, transcribe.engines[].price).
// Token-billed speech = per minute of audio out (text in, ~US$0.0006 per 1000 characters, left out), marked 約.
const speechPrice = (audio) => at(() => ("usdPerMChars" in (rates.OPENAI_TTS_RATES[audio] || {}) ? { usd: speechUsd(audio, 1000), unit: "千字" }
  : { usd: speechUsd(audio, 0, 60), unit: "分鐘", estimate: true }));
const transcribePrice = (model) => at(() => ({ usd: transcribeUsd(model, 60), unit: "分鐘", ...(rates.GEMINI_TRANSCRIBE_RATES[model] ? { estimate: true } : {}) }));
// Unit prices the buttons show before a click (capabilities.prices -> shared/paid-price.js), from the same functions the
// charge uses. Text: one call at the 3000-token output cap plus a nominal 20000-char input. An unpriced model = null.
function displayPrices({ text, image, audio, transcribe }) {
  return {
    "video.script": at(() => ({ usd: textUsd(text, null, { inputChars: 20000, maxOutputTokens: 3000 }), unit: "次", estimate: true })),
    "video.image": at(() => ({ usd: imageUsd(image), unit: "張", estimate: true })),
    "video.tts": speechPrice(audio),
    "video.transcribe": transcribePrice(transcribe),
  };
}

// Replicate models billed per GPU second (TOOL_RATES usdPerSec): the one function, next-admin cost-model.ts replicateRunUsd.
const runUsd = (key, predictTimeSec) => rates.replicateRunUsd(key, predictTimeSec);

module.exports = { textUsd, imageUsd, videoUsd, speechUsd, transcribeUsd, toolUsd, runUsd, priceOf, displayPrices, speechPrice, transcribePrice };

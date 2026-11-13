// ElevenLabs: the one client every ElevenLabs row uses (speech.cjs, transcribe.cjs, music.cjs, audio-tools.cjs) -- key,
// headers, refusals in plain words, and the account's plan (GET /v1/user/subscription), which decides the bill: free plan =
// the monthly credits, US$0; any other plan = next-admin cost-model.ts ELEVENLABS_RATES list price (provider-cost.cjs).
// Free-plan check 2026-11-13: text-to-speech, sound-generation, speech-to-text and audio-isolation answer 200;
// /v1/music answers 402 paid_plan_required.
const BASE = "https://api.elevenlabs.io";
const ACCOUNT_TTL_MS = 10 * 60 * 1000;

const keyOf = (env) => String(env?.ELEVENLABS_API_KEY || "").trim() || null;
function key(env) {
  const k = keyOf(env);
  if (!k) throw Object.assign(Error("此電腦尚未設定 ELEVENLABS_API_KEY；請先設定服務。"), { status: 503 });
  return k;
}
// A refused call -> one error the job shows as is (the job fails; settle() charges only succeeded jobs).
function failure(status, value) {
  const d = value?.detail, code = String(d?.status || d?.code || "").toLowerCase(),
    message = String(d?.message || (typeof d === "string" ? d : "")).slice(0, 300);
  const text = status === 402 || code === "paid_plan_required" ? "此 ElevenLabs 功能需要付費方案，目前的免費方案不能使用；請改選其他服務。"
    : /quota/.test(code) ? "ElevenLabs 本月免費額度已用完；請改選其他服務，或等下個月額度重置。"
    : status === 401 ? "ElevenLabs 拒絕這把金鑰（" + (code || "401") + "）；請檢查 ELEVENLABS_API_KEY。"
    : status === 429 ? "ElevenLabs 忙線中，請稍後再試。"
    : "ElevenLabs " + status + "：" + (message || code || "沒有說明");
  return Object.assign(Error(text), { status, vendorCode: code || null });
}

let cache = null; // { key, at, value } -- one key per process; the value never holds the key itself
// One call: JSON (json) or multipart (form) body; answers the Response when ok, else throws failure(). A spending call
// marks the cached plan stale, so the next /capabilities shows the credits left.
async function call(route, { apiKey, json, form, method = json || form ? "POST" : "GET", fetchImpl = fetch, signal, timeoutMs = 180000 }) {
  const r = await fetchImpl(BASE + route, {
    method,
    headers: { "xi-api-key": apiKey, ...(json ? { "Content-Type": "application/json" } : {}) },
    ...(json ? { body: JSON.stringify(json) } : form ? { body: form } : {}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw failure(r.status, await r.json().catch(() => null));
  if (method !== "GET" && cache) cache.at = 0;
  return r;
}

// The plan and credits, at most one subscription call per 10 minutes (pages read it from /capabilities, never per click).
// { tier, used, limit, remaining } or null (no key / the refresh failed). A failed refresh forgets the old plan: an
// upgrade must never keep billing US$0, so unknown = the list price. A plan change shows within 10 minutes.
async function account(env, fetchImpl = fetch, now = Date.now()) {
  const k = keyOf(env);
  if (!k) return null;
  if (cache && cache.key === k && now - cache.at < ACCOUNT_TTL_MS) return cache.value;
  let value = null;
  try {
    const s = await (await call("/v1/user/subscription", { apiKey: k, fetchImpl, timeoutMs: 8000 })).json();
    const used = Math.max(0, Number(s?.character_count) || 0), limit = Math.max(0, Number(s?.character_limit) || 0);
    value = { tier: String(s?.tier || ""), used, limit, remaining: Math.max(0, limit - used) };
  } catch {}
  cache = { key: k, at: now, value };
  return value;
}
const known = () => cache?.value || null;
// The bill rule's one question. Plan not known yet = not free (the list price is shown and charged, never under).
const freePlan = () => known()?.tier === "free";
// What a free-plan row says beside its button.
const creditsNote = () => (freePlan() ? `ElevenLabs 免費額度，本月剩 ${known().remaining.toLocaleString("en-US")} 點。` : "");
const forget = () => { cache = null; }; // tests

// ---- the calls ------------------------------------------------------------------------------------------------
const bytes = async (r, what) => {
  const audio = Buffer.from(await r.arrayBuffer());
  if (!audio.length) throw Object.assign(Error(what + "沒有回傳音訊"), { status: 502 });
  return audio;
};
// Text to speech (elevenlabs.io/docs/api-reference/text-to-speech/convert): MP3 bytes.
async function speak({ apiKey, model, voice, text, fetchImpl, signal }) {
  const r = await call("/v1/text-to-speech/" + encodeURIComponent(voice) + "?output_format=mp3_44100_128", { apiKey, json: { text, model_id: model }, fetchImpl, signal });
  return bytes(r, "配音服務");
}
// Sound effects (api-reference/text-to-sound-effects/convert): duration 0.5-22 s; MP3 bytes.
const SOUND_MAX_SECONDS = 22;
async function soundEffect({ apiKey, prompt, seconds, fetchImpl, signal }) {
  const duration_seconds = Math.min(SOUND_MAX_SECONDS, Math.max(0.5, Math.round(Number(seconds) * 10) / 10 || 0.5));
  const r = await call("/v1/sound-generation?output_format=mp3_44100_128", { apiKey, json: { text: prompt, duration_seconds }, fetchImpl, signal });
  return { audio: await bytes(r, "音效服務"), seconds: duration_seconds };
}
// Voice isolator (api-reference/audio-isolation/convert): the voice only, MP3 bytes. The vendor refuses under 4.6 s.
const ISOLATE_MIN_SECONDS = 4.6;
async function isolate({ apiKey, buffer, filename = "audio.mp3", fetchImpl, signal }) {
  const form = new FormData();
  form.append("audio", new Blob([buffer], { type: "audio/mpeg" }), filename);
  return bytes(await call("/v1/audio-isolation", { apiKey, form, fetchImpl, signal, timeoutMs: 600000 }), "人聲分離服務");
}
// Speech to text (api-reference/speech-to-text/convert): { language_code, words: [{ text, start, end, type, logprob }] }.
async function transcribe({ apiKey, model, buffer, filename, mime, language, fetchImpl, signal }) {
  const form = new FormData();
  form.append("model_id", model);
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  if (language) form.append("language_code", language);
  form.append("file", new Blob([buffer], { type: mime || "audio/mpeg" }), filename || "audio.mp3");
  return (await call("/v1/speech-to-text", { apiKey, form, fetchImpl, signal, timeoutMs: 900000 })).json();
}
// Eleven Music (api-reference/music/compose): MP3 bytes. Lyrics go in the prompt; force_instrumental only works with prompt.
async function compose({ apiKey, model, prompt, instrumental, seconds, fetchImpl, signal }) {
  const r = await call("/v1/music?output_format=mp3_44100_128", { apiKey, json: { prompt, model_id: model, music_length_ms: Math.round(seconds * 1000), force_instrumental: !!instrumental }, fetchImpl, signal, timeoutMs: 600000 });
  return bytes(r, "音樂服務");
}

module.exports = { BASE, ACCOUNT_TTL_MS, SOUND_MAX_SECONDS, ISOLATE_MIN_SECONDS, keyOf, key, failure, call, account, known, freePlan, creditsNote, forget, speak, soundEffect, isolate, transcribe, compose };

// 去配樂・重配音效 way B (backend/audio-tools.cjs sfx row "elevenlabs"): Gemini watches the video and answers timed sound
// cues [{ start, end, prompt }] that ElevenLabs then generates. The video goes small and silent (360p, 2 fps, no sound):
// Gemini samples about one frame a second, so a cue is timed to the second and a fast action can be missed.
// Model = the cheapest Gemini Flash-Lite row of next-admin cost-model.ts TEXT_RATES; charged from the reply's usage
// (provider-cost.cjs interactionsTextUsd), the request's upper bound when the reply has none.
const fs = require("node:fs");
const costs = require("./provider-cost.cjs");

const MODEL = "gemini-3.5-flash-lite";
const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_SEGMENTS = 12, MAX_OUTPUT_TOKENS = 2048;
// Upper estimate of video input tokens per second (Gemini video understanding, default resolution: about 258 tokens a
// frame at one frame a second, plus the request's text). Used only for the button price and a reply without usage.
const TOKENS_PER_SECOND = 300;
// A cue may end past the source by this much (Gemini rounds to whole seconds); more = refused, not trimmed.
const END_SLACK_SECONDS = 1;

function key(env) {
  const k = String(env?.GEMINI_API_KEY || "").trim();
  if (!k) throw Object.assign(Error("此電腦尚未設定 GEMINI_API_KEY；請先設定服務。"), { status: 503 });
  return k;
}
const keyOf = (env) => !!String(env?.GEMINI_API_KEY || "").trim();

// The most one look can cost: the whole video's estimated tokens in, the output cap out.
const estimateUsd = (seconds) => costs.textUsd(MODEL, { input_tokens: Math.ceil(Math.max(0, Number(seconds) || 0) * TOKENS_PER_SECOND), output_tokens: MAX_OUTPUT_TOKENS });

const instructions = (seconds, extra) => [
  `You are a foley designer. Watch this silent ${seconds.toFixed(1)}-second video and list the sound effects its picture needs.`,
  "Answer only a JSON array, no prose, no code fence: [{\"start\": <seconds>, \"end\": <seconds>, \"prompt\": \"<English sound description>\"}].",
  `Rules: at most ${MAX_SEGMENTS} items; sorted by start; items never overlap; 0 <= start < end <= ${seconds.toFixed(1)}; each item at most 30 seconds;`,
  "each prompt is plain English, under 200 characters, describing only non-musical sound: no music of any kind (no instrument, even one played on screen), no singing, no speech or dialogue.",
  "Cover the whole video back to back where sound is heard; when an ambience and an action happen at once, describe both in that one item's prompt (never a second item over the same time).",
  ...(extra ? ["The user also asked for (may be written in Chinese; follow it where the picture allows): " + extra] : []),
].join("\n");

// The reply's text as cues, or a refusal (status 502: the vendor answered something unusable). Strict: every rule of
// instructions() is checked, none is repaired, except an end up to END_SLACK_SECONDS past the source is set to its end.
function parseCues(text, seconds) {
  const bad = (why) => Object.assign(Error("Gemini 回覆的音效時間表無效：" + why), { status: 502 });
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let list;
  try { list = JSON.parse(raw); } catch { throw bad("不是 JSON"); }
  if (!Array.isArray(list) || !list.length) throw bad("沒有任何段落");
  if (list.length > MAX_SEGMENTS) throw bad(`超過 ${MAX_SEGMENTS} 段`);
  const cues = list.map((c, i) => {
    const start = Number(c?.start), end0 = Number(c?.end), prompt = typeof c?.prompt === "string" ? c.prompt.trim() : "";
    if (!Number.isFinite(start) || !Number.isFinite(end0) || start < 0 || end0 <= start) throw bad(`第 ${i + 1} 段時間不合理`);
    if (start >= seconds || end0 > seconds + END_SLACK_SECONDS) throw bad(`第 ${i + 1} 段超出影片長度`);
    if (prompt.length < 3 || prompt.length > 300 || /[　-鿿＀-￯]/.test(prompt)) throw bad(`第 ${i + 1} 段描述不是英文短句`);
    return { start, end: Math.min(end0, seconds), prompt };
  });
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start < cues[i - 1].start) throw bad("段落沒有依時間排序");
    if (cues[i].start < cues[i - 1].end) throw bad(`第 ${i} 段與第 ${i + 1} 段重疊`);
  }
  return cues;
}

// file = the source video; run = media.cjs ffmpeg runner; tmp(ext) = a temp path the caller removes.
// Answers { cues, usd, usage }.
async function describe({ file, seconds, extra = "", env, fetchImpl = fetch, signal, run, tmp }) {
  const apiKey = key(env), small = tmp("mp4");
  await run(["-y", "-hide_banner", "-i", file, "-an", "-vf", "fps=2,scale=-2:360", "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-pix_fmt", "yuv420p", "-t", String(seconds), small], signal);
  const prompt = instructions(seconds, String(extra || "").trim().slice(0, 200));
  const r = await fetchImpl(API, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: "text", text: prompt }, { type: "video", data: fs.readFileSync(small).toString("base64"), mime_type: "video/mp4" }],
      generation_config: { temperature: 0.2, max_output_tokens: MAX_OUTPUT_TOKENS },
      store: false,
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000),
  });
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(Error("看片服務失敗：Google " + r.status + " " + String(value?.error?.message || "").slice(0, 300)), { status: r.status });
  const text = (value?.steps || []).flatMap((s) => s?.content || []).filter((c) => c?.type === "text").map((c) => c.text).join("");
  const usage = value?.usage || null;
  const usd = costs.interactionsTextUsd(MODEL, usage, { inputChars: prompt.length * 2 + Math.ceil(seconds * TOKENS_PER_SECOND) * 2, maxOutputTokens: MAX_OUTPUT_TOKENS });
  try {
    return { cues: parseCues(text, seconds), usd, usage };
  } catch (e) {
    throw Object.assign(e, { reply: text.slice(0, 2000), usd }); // for the log; the job shows e.message only
  }
}

module.exports = { MODEL, MAX_SEGMENTS, TOKENS_PER_SECOND, key, keyOf, estimateUsd, instructions, parseCues, describe };

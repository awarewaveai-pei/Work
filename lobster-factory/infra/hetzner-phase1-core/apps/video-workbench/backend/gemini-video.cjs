// Google Gemini video through the Interactions API, run in the background (aistudio.google.com/docs/omni and
// api-reference/interactions-api, read 2026-11-10). Same calls as replicate-video.cjs; generation-policy.cjs videoVendor()
// picks the module by job.video.provider. Price: next-admin cost-model.ts GEMINI_VIDEO_RATES.
const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // same cap as replicate-video.cjs

// Omni takes any whole second 3-15 (default 10) and 16:9 or 9:16; output always has native audio.
const MODELS = Object.freeze({
  "gemini-omni-1.2-flash": Object.freeze({ defaultDurationSec: 8, durations: Object.freeze([4, 6, 8, 10, 15]), ratios: Object.freeze(["16:9", "9:16"]), requiresImage: false }),
});

// 503 = nothing was sent (shared/runtime.js treats it as a safe rejection).
function token(env) {
  if (!env.GEMINI_API_KEY) throw Object.assign(Error("此電腦尚未設定 GEMINI_API_KEY，無法使用這個影片模型。"), { status: 503 });
  return env.GEMINI_API_KEY;
}

async function call(fetchImpl, env, url, init = {}) {
  const r = await fetchImpl(url, {
    ...init,
    headers: { "x-goog-api-key": token(env), ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: init.signal || AbortSignal.timeout(60_000),
  });
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(Error("Google " + r.status + "：" + String(value?.error?.message || "").slice(0, 300)), { status: r.status >= 500 ? 502 : r.status });
  return value;
}

/** Starts one background interaction; returns its id. imageUrl = data URL or omitted. */
async function create({ model, prompt, imageUrl, ratio, seconds, env, fetchImpl, signal }) {
  const image = imageUrl && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(imageUrl);
  if (imageUrl && !image) throw Error("參考圖格式無效");
  const value = await call(fetchImpl, env, API, {
    method: "POST",
    body: JSON.stringify({
      model,
      input: image ? [{ type: "image", data: image[2], mime_type: image[1] }, { type: "text", text: prompt }] : prompt,
      response_format: { type: "video", aspect_ratio: ratio, duration: seconds + "s", resolution: "720p" },
      background: true,
    }),
    signal,
  });
  if (typeof value?.id !== "string") throw Error("Google 沒有回傳任務編號");
  return value.id;
}

/** { status: queued|running|succeeded|failed, output?, error? }; output = the finished interaction (video inline as base64). */
async function status({ id, env, fetchImpl }) {
  const value = await call(fetchImpl, env, API + "/" + encodeURIComponent(id));
  if (value.status === "in_progress") return { status: "running" };
  if (value.status !== "completed") return { status: "failed", error: "影片供應商狀態：" + value.status };
  return { status: "succeeded", output: value };
}

/** { video: Buffer, usage } from status().output. */
async function download({ output }) {
  const part = (output.steps || []).flatMap((s) => s?.content || []).find((c) => c?.type === "video" && typeof c.data === "string");
  if (!part) throw Error("Google 沒有回傳影片");
  if (part.data.length * 0.75 > MAX_VIDEO_BYTES) throw Error("影片超過 80MB");
  return { video: Buffer.from(part.data, "base64"), usage: output.usage || null };
}

/** Asks Google to stop the interaction; true only when Google accepted (2xx). */
async function cancel({ id, env, fetchImpl }) {
  if (!id || !env.GEMINI_API_KEY) return false;
  const r = await fetchImpl(API + "/" + encodeURIComponent(id) + "/cancel", {
    method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!r?.ok;
}

module.exports = { MODELS, token, create, status, download, cancel };

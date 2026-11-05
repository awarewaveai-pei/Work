// Replicate video models (card RV). The model list, slugs and input fields are next-admin's
// lib/ai/video-motion-models.ts, required here like cost-model.ts (Node type stripping), never copied.
// One prediction per job: create once, store its id in job.providerId, then poll/download/cancel by that id.
const path = require("node:path");
const { MOTION_MODELS } = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/video-motion-models.ts"));

const API = "https://api.replicate.com/v1";
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // same cap as next-admin video-motion-gen.ts

const isModel = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(MOTION_MODELS, id);
// 503 = nothing was sent (shared/runtime.js treats it as a safe rejection).
function token(env) {
  if (!env.REPLICATE_API_TOKEN)
    throw Object.assign(Error("此電腦尚未設定 REPLICATE_API_TOKEN，無法使用這個影片模型。"), { status: 503 });
  return env.REPLICATE_API_TOKEN;
}

async function call(fetchImpl, env, url, init = {}) {
  const r = await fetchImpl(url, {
    ...init,
    headers: { Authorization: "Bearer " + token(env), ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: init.signal || AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json()).detail || ""; } catch {}
    throw Object.assign(Error("Replicate " + r.status + (detail ? "：" + String(detail).slice(0, 300) : "")), { status: r.status >= 500 ? 502 : r.status });
  }
  return r.json();
}

/** Starts one prediction; returns its id. imageUrl = data URL or omitted. */
async function create({ model, prompt, imageUrl, ratio, seconds, env, fetchImpl, signal }) {
  const config = MOTION_MODELS[model];
  const input = config.buildInput({ imageUrl, prompt, aspectRatio: ratio, durationSec: seconds, resolution: "720p" });
  const prediction = await call(fetchImpl, env, API + "/models/" + config.slug + "/predictions", { method: "POST", body: JSON.stringify({ input }), signal });
  if (typeof prediction.id !== "string") throw Error("Replicate 沒有回傳任務編號");
  return prediction.id;
}

/** { status: queued|running|succeeded|failed, outputUrl?, error? } */
async function status({ id, env, fetchImpl }) {
  const p = await call(fetchImpl, env, API + "/predictions/" + encodeURIComponent(id));
  const s = { starting: "queued", processing: "running", succeeded: "succeeded" }[p.status] || "failed";
  if (s === "failed") return { status: s, error: "影片供應商狀態：" + p.status + (p.error ? "（" + String(p.error).slice(0, 200) + "）" : "") };
  if (s !== "succeeded") return { status: s };
  const outputUrl = Array.isArray(p.output) ? p.output[0] : p.output;
  // Only Replicate's delivery host, https only (bg-remove.cjs / next-admin image-gen.ts isAllowedOutputUrl).
  if (typeof outputUrl !== "string" || !/^https:\/\/([a-z0-9-]+\.)*replicate\.delivery\//.test(outputUrl))
    return { status: "failed", error: "影片結果網址不在允許範圍" };
  return { status: s, outputUrl };
}

// Streams and stops at the cap: Content-Length may be absent.
async function download({ url, fetchImpl }) {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw Error("下載影片失敗：Replicate " + r.status);
  if (Number(r.headers?.get?.("content-length")) > MAX_VIDEO_BYTES) throw Error("影片超過 80MB");
  const reader = r.body?.getReader?.();
  if (!reader) {
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > MAX_VIDEO_BYTES) throw Error("影片超過 80MB");
    return b;
  }
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_VIDEO_BYTES) { await reader.cancel().catch(() => {}); throw Error("影片超過 80MB"); }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/** Asks Replicate to stop the prediction; true only when Replicate accepted (2xx), so a refusal is never shown as cancelled. */
async function cancel({ id, env, fetchImpl }) {
  if (!id || !env.REPLICATE_API_TOKEN) return false;
  const r = await fetchImpl(API + "/predictions/" + encodeURIComponent(id) + "/cancel", {
    method: "POST", headers: { Authorization: "Bearer " + env.REPLICATE_API_TOKEN }, signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!r?.ok;
}

module.exports = { MOTION_MODELS, isModel, token, create, status, download, cancel };

// AI 畫質增強 (card ED.12.3): topazlabs/video-upscale on Replicate (official model, called by name). The job is the
// tools page's own 畫面增強 shape -- { operation: "enhance", settings: { enhanceType: "畫面", enhanceOption: "AI 大模型增強",
// enhanceResolution } } -- so the 特效 pane and the tools page send the same job. Price: next-admin cost-model.ts
// videoEnhanceUsd via provider-cost.cjs enhanceUsd -- the run's reported units -- charged only on success (api.cjs settle).
// The source goes as a data: URI, like every Replicate route here (bg-remove.cjs, image-to-3d.cjs): the model cannot read
// a Files API url (it needs auth; 2026-11-13 real run: "source.container is required"), so the source is capped at 20MB.
const fs = require("node:fs"), path = require("node:path"), { Readable } = require("node:stream"), { pipeline } = require("node:stream/promises");

const MODEL = "topazlabs/video-upscale";
const API = "https://api.replicate.com/v1";
const POLL_INTERVAL_MS = 5_000; // VW_ENHANCE_POLL_MS overrides it (tests)
// The job's own server limit (api.cjs jobTimeoutMs): upscaling minutes of 4K takes a while on the vendor side.
const TIMEOUT_MS = 40 * 60_000;
const MAX_SOURCE_SECONDS = 300, MAX_SOURCE_BYTES = 20 * 1024 ** 2, MAX_OUTPUT_BYTES = 4 * 1024 ** 3;
const VIDEO_EXT = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4" };
const RESOLUTIONS = ["720P", "1080P", "4K"];
const TARGET = { "720P": "720p", "1080P": "1080p", "4K": "4k" };

const isAi = (input) => input?.operation === "enhance" && input.settings?.enhanceType === "畫面" && input.settings?.enhanceOption === "AI 大模型增強";
const resolutionOf = (input) => {
  const r = String(input.settings?.enhanceResolution || "");
  if (!RESOLUTIONS.includes(r)) throw Object.assign(Error("AI 畫質增強支援 " + RESOLUTIONS.join("／") + " 輸出"), { status: 400 });
  return r;
};
// 503 = nothing was sent (shared/runtime.js treats it as a safe rejection), so this runs before any provider call.
function token(env) {
  if (!env.REPLICATE_API_TOKEN)
    throw Object.assign(Error("此電腦尚未設定 REPLICATE_API_TOKEN，無法使用 AI 畫質增強。"), { status: 503 });
  return env.REPLICATE_API_TOKEN;
}
const mimeOf = (file) => VIDEO_EXT[path.extname(file).slice(1).toLowerCase()];
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });

/** Best effort: stops Replicate billing a prediction nobody will collect. */
async function cancelPrediction({ id, env, fetchImpl }) {
  if (!id || !env.REPLICATE_API_TOKEN) return;
  await fetchImpl(API + "/predictions/" + encodeURIComponent(id) + "/cancel", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.REPLICATE_API_TOKEN },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/** Upscales the local video `file` into `dest` (an .mp4 path); returns { units } = the prediction's billed units
 *  (metrics.unspecified_billing_metric; undefined when not reported). Throws on any provider failure; `dest` is written
 *  only from a succeeded prediction. resumeId: an earlier prediction for the same source and resolution that may still
 *  bill; it is polled instead of paying twice. onPrediction(id) records the id in use. */
async function upscale({ file, resolution, dest, env, fetchImpl, signal, resumeId, onPrediction = () => {} }) {
  const auth = { Authorization: "Bearer " + token(env) },
    mime = mimeOf(file);
  if (!mime) throw Error("AI 畫質增強只支援 MP4、MOV、WebM 影片");
  if (fs.statSync(file).size > MAX_SOURCE_BYTES) throw Error("AI 畫質增強的來源影片最大 20MB");
  const call = async (url, init, label) => {
    let r;
    try {
      r = await fetchImpl(url, { ...init, signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw Error(label + "連線失敗");
    }
    if (!r.ok) throw Error(label + "失敗：Replicate " + r.status);
    return r;
  };
  let prediction = null;
  if (resumeId) {
    try {
      const earlier = await (await call(API + "/predictions/" + encodeURIComponent(resumeId), { headers: auth }, "畫質增強狀態查詢")).json();
      if (["starting", "processing", "succeeded"].includes(earlier.status)) prediction = earlier;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (!prediction) {
    const video = "data:" + mime + ";base64," + fs.readFileSync(file).toString("base64");
    prediction = await (await call(API + "/models/" + MODEL + "/predictions", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { video, target_resolution: TARGET[resolution], target_fps: 30 } }),
    }, "畫質增強")).json();
  }
  if (typeof prediction.id === "string") onPrediction(prediction.id);
  try {
    while (["starting", "processing"].includes(prediction.status)) {
      await wait(Number(env.VW_ENHANCE_POLL_MS) || POLL_INTERVAL_MS, signal);
      prediction = await (await call(API + "/predictions/" + encodeURIComponent(prediction.id), { headers: auth }, "畫質增強狀態查詢")).json();
    }
  } catch (e) {
    // Timeout, cancel or a lost connection: nobody will collect this run, so Replicate is told to stop billing it.
    await cancelPrediction({ id: prediction.id, env, fetchImpl });
    throw e;
  }
  if (prediction.status !== "succeeded")
    throw Error("畫質增強失敗：" + String(prediction.error || prediction.status).slice(0, 200));
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  // Only Replicate's delivery host, https only: the url comes from a provider reply.
  if (typeof outputUrl !== "string" || !/^https:\/\/replicate\.delivery\//.test(outputUrl))
    throw Error("畫質增強結果網址不在允許範圍");
  const download = await call(outputUrl, {}, "下載畫質增強結果");
  if (Number(download.headers?.get?.("content-length")) > MAX_OUTPUT_BYTES) throw Error("畫質增強結果超過 4GB");
  let size = 0;
  const capped = async function* (source) {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) throw Error("畫質增強結果超過 4GB");
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(download.body), capped, fs.createWriteStream(dest), { signal });
  } catch (e) {
    fs.rmSync(dest, { force: true });
    throw e;
  }
  const units = Number(prediction.metrics?.unspecified_billing_metric);
  return { units: units > 0 ? units : undefined, predictionId: prediction.id };
}

module.exports = { MODEL, TIMEOUT_MS, MAX_SOURCE_SECONDS, MAX_SOURCE_BYTES, RESOLUTIONS, isAi, resolutionOf, token, mimeOf, upscale, cancelPrediction };

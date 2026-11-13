// AI 畫質增強 (card ED.12.3): topazlabs/video-upscale on Replicate (official model, called by name). The job is the
// tools page's own 畫面增強 shape -- { operation: "enhance", settings: { enhanceType: "畫面", enhanceOption: "AI 大模型增強",
// enhanceResolution } } -- so the 特效 pane and the tools page send the same job. Price: next-admin cost-model.ts
// videoEnhanceUsd via provider-cost.cjs enhanceUsd -- the run's reported units -- charged only on success (api.cjs settle).
// The source goes as a data: URI, like every Replicate route here (bg-remove.cjs, image-to-3d.cjs): the model cannot read
// a Files API url (it needs auth; 2026-11-13 real run: "source.container is required"), so the source is capped at 20MB.
const fs = require("node:fs"), path = require("node:path"), { Readable } = require("node:stream"), { pipeline } = require("node:stream/promises");

const run = require("./replicate-run.cjs");
const MODEL = "topazlabs/video-upscale";
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

/** Upscales the local video `file` into `dest` (an .mp4 path); returns { units } = the prediction's billed units
 *  (metrics.unspecified_billing_metric; undefined when not reported). Throws on any provider failure; `dest` is written
 *  only from a succeeded prediction. resumeId / onPrediction: replicate-run.cjs (takeover and cancel rules). */
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
  const prediction = await run.runPrediction({
    call, auth, resumeId, label: "畫質增強", pollMs: Number(env.VW_ENHANCE_POLL_MS) || POLL_INTERVAL_MS, signal, env, fetchImpl, onPrediction,
    create: async () => {
      const video = "data:" + mime + ";base64," + fs.readFileSync(file).toString("base64");
      return (await call(run.API + "/models/" + MODEL + "/predictions", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ input: { video, target_resolution: TARGET[resolution], target_fps: 30 } }),
      }, "畫質增強")).json();
    },
  });
  const download = await call(run.deliveryUrl(prediction, "畫質增強"), {}, "下載畫質增強結果");
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

module.exports = { MODEL, TIMEOUT_MS, MAX_SOURCE_SECONDS, MAX_SOURCE_BYTES, RESOLUTIONS, isAi, resolutionOf, token, mimeOf, upscale };

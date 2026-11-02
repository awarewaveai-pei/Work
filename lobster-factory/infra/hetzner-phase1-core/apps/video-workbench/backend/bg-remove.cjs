const fs = require("node:fs"), path = require("node:path");
// Same Replicate model, version and limits as next-admin lib/studio/bg-remover.ts (that file imports the gateway
// and entitlements, so it cannot be loaded here). tests/remove-bg.cjs reads its version const and compares.
const BG_REMOVER_VERSION_DEFAULT = "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"; // 851-labs/background-remover (pinned 2026-06-11)
const MODEL = "851-labs/background-remover";
const POLL_INTERVAL_MS = 2_000, TIMEOUT_MS = 55_000, MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const version = (env) => env.BG_REMOVER_VERSION || BG_REMOVER_VERSION_DEFAULT;
const modelLabel = (env) => MODEL + ":" + version(env).slice(0, 12);
// 503 = nothing was sent (shared/runtime.js treats it as a safe rejection), so this runs before any provider call.
function token(env) {
  if (!env.REPLICATE_API_TOKEN)
    throw Object.assign(Error("此電腦尚未設定 REPLICATE_API_TOKEN，無法去背。"), { status: 503 });
  return env.REPLICATE_API_TOKEN;
}
const mimeOf = (file) => MIME[path.extname(file).slice(1).toLowerCase()];
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });

// Streams the body and stops at the cap: Content-Length may be absent, so arrayBuffer() could exhaust memory first.
async function capped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_OUTPUT_BYTES) throw Error("去背結果超過 20MB");
    return buffer;
  }
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_OUTPUT_BYTES) {
      await reader.cancel().catch(() => {});
      throw Error("去背結果超過 20MB");
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/** Best effort: stops Replicate billing a prediction nobody will collect. */
async function cancelPrediction({ id, env, fetchImpl }) {
  if (!id || !env.REPLICATE_API_TOKEN) return;
  await fetchImpl("https://api.replicate.com/v1/predictions/" + encodeURIComponent(id) + "/cancel", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.REPLICATE_API_TOKEN },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/** Transparent PNG of `file` (a local png/jpeg/webp). Throws on any provider failure; never returns partial output.
 *  resumeId: an earlier prediction for the same image that may still bill; it is polled instead of paying twice,
 *  and only a canceled/failed/unreadable one leads to a new prediction. onPrediction(id) records the id it uses. */
async function removeBackground({ file, env, fetchImpl, signal, resumeId, onPrediction = () => {} }) {
  const auth = { Authorization: "Bearer " + token(env) };
  const mime = mimeOf(file);
  if (!mime) throw Error("去背只支援 PNG、JPEG、WebP 圖片");
  const deadline = AbortSignal.timeout(TIMEOUT_MS),
    abort = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const call = async (url, init, label) => {
    let r;
    try {
      r = await fetchImpl(url, { ...init, signal: abort });
    } catch (e) {
      throw Error(deadline.aborted ? "去背逾時（55 秒）" : label + "連線失敗");
    }
    if (!r.ok) throw Error(label + "失敗：Replicate " + r.status);
    return r;
  };
  let prediction = null;
  if (resumeId) {
    try {
      const earlier = await (await call("https://api.replicate.com/v1/predictions/" + encodeURIComponent(resumeId), { headers: auth }, "去背狀態查詢")).json();
      if (["starting", "processing", "succeeded"].includes(earlier.status)) prediction = earlier;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (!prediction) {
    const image = "data:" + mime + ";base64," + fs.readFileSync(file).toString("base64");
    prediction = await (await call("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ version: version(env), input: { image, format: "png", background_type: "rgba" } }),
    }, "去背")).json();
  }
  if (typeof prediction.id === "string") onPrediction(prediction.id);
  while (["starting", "processing"].includes(prediction.status)) {
    await wait(POLL_INTERVAL_MS, abort).catch(() => { throw Error(deadline.aborted ? "去背逾時（55 秒）" : "去背已取消"); });
    prediction = await (await call("https://api.replicate.com/v1/predictions/" + encodeURIComponent(prediction.id), { headers: auth }, "去背狀態查詢")).json();
  }
  if (prediction.status !== "succeeded")
    throw Error("去背失敗：" + String(prediction.error || prediction.status).slice(0, 200));
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  // Only Replicate's delivery host, https only (same rule as bg-remover.ts): the url comes from a provider reply.
  if (typeof outputUrl !== "string" || !/^https:\/\/replicate\.delivery\//.test(outputUrl))
    throw Error("去背結果網址不在允許範圍");
  const download = await call(outputUrl, {}, "下載去背結果");
  if (Number(download.headers?.get?.("content-length")) > MAX_OUTPUT_BYTES) throw Error("去背結果超過 20MB");
  const buffer = await capped(download);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw Error("去背結果不是 PNG 圖片");
  return buffer;
}

module.exports = { removeBackground, cancelPrediction, token, mimeOf, modelLabel, BG_REMOVER_VERSION_DEFAULT };

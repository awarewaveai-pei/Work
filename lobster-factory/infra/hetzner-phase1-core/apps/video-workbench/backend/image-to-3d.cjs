// Card S4b: image -> 3D, one job operation "image-to-3d"; settings.method picks the way (docs/s4-image-to-3d-providers-20261103.md §7).
//   { operation: "image-to-3d", references: { image: { url, id } }, settings: { method, texture? (meshy only) } } -> GLB model asset.
// Prices come only from next-admin lib/ai/cost-model.ts TOOL_RATES (never copied); the local way is free.
// Invariant: one job id makes at most one paid vendor call -- beforeCall() records job.vendorCall and persists it before
// the request, and a job that already has one never calls again. Async vendors (Replicate, Meshy) persist their task id
// (job.vendorTaskId); api.cjs passes an earlier unfinished task for the same image + method + options as resumeId.
const fs = require("node:fs"),
  path = require("node:path");
const { TOOL_RATES, replicateRunUsd } = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
const sf3dLocal = require("./sf3d-local.cjs"),
  meshy = require("./meshy.cjs"),
  { cancelPrediction } = require("./bg-remove.cjs");
const { vwEnv } = require("./env-compat.cjs");

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const MAX_GLB = 200 * 1024 * 1024;
const TIMEOUT_MS = 1200000;
// Pinned like bg-remove.cjs; registered in cost-model.ts MEDIA_MODELS so scripts/probe-models.mjs checks it.
const TRELLIS = { model: "firtoz/trellis", version: "e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c" };
const TRELLIS_INPUT = { generate_model: true, generate_color: false, generate_normal: false, texture_size: 1024, mesh_simplify: 0.95, randomize_seed: false, seed: 0 };

// The ways, in the order the page shows them. maxImage = the vendor's request limit. default: preselected on the page
// (card S4b.2, docs/s4-image-to-3d-providers-20261103.md §8). facing: degrees the vendor's model is turned from glTF +Z
// (measured on the S4b.2 run: SPAR3D and local SF3D face -Z; Stability's hosted SF3D was not run); the page passes it as
// the autorig turn so a figure walks forwards.
const METHODS = {
  "stability-spar3d": { label: "Stability SPAR3D", vendor: "Stability AI", rate: "3d-spar3d", default: true, facing: 180, key: "STABILITY_API_KEY", endpoint: "stable-point-aware-3d", maxImage: 10 * 1024 * 1024 },
  "stability-sf3d": { label: "Stability SF3D", vendor: "Stability AI", rate: "3d-sf3d", key: "STABILITY_API_KEY", endpoint: "stable-fast-3d", maxImage: 10 * 1024 * 1024 },
  "local-sf3d": { label: "本機 SF3D", vendor: "本機", local: true, facing: 180, maxImage: 20 * 1024 * 1024 },
  "replicate-trellis": { label: "Replicate TRELLIS", vendor: "Replicate", rate: "3d-trellis", key: "REPLICATE_API_TOKEN", maxImage: 10 * 1024 * 1024 },
  meshy: { label: "Meshy", vendor: "Meshy", key: "MESHY_API_KEY", hiddenWithoutKey: true, maxImage: 20 * 1024 * 1024 },
};
const bad = (message, status = 400) => Object.assign(Error(message), { status });
const methodOf = (input) => {
  const m = input?.settings?.method;
  if (!Object.hasOwn(METHODS, m)) throw bad("請選一種圖片轉 3D 方式");
  return METHODS[m];
};
const usdOf = (m) => (m.local ? 0 : m.rate ? TOOL_RATES[m.rate].usd : null);

// For /capabilities: every way with its price and why it cannot run here. Meshy appears only when its key is set.
// priced (connected to the main system): a paid way with no USD price is refused before the job (api.cjs priceOf), so it
// is shown unavailable here too.
function capability(env, { priced = false } = {}) {
  const methods = Object.entries(METHODS)
    .filter(([, m]) => !m.hiddenWithoutKey || env[m.key])
    .map(([id, m]) => {
      const reason = m.local ? (sf3dLocal.installed(env) ? null : "未安裝") : !env[m.key] ? "金鑰未設定" : priced && usdOf(m) == null ? "無美元價目" : null;
      return { id, label: m.label, vendor: m.vendor, usd: usdOf(m), estimate: !!(m.rate && TOOL_RATES[m.rate].estimate), ...(id === "meshy" ? { credits: meshy.CREDITS } : {}), ...(m.default ? { default: true } : {}), ...(m.facing ? { facing: m.facing } : {}), available: !reason, ...(reason ? { reason } : {}) };
    });
  return { methods };
}

function imageFile(input, localFile, m) {
  const file = localFile(input.references?.image?.url, { assets: true });
  const mime = file && MIME[path.extname(file).slice(1).toLowerCase()];
  if (!mime || !fs.existsSync(file)) throw bad("請選一張素材庫中的 PNG、JPEG 或 WebP 圖片");
  if (fs.statSync(file).size > m.maxImage) throw bad(`圖片超過 ${m.maxImage / 1048576} MB`);
  return { file, mime };
}
// Validates before the job is recorded (api.cjs answers 202 only after this).
function request(input, { env, localFile }) {
  const m = methodOf(input);
  if (m.local ? !sf3dLocal.installed(env) : !env[m.key]) throw bad(`${m.label}${m.local ? "未安裝" : "金鑰未設定"}`, 503);
  imageFile(input, localFile, m);
  return { type: "model" };
}
// TOOL_RATES key of a paid way (api.cjs prices it before the job starts), null for the free local way.
const rateKey = (input) => {
  const m = methodOf(input);
  return m.local ? null : m.rate || "meshy";
};
// One local SF3D at a time; the API ways need no slot.
const claim = (input) => (methodOf(input).local ? sf3dLocal.claim() : () => {});
// An earlier job whose vendor task may still be collected: unfinished, and not cancelled at the vendor (a cancelled
// TRELLIS job's prediction is being cancelled at Replicate; attaching to it would fail when it turns "canceled").
const resumable = (j) => !!j.vendorTaskId && j.status !== "succeeded" && !(j.status === "cancelled" && j.input?.settings?.method === "replicate-trellis");
// Earlier unfinished vendor tasks are reused only when this matches (image + method + every option sent).
const reuseKey = (input) => {
  const id = input?.settings?.method;
  const options = id === "replicate-trellis" ? TRELLIS_INPUT : id === "meshy" ? meshy.options(input) : null;
  return options ? JSON.stringify([id, input.references?.image?.url, options]) : null;
};

async function capped(response, label) {
  if (Number(response.headers?.get?.("content-length")) > MAX_GLB) throw Error(label + "超過 200 MB");
  const reader = response.body?.getReader?.();
  const parts = [];
  let size = 0;
  if (!reader) parts.push(Buffer.from(await response.arrayBuffer()));
  else
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > MAX_GLB) {
        await reader.cancel().catch(() => {});
        throw Error(label + "超過 200 MB");
      }
      parts.push(Buffer.from(value));
    }
  const buffer = Buffer.concat(parts);
  if (buffer.length > MAX_GLB) throw Error(label + "超過 200 MB");
  return buffer;
}
const isGlb = (buffer) => buffer.length > 12 && buffer.toString("latin1", 0, 4) === "glTF";
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(Error("已取消"))), { once: true });
  });

// Stability v2beta 3D (docs.stability.ai/api-reference/3d/stable-fast-3d, .../stable-point-aware-3d, read 2026-11-10):
// multipart image + texture_resolution, answers the GLB itself (model/gltf-binary); a failed generation is not charged.
async function stability({ m, file, mime, env, fetchImpl, signal, beforeCall }) {
  const form = new FormData();
  form.append("image", new Blob([fs.readFileSync(file)], { type: mime }), "image" + path.extname(file));
  form.append("texture_resolution", "1024");
  beforeCall();
  const r = await fetchImpl("https://api.stability.ai/v2beta/3d/" + m.endpoint, { method: "POST", headers: { authorization: "Bearer " + env.STABILITY_API_KEY }, body: form, signal });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let reason = text.slice(0, 200);
    try {
      const body = JSON.parse(text);
      reason = [body.name, ...(Array.isArray(body.errors) ? body.errors : [])].filter(Boolean).join("：") || reason;
    } catch {}
    throw Error(`Stability 回應 ${r.status}：${reason}`);
  }
  return { buffer: await capped(r, "GLB"), origin: { provider: "Stability AI", model: m.endpoint } };
}

// Replicate firtoz/trellis (version schema read 2026-11-10: input images[], generate_model; output.model_file).
async function trellis({ file, mime, env, fetchImpl, signal, resumeId, beforeCall, onTask, onProgress, pollMs, download }) {
  const auth = { Authorization: "Bearer " + env.REPLICATE_API_TOKEN };
  const get = async (id) => {
    const r = await fetchImpl("https://api.replicate.com/v1/predictions/" + encodeURIComponent(id), { headers: auth, signal });
    if (!r.ok) throw Error("TRELLIS 狀態查詢失敗：Replicate " + r.status);
    return r.json();
  };
  const result = async (prediction) => {
    const url = prediction.output?.model_file;
    // Only Replicate's delivery host, https only: the url comes from a provider reply (same rule as bg-remove.cjs).
    if (typeof url !== "string" || !/^https:\/\/replicate\.delivery\//.test(url)) throw Error("TRELLIS 結果網址不在允許範圍");
    // Billed per second of predict_time (cost-model.ts replicateRunUsd); without it the estimate stands (usdOf).
    const seconds = Number(prediction.metrics?.predict_time);
    return {
      buffer: await download(url),
      origin: { provider: "Replicate", model: TRELLIS.model + ":" + TRELLIS.version.slice(0, 12), taskId: prediction.id, ...(seconds > 0 ? { costUsd: replicateRunUsd("3d-trellis", seconds), runSeconds: seconds } : {}) },
    };
  };
  let p = null;
  if (resumeId) {
    try {
      const earlier = await get(resumeId);
      if (["starting", "processing"].includes(earlier.status)) p = earlier;
      // An earlier finished prediction whose file is still downloadable; an expired one (Replicate keeps outputs ~1 h) is not reused.
      else if (earlier.status === "succeeded") return (onTask(earlier.id), await result(earlier));
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (!p) {
    beforeCall();
    const r = await fetchImpl("https://api.replicate.com/v1/predictions", {
      method: "POST", signal, headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ version: TRELLIS.version, input: { images: [`data:${mime};base64,${fs.readFileSync(file).toString("base64")}`], ...TRELLIS_INPUT } }),
    });
    if (!r.ok) throw Error("TRELLIS 送出失敗：Replicate " + r.status);
    p = await r.json();
    if (typeof p.id !== "string" || !p.id) throw Error("Replicate 沒有回傳預測編號");
  }
  onTask(p.id);
  while (["starting", "processing"].includes(p.status)) {
    onProgress(p.status === "processing" ? 50 : 10);
    await wait(pollMs, signal);
    p = await get(p.id);
  }
  if (p.status !== "succeeded") throw Error("TRELLIS 失敗：" + String(p.error || p.status).slice(0, 200));
  return result(p);
}

async function local({ job, file, env, signal, dataDir, onSpawn, beforeCall }) {
  const workdir = path.join(dataDir, "sf3d", job.id);
  fs.rmSync(workdir, { recursive: true, force: true });
  fs.mkdirSync(workdir, { recursive: true });
  try {
    const image = path.join(workdir, "input" + path.extname(file));
    fs.copyFileSync(file, image);
    beforeCall();
    const glb = await sf3dLocal.run({ file: image, workdir, env, signal, onSpawn });
    return { buffer: fs.readFileSync(glb), origin: { provider: "本機", model: "stable-fast-3d" } };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

// ctx: { env, fetchImpl, signal, mediaStore, localFile, dataDir, resumeId, persist, onProgress, onSpawn }.
async function run(job, ctx) {
  if (job.vendorCall) throw Error("此任務已呼叫過廠商，不會重送；請從歷史記錄重新送出");
  const input = job.input, id = input.settings.method, m = methodOf(input);
  const { file, mime } = imageFile(input, ctx.localFile, m);
  const beforeCall = () => {
    if (job.vendorCall) throw Error("此任務已呼叫過廠商，不會重送");
    job.vendorCall = { method: id, at: new Date().toISOString() };
    ctx.persist();
  };
  const onTask = (taskId) => {
    job.vendorTaskId = taskId;
    ctx.persist();
  };
  const download = async (url) => {
    const r = await ctx.fetchImpl(url, { signal: ctx.signal });
    if (!r.ok) throw Error("GLB 下載失敗：HTTP " + r.status);
    return capped(r, "GLB");
  };
  const pollMs = Number(vwEnv(ctx.env, "3D_POLL_MS")) || 5000;
  const args = { ...ctx, job, m, file, mime, input, beforeCall, onTask, download, pollMs };
  const made = m.local ? await local(args) : id === "replicate-trellis" ? await trellis(args) : id === "meshy" ? await meshy.run(args) : await stability(args);
  if (!isGlb(made.buffer)) throw Error(`${m.label}回傳的不是 GLB 模型`);
  const stored = await ctx.mediaStore.ingest({ buffer: made.buffer, ext: "glb", signal: ctx.signal });
  const parentAssetId = input.references.image.id, usd = usdOf(m);
  return {
    ...stored, kind: "model", type: "model/gltf-binary",
    origin: {
      kind: "ai_generated", method: id, ...(usd != null ? { costUsd: usd } : {}), ...made.origin, // an adapter's measured cost wins
      ...(typeof parentAssetId === "string" && parentAssetId ? { parentAssetId } : {}),
    },
  };
}
// Best effort when a job is cancelled: stops Replicate billing a prediction nobody will collect.
function cancel(job, { env, fetchImpl }) {
  if (job.input?.settings?.method === "replicate-trellis" && job.vendorTaskId) cancelPrediction({ id: job.vendorTaskId, env, fetchImpl });
}
module.exports = { METHODS, TRELLIS, capability, request, run, rateKey, claim, reuseKey, resumable, cancel, TIMEOUT_MS };

// Card P5 S4: image -> 3D through Meshy only (Rodin/Tripo/Hunyuan excluded). docs.meshy.ai, read 2026-11-03:
// POST /openapi/v1/image-to-3d {image_url (data: URI allowed, jpg/png/webp <= 20 MB), ai_model, should_texture,
// target_formats} -> {result: taskId}; GET /openapi/v1/image-to-3d/:id -> {status PENDING|IN_PROGRESS|SUCCEEDED|
// FAILED|CANCELED, progress 0-100, model_urls.glb, task_error}. Credits: meshy-7.1 mesh 20, mesh + texture 30
// (no USD per credit published), so the page shows credits, and the task's consumed_credits is recorded when present.
// No MESHY_API_KEY -> capability false (button disabled). Tests pass a fake fetchImpl; never a real call.
const fs = require("node:fs"), path = require("node:path");

const API = "https://api.meshy.ai/openapi/v1/image-to-3d";
const CREDITS = { mesh: 20, textured: 30 };
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const MAX_IMAGE = 20 * 1024 * 1024, MAX_GLB = 200 * 1024 * 1024;
const capability = (env) => ({ available: !!env.MESHY_API_KEY, credits: CREDITS });

function imageFile(input, localFile) {
  const file = localFile(input.references?.image?.url, { assets: true });
  const mime = file && MIME[path.extname(file).slice(1).toLowerCase()];
  if (!mime || !fs.existsSync(file)) throw Object.assign(Error("請選一張素材庫中的 PNG、JPEG 或 WebP 圖片"), { status: 400 });
  if (fs.statSync(file).size > MAX_IMAGE) throw Object.assign(Error("圖片超過 20 MB"), { status: 400 });
  return { file, mime };
}
function request(input, { env, localFile }) {
  if (!env.MESHY_API_KEY) throw Object.assign(Error("Meshy 金鑰未設定"), { status: 503 });
  imageFile(input, localFile);
  return { type: "model" };
}
async function call(fetchImpl, env, url, init = {}, signal) {
  const response = await fetchImpl(url, { ...init, signal, headers: { Authorization: "Bearer " + env.MESHY_API_KEY, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!response.ok) throw Error(`Meshy 回應 ${response.status}：${body.message || text.slice(0, 200)}`);
  return body;
}
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(Error("已取消"))), { once: true });
  });

// Everything sent to Meshy besides the image; api.cjs reuses an earlier task only when these match too.
const options = (input) => ({ ai_model: "latest", should_texture: input?.settings?.texture !== false, target_formats: ["glb"] });
// onTask(id) persists the Meshy task id at once: a cancelled or restarted job resumes that task instead of paying again.
async function run(job, { env, fetchImpl, signal, mediaStore, localFile, resumeId, onTask, onProgress, pollMs = 5000 }) {
  let taskId = resumeId;
  if (!taskId) {
    const { file, mime } = imageFile(job.input, localFile);
    const created = await call(fetchImpl, env, API, {
      method: "POST",
      body: JSON.stringify({ image_url: `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`, ...options(job.input) }),
    }, signal);
    taskId = created.result;
    if (typeof taskId !== "string" || !taskId) throw Error("Meshy 沒有回傳任務編號");
  }
  onTask(taskId);
  let task;
  for (;;) {
    task = await call(fetchImpl, env, API + "/" + encodeURIComponent(taskId), {}, signal);
    if (Number.isFinite(task.progress)) onProgress(Math.min(95, Math.round(task.progress * 0.95)));
    if (task.status === "SUCCEEDED") break;
    if (task.status === "FAILED" || task.status === "CANCELED") throw Error(`Meshy 任務${task.status === "FAILED" ? "失敗" : "已被取消"}：${task.task_error?.message || task.status}`);
    await wait(pollMs, signal);
  }
  const url = task.model_urls?.glb;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) throw Error("Meshy 沒有回傳 GLB 網址");
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw Error("GLB 下載失敗：HTTP " + response.status);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_GLB) throw Error("GLB 超過 200 MB");
  const stored = await mediaStore.ingest({ buffer, ext: "glb", signal });
  const parentAssetId = job.input.references.image.id;
  return {
    ...stored, kind: "model", type: "model/gltf-binary",
    origin: {
      kind: "ai_generated", provider: "Meshy", model: task.ai_model || "latest", taskId,
      credits: Number.isFinite(task.consumed_credits) ? task.consumed_credits : null,
      ...(typeof parentAssetId === "string" && parentAssetId ? { parentAssetId } : {}),
    },
  };
}
module.exports = { capability, request, run, options, API, CREDITS };

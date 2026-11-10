// Card P5 S4 adapter, disabled by S4b (operating entity reported in Beijing, docs/s4-image-to-3d-providers-20261103.md §1):
// kept for backend/image-to-3d.cjs, listed only when MESHY_API_KEY is set, never a default. docs.meshy.ai, read 2026-11-03:
// POST /openapi/v1/image-to-3d {image_url (data: URI allowed, jpg/png/webp <= 20 MB), ai_model, should_texture,
// target_formats} -> {result: taskId}; GET /openapi/v1/image-to-3d/:id -> {status PENDING|IN_PROGRESS|SUCCEEDED|
// FAILED|CANCELED, progress 0-100, model_urls.glb, task_error}. Credits: mesh 20, mesh + texture 30 (no USD per credit
// published), so the page shows credits, and the task's consumed_credits is recorded when present.
const fs = require("node:fs");

const API = "https://api.meshy.ai/openapi/v1/image-to-3d";
const CREDITS = { mesh: 20, textured: 30 };

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

// Everything sent to Meshy besides the image: an earlier task is reused only when these match too.
const options = (input) => ({ ai_model: "latest", should_texture: input?.settings?.texture !== false, target_formats: ["glb"] });
// ctx from image-to-3d.cjs: beforeCall() records the one paid call of this job; onTask(id) persists the task id at once,
// so a cancelled or restarted job's task is resumed by the next job for the same image instead of paying again.
async function run({ file, mime, input, env, fetchImpl, signal, resumeId, beforeCall, onTask, onProgress, pollMs, download }) {
  let taskId = resumeId;
  if (!taskId) {
    beforeCall();
    const created = await call(fetchImpl, env, API, {
      method: "POST",
      body: JSON.stringify({ image_url: `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`, ...options(input) }),
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
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, pollMs);
      signal?.addEventListener("abort", () => (clearTimeout(t), reject(Error("已取消"))), { once: true });
    });
  }
  const url = task.model_urls?.glb;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) throw Error("Meshy 沒有回傳 GLB 網址");
  return {
    buffer: await download(url),
    origin: { provider: "Meshy", model: task.ai_model || "latest", taskId, credits: Number.isFinite(task.consumed_credits) ? task.consumed_credits : null },
  };
}
module.exports = { run, options, API, CREDITS };

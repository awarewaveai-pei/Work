// Remotion title templates (card P1), run as the job operation "remotion-template" through /generations.
// Transport mirrors next-admin lib/content/video/remotion-client.ts submitRemotion (:14) and pollRemotion (:48):
// same paths, body shape, X-Render-Token header and timeouts. It is not imported because it imports
// "./renderer-auth" without an extension, which Node's loader refuses (ERR_MODULE_NOT_FOUND); renderer-auth.ts has
// no imports, so it is import()ed and stays the one place that names the token variables.
const path = require("node:path"),
  { pathToFileURL } = require("node:url");
// Every id must exist in ../remotion-service/src/server.ts TEMPLATE_MAP (tests/remotion-template.cjs reads it).
// Text fields only, plus the background image both templates require (sent as a data: URI: the service cannot
// reach this laptop's urls).
const catalog = [
  {
    id: "scale-bg-text-slideup",
    label: "背景放大＋標題上滑",
    fields: [{ key: "text", label: "標題", max: 80, required: true }],
    image: { key: "imageUrl", label: "背景圖" },
  },
  {
    id: "circle-mask-text-slideup-reveal",
    label: "圓形揭露＋品牌標語",
    fields: [
      { key: "headline", label: "主標題", max: 80, required: true },
      { key: "brand", label: "品牌名稱", max: 40 },
      { key: "tagline", label: "標語", max: 80 },
    ],
    image: { key: "imageUrl", label: "背景圖" },
  },
];
const SECONDS = 5,
  POLL_MS = 2000,
  POLL_LIMIT_MS = 10 * 60 * 1000,
  MAX_BODY = 3.5 * 1024 * 1024,
  MAX_DOWNLOAD = 300 * 1024 * 1024;
const formats = { "16:9": ["16x9", 1920, 1080], "9:16": ["9x16", 1080, 1920], "4:5": ["4x5", 1080, 1350], "1:1": ["1x1", 1080, 1080] };
const fail = (message, status) => Object.assign(Error(message), status ? { status } : {});

const authModules = new Map();
async function resolveAuth(env, appDir) {
  if (!authModules.has(appDir))
    authModules.set(appDir, import(pathToFileURL(path.join(appDir, "lib/content/video/renderer-auth.ts")).href).catch(() => null));
  const mod = await authModules.get(appDir);
  return mod ? mod.resolveRendererAuth("remotion", env) : { ok: false };
}
// REMOTION_SERVICE_URL only: unset = not configured (never a silent 127.0.0.1:8733 default).
const baseUrl = (env) => String(env.REMOTION_SERVICE_URL || "").trim().replace(/\/+$/, "");
async function configured(env, appDir) {
  return !!baseUrl(env) && (await resolveAuth(env, appDir)).ok === true;
}

// Checks and builds the POST /render body before the job is accepted. imageData(url) -> data: URI of a local asset.
function request(input, imageData) {
  const s = input.settings || {},
    template = catalog.find((t) => t.id === s.templateId);
  if (!template) throw fail("片頭模板不存在", 400);
  const format = formats[s.ratio];
  if (!format) throw fail("片頭模板只支援 16:9、9:16、4:5、1:1 比例", 400);
  const fps = Number(s.fps);
  if (![24, 25, 30, 60].includes(fps)) throw fail("片頭模板只支援 24、25、30、60 fps；請先調整專案影格率", 400);
  const props = {};
  for (const field of template.fields) {
    const value = typeof s.fields?.[field.key] === "string" ? s.fields[field.key].trim() : "";
    if (field.required && !value) throw fail("請填寫「" + field.label + "」", 400);
    if (value.length > field.max) throw fail("「" + field.label + "」最多 " + field.max + " 字", 400);
    if (value) props[field.key] = value;
  }
  const image = input.references?.image;
  if (!image?.url) throw fail("請從素材庫選一張「" + template.image.label + "」", 400);
  props[template.image.key] = imageData(image.url);
  const body = { templateId: template.id, props, outputFormat: format[0], fps, durationInFrames: SECONDS * fps };
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY)
    throw fail("背景圖太大（送出內容超過 3.5 MB），請選較小的圖片", 413);
  return { body, expect: { duration: SECONDS, fps, width: format[1], height: format[2] } };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}
const within = (signal, ms) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);

// Submits, polls every 2 s up to 10 min, downloads the finished file. Returns the mp4 bytes.
async function render(input, { env, appDir, fetchImpl, signal, imageData, onRemoteJob }) {
  const auth = await resolveAuth(env, appDir),
    base = baseUrl(env);
  if (!base || !auth.ok) throw fail("片頭模板服務未設定", 503);
  const { body } = request(input, imageData);
  let r, reply;
  try {
    r = await fetchImpl(base + "/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      body: JSON.stringify(body),
      signal: within(signal, 30000),
    });
    reply = await r.json().catch(() => ({}));
  } catch (e) {
    if (signal.aborted) throw e;
    throw fail("無法連線到片頭模板服務");
  }
  if (!r.ok || typeof reply.jobId !== "string" || !reply.jobId)
    throw fail("片頭模板服務拒絕請求（HTTP " + r.status + "）" + (typeof reply.error === "string" ? "：" + reply.error.slice(0, 200) : ""));
  onRemoteJob(reply.jobId);
  const deadline = Date.now() + POLL_LIMIT_MS;
  let url;
  for (;;) {
    await sleep(POLL_MS, signal);
    if (Date.now() > deadline) throw fail("片頭模板渲染逾時（超過 10 分鐘）");
    let status;
    try {
      const s = await fetchImpl(base + "/status/" + encodeURIComponent(reply.jobId), { headers: auth.headers, signal: within(signal, 15000) });
      if (s.status === 404) throw fail("片頭模板服務找不到此任務（服務可能已重新啟動），請重試");
      status = await s.json().catch(() => ({}));
    } catch (e) {
      if (signal.aborted || String(e.message).startsWith("片頭")) throw e;
      continue; // transient network error: poll again, as pollRemotion does
    }
    if (status.status === "error") throw fail("片頭模板渲染失敗：" + String(status.error || "未知原因").slice(0, 200));
    if (status.status === "done") {
      if (typeof status.url !== "string" || !/^https:\/\//.test(status.url)) throw fail("片頭模板渲染完成，但沒有可下載的網址");
      url = status.url;
      break;
    }
  }
  let file;
  try {
    file = await fetchImpl(url, { signal: within(signal, 120000) });
  } catch (e) {
    if (signal.aborted) throw e;
    throw fail("片頭影片下載失敗");
  }
  if (!file.ok) throw fail("片頭影片下載失敗（HTTP " + file.status + "）");
  if (Number(file.headers?.get?.("content-length")) > MAX_DOWNLOAD) throw fail("片頭影片檔案過大");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_DOWNLOAD) throw fail("片頭影片檔案大小無效");
  return buffer;
}

const publicCatalog = catalog.map(({ id, label, fields, image }) => ({ id, label, fields, image: { label: image.label } }));
module.exports = { catalog, publicCatalog, configured, request, render, SECONDS };

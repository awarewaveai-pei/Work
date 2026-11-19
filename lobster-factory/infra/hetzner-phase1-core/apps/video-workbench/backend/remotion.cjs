// Remotion title templates (card P1), run as the job operation "remotion-template" through /generations.
// Transport mirrors next-admin lib/content/video/remotion-client.ts submitRemotion (:14) and pollRemotion (:48):
// same paths, body shape, X-Render-Token header and timeouts. It is not imported because it imports
// "./renderer-auth" without an extension, which Node's loader refuses (ERR_MODULE_NOT_FOUND); renderer-auth.ts has
// no imports, so it is import()ed and stays the one place that names the token variables.
const path = require("node:path"),
  { pathToFileURL } = require("node:url");
// Every id must exist in ../remotion-service/src/app.ts TEMPLATE_MAP (tests/remotion-template.cjs reads it).
// One field table per template; the editor's 片頭 form is generated from it (scripts/editor-panes/text.js), so a field is
// declared once, here. field.key = the composition prop name (and, for image/audio, the key of input.references).
//   type "text" (default): max chars, required, multiline | "number": integer min..max | "color": #rrggbb
//   type "image"/"audio": picked from the local library and sent as a data: URI (the service cannot reach this
//   laptop's urls). Optional unless required.
// seconds = the length range; a template whose scenes start at fixed times (pan, photo) cannot go below its natural length.
const logo = { key: "logoUrl", label: "Logo", type: "image" },
  music = { key: "audioUrl", label: "背景音樂", type: "audio" },
  scene = (n) => [
    { key: "imageUrl" + n, label: "場景 " + n + " 圖片", type: "image", required: true },
    { key: "text" + n, label: "場景 " + n + " 文字", max: 20, required: true },
  ];
const catalog = [
  {
    id: "scale-bg-text-slideup",
    label: "背景放大＋標題上滑",
    seconds: { min: 3, def: 5, max: 30 },
    fields: [{ key: "imageUrl", label: "背景圖", type: "image", required: true }, { key: "text", label: "標題", max: 80, required: true }, logo, music],
  },
  {
    id: "circle-mask-text-slideup-reveal",
    label: "圓形揭露＋品牌標語",
    seconds: { min: 10, def: 20, max: 30 },
    fields: [
      { key: "imageUrl", label: "背景圖", type: "image", required: true },
      { key: "headline", label: "主標題", max: 80, required: true },
      { key: "brand", label: "品牌名稱", max: 40 },
      { key: "tagline", label: "標語", max: 80 },
      logo,
      music,
    ],
  },
  {
    id: "pan-slide-text-left-3scenes",
    label: "三場景平移＋文字",
    seconds: { min: 20, def: 20, max: 30 },
    fields: [...scene(1), ...scene(2), ...scene(3), logo, music],
  },
  {
    id: "product-review-typewriter",
    label: "產品評論打字機",
    seconds: { min: 8, def: 10, max: 30 },
    fields: [
      { key: "backgroundImageUrl", label: "背景圖片", type: "image", required: true },
      { key: "productImageUrl", label: "產品圖片", type: "image", required: true },
      { key: "profileImageUrl", label: "評論人大頭照", type: "image" },
      { key: "reviewerName", label: "評論人姓名", max: 20, required: true },
      { key: "reviewDate", label: "日期", max: 20, required: true },
      { key: "reviewText", label: "評論內容", max: 80, required: true, multiline: true },
      { key: "starCount", label: "星星數（1–5）", type: "number", min: 1, max: 5 },
      logo,
      music,
    ],
  },
  {
    id: "photo-highlights-slides-zoom",
    label: "相片精選幻燈片",
    seconds: { min: 22, def: 22, max: 30 },
    fields: [
      ...[1, 2, 3].flatMap((n) => [
        { key: "imageUrl" + n, label: "相片 " + n, type: "image", required: true },
        { key: "text" + n, label: "相片 " + n + " 說明", max: 20, required: true },
      ]),
      logo,
      { key: "backgroundColor", label: "主題色（#rrggbb）", type: "color" },
      music,
    ],
  },
];
const POLL_MS = 2000,
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

// Checks and builds the POST /render body before the job is accepted. mediaData(url, type) -> data: URI of a local
// image/audio asset.
function request(input, mediaData) {
  const s = input.settings || {},
    template = catalog.find((t) => t.id === s.templateId);
  if (!template) throw fail("片頭模板不存在", 400);
  const format = formats[s.ratio];
  if (!format) throw fail("片頭模板只支援 16:9、9:16、4:5、1:1 比例", 400);
  const fps = Number(s.fps);
  if (![24, 25, 30, 60].includes(fps)) throw fail("片頭模板只支援 24、25、30、60 fps；請先調整專案影格率", 400);
  const { min, def, max } = template.seconds,
    seconds = s.seconds === undefined ? def : Number(s.seconds);
  if (!Number.isInteger(seconds) || seconds < min || seconds > max) throw fail("片頭長度需為 " + min + "–" + max + " 秒的整數", 400);
  const props = {};
  for (const field of template.fields) {
    if (field.type === "image" || field.type === "audio") {
      const ref = input.references?.[field.key];
      if (!ref?.url) {
        if (field.required) throw fail("請從素材庫選「" + field.label + "」", 400);
        continue;
      }
      props[field.key] = mediaData(ref.url, field.type);
      continue;
    }
    const value = typeof s.fields?.[field.key] === "string" ? s.fields[field.key].trim() : "";
    if (!value) {
      if (field.required) throw fail("請填寫「" + field.label + "」", 400);
      continue;
    }
    if (field.type === "number") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < field.min || n > field.max) throw fail("「" + field.label + "」需為 " + field.min + "–" + field.max + " 的整數", 400);
      props[field.key] = n;
    } else if (field.type === "color") {
      if (!/^#[\da-f]{6}$/i.test(value)) throw fail("「" + field.label + "」格式為 #rrggbb", 400);
      props[field.key] = value;
    } else {
      if (value.length > field.max) throw fail("「" + field.label + "」最多 " + field.max + " 字", 400);
      props[field.key] = value;
    }
  }
  const body = { templateId: template.id, props, outputFormat: format[0], fps, durationInFrames: seconds * fps };
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY)
    throw fail("圖片與音樂太大（送出內容超過 3.5 MB），請選較小的檔案", 413);
  return { body, expect: { duration: seconds, fps, width: format[1], height: format[2], audio: "audioUrl" in props, audible: "audioUrl" in props } };
}
// The first picked image is the title's parent asset (lineage); null when the template picked none.
const parentAssetId = (input) => {
  for (const field of catalog.find((t) => t.id === input.settings?.templateId)?.fields || [])
    if (field.type === "image" && typeof input.references?.[field.key]?.id === "string") return input.references[field.key].id;
  return null;
};

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}
const within = (signal, ms) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);

// Submits, polls every 2 s up to 10 min, downloads the finished file. Returns the mp4 bytes.
async function render(input, { env, appDir, fetchImpl, signal, mediaData, onRemoteJob }) {
  return transport(request(input, mediaData).body, { env, appDir, fetchImpl, signal, onRemoteJob });
}

// Card R1: the cover (封面) template, one JPEG still (remotion-service src/compositions/Cover.tsx). Same ratio table as
// the title templates; the frame goes as a data: URI like every picture this service gets.
const COVER_MAX_DOWNLOAD = 10 * 1024 * 1024;
/** The format key for a video of width x height (within 1 %); null = the cover template has no layout for it. */
function coverRatio(width, height) {
  for (const [ratio, [, w, h]] of Object.entries(formats)) if (width > 0 && height > 0 && Math.abs(width / height / (w / h) - 1) <= 0.01) return ratio;
  return null;
}
/** The POST /render body of one cover; frame = JPEG bytes of the picture (no title). */
function coverRequest({ frame, title, subtitle, width, height }) {
  const ratio = coverRatio(width, height);
  if (!ratio) throw fail("封面模板不支援這個畫面比例（" + width + "x" + height + "）");
  const text = String(title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) throw fail("封面模板需要標題");
  const props = { backgroundUrl: "data:image/jpeg;base64," + Buffer.from(frame).toString("base64"), title: text };
  const sub = String(subtitle || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (sub) props.subtitle = sub;
  const body = { templateId: "cover", props, outputFormat: formats[ratio][0], fps: 30, durationInFrames: 1 };
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY) throw fail("封面畫格太大（送出內容超過 3.5 MB）");
  return body;
}
/** One cover still: the JPEG bytes at the ratio's render size (the caller scales it to the video's own size). */
async function coverStill(cover, { env, appDir, fetchImpl, signal, pollMs }) {
  return transport(coverRequest(cover), { env, appDir, fetchImpl, signal, pollMs, maxBytes: COVER_MAX_DOWNLOAD, noun: "封面", fileWord: "圖片" });
}

// POST /render, poll /status, download the result. `noun` names the thing in every error ("片頭" / "封面").
async function transport(body, { env, appDir, fetchImpl, signal, onRemoteJob = () => {}, pollMs = POLL_MS, maxBytes = MAX_DOWNLOAD, noun = "片頭", fileWord = "影片" }) {
  const auth = await resolveAuth(env, appDir),
    base = baseUrl(env);
  if (!base || !auth.ok) throw fail(noun + "模板服務未設定", 503);
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
    throw fail("無法連線到" + noun + "模板服務");
  }
  if (!r.ok || typeof reply.jobId !== "string" || !reply.jobId)
    throw fail(noun + "模板服務拒絕請求（HTTP " + r.status + "）" + (typeof reply.error === "string" ? "：" + reply.error.slice(0, 200) : ""));
  onRemoteJob(reply.jobId);
  const deadline = Date.now() + POLL_LIMIT_MS;
  let url;
  for (;;) {
    await sleep(pollMs, signal);
    if (Date.now() > deadline) throw fail(noun + "模板渲染逾時（超過 10 分鐘）");
    let status;
    try {
      const s = await fetchImpl(base + "/status/" + encodeURIComponent(reply.jobId), { headers: auth.headers, signal: within(signal, 15000) });
      if (s.status === 404) throw fail(noun + "模板服務找不到此任務（服務可能已重新啟動），請重試");
      status = await s.json().catch(() => ({}));
    } catch (e) {
      if (signal.aborted || String(e.message).startsWith(noun)) throw e;
      continue; // transient network error: poll again, as pollRemotion does
    }
    if (status.status === "error") throw fail(noun + "模板渲染失敗：" + String(status.error || "未知原因").slice(0, 200));
    if (status.status === "done") {
      if (typeof status.url !== "string" || !/^https:\/\//.test(status.url)) throw fail(noun + "模板渲染完成，但沒有可下載的網址");
      url = status.url;
      break;
    }
  }
  let file;
  try {
    file = await fetchImpl(url, { signal: within(signal, 120000) });
  } catch (e) {
    if (signal.aborted) throw e;
    throw fail(noun + fileWord + "下載失敗");
  }
  if (!file.ok) throw fail(noun + fileWord + "下載失敗（HTTP " + file.status + "）");
  if (Number(file.headers?.get?.("content-length")) > maxBytes) throw fail(noun + fileWord + "檔案過大");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) throw fail(noun + fileWord + "檔案大小無效");
  return buffer;
}

module.exports = { catalog, configured, request, parentAssetId, render, coverRatio, coverRequest, coverStill };

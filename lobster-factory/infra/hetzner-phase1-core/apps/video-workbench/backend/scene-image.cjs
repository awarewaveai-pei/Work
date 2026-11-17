// Card U4.4: a shot's picture drawn by one of next-admin's video scene models (public/editor-shared/image-models.js
// VIDEO_SCENE_MODELS: FLUX, Ideogram, Google, OpenAI), a vendor like quick-render.cjs. Vendor = next-admin
// /api/internal/video/workbench/scene-image (buildSceneAsset, billed there to this org); the picture is downloaded into the
// media store and settle() registers it with the origin next-admin answered (the model that actually ran), never one the
// page sent. A project-shot job without settings.imageModel is the workbench's own picture (generation-policy.cjs) and
// never comes here. No reference pictures: the shot card says so when the shot has some.
// Invariant: one paid picture per job, never lost after next-admin charged it. The call is not cancellable (next-admin
// runs it to the end and bills; api.cjs refuses a cancel while it runs); its answer is kept on the job (job.finishing)
// before anything local can fail, and a retry of that job takes the kept picture instead of drawing (and paying) again.
const path = require("node:path");
const { fail, refusal, download } = require("./main-route-vendor.cjs");
const source = require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const catalog = require(path.join(source, "public/editor-shared/image-models.js"));

const ROUTE = "/api/internal/video/workbench/scene-image",
  TIMEOUT_MS = 290000, // buildSceneAsset waits on the vendor (Replicate / OpenAI / Google) up to ~280 s
  MAX_DOWNLOAD = 20 * 1024 * 1024;
const RATIOS = { "16:9": "16x9", "9:16": "9x16", "4:5": "4x5" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The buttons: catalog rows of each group, priced from the catalog (usd per picture; token- or megapixel-billed rows are
// an estimate). Pages read this from /capabilities sceneImage and never keep a list of their own.
function capability(main) {
  const rows = new Map(catalog.IMAGE_MODELS.map((m) => [m.value, m]));
  return {
    available: !!main,
    ratios: Object.keys(RATIOS),
    groups: Object.entries(catalog.VIDEO_SCENE_MODELS).map(([group, ids]) => ({
      group,
      models: ids.filter((id) => rows.has(id)).map((id) => {
        const m = rows.get(id);
        return { id, label: m.label, note: m.note || "", usd: m.usd, estimate: m.vendor === "OpenAI" || !!(m.usdPerInputMp || m.usdPerOutputMp) };
      }),
    })),
  };
}

const modelOf = (input) => input?.operation === "project-shot" && typeof input?.settings?.imageModel === "string" && input.settings.imageModel ? input.settings.imageModel : null;
const known = (id) => Object.values(catalog.VIDEO_SCENE_MODELS).some((ids) => ids.includes(id));

// Checked before the job is accepted: the body next-admin gets. main = null (local mode) refuses.
function request(input, main) {
  if (!main) throw fail("這個生圖模型需要連上主系統", 503);
  const imageModel = modelOf(input);
  if (!known(imageModel)) throw fail("生圖模型無效", 400);
  const ratio = RATIOS[input.ratio ?? input.settings?.ratio];
  if (!ratio) throw fail("這個生圖模型只支援 16:9、9:16、4:5", 400);
  const refs = input.references, images = Array.isArray(refs) ? refs : Object.values(refs || {}).flat();
  if (images.length) throw fail("這個生圖模型不使用參考圖", 400); // nothing unused may be recorded as the picture's source
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt || prompt.length > 4000) throw fail("畫面描述要有 1 到 4000 字", 400);
  return { prompt, imageModel, ratio };
}

const extOf = (b) =>
  b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png"
  : b[0] === 255 && b[1] === 216 && b[2] === 255 ? "jpg"
  : b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" ? "webp"
  : null;

// A kept answer (job.finishing) of the same model, from this job or the one it retries.
const kept = (job) => (job?.finishing?.kind === "scene-image" && job.finishing.origin?.model === modelOf(job.input) ? job.finishing : null);

// onPaid(finishing): called once next-admin answered (charged), before the download; the caller persists it.
async function run(job, { main, fetchImpl, mediaStore, signal, onPaid = () => {} }) {
  const asked = request(job.input, main);
  let paid = kept(job);
  if (!paid) {
    const body = { organizationId: main.organizationId(), ...asked, ...(UUID.test(String(job.createdBy || "")) ? { userId: job.createdBy } : {}) };
    const r = await main.call(ROUTE, { method: "POST", body, timeoutMs: TIMEOUT_MS }); // no job signal: not cancellable
    if (!r.ok || r.value.ok !== true) throw refusal("主系統無法生成畫面", r);
    const { url, origin, costUsd } = r.value;
    if (!/^https:\/\//.test(String(url || "")) || origin?.kind !== "ai_generated" || origin.model !== asked.imageModel) throw fail("主系統回的畫面與所選模型不符");
    paid = { kind: "scene-image", url: String(url), origin: { kind: "ai_generated", model: String(origin.model), provider: String(origin.provider || "") }, costUsd: Number.isFinite(costUsd) ? costUsd : 0 };
    onPaid(paid);
  }
  const { url, origin, costUsd } = paid;
  let buffer;
  for (let attempt = 1; ; attempt++) {
    try {
      buffer = await download(url, { fetchImpl, signal, max: MAX_DOWNLOAD, what: "生成的畫面" });
      break;
    } catch (e) {
      if (signal.aborted || attempt >= 3) throw fail(e.message + "（畫面已生成並計費；按「以相同設定重試」會直接取回，不再收費）");
    }
  }
  const ext = extOf(buffer);
  if (!ext) throw fail("生成的畫面格式不正確");
  const stored = await mediaStore.ingest({ buffer, ext, signal });
  return {
    url: stored.url, previewUrl: stored.previewUrl, thumbUrl: stored.thumbUrl,
    origin: { ...origin, costUsd, jobId: job.id },
  };
}

module.exports = { capability, modelOf, kept, request, run, ROUTE };

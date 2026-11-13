const { vwEnv } = require("./env-compat.cjs");
const imageOutputs = Object.fromEntries([["1K", 1024], ["2K", 2048], ["4K", 4096]].map(([quality, size]) => [quality, { "1:1": [size, size], "16:9": [size, size * 9 / 16], "9:16": [size * 9 / 16, size], "4:5": [Math.round(size / 10) * 8, Math.round(size / 10) * 10], "4:3": [size, size * 3 / 4] }]));
// The one place that names the provider and models: capabilities shows them, backend/api.cjs calls them and
// writes them into each result's origin, so the origin always names the model that actually ran.
const provider = "OpenAI";
// USD per run shown on the button before the click and charged after it: read from next-admin's cost SSOT
// (lib/ai/cost-model.ts TOOL_RATES, Node type stripping), never copied here.
const { TOOL_RATES, VIDEO_MOTION_RATES, GEMINI_VIDEO_RATES, TWD_RATE } = require(require("node:path").join(require("./appearance.cjs").resolveSource(require("node:path").join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
const replicateVideo = require("./replicate-video.cjs");
const geminiVideo = require("./gemini-video.cjs");
const providers = require("./providers.cjs");
const { videoUsd } = require("./provider-cost.cjs");
const speech = require("./speech.cjs");
const toolCosts = Object.freeze({ removeBackground: TOOL_RATES["bg-remove"].usd });
const models = (env) => ({ image: vwEnv(env, "IMAGE_MODEL") || "gpt-image-2.5-flare", video: videoModels(env)[0].id, audio: speech.defaultModel(env).id });
// Video models the vendor shut down (OpenAI GET /v1/models/sora-2: shutdown_date 2026-09-24). A saved setting or an
// old job naming one runs the default; the page says so once (shared/models.js replaceRetired).
const RETIRED_VIDEO_MODELS = Object.freeze({ "sora-2": "Sora 2", "sora-2-pro": "Sora 2 Pro" });
// One line per video model under its button, for someone choosing for the first time (operator 2026-11-10: 「當作使用者是第一次使用」).
// The 聲音 setting picks between the two kinds: 有聲 = a model with sound, 靜音 = one without (scripts/index-0.js).
const VIDEO_NOTES = Object.freeze({
  "gemini-omni-1.2-flash": "預設。影片自帶現場聲音（關不掉），比較便宜。會自己分成幾個鏡頭；要一個鏡頭拍到底，請在描述寫「一鏡到底，不要切鏡頭」。",
  "veo-3-1-fast": "沒有聲音。要配自己的旁白或音樂時用：把聲音選「靜音」就會自動換成它。",
  "veo-3-1": "沒有聲音。Veo 3.1 Fast 的完整版，價格是兩倍。",
  "runway-gen4-turbo": "沒有聲音。最便宜，但一定要放一張圖當第一格畫面。",
  "luma-ray-3-2": "沒有聲音。只能做 5 秒。",
});
// Video vendor modules by job.video.provider (each: token, create, status, download, cancel); null = none (an old Sora job).
const VIDEO_VENDORS = Object.freeze({ Google: geminiVideo, Replicate: replicateVideo });
const videoVendor = (provider) => (Object.hasOwn(VIDEO_VENDORS, provider) ? VIDEO_VENDORS[provider] : null);
// Video models a job can pick (card RV): Gemini (cheapest per second with audio, vendor-alternatives-20261110.md), then
// next-admin's Replicate models (lib/ai/video-motion-models.ts) with Veo 3.1 Fast first, so providers.choose falls back to it
// when there is no Gemini key. VW_VIDEO_MODEL names the default when it can run. The default comes first in the list.
// usdPerSec = the button price (provider-cost.cjs videoUsd, the same function the charge uses). estimate = billed by the
// finished run's token usage (GEMINI_VIDEO_RATES), so the button price is only an estimate: pages put 約 before it.
function videoModels(env) {
  const row = (id, m, extra) => ({ id, durations: [...m.durations], defaultDurationSec: m.defaultDurationSec, ratios: [...m.ratios], requiresImage: m.requiresImage, audio: m.audio, note: VIDEO_NOTES[id] || "", usdPerSec: videoUsd(id, 1), estimate: Object.hasOwn(GEMINI_VIDEO_RATES, id), free: false, ...extra });
  const rows = [
    ...Object.entries(geminiVideo.MODELS).map(([id, m]) => row(id, m, { label: GEMINI_VIDEO_RATES[id].label, vendor: "Google", provider: "Google", model: id, keyName: "GEMINI_API_KEY", available: !!env.GEMINI_API_KEY })),
    ...Object.entries(replicateVideo.MOTION_MODELS).sort(([a], [b]) => (b === "veo-3-1-fast") - (a === "veo-3-1-fast")).map(([id, m]) =>
      row(id, m, { label: VIDEO_MOTION_RATES[id].label, vendor: VIDEO_MOTION_RATES[id].vendor, provider: "Replicate", model: m.slug, keyName: "REPLICATE_API_TOKEN", available: !!env.REPLICATE_API_TOKEN })),
  ];
  const first = providers.choose(rows, vwEnv(env, "VIDEO_MODEL"));
  return [first, ...rows.filter((r) => r !== first)].map(({ free, ...m }) => m);
}
// The model a video job runs: a known id, else the default (sora-2, an old project's "VideoWorkbench V3", no value).
function videoModelOf(input, env) {
  const list = videoModels(env), id = input?.settings?.model ?? input?.model;
  return list.find((m) => m.id === id) || list[0];
}
function capabilities(env, localTools) {
  return {
    image: !!env.OPENAI_API_KEY, text: !!env.OPENAI_API_KEY,
    audio: speech.capability(env).models.some((m) => m.available), video: videoModels(env).some((m) => m.available),
    // The live speech models with voices and prices (backend/speech.cjs); pages draw them as buttons.
    speech: speech.capability(env),
    provider,
    models: models(env),
    videoModels: videoModels(env), retiredVideoModels: RETIRED_VIDEO_MODELS,
    // Top-level video limits = the default model; per-model limits are in videoModels.
    videoDurations: videoModels(env)[0].durations, videoRatios: videoModels(env)[0].ratios, videoQualities: ["720p"],
    maxVideoImages: 1, maxImageReferences: 4, multiModalReferences: false,
    imageQualities: Object.keys(imageOutputs), imageOutputs, imageExactOutput: true,
    removeBackground: !!env.REPLICATE_API_TOKEN, toolCosts,
    // Pages show prices in NT$ at next-admin's one rate (image-models.js TWD_RATE); prices stay USD everywhere else.
    twdRate: TWD_RATE,
    motionReference: false, subtitles: false, generationWatermark: false,
    spokespersonVideo: false, reshoot: false, advancedMedia: false, localTools,
  };
}
function validate(input, type, env = process.env) {
  const settings = input.settings || {};
  const refs = Array.isArray(input.references) ? input.references : Object.values(input.references || {}).flat();
  if (type === "image" && refs.length > 4) throw Error("目前圖片服務最多接受 4 張參考圖；請移除多餘圖片。");
  if (type === "image" && settings.imageLayout) {
    if (settings.imageLayout === "region-preserve" && input.operation !== "region") throw Error("圖片編輯輸出設定無效");
    imageDimensions(settings);
  }
  if (type !== "video") return;
  if (input.referenceMode === "first" && !input.references?.firstFrame?.length) throw Error("首尾幀參考必須先選擇首幀。");
  if (input.referenceMode === "motion") throw Error("動作參考需要專用服務，尚未接入。");
  if (input.references?.lastFrame?.length) throw Error("尾幀控制需要專用服務，尚未接入。");
  if (refs.some((r) => /^(audio|video)\//.test(r?.type || "") || ["audio", "video"].includes(r?.kind))) throw Error("目前影片服務僅支援圖片參考，影片／音訊參考需要專用服務。");
  if (refs.length > 1) throw Error("目前影片服務僅支援單張參考圖，請移除其他圖片。");
  const vm = videoModelOf(input, env), seconds = Number(input.duration || settings.duration || 8), ratio = settings.ratio || input.ratio || "16:9";
  if (!vm.durations.includes(seconds)) throw Error(vm.label + " 支援 " + vm.durations.join("、") + " 秒；請調整影片長度後送出。");
  if (!vm.ratios.includes(ratio)) throw Error("目前影片服務支援 16:9 或 9:16");
  if (vm.requiresImage && !refs.length) throw Error(vm.label + " 需要一張參考圖當第一格畫面；請先加入圖片。");
  if (settings.quality && settings.quality !== "720p") throw Error("目前影片服務只支援 720p");
  if (settings.subtitle === "開") throw Error("字幕燒錄服務尚未接入，請先關閉自動字幕。");
  // A saved 有聲 with a silent model is an old draft (before 2026-11-10 the setting did nothing): it runs as it always did.
  if (settings.audio === "靜音" && vm.audio) throw Error(vm.label + " 一定有聲音；要無聲影片，請把模型換成沒有聲音的（例如 Veo 3.1 Fast）。");
  if (settings.watermark && settings.watermark !== "不套用") throw Error("生成服務尚未支援浮水印；請在影片完成後使用浮水印工具。");
}
function imageDimensions(settings) {
  if (settings.imageLayout === 'region-preserve') {
    const width = Number(settings.regionWidth), height = Number(settings.regionHeight), edge = { '1K': 1024, '2K': 2048, '4K': 4096 }[settings.quality];
    if (!edge || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384) throw Error('圖片編輯尺寸無效');
    const scale = edge / Math.max(width, height); return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
  }
  const dimensions = imageOutputs[settings.quality]?.[settings.ratio];
  if (settings.imageLayout !== 'center-crop' || !Array.isArray(dimensions)) throw Error('圖片輸出設定無效'); return dimensions;
}
module.exports = { provider, models, videoModels, videoVendor, RETIRED_VIDEO_MODELS, videoModelOf, toolCosts, capabilities, validate, imageOutputs, imageDimensions };

const { vwEnv } = require("./env-compat.cjs");
const imageOutputs = Object.fromEntries([["1K", 1024], ["2K", 2048], ["4K", 4096]].map(([quality, size]) => [quality, { "1:1": [size, size], "16:9": [size, size * 9 / 16], "9:16": [size * 9 / 16, size], "4:5": [Math.round(size / 10) * 8, Math.round(size / 10) * 10], "4:3": [size, size * 3 / 4] }]));
// The one place that names the provider and models: capabilities shows them, backend/api.cjs calls them and
// writes them into each result's origin, so the origin always names the model that actually ran.
const provider = "OpenAI";
// USD per run shown on the button before the click and charged after it: read from next-admin's cost SSOT
// (lib/ai/cost-model.ts TOOL_RATES, Node type stripping), never copied here.
const { TOOL_RATES, VIDEO_MOTION_RATES } = require(require("node:path").join(require("./appearance.cjs").resolveSource(require("node:path").join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
const replicateVideo = require("./replicate-video.cjs");
const toolCosts = Object.freeze({ removeBackground: TOOL_RATES["bg-remove"].usd });
// Default video model: needs no reference image, lowest price (price audit 2026-11-10). VW_VIDEO_MODEL may name another
// next-admin motion id; anything else is ignored.
const DEFAULT_VIDEO_MODEL = "veo-3-1-fast";
const models = (env) => ({ image: vwEnv(env, "IMAGE_MODEL") || "gpt-image-2.5-flare", video: replicateVideo.isModel(vwEnv(env, "VIDEO_MODEL")) ? vwEnv(env, "VIDEO_MODEL") : DEFAULT_VIDEO_MODEL, audio: vwEnv(env, "TTS_MODEL") || "gpt-4o-mini-tts" });
// Video models the vendor shut down (OpenAI GET /v1/models/sora-2: shutdown_date 2026-09-24). A saved setting or an
// old job naming one runs the default; the page says so once (shared/models.js replaceRetired).
const RETIRED_VIDEO_MODELS = Object.freeze({ "sora-2": "Sora 2", "sora-2-pro": "Sora 2 Pro" });
// Video models a job can pick (card RV): next-admin's Replicate models (lib/ai/video-motion-models.ts), the default
// first. usdPerSec is the price shown on the button and charged after the run.
function videoModels(env) {
  const first = models(env).video;
  return Object.entries(replicateVideo.MOTION_MODELS).sort(([a], [b]) => (b === first) - (a === first)).map(([id, m]) => ({
    id, label: VIDEO_MOTION_RATES[id].label, vendor: VIDEO_MOTION_RATES[id].vendor, provider: "Replicate", model: m.slug,
    durations: [...m.durations], defaultDurationSec: m.defaultDurationSec, ratios: [...m.ratios], requiresImage: m.requiresImage, usdPerSec: VIDEO_MOTION_RATES[id].usdPerSec, available: !!env.REPLICATE_API_TOKEN,
  }));
}
// The model a video job runs: a known id, else the default (sora-2, an old project's "VideoWorkbench V3", no value).
function videoModelOf(input, env) {
  const list = videoModels(env), id = input?.settings?.model ?? input?.model;
  return list.find((m) => m.id === id) || list[0];
}
function capabilities(env, localTools) {
  return {
    image: !!env.OPENAI_API_KEY, text: !!env.OPENAI_API_KEY,
    audio: !!env.OPENAI_API_KEY, video: !!env.REPLICATE_API_TOKEN,
    provider,
    models: models(env),
    videoModels: videoModels(env), retiredVideoModels: RETIRED_VIDEO_MODELS,
    // Top-level video limits = the default model; per-model limits are in videoModels.
    videoDurations: videoModels(env)[0].durations, videoRatios: videoModels(env)[0].ratios, videoQualities: ["720p"],
    maxVideoImages: 1, maxImageReferences: 4, multiModalReferences: false,
    imageQualities: Object.keys(imageOutputs), imageOutputs, imageExactOutput: true,
    removeBackground: !!env.REPLICATE_API_TOKEN, toolCosts,
    motionReference: false, subtitles: false, muteOutput: false, generationWatermark: false,
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
  if (settings.audio === "靜音") throw Error("目前生成服務尚未支援靜音輸出。");
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
module.exports = { provider, models, videoModels, RETIRED_VIDEO_MODELS, videoModelOf, toolCosts, capabilities, validate, imageOutputs, imageDimensions };

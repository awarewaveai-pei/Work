// 圖片局部編輯器 (tool "region"): the one list of image-edit models. Pages draw the rows as buttons from /capabilities
// (imageEdit.models, like speech.cjs); a job naming a row runs it, any other name is refused. Prices: provider-cost.cjs
// imageEditUsd, read from next-admin cost-model.ts (the button shows the same function the charge uses).
// Facts per row, official docs read 2026-11-13 (developers.openai.com/api/docs/guides/image-generation, models/
// gpt-image-2.6-sunburst, aistudio.google.com/docs/pricing + image-generation):
// - OpenAI /images/edits takes a mask (prompt-guided: the edit may spill past it). Per-size output tokens of the 2.5 / 2.6
//   models are not published, so only 1K is offered (the size every edit has always been sent at); the charge is the
//   response's usage. gpt-image-2 is left out: deprecated 2026-11-10, shut down 2027-02-10.
// - Gemini takes no mask: the instruction names each box, and the server pastes only the boxes back onto the original
//   (media.cjs compositeRegions), so nothing outside a box changes. 1K / 2K / 4K are native output sizes.
// Chinese-vendor models are never listed (operator rule).
const providers = require("./providers.cjs");
const { vwEnv } = require("./env-compat.cjs");
const { imageEditUsd } = require("./provider-cost.cjs");

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/interactions";
// Aspect ratios a Gemini image reply is asked for (the ones next-admin lib/tarot/image-gen.ts sends); the nearest to the source.
const GEMINI_RATIOS = Object.freeze(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "9:16", "16:9"]);
const SIZES = Object.freeze(["1K", "2K", "4K"]);

const MODELS = Object.freeze([
  Object.freeze({ id: "gpt-image-2.5-flare", vendor: "OpenAI", label: "GPT Image 2.5", keyName: "OPENAI_API_KEY", mask: true, sizes: Object.freeze(["1K"]),
    note: "依遮罩修改框內，框外通常不動但不保證。只有 1K。" }),
  Object.freeze({ id: "gpt-image-2.6-sunburst", vendor: "OpenAI", label: "GPT Image 2.6", keyName: "OPENAI_API_KEY", mask: true, sizes: Object.freeze(["1K"]),
    note: "OpenAI 的精準修圖版，指令多、描述長時最準。只有 1K。" }),
  Object.freeze({ id: "gemini-nano-banana-2.1", vendor: "Google", label: "Nano Banana 2.1", keyName: "GEMINI_API_KEY", mask: false, sizes: SIZES,
    note: "最便宜，可出 2K、4K。只把框內的結果貼回原圖，框外保證不變。" }),
]);

const rows = (env) => MODELS.map((m) => ({ m, id: m.id, available: !!env[m.keyName], free: false }));
// Default: VW_IMAGE_MODEL (generation-policy.cjs models().image, gpt-image-2.5-flare when unset) when it is a listed row
// that can run here, else providers.cjs's rule.
const defaultModel = (env) => providers.choose(rows(env), vwEnv(env, "IMAGE_MODEL") || "gpt-image-2.5-flare").m;
const defaultSize = (m) => (m.sizes.includes("2K") ? "2K" : m.sizes[0]);
function pick(id, env = process.env) {
  if (id === undefined || id === null || id === "") return defaultModel(env);
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw Object.assign(Error("圖片編輯模型無效"), { status: 400 });
  return m;
}
// A size the row cannot make (an old draft's 2K on a 1K-only row) runs at the row's default, never a resized 1K.
const sizeOf = (m, wanted) => (m.sizes.includes(wanted) ? wanted : defaultSize(m));
// Before validation: the job records the model and size it runs, so prices, retries and the origin name what ran.
function request(input, env) {
  const m = pick(input.settings?.model, env);
  input.settings = { ...input.settings, model: m.id, quality: sizeOf(m, input.settings?.quality) };
  return m;
}
function key(m, env) {
  if (!env[m.keyName]) throw Object.assign(Error("此電腦尚未設定 " + m.keyName + "；請先設定服務。"), { status: 503 });
  return env[m.keyName];
}
function capability(env) {
  return {
    defaultModel: defaultModel(env).id,
    ratios: [...GEMINI_RATIOS],
    models: rows(env).map(({ m, available }) => ({
      id: m.id, vendor: m.vendor, label: m.label, note: m.note, available, mask: m.mask, sizes: [...m.sizes], defaultSize: defaultSize(m),
      prices: Object.fromEntries(m.sizes.map((s) => [s, { usd: imageEditUsd(m.id, s), unit: "張", estimate: true }])),
    })),
  };
}
const nearestRatio = (width, height) => {
  const off = (r) => { const [a, b] = r.split(":").map(Number); return Math.abs(Math.log(a / b / (width / height))); };
  return GEMINI_RATIOS.reduce((best, r) => (off(r) < off(best) ? r : best));
};
// Gemini Interactions API: one source image + the instruction. Answers { image: Buffer (as returned), usage }.
async function gemini(m, { prompt, image, width, height, size, env, fetchImpl, signal }) {
  const source = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(image || "");
  if (!source) throw Error("參考圖格式無效");
  const r = await fetchImpl(GEMINI_API, {
    method: "POST",
    headers: { "x-goog-api-key": key(m, env), "Content-Type": "application/json" },
    body: JSON.stringify({ model: m.id, input: [{ type: "image", mime_type: source[1], data: source[2] }, { type: "text", text: prompt }],
      response_format: { type: "image", aspect_ratio: nearestRatio(width, height), image_size: size }, store: false }),
    signal,
  });
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(Error("Google " + r.status + "：" + String(value?.error?.message || "").slice(0, 300)), { status: r.status >= 500 ? 502 : r.status });
  const part = (value?.steps || []).flatMap((s) => s?.content || []).find((c) => c?.type === "image" && typeof c.data === "string");
  if (!part) throw Error("圖片服務沒有回傳圖片");
  return { image: Buffer.from(part.data, "base64"), usage: value?.usage || null };
}

module.exports = { MODELS, GEMINI_RATIOS, pick, request, sizeOf, key, capability, gemini, nearestRatio };

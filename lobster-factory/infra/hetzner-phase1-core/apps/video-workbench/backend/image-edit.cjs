// 圖片局部編輯器 (tool "region"): its models are next-admin's catalog rows that change a selected area
// (public/editor-shared/image-models.js modelsFor("fill"), cheapest first) -- labels, notes, prices and the measured
// zh / blank answers come only from there; pages draw them from /capabilities imageEdit. Every run is pasted back onto the
// original only inside the boxes (media.cjs compositeRegions), so nothing outside a box changes, with or without a mask.
// CALLS = how each row is called. next-admin calls the same rows through its own billing (lib/studio/generative-fill.ts,
// lib/tarot/image-gen.ts import its gateway and entitlements, so they cannot be loaded here; same rule as bg-remove.cjs):
// the input shapes follow those files and the pinned versions are read from cost-model.ts MEDIA_MODELS, which next-admin's
// model-registry test holds. A catalog fill row without a CALLS entry is listed unavailable, never guessed.
const path = require("node:path");
const providers = require("./providers.cjs");
const { vwEnv } = require("./env-compat.cjs");
const { fillUsd } = require("./provider-cost.cjs");
const source = require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const catalog = require(path.join(source, "public/editor-shared/image-models.js"));
const { MEDIA_MODELS } = require(path.join(source, "lib/ai/cost-model.ts"));

const REPLICATE = "https://api.replicate.com/v1";
const pinned = (slug) => MEDIA_MODELS[slug].version;
// mask: what the vendor wants -- "alpha" = transparent = edit (OpenAI), "white" = white = edit, "black" = black = edit,
// null = no mask (the instruction names each box; the paste-back keeps the rest).
const CALLS = Object.freeze({
  // lib/tarot/image-gen.ts TAROT_MODELS["flux-2-klein-4b"].buildInput
  "flux-2-klein-4b": { keyName: "REPLICATE_API_TOKEN", mask: null, model: "black-forest-labs/flux-2-klein-4b",
    input: ({ prompt, image }) => ({ prompt, images: [image], output_format: "png", output_megapixels: "1", aspect_ratio: "match_input_image" }) },
  // lib/tarot/image-gen.ts TAROT_MODELS["flux-kontext-fast"].buildInput
  "flux-kontext-fast": { keyName: "REPLICATE_API_TOKEN", mask: null, model: "prunaai/flux-kontext-fast",
    input: ({ prompt, image }) => ({ prompt, img_cond_path: image, output_format: "png", aspect_ratio: "match_input_image" }) },
  // lib/studio/generative-fill.ts generativeFill, ideogram cases (its mask: black = edit)
  "ideogram-4-5-edit-low": { keyName: "REPLICATE_API_TOKEN", mask: "black", version: () => pinned("ideogram-ai/ideogram-4-5-precise-edit"),
    input: ({ prompt, image, mask }) => ({ image, mask, prompt, quality: "low", num_images: 1 }) },
  "ideogram-4-5-edit": { keyName: "REPLICATE_API_TOKEN", mask: "black", version: () => pinned("ideogram-ai/ideogram-4-5-precise-edit"),
    input: ({ prompt, image, mask }) => ({ image, mask, prompt, quality: "medium", num_images: 1 }) },
  // lib/studio/generative-fill.ts generativeFill, flux-fill-pro case (white = fill)
  "flux-fill-pro": { keyName: "REPLICATE_API_TOKEN", mask: "white", version: () => pinned("black-forest-labs/flux-fill-pro"),
    input: ({ prompt, image, mask }) => ({ image, mask, prompt, output_format: "png", safety_tolerance: 5 }) },
  // lib/tarot/image-gen.ts TAROT_MODELS["openai-26-edit"]: /images/edits, quality high, with the mask
  "openai-26-edit": { keyName: "OPENAI_API_KEY", mask: "alpha", openaiModel: "gpt-image-2.6-sunburst" },
});
// Output: the model's whole-image result at ~1 MP; no row states a larger size, so 1K is the one size offered.
const SIZES = Object.freeze(["1K"]);

const rows = (env) => catalog.modelsFor("fill").map((m) => ({ m, id: m.value, available: !!CALLS[m.value] && !!env[CALLS[m.value].keyName], free: false }));
// Default: the cheapest row that can run here and needs no description (catalog blank "ok"); VW_IMAGE_EDIT_MODEL names another.
function defaultRow(env) {
  const list = rows(env), wanted = vwEnv(env, "IMAGE_EDIT_MODEL");
  return list.find((r) => r.id === wanted && r.available) || list.find((r) => r.available && catalog.takesBlankPrompt(r.m)) || providers.choose(list);
}
function pick(id, env = process.env) {
  if (id === undefined || id === null || id === "") return defaultRow(env).m;
  const m = catalog.modelsFor("fill").find((x) => x.value === id);
  if (!m) throw Object.assign(Error("圖片編輯模型無效"), { status: 400 });
  return m;
}
// The job records the row and size it runs, before pricing and storing (an old draft's 2K / another model id included).
function request(input, env) {
  const m = pick(input.settings?.model, env);
  input.settings = { ...input.settings, model: m.value, quality: SIZES[0] };
  return m;
}
function key(m, env) {
  const call = CALLS[m.value];
  if (!call) throw Object.assign(Error(m.label + " 尚未接入圖片局部編輯器"), { status: 503 });
  if (!env[call.keyName]) throw Object.assign(Error("此電腦尚未設定 " + call.keyName + "；請先設定服務。"), { status: 503 });
  return env[call.keyName];
}
function capability(env) {
  return {
    defaultModel: defaultRow(env).id,
    ratios: [...catalog.ASPECT_RATIOS], // the page names the source's nearest ratio (參數)
    models: rows(env).map(({ m, available }) => ({
      id: m.value, vendor: m.vendor, label: m.label, available, sizes: [...SIZES], defaultSize: SIZES[0],
      note: m.note + (catalog.takesChinese(m) ? "" : "。指令請用英文寫"),
      prices: { [SIZES[0]]: { usd: fillUsd(m.value), unit: "張", estimate: true } },
    })),
  };
}
const pngSize = (buffer) => (buffer.subarray(1, 4).toString() === "PNG" ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null);
const mp = (s) => (s ? (s.width * s.height) / 1e6 : 1);

// Replicate: create (pinned version or the official model by name), poll, download from replicate.delivery only.
async function replicate(call, input, { env, fetchImpl, signal }) {
  const auth = { Authorization: "Bearer " + env.REPLICATE_API_TOKEN };
  const deadline = AbortSignal.timeout(170_000), abort = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const json = async (url, init = {}) => {
    const r = await fetchImpl(url, { ...init, headers: { ...auth, ...(init.body ? { "Content-Type": "application/json" } : {}) }, signal: abort });
    const v = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(Error("Replicate " + r.status + "：" + String(v?.detail || "").slice(0, 200)), { status: r.status >= 500 ? 502 : r.status });
    return v;
  };
  let p = await json(call.version ? REPLICATE + "/predictions" : REPLICATE + "/models/" + call.model + "/predictions",
    { method: "POST", body: JSON.stringify(call.version ? { version: call.version(), input } : { input }) });
  while (["starting", "processing"].includes(p?.status)) {
    await new Promise((r, j) => { const t = setTimeout(r, 2000); abort.addEventListener("abort", () => { clearTimeout(t); j(Error(deadline.aborted ? "圖片編輯逾時" : "已取消")); }, { once: true }); });
    p = await json(REPLICATE + "/predictions/" + encodeURIComponent(p.id));
  }
  if (p?.status !== "succeeded") throw Error("圖片編輯失敗：" + String(p?.error || p?.status).slice(0, 200));
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  if (typeof url !== "string" || !/^https:\/\/replicate\.delivery\//.test(url)) throw Error("圖片結果網址不在允許範圍");
  const r = await fetchImpl(url, { signal: abort });
  if (!r.ok) throw Error("下載圖片結果失敗：" + r.status);
  return Buffer.from(await r.arrayBuffer());
}
// One run of row m on the source PNG with the mask in the vendor's form. Answers { image: Buffer, costUsd }.
async function run(m, { prompt, image, masks, ratio, env, fetchImpl, signal }) {
  const call = CALLS[m.value];
  key(m, env);
  if (call.openaiModel) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ model: call.openaiModel, prompt, size: ratio > 1.2 ? "1536x1024" : ratio < 0.83 ? "1024x1536" : "1024x1024", quality: "high", n: "1" })) form.append(k, v);
    form.append("image[]", new Blob([image], { type: "image/png" }), "source.png");
    form.append("mask", new Blob([masks.alpha], { type: "image/png" }), "mask.png");
    const r = await fetchImpl("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, body: form, signal });
    if (!r.ok) throw Error("圖片編輯失敗：OpenAI " + r.status);
    const result = await r.json();
    if (!result.data?.[0]?.b64_json) throw Error("圖片服務沒有回傳圖片");
    return { image: Buffer.from(result.data[0].b64_json, "base64"), costUsd: fillUsd(m.value, { openaiModel: call.openaiModel, usage: result.usage }) };
  }
  const dataUrl = (b) => "data:image/png;base64," + b.toString("base64");
  const out = await replicate(call, call.input({ prompt, image: dataUrl(image), mask: call.mask && dataUrl(masks[call.mask]) }), { env, fetchImpl, signal });
  return { image: out, costUsd: fillUsd(m.value, { inputMp: mp(pngSize(image)), outputMp: mp(pngSize(out)) }) };
}

module.exports = { CALLS, SIZES, pick, request, key, capability, run, pngSize };

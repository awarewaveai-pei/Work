// Image-model catalog SSOT — every AI image model / editing tool the app can bill, with its vendor price. One plain ES
// module (like outpaint-presets.js): the browser (editor-shared dock blocks, canvas) and the server (lib/studio/model-options.ts,
// lib/ai/cost-model.ts IMAGE_RATES) read the same rows, so a price or label changes in ONE place. Typed door:
// lib/studio/model-options.ts. Vendor-side ids (Replicate slug / pinned version / OpenAI model id) stay in the TS callers and
// lib/ai/cost-model.ts MEDIA_MODELS (the probe reads them there). drift guard: lib/studio/__tests__/editor-ai-panels.test.ts.
//
// usd = per image, Replicate model page / OpenAI token rates (2026-11-09). OpenAI rows are token-billed: usd is the
// estimate shown before generating; the logged cost comes from each response's usage.
// note = the one line under the price on every model button (繁中, ≤18 chars): what this row is FOR. 實測 = measured here.
// A row without a mask can still serve "fill": the panel sends only a crop around the selection and blends just the
// selection back (blocks/ai-fill.js fillSelection), so the model only has to repaint that crop. It cannot guess WHAT to
// change though, so those rows say so in their note (2026-11-09: FLUX 2 Klein 4B removed three animals cleanly at NT$0.03
// when told what to remove, and left them untouched when the description was empty).
// uses: generate = text→image (Studio/Tarot picker) · edit = whole image, reference in, instruction (AI 修圖) ·
//       fill = masked region (生成填色) · remove = masked object removal (去除) · outpaint = extend the canvas (擴圖)

/** USD → NT$ reference rate. The only copy. */
export const TWD_RATE = 32;
/** Price in NT$, two decimals — one decimal rounded the cheapest row (US$0.001 = NT$0.03) down to NT$0.0 on the buttons. */
export const nt = (usd) => Math.round(usd * TWD_RATE * 100) / 100;

export const IMAGE_MODELS = Object.freeze([
  { value: "flux-schnell", label: "FLUX schnell", group: "BFL", vendor: "BFL/Replicate", usd: 0.003, maxRefs: 0, note: "最便宜，草稿用", uses: ["generate"] },
  { value: "flux-dev", label: "FLUX dev", group: "BFL", vendor: "BFL/Replicate", usd: 0.025, maxRefs: 1, note: "便宜，吃一張參考圖", uses: ["generate"] },
  { value: "flux-kontext-dev", label: "FLUX Kontext Dev", group: "BFL", vendor: "BFL/Replicate", usd: 0.025, maxRefs: 1, note: "參考圖融入新場景（開源版）", uses: ["generate"] },
  { value: "flux-kontext-pro", label: "FLUX Kontext Pro", group: "BFL", vendor: "BFL/Replicate", usd: 0.04, maxRefs: 1, note: "把參考圖的東西放進新場景", uses: ["generate", "edit"] },
  // flux-2-max bills $0.04 per run + $0.03 per output MP (+ $0.03 per input MP; maxRefs 0 sends none), replicate.com
  // billingConfig 2026-11-10; lib/tarot/image-gen.ts asks resolution "1 MP".
  { value: "flux-2-max", label: "FLUX 2 Max", group: "BFL", vendor: "BFL/Replicate", usd: 0.07, usdPerRun: 0.04, usdPerInputMp: 0.03, usdPerOutputMp: 0.03, maxOutputMp: 1.1, maxRefs: 0, note: "BFL 最高畫質，純文字生圖", uses: ["generate"] },
  // The two cheap whole-image editors (operator 2026-11-09). Measured the same day: neither takes a mask, so they are
  // offered for 「整張改順」 only, never for 生成填色. klein bills per megapixel IN and OUT (replicate.com billingConfig
  // 2026-11-10: $1 per 1000 input MP + $1 per 1000 output MP): imageRunUsd prices each call from its real sizes; usd is
  // the button estimate for its one use, a ~1 MP reference in + the 1 MP output (output_megapixels "1").
  { value: "flux-2-klein-4b", label: "FLUX 2 Klein 4B", group: "BFL", vendor: "BFL/Replicate", usd: 0.002, usdPerInputMp: 0.001, usdPerOutputMp: 0.001, maxOutputMp: 1.1, maxRefs: 1, note: "最便宜，適合多試幾次。一定要寫描述", uses: ["edit", "fill"], zh: "ok", blank: "no" },
  { value: "flux-kontext-fast", label: "FLUX Kontext Fast", group: "BFL", vendor: "Pruna/Replicate", usd: 0.01, maxRefs: 1, note: "筆觸最貼近原畫。一定要寫描述", uses: ["edit", "fill"], zh: "no", blank: "no" },
  { value: "ideogram-v2a-turbo", label: "Ideogram v2a Turbo", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.025, maxRefs: 0, note: "快，文字排版清楚", uses: ["generate"] },
  { value: "ideogram-v3-balanced", label: "Ideogram v3 Balanced", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.06, maxRefs: 0, note: "畫質與速度折衷", uses: ["generate"] },
  { value: "ideogram-v4-turbo", label: "Ideogram v4 Turbo", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.03, maxRefs: 0, note: "v4 快版", uses: ["generate"] },
  { value: "ideogram-v4-quality", label: "Ideogram v4 Quality", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.10, maxRefs: 0, note: "v4 高畫質", uses: ["generate"] },
  { value: "ideogram-character", label: "Ideogram Character", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.15, maxRefs: 1, note: "同一個角色不走樣", uses: ["generate"] },
  // Priced at the tier lib/tarot/image-gen.ts sends, resolution "2K" (replicate.com billingConfig 2026-11-10: 1K .067 / 2K .101 / 4K .151).
  // fill (operator 2026-11-13): no mask, so every fill caller pastes back only the selection (ai-fill.js fillSelection;
  // video-workbench compositeRegions). zh: 2026-11-13 two real 1K 繁中 box edits (video-workbench 圖片局部編輯器) drew the asked night sky.
  // blank: not measured; a mask-less row has no area for an empty description (the two measured ones returned the image
  // untouched), so it counts as "no".
  { value: "nano-banana-2", label: "Nano Banana 2.1", group: "Google+", vendor: "Google", usd: 0.057, maxRefs: 14, note: "最多 14 張參考圖，便宜", uses: ["generate", "edit", "fill"], zh: "ok", blank: "no" },
  { value: "nano-banana-pro", label: "Nano Banana Pro", group: "Google+", vendor: "Google/Replicate", usd: 0.15, maxRefs: 8, note: "Google 最強，人物與文字穩", uses: ["generate", "edit"] },
  { value: "openai-low", label: "GPT-Image-2 低", group: "OpenAI", vendor: "OpenAI", usd: 0.02, maxRefs: 5, note: "最省，先看構圖", uses: ["generate"] },
  { value: "openai-medium", label: "GPT-Image-2 中", group: "OpenAI", vendor: "OpenAI", usd: 0.07, maxRefs: 5, note: "日常品質", uses: ["generate"] },
  { value: "openai-high", label: "GPT-Image-2 高", group: "OpenAI", vendor: "OpenAI", usd: 0.19, maxRefs: 5, note: "最高畫質，較貴", uses: ["generate"] },
  // Measured 2026-11-01 on /v1/images/edits (high, 1024x1536, 2 refs): US$0.062. Keeps the unmasked pixels; prints follow fabric folds.
  { value: "openai-25-edit", label: "GPT-Image-2.5 修圖", group: "OpenAI", vendor: "OpenAI", usd: 0.06, maxRefs: 5, note: "印花貼合衣物皺褶（實測）", uses: ["generate", "edit"] },
  // gpt-image-2.6-sunburst (OpenAI 2026-11-09: "precise edits"), same token rates as 2.5; takes a mask on /images/edits.
  { value: "openai-26-edit", label: "GPT-Image-2.6 修圖", group: "OpenAI", vendor: "OpenAI", usd: 0.06, maxRefs: 5, note: "條件多、描述長的時候最準", uses: ["generate", "edit", "fill", "outpaint"], zh: "ok", blank: "ok" },
]);

/** `zh` = does a 繁中 instruction work on this button, measured 2026-11-09 on one card with one sentence:
 *  Ideogram 4.5 Edit low and FLUX 2 Klein 4B removed the object, FLUX Kontext Fast left it in place twice and
 *  removed it from the same English sentence. "no" = write the instruction in English; the guide prints one.
 *  `blank` = what an EMPTY description does on a 生成填色 / 去除 button, the one place that answers 「這顆可以留空嗎」
 *  (the guide prints it, ai-fill.js refuses to spend without it). Measured 2026-11-09 on one real card, WORKLOG 續1/續2:
 *    "ok" = the server sends CONTEXT_FILL_PROMPT and the masked area is redrawn from its surroundings
 *    "no" = the model takes no mask, so that instruction has no area to act on and the image comes back unchanged
 *  A row with a "fill" or "remove" use and no `blank` is a row nobody measured: treat it as "no".
 */
/** Mask / canvas tools (not text→image). Ids = the `model` the genfill / inpaint routes take and log.
 *  Button order comes from modelsFor() (cheapest first), not from this list. */
export const EDIT_TOOLS = Object.freeze([
  // Ideogram's own quality tiers, one row each (replicate.com page 2026-11-09: very_low .008 / low .03 / medium .06 / high .22).
  // 2026-11-09 on one real card, low removed the object as cleanly as medium and very_low barely changed the area.
  { value: "ideogram-4-5-edit-low", label: "Ideogram 4.5 Edit（省）", vendor: "Ideogram/Replicate", usd: 0.03, note: "預設用這顆。清東西、加東西都穩，接縫最少", uses: ["fill"], zh: "ok", blank: "ok" },
  { value: "ideogram-4-5-edit", label: "Ideogram 4.5 Edit（細）", vendor: "Ideogram/Replicate", usd: 0.06, note: "高畫質檔。省的那顆不夠細再用", uses: ["fill"], zh: "ok", blank: "ok" },
  { value: "flux-fill-pro", label: "FLUX Fill Pro", vendor: "BFL/Replicate", usd: 0.05, note: "建議寫描述。留空它會自己發揮", uses: ["fill", "outpaint"], zh: "ok", blank: "ok" },
  { value: "bria-eraser", label: "Bria Eraser", vendor: "Bria/Replicate", usd: 0.04, note: "只清掉東西，不會順手加東西。不用寫描述", uses: ["remove"], blank: "ok" },
  { value: "bria-expand", label: "Bria Expand", vendor: "Bria/Replicate", usd: 0.04, note: "擴圖尺寸精準，不會走樣。不用寫描述", uses: ["outpaint"] },
]);

/** maxOutputMp = the most a "1 MP" request returns (sides snap to 16 px: 1024x1024 is 1.05 MP); the credit hold uses it,
 *  the charge uses the image actually returned. */
/** USD of one image from catalog row `m`. A per-megapixel row (usdPerRun + usdPerInputMp / usdPerOutputMp) is priced
 *  from the call's real sizes: inputMp = all reference images together, outputMp = the image returned; every other row is
 *  its per-image usd. The one price function for catalog rows (lib/tarot/image-gen.ts holds and charges through it). */
export function imageRunUsd(m, { inputMp = 0, outputMp = 1 } = {}) {
  if (!(m?.usdPerInputMp || m?.usdPerOutputMp)) return m.usd;
  const mp = (v) => Math.max(0, Number(v) || 0);
  return Math.round(((m.usdPerRun ?? 0) + (m.usdPerInputMp ?? 0) * mp(inputMp) + (m.usdPerOutputMp ?? 0) * mp(outputMp)) * 1e6) / 1e6;
}

/** Does an empty description do anything on this row? Unmeasured rows answer no, so a new model cannot silently
 *  inherit 「留空可以」 and charge for a no-op. */
export function takesBlankPrompt(m) {
  return m != null && m.blank === "ok";
}

/** Does a 繁中 instruction work on this row? Unmeasured rows answer no, so the guide tells her to write English
 *  rather than let her pay to find out. */
export function takesChinese(m) {
  return m != null && m.zh === "ok";
}

/** Rows that offer `use` ("edit" | "fill" | "remove" | "outpaint"), CHEAPEST FIRST. One ordering rule for every
 *  list of buttons: the panels and the guide read this function, so they cannot disagree about the order. */
export function modelsFor(use) {
  return [...EDIT_TOOLS, ...IMAGE_MODELS].filter((m) => m.uses.includes(use)).sort((a, b) => a.usd - b.usd);
}

export const ASPECT_RATIOS = Object.freeze(["2:3", "3:2", "4:5", "1:1", "9:16", "4:3", "3:4", "16:9"]);
const ASPECT_VALUES = [["2:3", 2 / 3], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["9:16", 9 / 16], ["3:2", 3 / 2], ["4:3", 4 / 3], ["16:9", 16 / 9]];
/** The supported ratio closest to an image's own, so an edit of it keeps its framing. */
export function nearestAspectRatio(width, height) {
  const r = width / height;
  return ASPECT_VALUES.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

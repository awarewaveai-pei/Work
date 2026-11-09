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
  { value: "flux-kontext-dev", label: "FLUX Kontext Dev", group: "BFL", vendor: "BFL/Replicate", usd: 0.045, maxRefs: 1, note: "參考圖融入新場景（開源版）", uses: ["generate"] },
  { value: "flux-kontext-pro", label: "FLUX Kontext Pro", group: "BFL", vendor: "BFL/Replicate", usd: 0.04, maxRefs: 1, note: "把參考圖的東西放進新場景", uses: ["generate", "edit"] },
  { value: "flux-2-max", label: "FLUX 2 Max", group: "BFL", vendor: "BFL/Replicate", usd: 0.07, maxRefs: 0, note: "BFL 最高畫質，純文字生圖", uses: ["generate"] },
  // The two cheap whole-image editors (operator 2026-11-09). Measured the same day: neither takes a mask, so they are
  // offered for 「整張改順」 only, never for 生成填色. 1 megapixel output keeps klein at its $0.001 price point.
  { value: "flux-2-klein-4b", label: "FLUX 2 Klein 4B", group: "BFL", vendor: "BFL/Replicate", usd: 0.001, maxRefs: 1, note: "最便宜；填色要寫清楚改什麼", uses: ["edit", "fill"] },
  { value: "flux-kontext-fast", label: "FLUX Kontext Fast", group: "BFL", vendor: "Pruna/Replicate", usd: 0.01, maxRefs: 1, note: "很便宜；填色要寫清楚改什麼", uses: ["edit", "fill"] },
  { value: "ideogram-v2a-turbo", label: "Ideogram v2a Turbo", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.025, maxRefs: 0, note: "快，文字排版清楚", uses: ["generate"] },
  { value: "ideogram-v3-balanced", label: "Ideogram v3 Balanced", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.06, maxRefs: 0, note: "畫質與速度折衷", uses: ["generate"] },
  { value: "ideogram-v4-turbo", label: "Ideogram v4 Turbo", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.03, maxRefs: 0, note: "v4 快版", uses: ["generate"] },
  { value: "ideogram-v4-quality", label: "Ideogram v4 Quality", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.10, maxRefs: 0, note: "v4 高畫質", uses: ["generate"] },
  { value: "ideogram-character", label: "Ideogram Character", group: "Ideogram", vendor: "Ideogram/Replicate", usd: 0.15, maxRefs: 1, note: "同一個角色不走樣", uses: ["generate"] },
  { value: "nano-banana-2", label: "Nano Banana 2", group: "Google+", vendor: "Google/Replicate", usd: 0.067, maxRefs: 14, note: "最多 14 張參考圖，便宜", uses: ["generate", "edit"] },
  { value: "nano-banana-pro", label: "Nano Banana Pro", group: "Google+", vendor: "Google/Replicate", usd: 0.15, maxRefs: 8, note: "Google 最強，人物與文字穩", uses: ["generate", "edit"] },
  { value: "imagen-4", label: "Imagen 4", group: "Google+", vendor: "Google/Replicate", usd: 0.04, maxRefs: 0, note: "Google 寫實風", uses: ["generate"] },
  { value: "openai-low", label: "GPT-Image-2 低", group: "OpenAI", vendor: "OpenAI", usd: 0.02, maxRefs: 5, note: "最省，先看構圖", uses: ["generate"] },
  { value: "openai-medium", label: "GPT-Image-2 中", group: "OpenAI", vendor: "OpenAI", usd: 0.07, maxRefs: 5, note: "日常品質", uses: ["generate"] },
  { value: "openai-high", label: "GPT-Image-2 高", group: "OpenAI", vendor: "OpenAI", usd: 0.19, maxRefs: 5, note: "最高畫質，較貴", uses: ["generate"] },
  // Measured 2026-11-01 on /v1/images/edits (high, 1024x1536, 2 refs): US$0.062. Keeps the unmasked pixels; prints follow fabric folds.
  { value: "openai-25-edit", label: "GPT-Image-2.5 修圖", group: "OpenAI", vendor: "OpenAI", usd: 0.06, maxRefs: 5, note: "印花貼合衣物皺褶（實測）", uses: ["generate", "edit"] },
  // gpt-image-2.6-sunburst (OpenAI 2026-11-09: "precise edits"), same token rates as 2.5; takes a mask on /images/edits.
  { value: "openai-26-edit", label: "GPT-Image-2.6 修圖", group: "OpenAI", vendor: "OpenAI", usd: 0.06, maxRefs: 5, note: "指令跟得最緊，長描述最準", uses: ["generate", "edit", "fill"] },
]);

/** Mask / canvas tools (not text→image). Ids = the `model` the genfill / inpaint routes take and log. ORDER = the order of the
 *  buttons in the panels, so the first row of each use is what an operator reaches for: for 生成填色 that is Ideogram 4.5 Edit,
 *  the only one that honours a context fill (an EMPTY prompt). Prod 2026-11-09: with an empty prompt flux-fill-pro replaced the
 *  selection with unrelated bands, Ideogram continued the surrounding artwork. */
export const EDIT_TOOLS = Object.freeze([
  // Ideogram's own quality tiers, one row each (replicate.com page 2026-11-09: very_low .008 / low .03 / medium .06 / high .22).
  // 2026-11-09 on one real card, low removed the object as cleanly as medium and very_low barely changed the area.
  { value: "ideogram-4-5-edit-low", label: "Ideogram 4.5 Edit（省）", vendor: "Ideogram/Replicate", usd: 0.03, note: "留空就照周圍補，最划算（實測）", uses: ["fill"] },
  { value: "ideogram-4-5-edit", label: "Ideogram 4.5 Edit（細）", vendor: "Ideogram/Replicate", usd: 0.06, note: "同上，細節多再用這個", uses: ["fill"] },
  { value: "flux-fill-pro", label: "FLUX Fill Pro", vendor: "BFL/Replicate", usd: 0.05, note: "留空會自己發揮，建議寫描述", uses: ["fill", "outpaint"] },
  { value: "bria-eraser", label: "Bria Eraser", vendor: "Bria/Replicate", usd: 0.04, note: "只清掉東西，不會新增", uses: ["remove"] },
  { value: "bria-expand", label: "Bria Expand", vendor: "Bria/Replicate", usd: 0.04, note: "擴圖尺寸精準，不會走樣", uses: ["outpaint"] },
]);

/** Rows that offer `use` ("edit" | "fill" | "remove" | "outpaint"): the purpose-built tools first, then the general models. */
export function modelsFor(use) {
  return [...EDIT_TOOLS, ...IMAGE_MODELS].filter((m) => m.uses.includes(use));
}

export const ASPECT_RATIOS = Object.freeze(["2:3", "3:2", "4:5", "1:1", "9:16", "4:3", "3:4", "16:9"]);
const ASPECT_VALUES = [["2:3", 2 / 3], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["9:16", 9 / 16], ["3:2", 3 / 2], ["4:3", 4 / 3], ["16:9", 16 / 9]];
/** The supported ratio closest to an image's own, so an edit of it keeps its framing. */
export function nearestAspectRatio(width, height) {
  const r = width / height;
  return ASPECT_VALUES.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

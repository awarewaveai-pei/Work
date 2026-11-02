// Card P2: which platforms a finished project fits, read from the main system's RATIO_PREFERENCE / ratioFor
// (imported, never copied; no second preference table here). The only translation is the ratio spelling
// "16:9" (workbench) <-> "16x9" (main system); 1:1 and 4:3 have no main-system key yet (card P6).
const path = require("node:path"),
  { pathToFileURL } = require("node:url");
const contractFile = path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/content/video/platform-ratio.ts");
let contract = null;
const loadContract = () => (contract ||= import(pathToFileURL(contractFile).href));
const toKey = (ratio) => String(ratio).replace(":", "x");
async function deliveryRatios(workbenchRatios) {
  const { RATIO_PREFERENCE, ratioFor } = await loadContract(),
    known = new Set(Object.values(RATIO_PREFERENCE).flat()),
    ratios = {};
  for (const ratio of workbenchRatios) {
    const key = toKey(ratio);
    ratios[ratio] = known.has(key)
      ? {
          key,
          platforms: Object.keys(RATIO_PREFERENCE)
            .filter((platform) => ratioFor(platform, [key]) === key)
            .map((platform) => ({ platform, preferred: RATIO_PREFERENCE[platform][0] === key })),
        }
      : { key, platforms: null, note: "主系統目前不收此比例（P6 處理）" };
  }
  return { ratios };
}
module.exports = { deliveryRatios };

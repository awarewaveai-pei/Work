// Card P2: which platforms a finished project fits, read from the main system's RATIO_PREFERENCE / ratioFor
// (imported, never copied; no second preference table here). The only translation is the ratio spelling
// "16:9" (workbench) <-> "16x9" (main system). Deliverable = 16:9, 9:16, 4:5, 1:1, 4:3 (platform-ratio.ts
// DELIVERY_RATIOS); any other ratio (e.g. a measured 2:1 file) is refused.
const path = require("node:path"),
  { pathToFileURL } = require("node:url");
const contractFile = path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/content/video/platform-ratio.ts");
let contract = null;
const loadContract = () => (contract ||= import(pathToFileURL(contractFile).href));
const UNDELIVERABLE = "此比例尚不能投遞";
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
          deliverable: true,
          platforms: Object.keys(RATIO_PREFERENCE)
            .filter((platform) => ratioFor(platform, [key]) === key)
            .map((platform) => ({ platform, preferred: RATIO_PREFERENCE[platform][0] === key })),
        }
      : { key, platforms: null, deliverable: false, note: UNDELIVERABLE };
  }
  return { ratios };
}
module.exports = { deliveryRatios, UNDELIVERABLE };

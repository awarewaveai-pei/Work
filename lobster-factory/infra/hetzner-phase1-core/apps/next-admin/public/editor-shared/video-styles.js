// U4.6: one video catalog, also consumed by the workbench's capabilities. Labels remain valid old VideoStudio values.
import { STYLE_CATALOG } from "./art-styles.js";
const legacy = [
  ["日系電影感", "暖色調 · 低對比 · Kodak Portra · 35mm · 淺景深 · 細膩顆粒 · 柔和逆光 · 溫馨 · 生活感"],
  ["賽博霓虹", "賽博霓虹"], ["清透紀實", "清透紀實"], ["復古膠片", "復古膠片"],
  ["卡通動漫", "卡通動漫"], ["黑白電影", "黑白電影"], ["黃金時刻", "黃金時刻"], ["夢幻粉彩", "夢幻粉彩"], ["自訂", ""],
];
export const VIDEO_STYLE_PRESETS = [
  { id: "video-cinematic", zh: "電影感", group: "影片風格", prompt: "Cinematic wide-angle 16:9, dramatic lighting, rich color grade" },
  { id: "video-documentary", zh: "紀錄片", group: "影片風格", prompt: "Documentary photography, natural light, authentic moment" },
  { id: "video-commercial", zh: "商業攝影", group: "影片風格", prompt: "Clean commercial photography, studio lighting, professional" },
];
// The label-derived id does not change when a catalog row is inserted/reordered. Old numeric p.style maps explicitly.
function key(label) {
  let hash = 2166136261;
  for (const c of label) { hash ^= c.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return "art-" + (hash >>> 0).toString(16);
}
export const WORKBENCH_LEGACY_STYLES = legacy.map(([zh, prompt], i) => ({ id: "legacy-" + i, zh, prompt, group: "工作台原有風格", legacyIndex: i }));
export const VIDEO_STYLE_CATALOG = [...VIDEO_STYLE_PRESETS, ...STYLE_CATALOG.map(s => ({ ...s, id: key(s.zh) })), ...WORKBENCH_LEGACY_STYLES];
export const VIDEO_STYLE_GROUPS = [...new Set(VIDEO_STYLE_CATALOG.map(s => s.group))];
export function videoStyle(value) {
  return typeof value === "number" ? WORKBENCH_LEGACY_STYLES[value] : VIDEO_STYLE_CATALOG.find(s => s.id === value || s.zh === value);
}
export function resolveVideoStyle(label) {
  const row = videoStyle(label);
  if (!row) return String(label || "");
  if (row.group !== "西方畫家" && row.group !== "亞洲畫家") return row.prompt;
  const head = row.zh.replace(/^[　-〿一-鿿豈-﫿·•\s]+/, "").split("｜")[0].trim();
  const tail = row.zh.split("｜").slice(1).join("｜").match(/[A-Za-z][A-Za-z .\-]*/);
  const name = /[A-Za-z]/.test(head) ? head : tail?.[0]?.trim();
  return name ? `In the style of ${name}. ${row.prompt}` : row.prompt;
}

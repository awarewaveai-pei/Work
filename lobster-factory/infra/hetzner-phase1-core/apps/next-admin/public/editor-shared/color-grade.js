// 🎨 調色 SSOT — the colour math of /tools/canvas (Fabric 7) and /vector-editor.html (Fabric 5), in ONE plain ES module
// (no build step, no deps, no CDN). Vector loads it with <script type="module">; canvas imports it through
// lib/studio/editor-color-grade.ts. Both sides turn the SAME `adj` object into the SAME ordered filter specs and only
// differ in how a spec becomes a Fabric class (new fabric.filters[cls](opts) vs new fabric.Image.filters[cls](opts)).
// drift guard: lib/studio/__tests__/editor-color-grade-drift.test.ts
//
// adj (stored on every image as `adj`, rides in the project file) =
//   { grade:{hue,sat,bri,black,white,gamma,sharpen,balCR,balMG,balYB}, presetId, removeWhite, vibrance, temp, blur,
//     noise, contrast, shadows, highlights, exposure, clarity, dehaze, hslMixer,
//     removeColor:{color,distance}|null  (the 🪄 去背 colour key),  legacy:[serialized filters]  (filters an old project carried) }
// INVARIANT: every filter on an image is derived from its `adj` by buildFilterSpecs — nothing infers ownership from filter
// class or params. A filter the panels cannot express lives in adj.legacy (copied verbatim, re-added last on every rebuild).

const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Slider bounds of adj.grade — same numbers as GRADE_LIMITS in lib/studio/color-grade.ts (the drift test compares them). */
export const GRADE_LIMITS = {
  hue: { min: -30, max: 30, neutral: 0 },
  sat: { min: 50, max: 200, neutral: 100 },
  bri: { min: 50, max: 200, neutral: 100 },
  black: { min: 0, max: 64, neutral: 0 },
  white: { min: 191, max: 255, neutral: 255 },
  gamma: { min: 100, max: 300, neutral: 100 },
  sharpen: { min: 0, max: 10, neutral: 0 },
  balCR: { min: -100, max: 100, neutral: 0 },
  balMG: { min: -100, max: 100, neutral: 0 },
  balYB: { min: -100, max: 100, neutral: 0 },
};
/** Slider bounds of the flat adj fields. */
export const EFFECT_LIMITS = {
  vibrance: { min: -100, max: 100, neutral: 0 },
  temp: { min: -100, max: 100, neutral: 0 },
  blur: { min: 0, max: 100, neutral: 0 },
  noise: { min: 0, max: 100, neutral: 0 },
  contrast: { min: -100, max: 100, neutral: 0 },
  shadows: { min: -100, max: 100, neutral: 0 },
  highlights: { min: -100, max: 100, neutral: 0 },
  exposure: { min: -100, max: 100, neutral: 0 },
  clarity: { min: 0, max: 100, neutral: 0 },
  dehaze: { min: 0, max: 100, neutral: 0 },
};

/** 🪄 去背 colour-key tolerance (Fabric RemoveColor `distance`); `neutral` = the slider's default, "off" is removeColor === null. */
export const REMOVE_COLOR_LIMITS = { min: 0, max: 0.6, neutral: 0.15 };

// ── 預設風格: one entry per name; cls = Fabric filter class (same name in Fabric 5 and 7), opts = its options ──
const tintMatrix = (hex, a) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return [1 - a, 0, 0, 0, c[0] * a, 0, 1 - a, 0, 0, c[1] * a, 0, 0, 1 - a, 0, c[2] * a, 0, 0, 0, 1, 0];
};
export const PRESETS = [
  { id: "sepia", label: "復古", cls: "Sepia" },
  { id: "vintage", label: "Vintage", cls: "Vintage" },
  { id: "polaroid", label: "拍立得", cls: "Polaroid" },
  { id: "kodachrome", label: "Koda", cls: "Kodachrome" },
  { id: "brownie", label: "Brownie", cls: "Brownie" },
  { id: "bw", label: "黑白", cls: "BlackWhite" },
  { id: "gray", label: "灰階", cls: "Grayscale" },
  { id: "invert", label: "反相", cls: "Invert" },
  { id: "warm", label: "暖色", cls: "ColorMatrix", opts: { matrix: tintMatrix("#ff7a00", 0.2) } },
  { id: "cool", label: "冷色", cls: "ColorMatrix", opts: { matrix: tintMatrix("#0066ff", 0.2) } },
];

// ── Slider rows, rendered identically by both editors. path = "grade.sat" | "contrast" ──
export const GRADE_SECTIONS = [
  { id: "levels", title: "色階 Levels", rows: [
    { path: "grade.black", label: "黑點 Black point", step: 1, fmt: "int" },
    { path: "grade.white", label: "白點 White point", step: 1, fmt: "int" },
    { path: "grade.gamma", label: "中間調 Gamma", step: 1, fmt: "gamma" },
  ] },
  { id: "balance", title: "色彩平衡 Color Balance", rows: [
    { path: "grade.balCR", label: "青 ↔ 紅", step: 1, fmt: "signed" },
    { path: "grade.balMG", label: "洋紅 ↔ 綠", step: 1, fmt: "signed" },
    { path: "grade.balYB", label: "黃 ↔ 藍", step: 1, fmt: "signed" },
  ] },
  { id: "basic", title: "基本 Basic", rows: [
    { path: "grade.bri", label: "亮度 Brightness", step: 1, fmt: "pct" },
    { path: "contrast", label: "對比 Contrast", step: 1, fmt: "signed" },
    { path: "grade.sat", label: "飽和 Saturation", step: 1, fmt: "pct" },
    { path: "vibrance", label: "自然飽和 Vibrance", step: 1, fmt: "signed" },
    { path: "grade.hue", label: "色相 Hue", step: 1, fmt: "deg" },
    { path: "temp", label: "色溫 冷↔暖", step: 1, fmt: "signed" },
    { path: "shadows", label: "陰影 Shadows", step: 1, fmt: "signed" },
    { path: "highlights", label: "高光 Highlights", step: 1, fmt: "signed" },
    { path: "grade.sharpen", label: "銳利 Sharpen", step: 0.5, fmt: "off" },
    { path: "blur", label: "高斯模糊 Blur", step: 1, fmt: "int" },
    { path: "noise", label: "雜訊 Noise", step: 1, fmt: "int" },
  ] },
  { id: "raw", title: "Camera RAW 效果", rows: [
    { path: "exposure", label: "曝光 Exposure", step: 1, fmt: "signed" },
    { path: "clarity", label: "清晰度 Clarity", step: 1, fmt: "signed" },
    { path: "dehaze", label: "去霧 Dehaze", step: 1, fmt: "signed" },
  ] },
];
export const limitOf = (path) => (path.startsWith("grade.") ? GRADE_LIMITS[path.slice(6)] : EFFECT_LIMITS[path]);
export const getPath = (adj, path) => (path.startsWith("grade.") ? adj.grade[path.slice(6)] : adj[path]);
/** Returns a new adj with `path` set (clamped to its bounds). */
export function setPath(adj, path, v) {
  const lim = limitOf(path);
  const n = clampN(finite(v, lim.neutral), lim.min, lim.max);
  return path.startsWith("grade.") ? { ...adj, grade: { ...adj.grade, [path.slice(6)]: n } } : { ...adj, [path]: n };
}
export function fmtValue(fmt, v) {
  if (fmt === "pct") return `${v}%`;
  if (fmt === "deg") return `${v}°`;
  if (fmt === "gamma") return (v / 100).toFixed(2);
  if (fmt === "off") return v === 0 ? "關" : `${v}`;
  if (fmt === "signed") return v > 0 ? `+${v}` : `${v}`;
  return `${v}`;
}

// ── HSL 色彩混合器 (Photoshop-style, 8 hue ranges × H/S/L + global "all") ──
/** 8 perceptual hue ranges: center in normalized hue (0–1), half-width in the same units. */
export const HSL_RANGES = [
  { key: "red", label: "紅", color: "#FF3B30", center: 0, hw: 0.083 },
  { key: "orange", label: "橘黃", color: "#FF9500", center: 0.083, hw: 0.083 },
  { key: "yellow", label: "黃", color: "#FFCC00", center: 0.167, hw: 0.083 },
  { key: "green", label: "綠", color: "#34C759", center: 0.333, hw: 0.167 },
  { key: "aqua", label: "水綠", color: "#00C7BE", center: 0.5, hw: 0.083 },
  { key: "blue", label: "藍", color: "#0A84FF", center: 0.667, hw: 0.111 },
  { key: "purple", label: "紫", color: "#BF5AF2", center: 0.778, hw: 0.097 },
  { key: "magenta", label: "洋紅", color: "#FF375F", center: 0.875, hw: 0.083 },
];
export const HSL_KEYS = ["all", ...HSL_RANGES.map((r) => r.key)];
export const HSL_AXES = [
  { axis: "h", label: "色相 Hue", min: -40, max: 40 },
  { axis: "s", label: "飽和度 Saturation", min: -100, max: 100 },
  { axis: "l", label: "明度 Luminance", min: -100, max: 100 },
];
export const hslNeutral = () => Object.fromEntries(HSL_KEYS.map((k) => [k, { h: 0, s: 0, l: 0 }]));
export function hasAnyHsl(state) {
  return Object.values(state).some((a) => a.h !== 0 || a.s !== 0 || a.l !== 0);
}
/** Untrusted value (design JSON / img.adj) → valid state; non-finite / out-of-range → neutral/clamped. */
export function sanitizeHsl(raw) {
  const out = hslNeutral();
  if (!raw || typeof raw !== "object") return out;
  for (const key of HSL_KEYS) {
    const e = raw[key];
    if (e && typeof e === "object") {
      out[key] = { h: clampN(finite(e.h, 0), -40, 40), s: clampN(finite(e.s, 0), -100, 100), l: clampN(finite(e.l, 0), -100, 100) };
    }
  }
  return out;
}

function hueDist(a, b) { const d = Math.abs(a - b); return d > 0.5 ? 1 - d : d; }
function rangeWeight(hue, center, hw) {
  const d = hueDist(hue, center);
  if (d >= hw) return 0;
  const t = 1 - d / hw;
  return t * t; // quadratic falloff → smooth Photoshop-like boundary
}
function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}
/** In-place per-pixel HSL mix on an RGBA Uint8ClampedArray. */
export function applyHslPixels(data, state) {
  const allAdj = state.all;
  const active = HSL_RANGES.filter((r) => { const a = state[r.key]; return a.h !== 0 || a.s !== 0 || a.l !== 0; });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip fully transparent
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    let totalW = 0, wdh = 0, wds = 0, wdl = 0; // Lightroom-style: normalise by the total weight
    for (const range of active) {
      const w = rangeWeight(h, range.center, range.hw);
      if (w > 0) { const a = state[range.key]; wdh += a.h * w; wds += a.s * w; wdl += a.l * w; totalW += w; }
    }
    const dh = totalW > 0 ? wdh / totalW : 0, ds = totalW > 0 ? wds / totalW : 0, dl = totalW > 0 ? wdl / totalW : 0;
    const nh = (((h + (dh + allAdj.h) / 360) % 1) + 1) % 1;
    const ns = Math.max(0, Math.min(1, s + (ds + allAdj.s) / 100));
    const nl = Math.max(0, Math.min(1, l + (dl + allAdj.l) / 100));
    const [nr, ng, nb] = hslToRgb(nh, ns, nl);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
}

// ── 高斯模糊: 3-pass edge-clamped box blur on premultiplied RGBA (same pixels on Fabric 5 and 7) ──
export function blurRadius(blur, w, h) { return Math.max(1, Math.round((clampN(finite(blur, 0), 0, 100) / 100) * 0.06 * Math.max(w, h))); }
function boxPass(src, dst, w, h, r, horizontal) {
  const len = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 4 : w * 4, lineStep = horizontal ? w * 4 : 4, win = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    for (let c = 0; c < 4; c++) {
      const at = (i) => src[base + (i < 0 ? 0 : i >= len ? len - 1 : i) * step + c];
      let sum = (r + 1) * at(0);
      for (let i = 1; i <= r; i++) sum += at(i);
      for (let i = 0; i < len; i++) { dst[base + i * step + c] = sum / win; sum += at(i + r + 1) - at(i - r); }
    }
  }
}
/** In-place blur of an ImageData-like {data,width,height}; blur 0..100. */
export function applyBlurPixels(imageData, blur) {
  const { data, width: w, height: h } = imageData, n = w * h * 4;
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i += 4) { const al = data[i + 3] / 255; a[i] = data[i] * al; a[i + 1] = data[i + 1] * al; a[i + 2] = data[i + 2] * al; a[i + 3] = data[i + 3]; }
  const r = Math.max(1, Math.round(blurRadius(blur, w, h) / 2));
  for (let pass = 0; pass < 3; pass++) { boxPass(a, b, w, h, r, true); boxPass(b, a, w, h, r, false); }
  for (let i = 0; i < n; i += 4) {
    const al = a[i + 3] / 255;
    data[i + 3] = Math.round(a[i + 3]);
    data[i] = al > 0 ? Math.round(a[i] / al) : 0; data[i + 1] = al > 0 ? Math.round(a[i + 1] / al) : 0; data[i + 2] = al > 0 ? Math.round(a[i + 2] / al) : 0;
  }
}

// ── adj object ──
export const gradeNeutral = () => Object.fromEntries(Object.entries(GRADE_LIMITS).map(([k, v]) => [k, v.neutral]));
export function neutralAdj() {
  return {
    grade: gradeNeutral(), presetId: null, removeWhite: false,
    ...Object.fromEntries(Object.entries(EFFECT_LIMITS).map(([k, v]) => [k, v.neutral])),
    hslMixer: hslNeutral(), removeColor: null, legacy: [],
  };
}
const HEX6 = /^#[0-9a-f]{6}$/i;
const LEGACY_MAX = 24;
const ADJ_KEYS = Object.keys(neutralAdj());
/** Untrusted → { color: "#rrggbb", distance } (clamped) or null (= colour key off). */
export function sanitizeRemoveColor(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.color !== "string" || !HEX6.test(raw.color)) return null;
  const L = REMOVE_COLOR_LIMITS;
  return { color: raw.color.toLowerCase(), distance: clampN(finite(raw.distance, L.neutral), L.min, L.max) };
}
/** Untrusted → plain-JSON filter objects ({ type, ...params }); anything else is dropped. */
export function sanitizeLegacy(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (out.length >= LEGACY_MAX) break;
    if (!e || typeof e !== "object" || typeof e.type !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(e.type)) continue;
    try { out.push(JSON.parse(JSON.stringify(e))); } catch { /* not plain JSON → drop */ }
  }
  return out;
}
/** Untrusted value (design JSON / img.adj, old canvas shape included) → complete, clamped adj. */
export function sanitizeAdj(raw) {
  const out = neutralAdj();
  if (!raw || typeof raw !== "object") return out;
  const g = raw.grade && typeof raw.grade === "object" ? raw.grade : {};
  for (const [k, lim] of Object.entries(GRADE_LIMITS)) out.grade[k] = clampN(finite(g[k], lim.neutral), lim.min, lim.max);
  for (const [k, lim] of Object.entries(EFFECT_LIMITS)) out[k] = clampN(finite(raw[k], lim.neutral), lim.min, lim.max);
  out.presetId = PRESETS.some((p) => p.id === raw.presetId) ? raw.presetId : null;
  out.removeWhite = !!raw.removeWhite;
  out.hslMixer = sanitizeHsl(raw.hslMixer);
  out.removeColor = sanitizeRemoveColor(raw.removeColor);
  out.legacy = sanitizeLegacy(raw.legacy);
  return out;
}
export function isNeutralAdj(adj) {
  const a = sanitizeAdj(adj), n = neutralAdj();
  return JSON.stringify(a) === JSON.stringify(n);
}
/** 調色 重設: everything the 調色 panel owns back to neutral; the 去背 colour key and legacy filters are not its to touch. */
export function resetGradeAdj(adj) {
  const a = sanitizeAdj(adj), n = neutralAdj();
  n.removeColor = a.removeColor; n.legacy = a.legacy;
  return n;
}
export function isGradeNeutral(adj) { return JSON.stringify(resetGradeAdj(adj)) === JSON.stringify(sanitizeAdj(adj)); }
/** 去背: set / clear only the colour key. */
export function setRemoveColor(adj, color, distance) { return { ...sanitizeAdj(adj), removeColor: sanitizeRemoveColor({ color, distance }) }; }
export function clearRemoveColor(adj) { return { ...sanitizeAdj(adj), removeColor: null }; }

/** Fabric filter instances → serialized legacy list (each filter's own toObject()). Used only to adopt an image that has filters but no usable adj. */
export function serializeFilters(filters) {
  const out = [];
  for (const f of filters || []) {
    if (!f) continue;
    let o;
    try { o = typeof f.toObject === "function" ? f.toObject() : {}; } catch { continue; }
    const type = (o && o.type) || f.type || (f.constructor && f.constructor.type);
    if (typeof type === "string") out.push({ ...o, type });
  }
  return sanitizeLegacy(out);
}
/**
 * The adj to show / edit for an image. A usable adj (only keys this module knows) is sanitized; an image that has filters but
 * no adj — or an adj shape sanitizeAdj cannot map — gets a neutral adj whose `legacy` holds its filters verbatim, so the first
 * 調色 / 去背 edit rebuilds exactly the picture it had, plus the edit.
 */
/** Same class and equal values on every key both serialized filters carry (numbers ±1e-6, strings case-insensitive, rest by JSON). */
function sameFilter(x, y) {
  if (x.type !== y.type) return false;
  for (const k of Object.keys(x)) {
    if (k === "type" || !(k in y)) continue;
    const u = x[k], v = y[k];
    if (typeof u === "number" && typeof v === "number") { if (Math.abs(u - v) > 1e-6) return false; }
    else if (typeof u === "string" && typeof v === "string") { if (u.toLowerCase() !== v.toLowerCase()) return false; }
    else if (JSON.stringify(u) !== JSON.stringify(v)) return false;
  }
  return true;
}
export function adoptAdj(raw, filters) {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).every((k) => ADJ_KEYS.includes(k))) {
    // A usable adj can still sit next to filters it does not produce (an old 去背 block's colour key, a hand-added filter):
    // keep those in adj.legacy instead of letting the next rebuild drop them (Codex 697e7d45 F1). A filter counts as the
    // adj's own only when buildFilterSpecs(adj) yields the same class with the same values (every key both sides carry);
    // no class gets special treatment, nothing is ever dropped, and the adj's own filters are never adopted twice.
    const a = sanitizeAdj(raw);
    const want = buildFilterSpecs(a).map((sp) => ({ type: sp.cls, ...(sp.opts || {}) }));
    const extra = [];
    for (const f of serializeFilters(filters)) {
      const i = want.findIndex((w) => sameFilter(w, f));
      if (i >= 0) want.splice(i, 1); else extra.push(f);
    }
    if (extra.length) a.legacy = sanitizeLegacy([...a.legacy, ...extra]);
    return a;
  }
  const a = neutralAdj();
  a.legacy = serializeFilters(filters);
  return a;
}

// ── adj → ordered filter specs [{cls, opts}] (order: grade → 去白底/去背色鍵/預設 → effects → HSL → legacy) ──
export const REMOVE_WHITE = { color: "#ffffff", distance: 0.12 };
export function buildFilterSpecs(rawAdj) {
  const adj = sanitizeAdj(rawAdj), g = adj.grade, out = [];
  const add = (cls, opts) => out.push({ cls, opts });
  // grade (Levels / balance / hue / sat / bri / sharpen)
  if (g.hue !== 0) add("HueRotation", { rotation: g.hue / 180 }); // Fabric rotation is −1..1 = ±180°
  if (g.sat !== 100) add("Saturation", { saturation: clampN(g.sat / 100 - 1, -1, 1) });
  if (g.bri !== 100) add("Brightness", { brightness: clampN(g.bri / 100 - 1, -1, 1) });
  if (!(g.black === 0 && g.white === 255) && g.white > g.black) add("Contrast", { contrast: clampN(255 / (g.white - g.black) - 1, -1, 1) }); // Levels ≈ contrast
  if (g.gamma > 100) add("Gamma", { gamma: [g.gamma / 100, g.gamma / 100, g.gamma / 100] });
  const bal = [g.balCR, g.balMG, g.balYB].map((v) => (v * 0.6) / 255); // ±100 → ±60/255, same as the Sharp bake
  if (bal.some((v) => v !== 0)) add("ColorMatrix", { matrix: [1, 0, 0, 0, bal[0], 0, 1, 0, 0, bal[1], 0, 0, 1, 0, bal[2], 0, 0, 0, 1, 0] });
  if (g.sharpen > 0) { const s = g.sharpen / 10; add("Convolute", { matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] }); }
  // 去白底 + 預設風格
  if (adj.removeWhite) add("RemoveColor", { ...REMOVE_WHITE });
  if (adj.removeColor) add("RemoveColor", { ...adj.removeColor });
  const preset = PRESETS.find((p) => p.id === adj.presetId);
  if (preset) add(preset.cls, preset.opts ? JSON.parse(JSON.stringify(preset.opts)) : undefined);
  // effects (Photoshop adjustments + Camera RAW)
  if (adj.vibrance) add("Vibrance", { vibrance: clampN(adj.vibrance / 100, -1, 1) });
  if (adj.contrast) add("Contrast", { contrast: clampN(adj.contrast / 100, -1, 1) });
  if (adj.shadows) { // + lifts the darks (gamma > 1), − crushes
    const gm = adj.shadows > 0 ? 1 + adj.shadows / 250 : 1 / (1 + Math.abs(adj.shadows) / 250);
    const gc = clampN(gm, 0.5, 2);
    add("Gamma", { gamma: [gc, gc, gc] });
  }
  if (adj.highlights) add("Brightness", { brightness: clampN(adj.highlights / 400, -0.25, 0.25) }); // no luminosity-selective filter in Fabric
  if (adj.exposure) add("Brightness", { brightness: clampN(adj.exposure / 200, -0.5, 0.5) });
  if (adj.clarity) { const s = clampN(adj.clarity / 100, 0, 1); add("Convolute", { matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] }); }
  if (adj.dehaze) { add("Contrast", { contrast: clampN(adj.dehaze / 150, 0, 0.67) }); add("Saturation", { saturation: clampN(adj.dehaze / 150, 0, 0.67) }); }
  if (adj.blur) add("AwBlur", { blur: adj.blur }); // own filter: Fabric 5 and 7 blur edges differently (v5 fades them to transparent)
  if (adj.noise) add("Noise", { noise: clampN(adj.noise * 6, 0, 600) });
  if (adj.temp) { // warm (+) adds red / removes blue; cool (−) the reverse
    const t = clampN((adj.temp / 100) * 0.25, -0.25, 0.25);
    add("ColorMatrix", { matrix: [1, 0, 0, 0, t, 0, 1, 0, 0, 0, 0, 0, 1, 0, -t, 0, 0, 0, 1, 0] });
  }
  if (hasAnyHsl(adj.hslMixer)) add("AwHsl", { state: JSON.parse(JSON.stringify(adj.hslMixer)) });
  for (const l of adj.legacy) { const { type, ...opts } = l; add(type, Object.keys(opts).length ? opts : undefined); } // an old project's own filters, after everything the panels build
  return out;
}
/** The two pixel filters buildFilterSpecs names that Fabric does not ship, defined once. Each Fabric version only wraps
 *  them in its own class syntax: Fabric 7 in app/(shell)/tools/canvas/fabric-filters.ts ensureAwFilters, Fabric 5 in
 *  editor-shared/blocks/color-grade.js ensureFabric. `f` is the filter instance; init's fields are copied onto it. */
export const AW_FILTERS = {
  AwHsl: {
    init: (o) => ({ state: sanitizeHsl(o && o.state) }),
    apply2d: (f, imageData) => applyHslPixels(imageData.data, f.state),
    neutral: (f) => !hasAnyHsl(f.state),
    toObject: (f) => ({ type: "AwHsl", state: f.state }),
  },
  AwBlur: {
    init: (o) => ({ blur: clampN(finite(o && o.blur, 0), 0, 100) }),
    apply2d: (f, imageData) => applyBlurPixels(imageData, f.blur),
    neutral: (f) => f.blur === 0,
    toObject: (f) => ({ type: "AwBlur", blur: f.blur }),
  },
};
/** specs → Fabric filter instances; `ctor(cls)` returns the editor's Fabric class for a name (null = skip). */
export function makeFilters(ctor, specs) {
  const out = [];
  for (const s of specs) { const C = ctor(s.cls); if (C) out.push(s.opts === undefined ? new C() : new C(s.opts)); }
  return out;
}
// ── 自動對比 / 自動色彩 / 自動色調: pixel analysis → slider values (RGBA Uint8ClampedArray in) ──
/** → { contrast, exposure } or null when the image has no tonal range. */
export function analyzeContrast(d) {
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (luma < lo) lo = luma;
    if (luma > hi) hi = luma;
  }
  if (hi <= lo) return null;
  const range = hi - lo, midpoint = (lo + hi) / 2;
  return {
    contrast: Math.round(Math.min(100, (255 / range - 1) * 50)),
    exposure: Math.round(Math.max(-50, Math.min(50, (127.5 - midpoint) / 2.55))),
  };
}
/** Gray-world: shift each channel toward the mean → { balCR, balMG, balYB } or null when empty. */
export function analyzeColor(d) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (n === 0) return null;
  r /= n; g /= n; b /= n;
  const gray = (r + g + b) / 3, c = (v) => Math.round(Math.max(-100, Math.min(100, (gray - v) / 2.55)));
  return { balCR: c(r), balMG: c(g), balYB: c(b) };
}
/** Fold analysis results into adj (grade.bal* + contrast/exposure), clamped. */
export function applyAuto(adj, kind, data) {
  let next = adj;
  if (kind === "contrast" || kind === "tone") {
    const a = analyzeContrast(data);
    if (a) { next = setPath(next, "contrast", a.contrast); next = setPath(next, "exposure", a.exposure); }
  }
  if (kind === "color" || kind === "tone") {
    const a = analyzeColor(data);
    if (a) { next = setPath(next, "grade.balCR", a.balCR); next = setPath(next, "grade.balMG", a.balMG); next = setPath(next, "grade.balYB", a.balYB); }
  }
  return next;
}

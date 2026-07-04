import type { ColorGradeParams } from "@/lib/studio/color-grade";

/**
 * Build Fabric image filters from the shared ColorGrade params, so the Canvas editor reuses
 * the exact same slider model as Tarot/POD Studio — just applied through Fabric's filter
 * pipeline instead of CSS/Sharp. Canvas is WYSIWYG (the filtered pixels ARE the PNG export),
 * so the multiplier→Fabric-range mapping only has to look right on screen:
 *   - hue (deg)         → HueRotation (radians)
 *   - saturation (×)    → Saturation  (-1..1, neutral 0)
 *   - brightness (×)    → Brightness  (additive -1..1 approximation)
 *   - levels black/whte → Contrast    (input-range narrowing ≈ contrast boost)
 *   - gamma             → Gamma [g,g,g]
 *   - sharpen           → Convolute   (3×3 sharpen kernel)
 *
 * `fabricNS` is the dynamically-imported `fabric` module (filters live on `fabricNS.filters`),
 * passed in so this stays a pure mapping helper with no static fabric import.
 */
const clampN = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ── Photoshop-style targeted HSL Color Mixer ────────────────────────────────────────

export type HslRange = "all" | "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";
export type HslAdj = { h: number; s: number; l: number };
export type HslMixerState = Record<HslRange, HslAdj>;

/** 8 perceptual hue ranges: center in normalized hue (0–1), half-width in same units. */
export const HSL_RANGES: { key: HslRange; label: string; color: string; center: number; hw: number }[] = [
  { key: "red",     label: "紅",  color: "#FF3B30", center: 0,     hw: 0.083 },
  { key: "orange",  label: "橘黃", color: "#FF9500", center: 0.083, hw: 0.083 },
  { key: "yellow",  label: "黃",  color: "#FFCC00", center: 0.167, hw: 0.083 },
  { key: "green",   label: "綠",  color: "#34C759", center: 0.333, hw: 0.167 },
  { key: "aqua",    label: "水綠", color: "#00C7BE", center: 0.500, hw: 0.083 },
  { key: "blue",    label: "藍",  color: "#0A84FF", center: 0.667, hw: 0.111 },
  { key: "purple",  label: "紫",  color: "#BF5AF2", center: 0.778, hw: 0.097 },
  { key: "magenta", label: "洋紅", color: "#FF375F", center: 0.875, hw: 0.083 },
];

export const HSL_NEUTRAL: HslMixerState = {
  all: { h: 0, s: 0, l: 0 }, red: { h: 0, s: 0, l: 0 }, orange: { h: 0, s: 0, l: 0 },
  yellow: { h: 0, s: 0, l: 0 }, green: { h: 0, s: 0, l: 0 }, aqua: { h: 0, s: 0, l: 0 },
  blue: { h: 0, s: 0, l: 0 }, purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 },
};

export function hasAnyHslAdjustment(state: HslMixerState): boolean {
  return Object.values(state).some(a => a.h !== 0 || a.s !== 0 || a.l !== 0);
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
}

function rangeWeight(hue: number, center: number, hw: number): number {
  const d = hueDist(hue, center);
  if (d >= hw) return 0;
  const t = 1 - d / hw;
  return t * t; // quadratic falloff → smooth Photoshop-like boundary
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn)      h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else                 h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function applyHslPixels(data: Uint8ClampedArray, state: HslMixerState): void {
  const allAdj = state.all;
  // Pre-filter to ranges that actually have non-zero adjustments (perf: skip no-op ranges)
  const activeRanges = HSL_RANGES.filter(r => {
    const a = state[r.key];
    return a.h !== 0 || a.s !== 0 || a.l !== 0;
  });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip fully transparent
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

    // Weighted sum of hue-range adjustments (Lightroom-style: normalize by total weight)
    let totalW = 0, wdh = 0, wds = 0, wdl = 0;
    for (const range of activeRanges) {
      const w = rangeWeight(h, range.center, range.hw);
      if (w > 0) {
        const adj = state[range.key];
        wdh += adj.h * w; wds += adj.s * w; wdl += adj.l * w;
        totalW += w;
      }
    }
    const dh = totalW > 0 ? wdh / totalW : 0;
    const ds = totalW > 0 ? wds / totalW : 0;
    const dl = totalW > 0 ? wdl / totalW : 0;

    const nh = ((h + (dh + allAdj.h) / 360) % 1 + 1) % 1;
    const ns = Math.max(0, Math.min(1, s + (ds + allAdj.s) / 100));
    const nl = Math.max(0, Math.min(1, l + (dl + allAdj.l) / 100));

    const [nr, ng, nb] = hslToRgb(nh, ns, nl);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
}

/**
 * Build a Photoshop-style targeted HSL Color Mixer filter.
 * 8 hue ranges × 3 axes (H/S/L) + global "all" channel.
 * Per-pixel canvas 2D processing via Fabric BaseFilter.applyTo2d.
 */
export function buildHslMixerFilter(
  fabricNS: { filters: Record<string, unknown> },
  state: HslMixerState
): object[] {
  if (!hasAnyHslAdjustment(state)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BaseFilter = (fabricNS.filters as Record<string, any>).BaseFilter as (new () => object) | undefined;
  if (!BaseFilter) return [];
  const snapshot: HslMixerState = JSON.parse(JSON.stringify(state));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class HslColorMixer extends (BaseFilter as any) {
    // Static type prevents cache-key collision with the BaseFilter identity shader in WebGL programCache.
    // Also ensures toJSON serializes "HslColorMixer" (not "BaseFilter") for correct design round-trips.
    static type = "HslColorMixer";
    type = "HslColorMixer";
    isNeutralState() { return false; }
    applyTo2d(opts: { imageData: ImageData }) { applyHslPixels(opts.imageData.data, snapshot); }
  }
  return [new HslColorMixer()];
}

/**
 * Sanitize an untrusted hslMixer value (from design JSON or img.adj) to a valid HslMixerState.
 * Coerces non-finite / out-of-range values to neutral so applyHslPixels never receives NaN.
 */
export function sanitizeHslMixer(raw: unknown): HslMixerState {
  const out: HslMixerState = JSON.parse(JSON.stringify(HSL_NEUTRAL));
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const fin = (v: unknown, lo: number, hi: number): number => {
    const n = typeof v === "number" && isFinite(v) ? v : 0;
    return Math.max(lo, Math.min(hi, n));
  };
  for (const key of (["all", ...HSL_RANGES.map(x => x.key)] as HslRange[])) {
    const entry = r[key];
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      out[key] = { h: fin(e.h, -40, 40), s: fin(e.s, -100, 100), l: fin(e.l, -100, 100) };
    }
  }
  return out;
}

type FilterCtor = new (opts?: Record<string, unknown>) => object;

/** One-click look presets → the matching Fabric filter class name. */
export const PRESET_FILTERS: { id: string; label: string; cls: string }[] = [
  { id: "sepia", label: "復古", cls: "Sepia" },
  { id: "vintage", label: "Vintage", cls: "Vintage" },
  { id: "polaroid", label: "拍立得", cls: "Polaroid" },
  { id: "kodachrome", label: "Koda", cls: "Kodachrome" },
  { id: "brownie", label: "Brownie", cls: "Brownie" },
  { id: "bw", label: "黑白", cls: "BlackWhite" },
  { id: "gray", label: "灰階", cls: "Grayscale" },
  { id: "invert", label: "反相", cls: "Invert" },
];

/**
 * Extra image-effect filters (Photoshop-style + Camera RAW), built separately and concat'd
 * with grade + preset filters at the apply site so all coexist on one image.
 *   - vibrance  −100..100 → Fabric Vibrance (-1..1)     自然飽和
 *   - blur        0..100  → Fabric Blur (0..1)           高斯模糊
 *   - noise       0..100  → Fabric Noise (0..~600)       雜訊
 *   - contrast  −100..100 → Fabric Contrast (-1..1)      對比
 *   - shadows   −100..100 → Fabric Gamma (0.5..2)        陰影（亮暗暗部）
 *   - highlights−100..100 → Fabric Brightness (scaled)   高光
 *   - exposure  −100..100 → Fabric Brightness (wider)    曝光（Camera RAW）
 *   - clarity     0..100  → Fabric Convolute (sharpen)   清晰度（Camera RAW）
 *   - dehaze      0..100  → Contrast + Saturation        去霧（Camera RAW）
 */
export function buildEffectFilters(
  fabricNS: { filters: Record<string, FilterCtor> },
  eff: {
    vibrance?: number; blur?: number; noise?: number; temp?: number;
    contrast?: number; shadows?: number; highlights?: number;
    exposure?: number; clarity?: number; dehaze?: number;
  }
): object[] {
  const F = fabricNS.filters;
  const out: object[] = [];
  if (eff.vibrance && F.Vibrance) out.push(new F.Vibrance({ vibrance: clampN(eff.vibrance / 100, -1, 1) }));
  // 對比 Contrast
  if (eff.contrast && F.Contrast) out.push(new F.Contrast({ contrast: clampN(eff.contrast / 100, -1, 1) }));
  // 陰影 Shadows: positive = lift (brighten dark areas via gamma > 1), negative = crush
  if (eff.shadows && F.Gamma) {
    const g = eff.shadows > 0 ? 1 + eff.shadows / 250 : 1 / (1 + Math.abs(eff.shadows) / 250);
    const gc = clampN(g, 0.5, 2);
    out.push(new F.Gamma({ gamma: [gc, gc, gc] }));
  }
  // 高光 Highlights: subtle brightness shift (Fabric has no luminosity-selective filter)
  if (eff.highlights && F.Brightness) {
    out.push(new F.Brightness({ brightness: clampN(eff.highlights / 400, -0.25, 0.25) }));
  }
  // 曝光 Exposure: wider brightness range than standard bri slider
  if (eff.exposure && F.Brightness) {
    out.push(new F.Brightness({ brightness: clampN(eff.exposure / 200, -0.5, 0.5) }));
  }
  // 清晰度 Clarity: mid-frequency contrast via convolution sharpen kernel, softer than Sharpen
  if (eff.clarity && F.Convolute) {
    const s = clampN(eff.clarity / 100, 0, 1);
    out.push(new F.Convolute({ matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] }));
  }
  // 去霧 Dehaze: contrast + saturation boost (approximates haze removal)
  if (eff.dehaze) {
    if (F.Contrast) out.push(new F.Contrast({ contrast: clampN(eff.dehaze / 150, 0, 0.67) }));
    if (F.Saturation) out.push(new F.Saturation({ saturation: clampN(eff.dehaze / 150, 0, 0.67) }));
  }
  if (eff.blur && F.Blur) out.push(new F.Blur({ blur: clampN(eff.blur / 100, 0, 1) }));
  if (eff.noise && F.Noise) out.push(new F.Noise({ noise: clampN(eff.noise * 6, 0, 600) }));
  // 色溫 temperature: warm (+) adds red / removes blue; cool (−) the reverse. ColorMatrix offset.
  if (eff.temp && F.ColorMatrix) {
    const t = clampN((eff.temp / 100) * 0.25, -0.25, 0.25);
    out.push(
      new F.ColorMatrix({
        // prettier-ignore
        matrix: [
          1, 0, 0, 0, t,
          0, 1, 0, 0, 0,
          0, 0, 1, 0, -t,
          0, 0, 0, 1, 0,
        ],
      })
    );
  }
  return out;
}

/**
 * Preset look + free chroma-key removal — built SEPARATELY from the colour-grade filters so
 * both can coexist on one image (the apply site concats grade + preset filter lists). RemoveColor
 * strips a near-white background (distance tolerance) for free, no Replicate call.
 */
export function buildPresetFilters(
  fabricNS: { filters: Record<string, FilterCtor> },
  presetId: string | null,
  removeWhite: boolean
): object[] {
  const F = fabricNS.filters;
  const out: object[] = [];
  if (removeWhite && F.RemoveColor) {
    out.push(new F.RemoveColor({ color: "#ffffff", distance: 0.12 }));
  }
  if (presetId) {
    const preset = PRESET_FILTERS.find((p) => p.id === presetId);
    if (preset && F[preset.cls]) out.push(new F[preset.cls]());
  }
  return out;
}

export function buildFabricImageFilters(
  fabricNS: { filters: Record<string, FilterCtor> },
  p: ColorGradeParams
): object[] {
  const F = fabricNS.filters;
  const out: object[] = [];

  if (p.hue !== 0 && F.HueRotation) {
    out.push(new F.HueRotation({ rotation: (p.hue * Math.PI) / 180 }));
  }
  if (p.saturation !== 1 && F.Saturation) {
    out.push(new F.Saturation({ saturation: clampN(p.saturation - 1, -1, 1) }));
  }
  if (p.brightness !== 1 && F.Brightness) {
    out.push(new F.Brightness({ brightness: clampN(p.brightness - 1, -1, 1) }));
  }
  // Levels black/white-point → contrast approximation (skip when neutral or degenerate).
  if (!(p.black === 0 && p.white === 255) && p.white > p.black && F.Contrast) {
    out.push(new F.Contrast({ contrast: clampN(255 / (p.white - p.black) - 1, -1, 1) }));
  }
  if (p.gamma > 1 && F.Gamma) {
    out.push(new F.Gamma({ gamma: [p.gamma, p.gamma, p.gamma] }));
  }
  // Colour balance → ColorMatrix per-channel offset (5th column, 0..1 scale; matches the
  // Sharp ±100→±60/255 mapping). 青紅/洋紅綠/黃藍 add to R/G/B respectively.
  const balR = ((p.balCR ?? 0) * 0.6) / 255;
  const balG = ((p.balMG ?? 0) * 0.6) / 255;
  const balB = ((p.balYB ?? 0) * 0.6) / 255;
  if ((balR !== 0 || balG !== 0 || balB !== 0) && F.ColorMatrix) {
    out.push(
      new F.ColorMatrix({
        // prettier-ignore
        matrix: [
          1, 0, 0, 0, balR,
          0, 1, 0, 0, balG,
          0, 0, 1, 0, balB,
          0, 0, 0, 1, 0,
        ],
      })
    );
  }
  if (p.sharpen > 0 && F.Convolute) {
    out.push(new F.Convolute({ matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0] }));
  }
  return out;
}

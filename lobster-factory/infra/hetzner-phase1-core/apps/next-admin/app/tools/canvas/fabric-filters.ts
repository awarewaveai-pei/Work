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
 * Extra image-effect filters (Photoshop-style), built separately and concat'd with grade +
 * preset filters at the apply site so all coexist on one image.
 *   - vibrance −100..100 → Fabric Vibrance (-1..1)  自然飽和
 *   - blur       0..100   → Fabric Blur (0..1)        高斯模糊
 *   - noise      0..100   → Fabric Noise (0..~600)    雜訊
 */
export function buildEffectFilters(
  fabricNS: { filters: Record<string, FilterCtor> },
  eff: { vibrance?: number; blur?: number; noise?: number }
): object[] {
  const F = fabricNS.filters;
  const out: object[] = [];
  if (eff.vibrance && F.Vibrance) out.push(new F.Vibrance({ vibrance: clampN(eff.vibrance / 100, -1, 1) }));
  if (eff.blur && F.Blur) out.push(new F.Blur({ blur: clampN(eff.blur / 100, 0, 1) }));
  if (eff.noise && F.Noise) out.push(new F.Noise({ noise: clampN(eff.noise * 6, 0, 600) }));
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

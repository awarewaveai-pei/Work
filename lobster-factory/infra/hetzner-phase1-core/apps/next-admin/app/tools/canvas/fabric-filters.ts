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
  if (p.sharpen > 0 && F.Convolute) {
    out.push(new F.Convolute({ matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0] }));
  }
  return out;
}

import type { ColorGradeParams } from "@/lib/studio/color-grade";
import { applyBlurPixels, applyHslPixels, hasAnyHsl, sanitizeHsl, type HslMixerState } from "@/lib/studio/editor-color-grade";

/**
 * Legacy ColorGradeParams → Fabric filters for Tarot print + Studio GradedPreview (the Sharp-shaped slider model).
 * The Canvas Editor and Vector Editor do NOT use buildFabricImageFilters: their 🎨 調色 math (grade filters, presets,
 * effects, HSL mixer) is public/editor-shared/color-grade.js, reached via lib/studio/editor-color-grade.ts.
 * `fabricNS` is the dynamically-imported `fabric` module, passed in so this stays a pure mapping helper.
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

type AwCtor = new (o?: Record<string, unknown>) => object;
let awFilters: Record<string, AwCtor> | null = null;

/**
 * The pixel filters the 調色 spec builder names that Fabric does not ship (AwHsl = HSL mixer, AwBlur = edge-clamped blur), for Fabric 7.
 * Built lazily (BaseFilter exists only after the dynamic fabric import) and registered in classRegistry, so undo / design load and
 * the Vector Editor's own AwHsl / AwBlur round-trip through JSON. State lives on the instance → toObject carries it;
 * the pixel math is the shared applyHslPixels / applyBlurPixels.
 */
export function ensureAwFilters(fabricNS: unknown): Record<string, AwCtor> {
  if (awFilters) return awFilters;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ns = fabricNS as { filters: Record<string, any>; classRegistry?: { setClass: (c: unknown, name?: string) => void } };
  const Base = ns.filters.BaseFilter as new (o?: object) => object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class AwHsl extends (Base as any) {
    static type = "AwHsl";
    state: HslMixerState;
    constructor(o?: { state?: unknown }) { super(); this.state = sanitizeHsl(o?.state); }
    isNeutralState() { return !hasAnyHsl(this.state); }
    applyTo2d(opts: { imageData: ImageData }) { applyHslPixels(opts.imageData.data, this.state); }
    toObject() { return { type: "AwHsl", state: this.state }; }
    static async fromObject(o: { state?: unknown }) { return new AwHsl(o); }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class AwBlur extends (Base as any) {
    static type = "AwBlur";
    blur: number;
    constructor(o?: { blur?: unknown }) { super(); this.blur = typeof o?.blur === "number" && Number.isFinite(o.blur) ? Math.min(100, Math.max(0, o.blur)) : 0; }
    isNeutralState() { return this.blur === 0; }
    applyTo2d(opts: { imageData: ImageData }) { applyBlurPixels(opts.imageData, this.blur); }
    toObject() { return { type: "AwBlur", blur: this.blur }; }
    static async fromObject(o: { blur?: unknown }) { return new AwBlur(o); }
  }
  ns.classRegistry?.setClass(AwHsl, "AwHsl");
  ns.classRegistry?.setClass(AwBlur, "AwBlur");
  awFilters = { AwHsl: AwHsl as unknown as AwCtor, AwBlur: AwBlur as unknown as AwCtor };
  return awFilters;
}

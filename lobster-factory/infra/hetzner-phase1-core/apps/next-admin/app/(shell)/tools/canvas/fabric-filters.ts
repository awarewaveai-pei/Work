import type { ColorGradeParams } from "@/lib/studio/color-grade";
import { AW_FILTERS } from "@/lib/studio/editor-color-grade";

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
    // Fabric multiplies rotation by π itself (rotation −1..1 = ±180°): degrees / 180, never radians (radians turned 30° into ~94°)
    out.push(new F.HueRotation({ rotation: p.hue / 180 }));
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
 * Built lazily (BaseFilter exists only after the dynamic fabric import) and registered in classRegistry, so undo and design load
 * round-trip through JSON. Fields, pixel math and toObject come from the shared AW_FILTERS (editor-shared/color-grade.js);
 * this only wraps each definition in a Fabric 7 class.
 */
export function ensureAwFilters(fabricNS: unknown): Record<string, AwCtor> {
  if (awFilters) return awFilters;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ns = fabricNS as { filters: Record<string, any>; classRegistry?: { setClass: (c: unknown, name?: string) => void } };
  const Base = ns.filters.BaseFilter as new (o?: object) => object;
  const made: Record<string, AwCtor> = {};
  for (const [name, def] of Object.entries(AW_FILTERS)) {
    const self = (f: unknown) => f as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class Aw extends (Base as any) {
      static type = name;
      constructor(o?: Record<string, unknown>) { super(); Object.assign(this, def.init(o)); }
      isNeutralState() { return def.neutral(self(this)); }
      applyTo2d(opts: { imageData: ImageData }) { def.apply2d(self(this), opts.imageData); }
      toObject() { return def.toObject(self(this)); }
      static async fromObject(o: Record<string, unknown>) { return new Aw(o); }
    }
    ns.classRegistry?.setClass(Aw, name);
    made[name] = Aw as unknown as AwCtor;
  }
  awFilters = made;
  return awFilters;
}

// Drift guard for the 🎨 調色 union (CARD-05): the colour math is ONE file, public/editor-shared/color-grade.js, used by
// /tools/canvas (via lib/studio/editor-color-grade.ts) and public/vector-editor.html (<script type="module">).
// This test fails if (a) the shared limits drift from the Sharp-bake model, (b) the spec builder drifts from the legacy
// params mapping it replaced, (c) either editor grows a private copy of the math again.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GRADE_LIMITS as BAKE_LIMITS, NEUTRAL_STATE, stateToParams } from "../color-grade";
import {
  EFFECT_LIMITS, GRADE_LIMITS, GRADE_SECTIONS, PRESETS, applyAuto, applyBlurPixels, applyHslPixels, buildFilterSpecs, getPath, hslNeutral,
  isGradeFilter, isNeutralAdj, limitOf, makeFilters, neutralAdj, sanitizeAdj, setPath,
} from "../editor-color-grade";
import { buildFabricImageFilters } from "../../../app/(shell)/tools/canvas/fabric-filters";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");

describe("shared limits = the Sharp bake model", () => {
  it("GRADE_LIMITS equals lib/studio/color-grade GRADE_LIMITS", () => {
    expect(GRADE_LIMITS).toEqual(BAKE_LIMITS);
  });
  it("neutral adj.grade equals NEUTRAL_STATE", () => {
    expect(neutralAdj().grade).toEqual(NEUTRAL_STATE);
  });
  it("every slider row has bounds, a neutral inside them, and round-trips through setPath/getPath (clamped)", () => {
    const paths = GRADE_SECTIONS.flatMap((s) => s.rows.map((r) => r.path));
    expect(new Set(paths).size).toBe(paths.length);
    // every limit is reachable from a row: the panel exposes all of grade.* and all effect fields
    expect(paths.filter((p) => p.startsWith("grade.")).sort()).toEqual(Object.keys(GRADE_LIMITS).map((k) => `grade.${k}`).sort());
    expect(paths.filter((p) => !p.startsWith("grade.")).sort()).toEqual(Object.keys(EFFECT_LIMITS).sort());
    for (const p of paths) {
      const lim = limitOf(p);
      expect(lim.min).toBeLessThan(lim.max);
      expect(lim.neutral).toBeGreaterThanOrEqual(lim.min);
      expect(lim.neutral).toBeLessThanOrEqual(lim.max);
      expect(getPath(setPath(neutralAdj(), p, lim.max + 1000), p)).toBe(lim.max);
      expect(getPath(setPath(neutralAdj(), p, lim.min - 1000), p)).toBe(lim.min);
      expect(getPath(setPath(neutralAdj(), p, Number.NaN), p)).toBe(lim.neutral);
    }
  });
});

describe("buildFilterSpecs", () => {
  it("neutral adj builds nothing; any single move builds something", () => {
    expect(buildFilterSpecs(neutralAdj())).toEqual([]);
    expect(isNeutralAdj(neutralAdj())).toBe(true);
    for (const p of GRADE_SECTIONS.flatMap((s) => s.rows.map((r) => r.path))) {
      const lim = limitOf(p);
      const moved = setPath(neutralAdj(), p, lim.neutral === lim.max ? lim.min : lim.max);
      expect(isNeutralAdj(moved), p).toBe(false);
      expect(buildFilterSpecs(moved).length, p).toBeGreaterThan(0);
    }
  });
  it("the grade filters match the legacy ColorGradeParams mapping (levels / gamma / sat / bri / balance), hue fixed to Fabric's ±1 scale", () => {
    const adj = sanitizeAdj({ grade: { hue: 0, sat: 130, bri: 90, black: 20, white: 230, gamma: 150, sharpen: 10, balCR: 40, balMG: -20, balYB: 10 } });
    const rec: { cls: string; opts: unknown }[] = [];
    const F = new Proxy({}, { get: (_t, cls: string) => class { constructor(o?: unknown) { rec.push({ cls, opts: o }); } } }) as Record<string, new (o?: Record<string, unknown>) => object>;
    buildFabricImageFilters({ filters: F }, stateToParams(adj.grade));
    expect(buildFilterSpecs(adj).map((s) => ({ cls: s.cls, opts: s.opts }))).toEqual(rec);
  });
  it("hue 30° is Fabric rotation 1/6 (Fabric multiplies by π) — not 30·π/180 radians", () => {
    expect(buildFilterSpecs(setPath(neutralAdj(), "grade.hue", 30))).toEqual([{ cls: "HueRotation", opts: { rotation: 30 / 180 } }]);
  });
  it("order is grade → 去白底/預設 → effects → HSL, and every preset builds a spec with a class name", () => {
    const adj = sanitizeAdj({ grade: { sat: 120 }, removeWhite: true, presetId: "sepia", contrast: 10, hslMixer: { all: { h: 10, s: 0, l: 0 } } });
    expect(buildFilterSpecs(adj).map((s) => s.cls)).toEqual(["Saturation", "RemoveColor", "Sepia", "Contrast", "AwHsl"]);
    expect(PRESETS.map((p) => p.label)).toEqual(expect.arrayContaining(["復古", "拍立得", "黑白", "灰階", "反相", "暖色", "冷色"]));
    for (const p of PRESETS) expect(buildFilterSpecs(sanitizeAdj({ presetId: p.id }))[0].cls).toBe(p.cls);
  });
  it("makeFilters instantiates with the options, and skips classes the editor lacks", () => {
    const made = makeFilters((cls) => (cls === "Saturation" ? class { opts: unknown; constructor(o?: unknown) { this.opts = o; } } : null), buildFilterSpecs(sanitizeAdj({ grade: { sat: 120, bri: 90 } })));
    expect(made).toHaveLength(1);
    expect((made[0] as { opts: { saturation: number } }).opts.saturation).toBeCloseTo(0.2, 10);
  });
});

describe("sanitizeAdj", () => {
  it("fills the old Canvas Editor shape (no new keys) and clamps garbage", () => {
    const old = { grade: { hue: 5, sat: 120, bri: 100 }, presetId: "vintage", removeWhite: true, vibrance: 20, temp: -10, blur: 0, noise: 0, contrast: 5, shadows: 0, highlights: 0, exposure: 0, clarity: 0, dehaze: 0 };
    const a = sanitizeAdj(old);
    expect(a.grade).toEqual({ ...NEUTRAL_STATE, hue: 5, sat: 120 });
    expect(a.presetId).toBe("vintage");
    expect(a.hslMixer).toEqual(hslNeutral());
    const bad = sanitizeAdj({ grade: { sat: 9999, white: "x" }, presetId: "nope", contrast: Infinity, hslMixer: { red: { h: 999, s: NaN, l: -999 } } });
    expect(bad.grade.sat).toBe(200);
    expect(bad.grade.white).toBe(255);
    expect(bad.presetId).toBeNull();
    expect(bad.contrast).toBe(0);
    expect(bad.hslMixer.red).toEqual({ h: 40, s: 0, l: -100 });
    expect(sanitizeAdj(null)).toEqual(neutralAdj());
  });
});

describe("pixel math", () => {
  it("HSL mixer: neutral leaves pixels alone; all.h +120 turns red into green; transparent pixels are skipped", () => {
    const px = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 0]);
    applyHslPixels(px, hslNeutral());
    expect(Array.from(px)).toEqual([255, 0, 0, 255, 255, 0, 0, 0]);
    const st = hslNeutral();
    st.all.h = 40; // max range is ±40° → red goes toward orange/yellow, hue only
    applyHslPixels(px, st);
    expect(px[3]).toBe(255);
    expect(px[1]).toBeGreaterThan(100); // green channel rose
    expect(px[4]).toBe(255); // the alpha-0 pixel was not touched
    expect(px[5]).toBe(0);
  });
  it("blur: flat colour stays, a hard edge softens, transparent pixels do not darken the colour (premultiplied)", () => {
    const w = 8, h = 8, data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([200, 100, 50, 255], i * 4);
    applyBlurPixels({ data, width: w, height: h }, 100);
    expect(Array.from(data.slice(0, 4))).toEqual([200, 100, 50, 255]);
    const edge = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) edge.set(x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * w + x) * 4);
    applyBlurPixels({ data: edge, width: w, height: h }, 100);
    const mid = (y: number, x: number) => Array.from(edge.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
    expect(mid(3, 3)[2]).toBeGreaterThan(0); // blue bled left across the edge
    expect(mid(3, 4)[0]).toBeGreaterThan(0); // red bled right
    const half = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) half.set(x < 4 ? [255, 0, 0, 255] : [0, 0, 0, 0], (y * w + x) * 4);
    applyBlurPixels({ data: half, width: w, height: h }, 100);
    expect(half[(3 * w + 3) * 4]).toBe(255); // still full red where alpha > 0, not faded toward black
  });
  it("applyAuto: a dim, low-contrast, tinted image gets contrast + exposure + balance; a flat one gets none", () => {
    const d = new Uint8ClampedArray(4 * 4);
    for (let i = 0; i < 4; i++) { const v = 60 + i * 20; d.set([v + 30, v, v - 20 < 0 ? 0 : v - 20, 255], i * 4); }
    const a = applyAuto(neutralAdj(), "tone", d);
    expect(a.contrast).toBeGreaterThan(0);
    expect(a.exposure).not.toBe(0);
    expect(a.grade.balCR).toBeLessThan(0); // too red → pull red down
    const flat = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    expect(applyAuto(neutralAdj(), "contrast", flat)).toEqual(neutralAdj());
  });
  it("isGradeFilter keeps only a foreign RemoveColor (the 去背 block's), regenerates everything else", () => {
    expect(isGradeFilter({ type: "Brightness" })).toBe(true);
    expect(isGradeFilter({ type: "RemoveColor", color: "#ffffff", distance: 0.12 })).toBe(true);
    expect(isGradeFilter({ type: "RemoveColor", color: "#ffffff", distance: 0.15 })).toBe(false);
    expect(isGradeFilter({ type: "RemoveColor", color: "#00ff00", distance: 0.12 })).toBe(false);
  });
});

describe("no private copy of the math in either editor", () => {
  const vector = read("public/vector-editor.html");
  const canvasTsx = read("app/(shell)/tools/canvas/CanvasEditor.tsx");
  const filtersTs = read("app/(shell)/tools/canvas/fabric-filters.ts");
  it("vector loads the shared module, carries adj in toObject, and has no old adjust block / local filter maths", () => {
    expect(vector).toMatch(/<script type="module">[^<]*editor-shared\/color-grade\.js/);
    expect(vector).toMatch(/const LAYER_PROPS=\[[^\]]*'adj'/);
    expect(vector).not.toMatch(/id:'adjust'/);
    expect(vector).not.toMatch(/new F\.(Brightness|Contrast|Saturation|HueRotation|BlendColor|Convolute|Noise)\(/);
    expect(vector).not.toMatch(/rgbToHsl|PRESETS\s*=\s*\{/);
    expect((vector.match(/<summary>🎨 調色<\/summary>/g) ?? []).length).toBe(1);
    // the 調色 panel sits right after 圖層 and before the 去背 block (CARD-04 order)
    expect(vector.indexOf("<summary>🗂 圖層</summary>")).toBeLessThan(vector.indexOf('id="gradePanel"'));
    expect(vector.indexOf('id="gradePanel"')).toBeLessThan(vector.indexOf('<details id="exportPanel">'));
  });
  it("canvas reads the shared module only; the old per-panel state and builders are gone", () => {
    expect(canvasTsx).toContain('from "@/lib/studio/editor-color-grade"');
    expect(canvasTsx).not.toMatch(/buildEffectFilters|buildPresetFilters|buildHslMixerFilter|PRESET_FILTERS|sanitizeHslMixer|useColorGrade|ColorGradePanel/);
    expect(canvasTsx).not.toMatch(/id="(adjust|cameraraw|hslmixer|filters)"/);
    expect((canvasTsx.match(/title="🎨 調色"/g) ?? []).length).toBe(1);
    expect(filtersTs).not.toMatch(/rgbToHsl|PRESET_FILTERS|buildEffectFilters/);
  });
});

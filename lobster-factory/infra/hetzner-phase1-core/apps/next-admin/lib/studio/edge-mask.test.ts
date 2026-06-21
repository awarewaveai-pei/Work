import { describe, expect, it } from "vitest";
import {
  EDGE_MASK_STYLES,
  buildMaskSvg,
  getEdgeMaskStyle,
  type EdgeMaskId,
} from "./edge-mask";

const ASSET_IDS: EdgeMaskId[] = Array.from(
  { length: 16 },
  (_, i) => `mask-${String(i + 1).padStart(2, "0")}` as EdgeMaskId,
);
const PROCEDURAL_IDS: EdgeMaskId[] = [
  "dry-brush",
  "soft-brush",
  "flat-brush",
  "comb-brush",
  "calligraphy-brush",
  "chalk-brush",
  "stipple-brush",
  "scratch-brush",
];
const ALL_IDS: EdgeMaskId[] = [...ASSET_IDS, ...PROCEDURAL_IDS];

describe("edge-mask registry", () => {
  it("exposes 16 asset + 8 procedural = 24 styles with unique ids + bilingual labels", () => {
    expect(EDGE_MASK_STYLES).toHaveLength(24);
    const ids = EDGE_MASK_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(24);
    expect(ids).toEqual(ALL_IDS);
    for (const s of EDGE_MASK_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.labelEn.length).toBeGreaterThan(0);
      expect(["asset", "texture"]).toContain(s.kind);
    }
  });

  it("asset styles carry a /edge-masks/ maskUrl and no build fn", () => {
    for (const id of ASSET_IDS) {
      const s = getEdgeMaskStyle(id)!;
      expect(s.kind).toBe("asset");
      expect(s.maskUrl).toBe(`/edge-masks/${id}.png`);
      expect(s.build).toBeUndefined();
    }
  });

  it("procedural styles carry a build fn and no maskUrl", () => {
    for (const id of PROCEDURAL_IDS) {
      const s = getEdgeMaskStyle(id)!;
      expect(s.kind).toBe("texture");
      expect(typeof s.build).toBe("function");
      expect(s.maskUrl).toBeUndefined();
    }
  });

  it("getEdgeMaskStyle resolves known ids and rejects unknown ones", () => {
    expect(getEdgeMaskStyle("dry-brush")?.label).toBe("乾毛筆筆刷");
    expect(getEdgeMaskStyle("mask-01")?.labelEn).toBe("Brush 1");
    expect(getEdgeMaskStyle("nope" as EdgeMaskId)).toBeUndefined();
  });
});

describe("buildMaskSvg", () => {
  it("produces a valid white-on-transparent SVG with feTurbulence for procedural styles", () => {
    for (const id of PROCEDURAL_IDS) {
      const svg = buildMaskSvg(id, 800, 1000, { amount: 55, seed: 7 });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('width="800"');
      expect(svg).toContain('height="1000"');
      expect(svg).toContain('fill="#fff"');
      expect(svg).toContain("<feTurbulence");
      expect(svg).toContain("<feDisplacementMap");
      expect(svg).toContain("<path");
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });

  it("returns an empty string for asset styles (they use maskUrl directly)", () => {
    for (const id of ASSET_IDS) {
      expect(buildMaskSvg(id, 800, 800, { amount: 55, seed: 7 })).toBe("");
    }
  });

  it("is deterministic for identical args and varies with the seed", () => {
    const a = buildMaskSvg("dry-brush", 700, 700, { amount: 50, seed: 1 });
    const b = buildMaskSvg("dry-brush", 700, 700, { amount: 50, seed: 1 });
    const c = buildMaskSvg("dry-brush", 700, 700, { amount: 50, seed: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("clamps hostile amount values without throwing", () => {
    for (const amount of [999, -5, Number.NaN]) {
      const svg = buildMaskSvg("soft-brush", 500, 500, { amount, seed: 7 });
      expect(svg).toContain('width="500"');
      expect(svg).toContain("<path");
    }
  });

  it("returns an empty string for an unknown style id", () => {
    expect(buildMaskSvg("ghost" as EdgeMaskId, 400, 400, { amount: 50, seed: 1 })).toBe("");
  });

  it("emits finite coordinates only for procedural styles", () => {
    for (const id of PROCEDURAL_IDS) {
      const svg = buildMaskSvg(id, 833, 1211, { amount: 80, seed: 9 });
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });
});

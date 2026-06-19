import { describe, expect, it } from "vitest";
import {
  EDGE_MASK_STYLES,
  buildMaskSvg,
  getEdgeMaskStyle,
  type EdgeMaskId,
} from "./edge-mask";

const EXPECTED_IDS: EdgeMaskId[] = [
  "organic-blob",
  "amoeba",
  "ink-splash",
  "paint-splash",
  "water-splash",
  "smoke-edge",
  "cloud-edge",
  "liquid-shape",
  "melted-edge",
  "lava-shape",
  "dry-brush",
];

describe("edge-mask registry", () => {
  it("exposes all 11 requested styles with unique ids + bilingual labels", () => {
    expect(EDGE_MASK_STYLES).toHaveLength(11);
    const ids = EDGE_MASK_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(11);
    expect(ids).toEqual(EXPECTED_IDS);
    for (const s of EDGE_MASK_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.labelEn.length).toBeGreaterThan(0);
      expect(["shape", "texture"]).toContain(s.kind);
    }
  });

  it("getEdgeMaskStyle resolves known ids and rejects unknown ones", () => {
    expect(getEdgeMaskStyle("organic-blob")?.label).toBe("有機水滴");
    expect(getEdgeMaskStyle("nope" as EdgeMaskId)).toBeUndefined();
  });
});

describe("buildMaskSvg", () => {
  it("produces a valid, correctly-sized white-on-transparent SVG for every style", () => {
    for (const id of EXPECTED_IDS) {
      const svg = buildMaskSvg(id, 800, 1000, { amount: 55, seed: 7 });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('width="800"');
      expect(svg).toContain('height="1000"');
      expect(svg).toContain('viewBox="0 0 800 1000"');
      expect(svg).toContain('fill="#fff"');
      // every mask must carry at least one drawable shape
      expect(/<(path|circle|ellipse)\b/.test(svg)).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg.length).toBeGreaterThan(120);
    }
  });

  it("textured styles embed a turbulence displacement filter; smooth ones do not", () => {
    const textured = EDGE_MASK_STYLES.filter((s) => s.kind === "texture").map((s) => s.id);
    const smooth = EDGE_MASK_STYLES.filter((s) => s.kind === "shape").map((s) => s.id);
    for (const id of textured) {
      const svg = buildMaskSvg(id, 600, 600, { amount: 55, seed: 3 });
      expect(svg).toContain("<feTurbulence");
      expect(svg).toContain("<feDisplacementMap");
    }
    for (const id of smooth) {
      const svg = buildMaskSvg(id, 600, 600, { amount: 55, seed: 3 });
      expect(svg).not.toContain("<feTurbulence");
    }
  });

  it("is deterministic for identical args and varies with the seed", () => {
    const a = buildMaskSvg("ink-splash", 700, 700, { amount: 50, seed: 1 });
    const b = buildMaskSvg("ink-splash", 700, 700, { amount: 50, seed: 1 });
    const c = buildMaskSvg("ink-splash", 700, 700, { amount: 50, seed: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("clamps hostile amount values without throwing", () => {
    for (const amount of [999, -5, Number.NaN]) {
      const svg = buildMaskSvg("organic-blob", 500, 500, { amount, seed: 7 });
      expect(svg).toContain('width="500"');
      expect(svg).toContain("<path");
    }
  });

  it("returns an empty string for an unknown style id", () => {
    expect(buildMaskSvg("ghost" as EdgeMaskId, 400, 400, { amount: 50, seed: 1 })).toBe("");
  });

  it("emits finite coordinates only (no NaN/Infinity leaking into paths)", () => {
    for (const id of EXPECTED_IDS) {
      const svg = buildMaskSvg(id, 833, 1211, { amount: 80, seed: 9 });
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });
});

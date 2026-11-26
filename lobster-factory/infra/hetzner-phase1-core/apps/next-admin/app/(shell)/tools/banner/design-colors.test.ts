// Card C12 (named tests): contrast maths, the brand-kit palette limit, an uploaded background never replaced, and the
// order of remedies when contrast is short (another palette colour, then the scrim + outline).
import { describe, expect, it } from "vitest";
import { bgStatsFromColors, bgStatsFromPixels, contrastRatio, guardContrast, resolveDesignColors, zoneRatio, type BgInfo, type ColorFields, type TextContent } from "./design-colors";

const ALL: TextContent = { subtext: true, priceNow: false, priceWas: false, trust: false };

const base: ColorFields = {
  bgMode: "color", bgColor: "#1a1a2e", gradFrom: "#667eea", gradTo: "#764ba2",
  textColor: "#ffffff", accentColor: "#fbbf24", accentHighlight: false, ctaBg: "#ff5a5f", ctaTextColor: "#ffffff", badgeColor: "#be123c",
  textScrim: false, textScrimOpacity: 0.5, textOutline: true, dimOverlay: false, dimOverlayOpacity: 0.45,
};
const center = [{ pos: "center", align: "center" }] as const;
/** A photo measured in the browser: the text band is mid-grey and busy. */
const photo: BgInfo = { ...bgStatsFromColors("color", "#808080"), mode: "upload", colors: ["#808080", "#d0c0a0", "#202830"] };
photo.zones.center.center = { lo: 0.1, hi: 0.5, busy: 0.2 };

describe("contrast ratio (WCAG)", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);   // the classic 'just fails 4.5' grey
    expect(contrastRatio("#ff5a5f", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#ff5a5f"), 10);
  });
});

describe("brand kit limits the colours", () => {
  const kit = ["#0b3d91", "#4f86f7", "#ffb703", "#fefefe", "#0a0a0a"];
  it("a hex outside the kit is dropped for the kit default; an index picks from the palette", () => {
    const raw = { textColor: "#ff00ff", accentColor: 2, ctaBg: "#ffb703", ctaTextColor: 4, badgeColor: "#00ff00" };
    const { patch } = resolveDesignColors(raw, base, bgStatsFromColors("color", "#1a1a2e"), center, kit, kit, ALL);
    for (const k of ["textColor", "accentColor", "ctaBg", "ctaTextColor", "badgeColor"] as const)
      expect(kit.map((c) => c.toLowerCase())).toContain(patch[k]!.toLowerCase());
    expect(patch.textColor).toBe("#fefefe");                 // kit 文字 role, not the off-kit magenta
    expect(patch.accentColor).toBe("#ffb703");
    expect(patch.ctaTextColor).toBe("#0a0a0a");
  });
  it("on a colour background the AI's background colour must be a kit colour too", () => {
    const { patch } = resolveDesignColors({ bgMode: "gradient", gradFrom: "#123456", gradTo: 0 }, base, bgStatsFromColors("color", "#1a1a2e"), center, kit, kit, ALL);
    expect(patch.bgMode).toBe("gradient");
    expect(patch.gradFrom).toBeUndefined();
    expect(patch.gradTo).toBe("#0b3d91");
  });
});

describe("an uploaded / AI picture stays the background", () => {
  it.each(["upload", "ai"] as const)("%s: bgMode and gradient colours are never taken from the answer", (mode) => {
    const raw = { bgMode: "gradient", gradFrom: "#000000", gradTo: "#000000", bgColor: "#000000", textColor: "#ffffff" };
    const { patch } = resolveDesignColors(raw, { ...base, bgMode: mode }, { ...photo, mode }, center, ["#ffffff", "#000000"], null, ALL);
    expect(patch.bgMode).toBeUndefined();
    expect(patch.gradFrom).toBeUndefined();
    expect(patch.gradTo).toBeUndefined();
    expect(patch.bgColor).toBeUndefined();
  });
});

describe("too little contrast: another palette colour first, then scrim + outline", () => {
  it("swaps to a palette colour that passes, scrim untouched", () => {
    const dark = bgStatsFromColors("color", "#101010");
    const g = guardContrast({ ...base, bgColor: "#101010", textColor: "#333333" }, dark, center, ["#333333", "#f5f5dc"], null, ALL);
    expect(g.patch.textColor).toBe("#f5f5dc");
    expect(g.patch.textScrim).toBeUndefined();
  });
  it("no palette colour passes on a busy photo -> scrim on (darker if needed) + outline, and then it passes", () => {
    const g = guardContrast({ ...base, bgMode: "upload", textColor: "#ffffff", textOutline: false }, photo, center, ["#ffffff", "#808080"], null, ALL);
    expect(g.patch.textScrim).toBe(true);
    expect(g.patch.textOutline).toBe(true);
    expect(g.patch.textScrimOpacity).toBeGreaterThanOrEqual(0.5);
    expect(g.unmet).toEqual([]);
  });
  it("CTA text that does not read on its button gets the palette colour that does", () => {
    const g = guardContrast({ ...base, ctaBg: "#ffb703", ctaTextColor: "#ffffff" }, bgStatsFromColors("color", "#1a1a2e"), center, ["#ffffff", "#0a0a0a"], null, ALL);
    expect(g.patch.ctaTextColor).toBe("#0a0a0a");
    expect(contrastRatio(g.patch.ctaTextColor!, "#ffb703")).toBeGreaterThanOrEqual(4.5);
  });
});

// Review fixes (Codex on C12), one named case each.
describe("C12 review fixes", () => {
  const dark = bgStatsFromColors("color", "#1a1a2e");
  it("1. the old price is drawn at 0.7 opacity: checked as the mixed colour, not the hex", () => {
    const c = { ...base, textColor: "#9a9a9a" };                       // opaque 4.5:1 passes, at 0.7 it does not
    expect(zoneRatio("#9a9a9a", dark.zones.center.center)).toBeGreaterThanOrEqual(4.5);
    expect(zoneRatio("#9a9a9a", dark.zones.center.center, 0.7)).toBeLessThan(4.5);
    expect(guardContrast(c, dark, center, ["#9a9a9a", "#ffffff"], null, ALL).patch.textColor).toBeUndefined();
    const g = guardContrast(c, dark, center, ["#9a9a9a", "#ffffff"], null, { ...ALL, priceWas: true });
    expect(g.patch.textColor).toBe("#ffffff");
  });
  it("2. accent highlight: the plate text (#1a1a1a) must read on the accent colour", () => {
    const light = bgStatsFromColors("color", "#f5f5f5");
    const c = { ...base, bgColor: "#f5f5f5", textColor: "#111111", accentColor: "#1d4ed8" };
    const pal = ["#111111", "#fde68a"];
    expect(guardContrast(c, light, center, pal, null, ALL).patch.accentColor).toBeUndefined();   // blue word on light bg reads
    const g = guardContrast({ ...c, accentHighlight: true }, light, center, pal, null, ALL);
    expect(["#fde68a", "#f5f5f5"]).toContain(g.patch.accentColor);   // a palette / background colour the plate text reads on
    expect(contrastRatio("#1a1a1a", g.patch.accentColor!)).toBeGreaterThanOrEqual(3);
  });
  it("3. no kit colour carries the badge's white text -> near-black, nothing left unmet", () => {
    const kit = ["#fde68a", "#fef3c7"];
    const g = guardContrast({ ...base, textColor: "#fef3c7", accentColor: "#fde68a", badgeColor: "#fde68a" }, dark, center, kit, kit, ALL);
    expect(g.patch.badgeColor).toBe("#111111");
    expect(g.unmet).toEqual([]);
  });
  it("4. worst case is the range point nearest the text: grey on a black-to-white gradient is 1:1", () => {
    expect(zoneRatio("#777777", { lo: 0, hi: 1 })).toBeCloseTo(1, 5);
    const grad = bgStatsFromColors("gradient", "#000000", "#ffffff");
    const g = guardContrast({ ...base, bgMode: "gradient", gradFrom: "#000000", gradTo: "#ffffff", textColor: "#777777" }, grad, center, ["#777777"], null, ALL);
    expect(g.patch.textScrim).toBe(true);
    expect(g.unmet).toEqual([]);
  });
  it("5. a small bright patch in the text band counts (2nd-98th percentile); one stray pixel does not", () => {
    const W = 50, H = 50;
    const img = (white: (x: number, y: number) => boolean) => {
      const d = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = white(x, y) ? 255 : 0; d.set([v, v, v, 255], (y * W + x) * 4); }
      return bgStatsFromPixels(d, W, H, [], "upload").zones.center.center;
    };
    expect(img((x, y) => x >= 20 && x < 30 && y >= 20 && y < 30).hi).toBeGreaterThan(0.9);
    expect(img((x, y) => x === 25 && y === 25).hi).toBe(0);
  });
});

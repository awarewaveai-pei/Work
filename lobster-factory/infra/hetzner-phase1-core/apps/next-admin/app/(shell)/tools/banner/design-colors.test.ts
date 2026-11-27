// Card C12 (named tests): contrast maths, the brand-kit palette limit, an uploaded background never replaced, and the
// order of remedies when contrast is short (another palette colour, then the scrim + outline).
import { describe, expect, it } from "vitest";
import { bgStatsFromColors, bgStatsFromPixels, contrastRatio, guardContrast, guardDrawn, resolveDesignColors, zoneRatio, type BgInfo, type ColorFields, type TextContent, type TextPlace } from "./design-colors";
import { REF_PX, layoutBanner } from "./banner-layout";
import { INIT, type State } from "./banner-state";

const ALL: TextContent = { subtext: true, priceNow: false, priceWas: false, trust: false };

const base: ColorFields = {
  bgMode: "color", bgColor: "#1a1a2e", gradFrom: "#667eea", gradTo: "#764ba2",
  textColor: "#ffffff", accentColor: "#fbbf24", accentHighlight: false, ctaBg: "#ff5a5f", ctaTextColor: "#ffffff", badgeColor: "#be123c",
  textScrim: false, textScrimOpacity: 0.5, textOutline: true, dimOverlay: false, dimOverlayOpacity: 0.45,
};
/** Text drawn in the middle of a 100x100 canvas; no picture grid (a colour background, or a picture not measured). */
const center: TextPlace[] = [{ w: 100, h: 100, boxes: [{ x: 25, y: 40, w: 50, h: 20 }] }];
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

describe("brand kit limits only the brand roles (accent, CTA, badge)", () => {
  const kit = ["#0b3d91", "#4f86f7", "#ffb703", "#fefefe", "#0a0a0a"];
  it("a brand role outside the kit falls back to the kit default; text and background colours are free", () => {
    const raw = { textColor: "#ff00ff", accentColor: 2, ctaBg: "#ffb703", ctaTextColor: "#0a0a0a", badgeColor: "#00ff00" };
    const { patch } = resolveDesignColors(raw, base, bgStatsFromColors("color", "#1a1a2e"), center, kit, kit, ALL);
    for (const k of ["accentColor", "ctaBg", "badgeColor"] as const)
      expect(kit.map((c) => c.toLowerCase())).toContain(patch[k]!.toLowerCase());
    expect(patch.accentColor).toBe("#ffb703");
    expect(patch.badgeColor).toBe("#0b3d91");                // off-kit green -> kit main
    expect(patch.textColor).not.toBe("#fefefe");             // the kit's text colour is not forced
  });
  it("on a colour background the AI's background colour is taken as given (not limited to the kit)", () => {
    const { patch } = resolveDesignColors({ bgMode: "gradient", gradFrom: "#123456", gradTo: "#654321" }, base, bgStatsFromColors("color", "#1a1a2e"), center, kit, kit, ALL);
    expect(patch.bgMode).toBe("gradient");
    expect(patch.gradFrom).toBe("#123456");
    expect(patch.gradTo).toBe("#654321");
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

// Codex round 2: translucent text is mixed per sRGB channel, as the canvas paints it (luminance-only mixing misjudged colour).
describe("translucent text on a coloured background", () => {
  it("white at 0.7 on #0000ff is 4.40:1 (luminance-only mixing said 5.29) -> the old price fails 4.5 there", () => {
    const blue = bgStatsFromColors("color", "#0000ff");
    expect(zoneRatio("#ffffff", blue.zones.center.center, 0.7)).toBeCloseTo(4.40, 2);
    const g = guardContrast({ ...base, bgColor: "#0000ff", textColor: "#ffffff" }, blue, center, ["#ffffff"], null, { ...ALL, priceWas: true });
    expect(g.patch.textScrim).toBe(true);
    expect(g.unmet).toEqual([]);
  });
});

// R2-C (named): the guard measures the picture under the text boxes the layout engine drew, not a band estimate.
describe("contrast under the real text boxes", () => {
  it("white text over the dark half passes as is; the same text moved over the white half is fixed", () => {
    const W = 40, H = 20;
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = x < W / 2 ? 10 : 250; d.set([v, v, v, 255], (y * W + x) * 4); }
    const bg = bgStatsFromPixels(d, W, H, ["#0a0a0a", "#fafafa"], "upload");
    const grid = bg.grids![0];
    const c = { ...base, bgMode: "upload" as const, textColor: "#ffffff" };
    // the canvas is 800x400; the band estimate for centre / centre spans both halves and would call for a fix either way
    const at = (x: number): TextPlace[] => [{ w: 800, h: 400, grid, boxes: [{ x, y: 150, w: 300, h: 100 }] }];
    const left = guardContrast(c, bg, at(40), ["#ffffff"], null, ALL);
    expect(left.patch.textColor).toBeUndefined();
    expect(left.patch.textScrim).toBeUndefined();
    const right = guardContrast(c, bg, at(460), ["#ffffff"], null, ALL);
    expect(right.patch.textColor).toBe("#0a0a0a");   // the dark main colour reads there
    expect(right.unmet).toEqual([]);
  });
});

// Codex on batch 2 (named): the guard checks what is drawn last -- the words swapped in, the background as it is now.
describe("guard on what is drawn last", () => {
  const W = 40, H = 20;
  const picture = (v: (x: number) => number) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const g = v(x); d.set([g, g, g, 255], (y * W + x) * 4); }
    return bgStatsFromPixels(d, W, H, ["#0a0a0a", "#fafafa"], "upload");
  };
  const halves = picture((x) => (x < W / 2 ? 10 : 250));
  // every character REF_PX wide at REF_PX: a title of n characters at 60 px is n x 60 px wide
  const measure = { text: (_f: string, s: string) => Array.from(s).length * REF_PX, image: () => null };
  const design = (headline: string): State => ({
    ...INIT, headline, subtext: "", ctaText: "", badgeText: "", showPrice: false, trustType: "none",
    textPos: "center", textAlignH: "left", typeAuto: false, headlineSize: 60, bgMode: "upload", textColor: "#ffffff",
    textScrim: false, dimOverlay: false, accentHighlight: false,
  });
  const drawnAt = (st: State) => {
    const L = layoutBanner(st, { w: 800, h: 400, ratio: "2:1", displayW: 500, group: "card" }, measure);
    return [{ w: 800, h: 400, boxes: [L.boxes.headline!] }];
  };

  it("a word set swapped in: its longer title reaching the bright half gets a fix; the short one did not need one", () => {
    const short = design("短標"), long = design("這是一個很長很長的標題");
    expect(drawnAt(short)[0].boxes[0].x + drawnAt(short)[0].boxes[0].w).toBeLessThan(400);
    expect(drawnAt(long)[0].boxes[0].x + drawnAt(long)[0].boxes[0].w).toBeGreaterThan(400);
    const a = guardDrawn(short, halves, drawnAt(short), null);
    expect(a.patch.textColor ?? a.patch.textScrim).toBeUndefined();
    const b = guardDrawn(long, halves, drawnAt(long), null);
    expect(b.patch.textColor ?? b.patch.textScrim).toBeDefined();
    expect(b.unmet).toEqual([]);
  });

  it("the background as it is when the answer lands: white chosen for the old dark picture is fixed on the new bright one", () => {
    const st = design("短標");
    const roles = { raw: { textColor: 0 }, palette: ["#ffffff", "#111111"] };   // index 0 of the palette the prompt had
    const old = guardDrawn(st, picture(() => 10), drawnAt(st), null, roles);
    expect(old.patch.textColor).toBe("#ffffff");
    const now = guardDrawn(st, picture(() => 250), drawnAt(st), null, roles);
    expect(now.patch.textColor === "#ffffff" && !now.patch.textScrim).toBe(false);
    expect(now.unmet).toEqual([]);
  });
});

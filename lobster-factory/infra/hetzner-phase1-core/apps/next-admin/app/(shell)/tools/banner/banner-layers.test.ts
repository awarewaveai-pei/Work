// Card (banner editable layers) tests (b) and (c): the SVG keeps every text as <text> with one Inkscape layer per Layer,
// and the PSD read back by ag-psd has the type layers' text. Pixel parity of the stacked PNG needs a real canvas: it was
// run in the browser (WORKLOG of this card).
import { describe, expect, it } from "vitest";
import { readPsd } from "ag-psd";
import { buildBannerPsd, buildBannerSvg, type Pixels, type RasterDoc, type TextSpec } from "./banner-layers";
import { autospace, autospaceRuns, wrapChars } from "./banner-layout";

const W = 40, H = 20;
function px(fill: (x: number, y: number) => boolean): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fill(x, y)) data.set([200, 30, 30, 255], (y * W + x) * 4);
  return { width: W, height: H, data };
}
const text = (lines: TextSpec["lines"], extra: Partial<TextSpec> = {}): TextSpec => ({
  lines, cssFamily: "'Noto Serif TC', serif", editorFont: "Noto Serif TC", weight: 700, size: 12, align: "center",
  x: 20, y: 12, lineHeight: 14, letterSpacing: 1, opacity: 1, ...extra,
});
const title = text([[{ text: "夏日", color: "#ffffff" }, { text: "特賣", color: "#fbbf24" }], [{ text: "<全面>&五折", color: "#ffffff" }]]);
const badge = text([[{ text: "限時優惠", color: "#ffffff" }]], { rotate: { angle: 0.18, cx: 30, cy: 6 }, opacity: 0.92 });
const doc: RasterDoc = {
  w: W, h: H,
  layers: [
    { name: "背景", pixels: px(() => true) },
    { name: "商品圖", pixels: px((x, y) => x > 5 && x < 12 && y > 4 && y < 9) },
    { name: "標題", pixels: px((x, y) => y === 10), text: title },
    { name: "按鈕底", pixels: px(() => false) },
    { name: "角標文字", pixels: px((x, y) => x === 30 && y === 6), text: badge },
  ],
  composite: px(() => true),
};

describe("banner layered SVG", () => {
  it("one Inkscape layer per Layer; every text is a <text>; pixel layers are cropped images", () => {
    const crops: Pixels[] = [];
    const svg = buildBannerSvg(doc, (p) => { crops.push(p); return "data:image/png;base64,AA=="; });
    expect(svg).toContain('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"');
    expect(svg.match(/<g [^>]*inkscape:groupmode="layer"/g)).toHaveLength(doc.layers.length);
    for (const l of doc.layers) expect(svg).toContain(`inkscape:label="${l.name}"`);
    expect(svg.match(/<text /g)).toHaveLength(2);
    expect(svg).not.toMatch(/<image[^>]*>[^<]*夏日/);
    // the title: line tspans at x/y, the accent run in its own fill, markup escaped
    expect(svg).toContain('<tspan x="20" y="12">夏日<tspan fill="#fbbf24">特賣</tspan></tspan><tspan x="20" y="26">&lt;全面&gt;&amp;五折</tspan>');
    // two pixel layers with something on them (the empty 按鈕底 gets no image); the product is cropped to its box
    expect(crops).toHaveLength(2);
    expect(crops[1]).toMatchObject({ width: 6, height: 4 });
    expect(svg).toContain('<image x="6" y="5" width="6" height="4"');
  });
});

describe("banner layer shadows (C2)", () => {
  // Photoshop's angle is where the light comes FROM: a shadow straight down = 90, straight right = 180
  const shadowed: RasterDoc = { ...doc, layers: [
    { name: "按鈕底", pixels: px((x, y) => x > 2 && x < 10 && y > 2 && y < 8), shadow: { color: "#ff0000", opacity: 0.5, blur: 8, x: 0, y: 10 } },
    { name: "角標底", pixels: px((x, y) => x > 20 && y < 5), shadow: { color: "#000000", opacity: 0.3, blur: 4, x: 10, y: 0 } },
  ] };
  it("PSD: drop shadow effect with angle / distance / size from the offsets", () => {
    const psd = readPsd(buildBannerPsd(shadowed), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const [a, b] = (psd.children ?? []).map((l) => l.effects?.dropShadow?.[0]);
    expect(a).toMatchObject({ angle: 90, distance: { value: 10 }, size: { value: 8 }, blendMode: "normal" });
    expect(b).toMatchObject({ angle: 180, distance: { value: 10 }, size: { value: 4 } });
  });
  it("SVG: feDropShadow on the layer group, stdDeviation = blur / 2", () => {
    const svg = buildBannerSvg(shadowed, () => "data:image/png;base64,AA==");
    expect(svg).toContain('<feDropShadow dx="0" dy="10" stdDeviation="4" flood-color="#ff0000" flood-opacity="0.5"/>');
    expect(svg).toMatch(/<g id="layer1" [^>]*filter="url\(#shadow1\)"/);
  });
});

describe("banner layered PSD", () => {
  it("reads back with the type layers' text and names", () => {
    const psd = readPsd(buildBannerPsd(doc), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    expect(psd.width).toBe(W);
    expect(psd.children?.map((l) => l.name)).toEqual(doc.layers.map((l) => l.name));
    const t = psd.children?.find((l) => l.name === "標題")?.text;
    expect(t?.text).toBe("夏日特賣\n<全面>&五折");
    expect(t?.style?.font?.name).toBe("Noto Serif TC");
    expect(t?.paragraphStyle?.justification).toBe("center");
    expect(psd.children?.find((l) => l.name === "角標文字")?.text?.text).toBe("限時優惠");
  });
});

// C3 critic findings: 避頭尾 never leaves a mark at a line start, and the 中英間距 space at an accent boundary stays plain.
// R3-A: no mark hangs past the edge (a hung full-width comma drew 圖二's title one em past the column) -- a closing mark
// that does not fit takes the character before it down; only a line with no such character left stays wider.
describe("banner CJK wrap (C3)", () => {
  const wrap = (text: string, perLine: number, rules = true) =>
    wrapChars(Array.from(text), (c) => c, (l) => l.length <= perLine, rules).map((l) => l.join(""));
  it("a closing mark that does not fit takes the last character down with it", () => {
    expect(wrap("限時優惠！", 4)).toEqual(["限時優", "惠！"]);
    expect(wrap("限時優惠！」", 4)).toEqual(["限時優", "惠！」"]);
    expect(wrap("好好好！！！", 3)).toEqual(["好好", "好！！！"]);
    for (const line of wrap("數量有限！！！今天開賣，「限量」款！", 4).slice(1)) expect("，。、；：！？）」』…".includes(line[0])).toBe(false);
  });
  it("an opening bracket moves down; no line is wider than the width", () => {
    expect(wrap("好好「限量」", 3)).toEqual(["好好", "「限", "量」"]);
    for (const line of wrap("今天「「限量」」開賣，數量有限！！", 5)) expect(line.length).toBeLessThanOrEqual(5);
  });
  it("rules off = plain greedy wrap; edge spaces dropped", () => {
    expect(wrap("限時優惠！", 4, false)).toEqual(["限時優惠", "！"]);
    expect(wrap("滿999 送", 4)).toEqual(["滿999", "送"]);
  });
  it("中英間距: a gap between an accent and a plain run is plain", () => {
    expect(autospace("iPhone17限定")).toBe("iPhone17 限定");
    expect(autospaceRuns([{ text: "限時", accent: true }, { text: "5折", accent: false }]))
      .toEqual([{ text: "限時", accent: true }, { text: " 5 折", accent: false }]);
  });
});

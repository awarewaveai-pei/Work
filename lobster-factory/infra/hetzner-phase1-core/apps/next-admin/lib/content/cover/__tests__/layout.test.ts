// K24 cover layout B: title ≤2 lines (shrink first, then "…"), subtitle 1 line, band below, no closing mark opens a line.
import { describe, expect, it } from "vitest";
import { layoutCover } from "../layout";
import { parseCoverSettings, DEFAULT_COVER_SETTINGS } from "../settings";

const L = (title: string, subtitle?: string, width = 1200, height = 900) => layoutCover({ width, height, title, subtitle });
const texts = (l: ReturnType<typeof layoutCover>) => l.title.lines.map((x) => x.text);

describe("layoutCover", () => {
  it("a short title is one line at the largest size", () => {
    const l = L("春季保養指南");
    expect(texts(l)).toEqual(["春季保養指南"]);
    expect(l.title.fontSize).toBe(60);
  });

  it("a long Chinese title takes two lines at a smaller size", () => {
    const l = L("從零開始的居家咖啡沖煮完整指南：器材、豆子與水溫一次看懂", "副標");
    expect(l.title.lines).toHaveLength(2);
    expect(l.title.fontSize).toBeLessThan(60);
    expect(texts(l).join("")).toBe("從零開始的居家咖啡沖煮完整指南：器材、豆子與水溫一次看懂");
  });

  it("a title too long for two lines ends line 2 with …", () => {
    const l = L("這是一個非常非常長的標題".repeat(6));
    expect(l.title.lines).toHaveLength(2);
    expect(l.title.lines[1].text.endsWith("…")).toBe(true);
    expect(l.title.fontSize).toBe(Math.round(1200 * 0.032));
  });

  it("a long subtitle is cut to one line with …", () => {
    const l = L("短標題", "這是一段非常長的副標題文字，".repeat(10));
    expect(l.subtitle!.line.text.endsWith("…")).toBe(true);
    expect(l.subtitle!.line.text.length).toBeLessThan(80);
  });

  it("English breaks at spaces, never inside a word", () => {
    const title = "The Complete Beginner Guide to Brewing Specialty Coffee at Home";
    const l = L(title);
    expect(l.title.lines).toHaveLength(2);
    const words = new Set(title.split(" "));
    for (const t of texts(l)) for (const w of t.split(" ")) expect(words.has(w), w).toBe(true);
  });

  it("no line starts with a closing mark", () => {
    // Sized so a plain greedy wrap would put the "，" first on line 2.
    for (let n = 10; n <= 24; n++) {
      const l = L("咖".repeat(n) + "，" + "啡".repeat(8));
      for (const t of texts(l)) expect(/^[，。、！？：；）」』…]/.test(t), t).toBe(false);
    }
  });

  it("4:5 keeps the band at the bottom and the picture and band do not overlap", () => {
    const l = L("直式封面標題", "副標", 1080, 1350);
    expect(l.band.y + l.band.height).toBe(1350);
    expect(l.image.y + l.image.height).toBeLessThanOrEqual(l.band.y);
    for (const t of l.title.lines) expect(t.y).toBeGreaterThan(l.band.y);
    expect(l.subtitle!.line.y).toBeLessThan(1350);
  });
});

describe("parseCoverSettings", () => {
  it("an illegal colour falls back to its default; a legal one is kept", () => {
    const s = parseCoverSettings({ bandColor: "red", titleColor: "#12345", subtitleColor: "#ABCDEF", font: "comic" });
    expect(s).toEqual({ ...DEFAULT_COVER_SETTINGS, subtitleColor: "#abcdef" });
    expect(parseCoverSettings({ bandColor: '#000000" onload="x' }).bandColor).toBe(DEFAULT_COVER_SETTINGS.bandColor);
  });
});

import { describe, it, expect } from "vitest";
import { checkRankMath, type RankMathReport } from "../rankmath-checker";

/** Pull a single check out of a report by its stable id. */
function pick(report: RankMathReport, id: string) {
  const c = report.checks.find(ch => ch.id === id);
  if (!c) throw new Error(`check "${id}" not found`);
  return c;
}

const KW = "兒童藝術治療"; // CJK focus keyword (6 chars)
const cjkSentence = `${KW}能幫助孩子表達情緒。`; // exactly one KW occurrence

/** Minimal CJK article whose body contains `n` exact keyword occurrences. */
function cjkArticle(n: number): string {
  return [
    "## 快速解答",
    cjkSentence.repeat(n),
    "",
    "## 其他內容",
    "這段沒有精確關鍵字，改用同義詞與代名詞描述這套方法的價值。",
  ].join("\n");
}

describe("rankmath-checker — CJK keyword frequency (issue B: 13.04% over-density)", () => {
  it("passes when the exact CJK keyword appears within the 2–8 band", () => {
    const report = checkRankMath({
      markdown: cjkArticle(5),
      focusKeyword: KW,
      seoTitle: `${KW}的7個專家技巧`,
      metaDescription: `${KW}是協助孩子的方法`,
      slug: "child-art-therapy",
    });
    const density = pick(report, "kw-density");
    expect(density.label).toContain("CJK");
    expect(density.pass).toBe(true);
  });

  it("FAILS (stuffing) when the exact CJK keyword appears 12 times — the old behaviour that read 13.04% on real RankMath", () => {
    const report = checkRankMath({
      markdown: cjkArticle(12),
      focusKeyword: KW,
      seoTitle: `${KW}的7個專家技巧`,
      metaDescription: `${KW}是協助孩子的方法`,
      slug: "child-art-therapy",
    });
    const density = pick(report, "kw-density");
    expect(density.pass).toBe(false);
    expect(density.suggestion).toContain("過多");
  });

  it("FAILS (too sparse) when the exact CJK keyword appears only once", () => {
    const report = checkRankMath({
      markdown: cjkArticle(1),
      focusKeyword: KW,
      seoTitle: `${KW}的7個專家技巧`,
      metaDescription: `${KW}是協助孩子的方法`,
      slug: "child-art-therapy",
    });
    expect(pick(report, "kw-density").pass).toBe(false);
  });

  it("keeps the percentage-density band for ASCII/English keywords (no regression)", () => {
    // "art therapy" appears 6× in ~700 words → ~1.7%, inside 0.5%–2.5%
    const body = `## Intro\n${"Art therapy helps children express emotion in a safe space. ".repeat(20)}` +
      `\n\n## How art therapy works\n${"Practitioners observe colour and composition over time. ".repeat(20)}` +
      `\n\nart therapy art therapy art therapy art therapy art therapy art therapy`;
    const report = checkRankMath({
      markdown: body,
      focusKeyword: "art therapy",
      seoTitle: "The Ultimate 7-Step Guide to Child Art Therapy",
      metaDescription: "Art therapy guide for parents and educators in 2025.",
      slug: "art-therapy",
    });
    const density = pick(report, "kw-density");
    expect(density.label).toContain("%");
    expect(density.label).not.toContain("CJK");
  });

  it("uses the occurrence band for an ASCII keyword inside a CJK article (re-stuffing guard)", () => {
    // A Chinese article with an English brand keyword used 6× (prompt-compliant max).
    // The char-based word count makes the % read <0.5%; keying density on the ARTICLE
    // script (not the keyword) must keep this in the 2–8 band → pass, not a false red.
    const body = [
      "## 快速解答",
      "Soulful 能幫助孩子表達情緒。".repeat(6), // ASCII keyword × 6 inside CJK prose
      "",
      "## 其他內容",
      "這段沒有精確關鍵字，改用同義詞與代名詞描述這套方法的價值。",
    ].join("\n");
    const report = checkRankMath({
      markdown: body,
      focusKeyword: "Soulful",
      seoTitle: "Soulful 兒童藝術治療的7個技巧",
      metaDescription: "Soulful 是協助孩子表達情緒的方法。",
      slug: "soulful-child-art",
    });
    const density = pick(report, "kw-density");
    expect(density.label).toContain("CJK"); // article script wins over keyword script
    expect(density.pass).toBe(true);
  });

  it("does not report an absurd density for an empty focus keyword", () => {
    expect(() =>
      checkRankMath({
        markdown: cjkArticle(4),
        focusKeyword: "",
        seoTitle: "兒童藝術治療的7個專家技巧",
        metaDescription: "協助孩子表達情緒的方法",
        slug: "child-art-therapy",
      }),
    ).not.toThrow();
    const report = checkRankMath({
      markdown: cjkArticle(4),
      focusKeyword: "",
      seoTitle: "兒童藝術治療的7個專家技巧",
      metaDescription: "協助孩子表達情緒的方法",
      slug: "child-art-therapy",
    });
    const density = pick(report, "kw-density");
    expect(density.pass).toBe(false);
    expect(density.detail).toContain("0 exact occurrences"); // not "542.9%"
  });
});

describe("rankmath-checker — CJK title length (issue C: pixel-width budget)", () => {
  it("passes a 14–30 char CJK title", () => {
    const report = checkRankMath({
      markdown: cjkArticle(4),
      focusKeyword: KW,
      seoTitle: "兒童藝術治療的7個專家必備技巧", // 15 chars
      metaDescription: `${KW}是協助孩子的方法`,
      slug: "child-art-therapy",
    });
    const t = pick(report, "title-length");
    expect(t.label).toContain("CJK");
    expect(t.pass).toBe(true);
  });

  it("FAILS a too-short CJK title", () => {
    const report = checkRankMath({
      markdown: cjkArticle(4),
      focusKeyword: KW,
      seoTitle: "兒童藝術治療", // 6 chars < 14
      metaDescription: `${KW}是協助孩子的方法`,
      slug: "child-art-therapy",
    });
    const t = pick(report, "title-length");
    expect(t.pass).toBe(false);
    expect(t.suggestion).toContain("過短");
  });

  it("keeps the 30–60 char band for English titles (no regression)", () => {
    const report = checkRankMath({
      markdown: cjkArticle(4),
      focusKeyword: KW,
      seoTitle: "The Ultimate 7-Step Guide to Child Art Therapy", // ~46 chars
      metaDescription: `${KW}是協助孩子的方法`,
      slug: "child-art-therapy",
    });
    const t = pick(report, "title-length");
    expect(t.label).not.toContain("CJK");
    expect(t.pass).toBe(true);
  });
});

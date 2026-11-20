// Live 2026-11-20: topic keyword 「感恩節 心理學」 came out as the title 「感恩節 心理學：7 個 有效 感恩任務 讓你更快樂」.
// A natural Chinese title must count as carrying the keyword; English keeps the verbatim match it always had.
import { describe, expect, it } from "vitest";
import { checkRankMath } from "../rankmath-checker";
import { containsKeyword, countKeyword, unspacedWordGaps } from "../keyword-match";
import { prepareArticleGeneration } from "@/lib/content/article/generate-core";
import { UNSPACED_TITLE_RULE } from "../keyword-match";

const pick = (r: ReturnType<typeof checkRankMath>, id: string) => r.checks.find((c) => c.id === id)!;
const report = (focusKeyword: string, seoTitle: string, markdown = "# t\n\nbody") =>
  checkRankMath({ markdown, focusKeyword, seoTitle, metaDescription: seoTitle, slug: "x" });

describe("focus keyword match", () => {
  it("a spaced Chinese keyword counts in a natural title (no space, a joining 的)", () => {
    const r = report("感恩節 心理學", "感恩節的心理學：7個有效的感恩練習");
    expect(pick(r, "kw-in-title").pass).toBe(true);
    expect(pick(r, "kw-in-meta").pass).toBe(true);
    expect(pick(r, "title-kw-position").pass).toBe(true);
    expect(countKeyword("感恩節的心理學，和感恩節 心理學", "感恩節 心理學")).toBe(2);
    expect(containsKeyword("感恩節。心理學", "感恩節 心理學")).toBe(false);
  });

  it("English keyword and title: verbatim, exactly as before (no space folding, no joining words)", () => {
    expect(pick(report("art therapy", "Art Therapy for Kids: 7 Essential Ideas"), "kw-in-title").pass).toBe(true);
    expect(containsKeyword("Arttherapy for kids", "art therapy")).toBe(false);
    expect(containsKeyword("Art of therapy", "art therapy")).toBe(false);
    expect(countKeyword("art therapy, Art Therapy and arttherapy", "art therapy")).toBe(2);
  });

  it("finds a space between Chinese words, not between a digit or Latin word and Chinese", () => {
    expect(unspacedWordGaps("感恩節 心理學：7 個 有效 感恩任務")).toHaveLength(3);
    expect(unspacedWordGaps("7 個 ChatGPT 教學")).toEqual([]);
  });

  it("the Chinese article prompt states the same rule and no longer asks for space-separated words", async () => {
    const r = await prepareArticleGeneration({ keyword: "感恩節 心理學", language: "繁體中文" } as never);
    if (!r.ok) throw new Error("prepare failed");
    expect(r.config.userPrompt).toContain(UNSPACED_TITLE_RULE);
    expect(r.config.userPrompt).not.toMatch(/space-separated|space-tokenised|完整 指南/);
    const ko = await prepareArticleGeneration({ keyword: "감사 심리학", language: "한국어" } as never);
    if (!ko.ok) throw new Error("prepare failed");
    expect(ko.config.userPrompt).not.toContain(UNSPACED_TITLE_RULE);
    expect(ko.config.userPrompt).toContain("space-separated token");
  });
});

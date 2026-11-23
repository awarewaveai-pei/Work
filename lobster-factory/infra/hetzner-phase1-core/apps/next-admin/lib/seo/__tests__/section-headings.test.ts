import { describe, expect, it } from "vitest";
import { extractExcerpt } from "@/lib/content/publish/wordpress-core";
import { SECTION_HEADINGS, sectionBody, sectionHeadingRe } from "../section-headings";

const article = (quick: string, faq: string) => [
  "# 職場倦怠的 5 個警訊", "", "開場的一段話，長度超過三十個字，用來確認沒有快速解答段落時摘要會退回這一段。", "",
  `## ${quick}`, "", "職場倦怠是長期工作壓力沒處理好的結果。", "", "## 正文", "", "內容。", "", `## ${faq}`, "", "### 問題一？", "答案。",
].join("\n");

describe("section headings: English and Chinese names are the same section", () => {
  it.each(SECTION_HEADINGS.quickAnswer)("recognises the quick-answer heading %s and reads its body", (name) => {
    const md = article(name, "FAQ");
    expect(sectionHeadingRe("quickAnswer").test(md)).toBe(true);
    expect(sectionBody(md, "quickAnswer")?.trim()).toBe("職場倦怠是長期工作壓力沒處理好的結果。");
  });

  it.each(SECTION_HEADINGS.faq)("recognises the FAQ heading %s", (name) => {
    expect(sectionHeadingRe("faq").test(article("Quick Answer", name))).toBe(true);
  });

  it("does not take an ordinary heading for a fixed section", () => {
    expect(sectionHeadingRe("quickAnswer").test("## 正文\n\n內容")).toBe(false);
    expect(sectionBody("## 正文\n\n內容", "quickAnswer")).toBeUndefined();
  });

  it("the WordPress excerpt comes from the quick answer under either name", () => {
    for (const name of ["Quick Answer", "快速解答"]) {
      expect(extractExcerpt(article(name, "FAQ"))).toBe("職場倦怠是長期工作壓力沒處理好的結果。");
    }
  });
});

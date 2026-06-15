import { describe, it, expect } from "vitest";
import { markdownToBlocks, type Block } from "../markdown-to-blocks";

function types(blocks: Block[]): string[] {
  return blocks.map(b => b.type);
}

describe("markdownToBlocks", () => {
  it("drops the leading H1 so the post title owns the only H1 (issue 二)", () => {
    const blocks = markdownToBlocks("# 兒童藝術治療完整指南\n\n## 快速解答\n\n這是一段內文。");
    // No heading block at level 1; first heading is the h2.
    const headings = blocks.filter(b => b.type === "heading") as Extract<Block, { type: "heading" }>[];
    expect(headings.every(h => h.level >= 2)).toBe(true);
    expect(headings[0].level).toBe(2);
    expect(headings[0].text).toBe("快速解答");
  });

  it("maps h2–h6 to heading blocks with the right level", () => {
    const blocks = markdownToBlocks("## H2\n### H3\n#### H4") as Extract<Block, { type: "heading" }>[];
    expect(blocks.map(b => b.level)).toEqual([2, 3, 4]);
  });

  it("turns a bullet list into one list block", () => {
    const blocks = markdownToBlocks("- 第一\n- 第二\n- 第三");
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as Extract<Block, { type: "list" }>;
    expect(list.type).toBe("list");
    expect(list.items).toEqual(["第一", "第二", "第三"]);
  });

  it("bakes the number into an ordered list (no ordered block type)", () => {
    const blocks = markdownToBlocks("1. 甲\n2. 乙");
    const list = blocks[0] as Extract<Block, { type: "list" }>;
    expect(list.type).toBe("list");
    expect(list.items).toEqual(["1. 甲", "2. 乙"]);
  });

  it("parses a table, skips the separator row, keeps the header row first", () => {
    const md = "| 欄A | 欄B |\n| --- | --- |\n| 1 | 2 |";
    const blocks = markdownToBlocks(md);
    const table = blocks.find(b => b.type === "table") as Extract<Block, { type: "table" }>;
    expect(table).toBeDefined();
    expect(table.rows).toEqual([["欄A", "欄B"], ["1", "2"]]);
  });

  it("emits a quote block for blockquotes", () => {
    const blocks = markdownToBlocks("> 一句名言");
    expect(blocks[0].type).toBe("quote");
    expect((blocks[0] as Extract<Block, { type: "quote" }>).text).toBe("一句名言");
  });

  it("emits an image block only for real http(s) URLs, skipping placeholders", () => {
    const ok = markdownToBlocks("![貓](https://example.com/cat.jpg)");
    expect(ok[0]).toEqual({ type: "image", url: "https://example.com/cat.jpg", alt: "貓" });
    const ph = markdownToBlocks("![貓](IMAGE_PLACEHOLDER_1)");
    expect(ph.filter(b => b.type === "image")).toHaveLength(0);
  });

  it("converts inline markdown to safe HTML and escapes angle brackets", () => {
    const blocks = markdownToBlocks("這是 **粗體** 與 [連結](https://a.com) 和 <script>。");
    const p = blocks[0] as Extract<Block, { type: "paragraph" }>;
    expect(p.text).toContain("<strong>粗體</strong>");
    expect(p.text).toContain('<a href="https://a.com">連結</a>');
    expect(p.text).toContain("&lt;script&gt;"); // escaped, not a live tag
  });

  it("strips the CONTENT_META block and SLUG_HINT comment", () => {
    const md = "<!-- CONTENT_META_START -->\nSEO_TITLE: x\n<!-- CONTENT_META_END -->\n<!-- SLUG_HINT: foo -->\n## 標題\n內文";
    const blocks = markdownToBlocks(md);
    expect(blocks.some(b => b.type === "heading" && b.text === "標題")).toBe(true);
    // The meta/slug-hint comment lines must not leak into any block text.
    const allText = JSON.stringify(blocks);
    expect(allText).not.toContain("SEO_TITLE");
    expect(allText).not.toContain("SLUG_HINT");
  });

  it("emits a divider for a horizontal rule", () => {
    const blocks = markdownToBlocks("段落一\n\n---\n\n段落二");
    expect(types(blocks)).toContain("divider");
  });
});

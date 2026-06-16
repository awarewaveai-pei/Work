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

  it("turns a standalone YouTube URL into an embed block (watch / youtu.be / shorts)", () => {
    const watch = markdownToBlocks("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(watch[0]).toEqual({ type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const short = markdownToBlocks("https://youtu.be/dQw4w9WgXcQ");
    expect(short[0]).toEqual({ type: "embed", url: "https://youtu.be/dQw4w9WgXcQ" });
    const shorts = markdownToBlocks("https://www.youtube.com/shorts/aBcDeFgHiJk");
    expect(shorts[0]).toEqual({ type: "embed", url: "https://www.youtube.com/shorts/aBcDeFgHiJk" });
  });

  it("rejects a YouTube-shaped URL with a too-short video id (must be 11 chars)", () => {
    const blocks = markdownToBlocks("https://www.youtube.com/shorts/abc123");
    expect(blocks.filter(b => b.type === "embed")).toHaveLength(0);
  });

  it("does not treat a non-YouTube URL as an embed (falls back to paragraph)", () => {
    const blocks = markdownToBlocks("https://example.com/some-article");
    expect(blocks.filter(b => b.type === "embed")).toHaveLength(0);
    expect(blocks[0].type).toBe("paragraph");
  });

  it("drops an unresolved YouTube placeholder instead of leaking '🎬 query' into the post", () => {
    const blocks = markdownToBlocks("前言\n\n[YOUTUBE_PLACEHOLDER_1: 兒童藝術治療入門影片]\n\n結語");
    const allText = JSON.stringify(blocks);
    expect(allText).not.toContain("YOUTUBE_PLACEHOLDER");
    expect(allText).not.toContain("🎬");
    // The surrounding paragraphs survive; only the placeholder line is removed.
    expect(blocks.filter(b => b.type === "paragraph")).toHaveLength(2);
  });

  it("scrubs an INLINE unresolved placeholder so it never leaks mid-sentence (critic Major)", () => {
    const blocks = markdownToBlocks("看這段影片 [YOUTUBE_PLACEHOLDER_1: cats] 很有趣");
    const allText = JSON.stringify(blocks);
    expect(allText).not.toContain("YOUTUBE_PLACEHOLDER");
    // The sentence text on either side of the placeholder survives in one paragraph.
    expect(allText).toContain("看這段影片");
    expect(allText).toContain("很有趣");
  });

  // #6 — Kadence funnel patterns
  it("turns a standalone [KADENCE_PATTERN: id] into a pattern block (#6)", () => {
    const blocks = markdownToBlocks("前言\n\n[KADENCE_PATTERN: 7207]\n\n結語");
    expect(blocks).toContainEqual({ type: "pattern", ref: 7207 });
    expect(blocks.filter(b => b.type === "paragraph")).toHaveLength(2);
  });

  it("drops a KADENCE_PATTERN with a zero/invalid ref instead of emitting ref:0 (#6)", () => {
    const blocks = markdownToBlocks("[KADENCE_PATTERN: 0]");
    expect(blocks.filter(b => b.type === "pattern")).toHaveLength(0);
  });

  it("scrubs an INLINE KADENCE_PATTERN so the raw cue never leaks mid-sentence (#6)", () => {
    const blocks = markdownToBlocks("快來看 [KADENCE_PATTERN: 7207] 這個方案");
    const allText = JSON.stringify(blocks);
    expect(allText).not.toContain("KADENCE_PATTERN");
    expect(allText).not.toContain("pattern"); // not promoted to a pattern block when inline
    expect(allText).toContain("快來看");
    expect(allText).toContain("這個方案");
  });
});

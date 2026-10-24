import { describe, expect, it } from "vitest";
import { parseArticleMeta } from "../meta";

const md = `<!-- CONTENT_META_START -->
SEO_TITLE: 5 個感恩日記習慣
META_DESC: ${"說".repeat(170)}
FOCUS_KEYWORD: 感恩日記
CATEGORIES: 身心, 習慣
TAGS: 日記, 感恩 ,
<!-- CONTENT_META_END -->
<!-- SLUG_HINT: gratitude-journal -->
# 標題`;

describe("parseArticleMeta", () => {
  it("reads the generator's meta block and slug hint", () => {
    expect(parseArticleMeta(md)).toEqual({
      seoTitle: "5 個感恩日記習慣", metaDesc: "說".repeat(160), focusKeyword: "感恩日記",
      categories: ["身心", "習慣"], tags: ["日記", "感恩"], slug: "gratitude-journal",
    });
  });

  it("reads a value written right after the colon (the pattern's whitespace is a real whitespace class)", () => {
    const tight = ["<!-- CONTENT_META_START -->", "SEO_TITLE:sleep tips", "META_DESC:sleep better", "FOCUS_KEYWORD:sleep", "<!-- CONTENT_META_END -->"].join("\n");
    expect(parseArticleMeta(tight)).toMatchObject({ seoTitle: "sleep tips", metaDesc: "sleep better", focusKeyword: "sleep" });
  });

  it("no block, or a block without title and description, is null", () => {
    expect(parseArticleMeta("# 只有內文")).toBeNull();
    expect(parseArticleMeta("<!-- CONTENT_META_START -->\nTAGS: a\n<!-- CONTENT_META_END -->")).toBeNull();
  });
});

// Internal markers never reach a WordPress post (lib/content/internal-markers.ts). 2026-11-22: aware-wave.com posts 62/69
// showed 「&lt;!-- NEEDS_FACT_CHECK --&gt;」 as text, and scheduled drafts ended with a 「[COST_JSON]{…}」 paragraph. One
// article carrying every marker goes through both publish converters; no marker (escaped or not) may come out, and the
// sentences around them, plus a standalone pattern line (a feature, not a marker), must.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

import { markdownToBlocks } from "../markdown-to-blocks";
import { markdownToHtml } from "../publish/wordpress-core";
import { scrubInternalMarkers } from "../internal-markers";

const MD = [
  "<!-- CONTENT_META_START -->", "SEO_TITLE: 標題", "META_DESC: 描述", "<!-- CONTENT_META_END -->",
  "# 文章標題",
  "## 第一節",
  "研究顯示 30% 的人有感<!-- NEEDS_FACT_CHECK --> 這是第一句。",
  "我們的品牌最早成立<!-- NEEDS_BRAND_VERIFY -->，這是第二句。",
  "<!-- NEEDS_FACT_CHECK -->",
  "第三句[YOUTUBE_PLACEHOLDER_1: 搜尋詞]在這裡。",
  "![配圖說明](IMAGE_PLACEHOLDER_2)",
  "第四句 [KADENCE_PATTERN: 7207] 黏在句子裡。",
  "[KADENCE_PATTERN: 7208]",
  "<!-- 模型自己加的註解 -->第五句。",
  "<!-- GENERATION_TRUNCATED: hit the output length limit -->",
  "<!-- SLUG_HINT: primary-slug -->",
  `[COST_JSON]${JSON.stringify({ usd: 0.03, model: "claude-opus-5-5", vendor: "Anthropic", route: "content/article-generate" })}`,
].join("\n");

const MARKERS = ["CONTENT_META", "SEO_TITLE", "NEEDS_FACT_CHECK", "NEEDS_BRAND_VERIFY", "YOUTUBE_PLACEHOLDER", "IMAGE_PLACEHOLDER",
  "KADENCE_PATTERN", "GENERATION_TRUNCATED", "SLUG_HINT", "COST_JSON", "模型自己加的註解", "<!--", "&lt;!--", "--&gt;"];
const SENTENCES = ["這是第一句。", "這是第二句。", "在這裡。", "黏在句子裡。", "第五句。"];

describe("internal markers never reach a post", () => {
  it.each([
    ["markdownToHtml (REST path)", () => markdownToHtml(MD).replace(/<!-- wp:block \{"ref":7208\} \/-->/, "PATTERN_7208")],
    ["markdownToBlocks (Bridge path)", () => JSON.stringify(markdownToBlocks(MD))],
  ])("%s: no marker in any form, every sentence kept, the standalone pattern kept as a block", (_name, run) => {
    const out = run();
    for (const m of MARKERS) expect(out, m).not.toContain(m);
    for (const s of SENTENCES) expect(out, s).toContain(s);
    expect(out).toMatch(/PATTERN_7208|"ref":7208|7208/);
  });
});

// K22 (2026-11-23 blind test): the year notes models wrote after a source, and a raw <a href> one model wrote.
describe("year notes and raw HTML links", () => {
  it("drops the three note forms, keeps a source name in the same brackets, leaves normal brackets alone", () => {
    expect(scrubInternalMarkers("見[維基百科](https://w.org)（年份未核）。")).toBe("見[維基百科](https://w.org)。");
    expect(scrubInternalMarkers("見[維基百科](https://w.org)（無固定出版年）。")).toBe("見[維基百科](https://w.org)。");
    expect(scrubInternalMarkers("職場倦怠很常見（Cheers，未註明年份；經理人，出版年份待查）。")).toBe("職場倦怠很常見（Cheers；經理人）。");
    expect(scrubInternalMarkers("根據衛福部（2024）與世界衛生組織（WHO）的定義（見下表）。")).toBe("根據衛福部（2024）與世界衛生組織（WHO）的定義（見下表）。");
  });

  it.each([
    ["markdownToHtml (REST path)", (md: string) => markdownToHtml(md)],
    ["markdownToBlocks (Bridge path)", (md: string) => markdownToBlocks(md).map(b => ("text" in b ? String(b.text) : "")).join(" ")],
  ])("%s: a raw <a href> becomes a real link, not visible code", (_name, run) => {
    const out = run('可參考<a href="https://zh.wikipedia.org/wiki/x">維基百科（職業倦怠）</a>的整理。');
    expect(out).not.toContain("&lt;a");
    expect(out).toContain('<a href="https://zh.wikipedia.org/wiki/x">維基百科（職業倦怠）</a>');
  });
});

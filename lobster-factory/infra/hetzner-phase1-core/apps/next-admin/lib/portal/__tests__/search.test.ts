import { describe, expect, it } from "vitest";
import { noResultHelp, rankItems, searchCatalog } from "../search";
import { buildSearchIndex } from "../search-index";

const index = buildSearchIndex({});
const top = (q: string) => rankItems(index, q).map((i) => i.name);

describe("top-bar search matching (U18, blueprint §4.5)", () => {
  it.each([
    ["文章", "寫文章"],          // the page whose name holds the word comes first
    ["寫文章", "寫文章"],        // exact name
    ["部落格", "內容行銷"],      // synonym of 寫 SEO 文章 reaches its product
    ["seo", "SEO 修正"],        // English: case-insensitive
    ["S E O", "SEO 修正"],      // and whitespace-insensitive
  ])("%s -> %s first", (q, first) => {
    expect(top(q)[0]).toBe(first);
  });

  it("ranks exact name > name contains > task > keyword > blurb", () => {
    const item = (key: string, over: object) => ({ group: "feature" as const, key, name: key, crumb: [key], tasks: [], keywords: [], blurb: "", category: "", href: "", ...over });
    const ix = { tasks: { t: { name: "排題目", synonyms: [] } }, items: [
      item("blurb", { name: "甲", blurb: "排題目的說明" }), item("kw", { name: "乙", keywords: ["排題目"] }),
      item("task", { name: "丙", tasks: ["t"] }), item("contains", { name: "排題目工具" }), item("exact", { name: "排題目" }),
    ] };
    expect(rankItems(ix, "排題目").map((i) => i.key)).toEqual(["exact", "contains", "task", "kw", "blurb"]);
  });

  it("groups 產品／功能／頁面, best group first, each hit with a breadcrumb", () => {
    const groups = searchCatalog(index, "文章人性化");
    expect(groups[0].group).toBe("feature");
    expect(groups[0].items[0].crumb).toEqual(["內容行銷", "文章人性化"]);
  });

  it("no result: nothing found, then task entries and every category", () => {
    expect(rankItems(index, "xyzzy")).toEqual([]);
    const help = noResultHelp(index, "xyzzy");
    expect(help.tasks.length).toBeGreaterThan(0);
    expect(help.categories).toContain("內容");
  });
});

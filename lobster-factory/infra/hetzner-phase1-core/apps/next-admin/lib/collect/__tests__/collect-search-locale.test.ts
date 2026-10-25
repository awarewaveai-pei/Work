// A search vendor is only ever sent the language and region codes it documents (2026-10-12: Brave answered 422 to
// search_lang=zh for every Chinese query, so the engine never answered). One table, SEARCH_LOCALES, maps our codes.

import { describe, expect, it } from "vitest";
import { SEARCH_DRIVERS, SEARCH_LOCALES, searchLocale } from "@/lib/collect/search/drivers";
import type { QueryLang } from "@/lib/collect/search/query-plan";

const OURS: QueryLang[] = ["zh", "en"];
const ask = (provider: string, languages?: string[]) => SEARCH_DRIVERS[provider].request({ query: "民法 667", maxResults: 5, languages });

describe("search vendor language and region parameters", () => {
  it("brave: zh is Traditional Chinese in Taiwan, en is English in the US", () => {
    expect(ask("brave", ["zh"]).path).toBe("/res/v1/web/search?q=%E6%B0%91%E6%B3%95+667&count=5&search_lang=zh-hant&country=TW");
    expect(ask("brave", ["en"]).path).toBe("/res/v1/web/search?q=%E6%B0%91%E6%B3%95+667&count=5&search_lang=en&country=US");
  });

  it("serper: zh is hl=zh-tw gl=tw, en is hl=en gl=us", () => {
    expect(ask("serper", ["zh"]).body).toEqual({ q: "民法 667", num: 5, hl: "zh-tw", gl: "tw" });
    expect(ask("serper", ["en"]).body).toEqual({ q: "民法 667", num: 5, hl: "en", gl: "us" });
  });

  it("sends no language parameter when none was asked for", () => {
    expect(ask("brave").path).toBe("/res/v1/web/search?q=%E6%B0%91%E6%B3%95+667&count=5");
    expect(ask("serper").body).toEqual({ q: "民法 667", num: 5 });
  });

  it("every vendor has a row, and every row names every code of ours", () => {
    expect(Object.keys(SEARCH_LOCALES).sort()).toEqual(Object.keys(SEARCH_DRIVERS).sort());
    for (const [provider, row] of Object.entries(SEARCH_LOCALES)) {
      for (const code of OURS) expect(row[code], `${provider}/${code}`).toBeDefined();
    }
  });

  it("an unmapped code fails loudly and is never sent raw", () => {
    for (const provider of Object.keys(SEARCH_DRIVERS)) {
      expect(() => ask(provider, ["ja"]), provider).toThrow(`unsupported_search_language_${provider}_ja`);
      expect(() => searchLocale(provider, "zh-hant"), provider).toThrow(/unsupported_search_language/);
    }
  });

  it("reads a code the way a person types it", () => {
    expect(searchLocale("brave", " ZH ")).toEqual({ lang: "zh-hant", region: "TW" });
  });
});

import { describe, expect, it } from "vitest";
import { buildKeywordQuery } from "@/lib/kb/keyword-query";

describe("a question becomes matchable terms", () => {
  it("bigrams a Chinese question instead of searching for the whole sentence", () => {
    // The old behaviour searched for the literal question, which no chunk contains. This is the
    // exact input that returned nothing for four months.
    const q = buildKeywordQuery("請問退貨運費要怎麼算？");
    expect(q.split(" OR ")).toContain("退貨");
    expect(q.split(" OR ")).toContain("運費");
    expect(q).not.toContain("請問退貨運費要怎麼算"); // never the whole sentence
  });

  it("keeps Latin words whole", () => {
    // Bigramming "shipping" into sh/hi/ip would match every English page ever stored.
    expect(buildKeywordQuery("What is the shipping policy?").split(" OR ")).toEqual(["is", "shipping", "policy"]);
  });

  it("handles a question that mixes both", () => {
    const terms = buildKeywordQuery("Shopify 退貨政策").split(" OR ");
    expect(terms).toContain("shopify");
    expect(terms).toContain("退貨");
    expect(terms).toContain("貨政");
  });

  it("strips query-syntax characters rather than letting them act as operators", () => {
    // Left in, `(` and `|` are PGroonga syntax: a user's punctuation would become a query the
    // database either rejects or answers with something nobody asked for.
    const q = buildKeywordQuery('退貨 (policy) | "refund" -now');
    expect(q).not.toMatch(/[()"'|*:~<>=]/);
    expect(q.split(" OR ")).toContain("policy");
    expect(q.split(" OR ")).toContain("refund");
  });

  it("keeps a single CJK character, which is a whole word", () => {
    expect(buildKeywordQuery("貓")).toBe("貓");
  });

  it("returns empty when nothing usable is left, so the caller can skip the half", () => {
    // An empty PGroonga query is not "match nothing" — it is an error or a match-all, and both are
    // worse than not running the query.
    expect(buildKeywordQuery("   ")).toBe("");
    expect(buildKeywordQuery("!!! ???")).toBe("");
    expect(buildKeywordQuery("a")).toBe(""); // one Latin letter narrows nothing
  });

  it("does not repeat a term, and stops before the query grows unbounded", () => {
    expect(buildKeywordQuery("退貨 退貨 退貨")).toBe("退貨");
    const long = buildKeywordQuery("字".repeat(200));
    expect(long.split(" OR ").length).toBeLessThanOrEqual(32);
  });
});

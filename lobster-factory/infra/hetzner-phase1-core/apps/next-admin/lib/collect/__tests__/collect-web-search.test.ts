// collect/web-search — a query becomes result URLs, and nothing the vendor wrote becomes content.
//
// The provider call is stubbed: this is about what the block does with a response, not about
// Perplexity being up. The response shape is the documented one (POST /search → results[] with
// title / url / snippet / date / last_updated).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { webSearchCollector, usableResults, domainFilter, searchProviderId, SEARCH_SCHEME } from "@/lib/collect/collectors/web-search";
import type { CollectCtx, Target } from "@/lib/collect/types";

const RESPONSE = {
  results: [
    { title: "退貨規定", url: "https://gov.example/consumer/returns", snippet: "七天鑑賞期…", date: "2026-01-02" },
    { title: "重複", url: "https://gov.example/consumer/returns?utm_source=x", snippet: "同一頁", date: null },
    { title: "沒有網址", snippet: "vendor returned a row with no url" },
    { title: "不是網頁", url: "ftp://files.example/doc.txt", snippet: "" },
    { title: "另一個站", url: "https://who.example/policy", snippet: "…", last_updated: "2026-03-04" },
  ],
};

function target(query: string, meta: Record<string, unknown> = {}): Target {
  const uri = `${SEARCH_SCHEME}://${encodeURIComponent(query)}`;
  return { uri, canonicalUri: uri, scope: { hosts: [] }, tier: 0, meta } as unknown as Target;
}

let callProvider: ReturnType<typeof vi.fn>;

function ctx(): CollectCtx {
  return {
    fetch: (async () => {
      throw new Error("this block must not crawl — it only asks the provider");
    }) as unknown as CollectCtx["fetch"],
    callProvider,
    canonicalize: (u: string) => u,
    tenantRef: "t1",
    log: () => {},
  } as unknown as CollectCtx;
}

beforeEach(() => {
  vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  callProvider = vi.fn(async () => ({ json: async () => RESPONSE }) as unknown as Response);
});

describe("routing", () => {
  it("answers to its own scheme and nothing else", () => {
    expect(webSearchCollector.match(target("退貨"))).toBeGreaterThan(0);
    expect(webSearchCollector.match({ uri: "academic://退貨" } as Target)).toBe(0);
    expect(webSearchCollector.match({ uri: "https://example.com/" } as Target)).toBe(0);
  });

  it("is inert without a key", () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    // Not an error, not a catalogue entry that disappears — just a block that never wins routing,
    // so a deployment without the key behaves exactly as it did before this file existed.
    expect(webSearchCollector.match(target("退貨"))).toBe(0);
  });
});

describe("what comes back", () => {
  it("stores nothing itself, and hands every usable hit to the crawler", async () => {
    const out = await webSearchCollector.run(target("退貨 規定"), ctx());

    // The whole point: the vendor's text is never content. A snippet stored as a document would be
    // an unverifiable paraphrase wearing a real URL.
    expect(out.docs).toEqual([]);
    expect(out.discovered.map((d) => d.uri)).toEqual([
      "https://gov.example/consumer/returns",
      "https://who.example/policy",
    ]);
    // The snippet survives only as meta on a target, where a person reading a run report can see
    // why a page was picked. It has no path into a document: docs is empty, and the text that ends
    // up stored comes from fetching the page itself.
    expect(out.discovered[0].meta?.searchSnippet).toBe("七天鑑賞期…");
    expect(out.discovered.some((d) => "text" in d || "contentHash" in d)).toBe(false);
  });

  it("scopes each hit to its own host", async () => {
    // Without this, the first result's host becomes the boundary for all of them and every other
    // result is dropped as out of scope — a search that silently returns one page.
    const out = await webSearchCollector.run(target("退貨"), ctx());
    expect(out.discovered.map((d) => d.scope?.hosts)).toEqual([["gov.example"], ["who.example"]]);
    expect(out.discovered.every((d) => d.scope?.pathPrefix === undefined)).toBe(true);
  });

  it("passes the operator's narrowing through to the provider", async () => {
    await webSearchCollector.run(
      target("退貨", { maxResults: 50, domains: "gov.tw, https://who.int/x", recency: "month", language: "zh,en" }),
      ctx(),
    );
    const body = callProvider.mock.calls[0][1].body;
    expect(body.query).toBe("退貨");
    expect(body.max_results).toBe(20); // asked for 50; the vendor's ceiling is 20
    expect(body.search_domain_filter).toEqual(["gov.tw", "who.int"]); // scheme and path stripped
    expect(body.search_recency_filter).toBe("month");
    expect(body.search_language_filter).toEqual(["zh", "en"]);
  });

  it("omits filters that were left blank rather than sending empty ones", async () => {
    await webSearchCollector.run(target("退貨"), ctx());
    const body = callProvider.mock.calls[0][1].body;
    expect(Object.keys(body).sort()).toEqual(["max_results", "query"]);
  });

  it("refuses an empty query instead of searching for nothing", async () => {
    await expect(webSearchCollector.run(target(""), ctx())).rejects.toThrow(/search_query_missing/);
  });
});

describe("result hygiene", () => {
  it("drops rows that are not fetchable pages, and duplicates of the same page", () => {
    const kept = usableResults(RESPONSE.results);
    expect(kept.map((k) => k.url.hostname)).toEqual(["gov.example", "who.example"]);
  });

  it("reads a domain list the way a person types it", () => {
    expect(domainFilter("gov.tw,who.int")).toEqual(["gov.tw", "who.int"]);
    expect(domainFilter(" https://example.com/path ")).toEqual(["example.com"]);
    expect(domainFilter("")).toBeUndefined();
    expect(domainFilter(undefined)).toBeUndefined();
    expect(domainFilter(Array.from({ length: 30 }, (_, i) => `d${i}.com`).join(","))).toHaveLength(20);
  });
});

describe("a second search vendor", () => {
  // Brave answers the same job with a different shape: GET with query params, results nested under
  // `web.results`, `description` instead of `snippet`, and no domain-filter parameter at all.
  const BRAVE = {
    web: {
      results: [
        { title: "退貨規定", url: "https://gov.example/returns", description: "七天…", age: "2026-01-02" },
        { title: "沒有網址", description: "no url" },
      ],
    },
  };

  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-key");
    vi.stubEnv("COLLECT_SEARCH_PROVIDER", "brave");
    callProvider = vi.fn(async () => ({ json: async () => BRAVE }) as unknown as Response);
  });

  it("reads Brave's shape into the same result the crawler gets from any vendor", async () => {
    const out = await webSearchCollector.run(target("退貨"), ctx());
    expect(out.docs).toEqual([]);
    expect(out.discovered.map((d) => d.uri)).toEqual(["https://gov.example/returns"]);
    expect(out.discovered[0].meta?.searchSnippet).toBe("七天…");
    expect(out.discovered[0].scope?.hosts).toEqual(["gov.example"]);
  });

  it("keeps the operator's domain restriction even though Brave has no filter parameter", async () => {
    // Dropping it would silently widen a search that was deliberately narrowed — the worst kind of
    // "it worked", because the results look plausible.
    await webSearchCollector.run(target("退貨", { domains: "gov.tw, who.int" }), ctx());
    const init = callProvider.mock.calls[0][1];
    expect(init.method).toBe("GET");
    // URLSearchParams encodes a space as '+', which decodeURIComponent does not undo — decode the
    // way a server would, or this asserts against a string nobody ever sees.
    const q = new URLSearchParams(init.path.split("?")[1]).get("q");
    expect(q).toContain("site:gov.tw OR site:who.int");
  });

  it("maps recency onto Brave's own vocabulary", async () => {
    await webSearchCollector.run(target("退貨", { recency: "month" }), ctx());
    expect(decodeURIComponent(callProvider.mock.calls[0][1].path)).toContain("freshness=pm");
  });

  it("picks whichever vendor has a key when none is named", () => {
    vi.stubEnv("COLLECT_SEARCH_PROVIDER", "");
    // Defaulting to perplexity while only the Brave key is set would make the source look broken
    // for a reason the operator has no way to see.
    expect(searchProviderId({ BRAVE_SEARCH_API_KEY: "k" })).toBe("brave");
    expect(searchProviderId({ PERPLEXITY_API_KEY: "k" })).toBe("perplexity");
    expect(searchProviderId({ COLLECT_SEARCH_PROVIDER: "brave", PERPLEXITY_API_KEY: "k" })).toBe("brave");
  });

  it("refuses a vendor it has no driver for instead of calling it blindly", async () => {
    vi.stubEnv("COLLECT_SEARCH_PROVIDER", "some-vendor");
    vi.stubEnv("SOME-VENDOR_API_KEY", "k");
    await expect(webSearchCollector.run(target("x"), ctx())).rejects.toThrow(/unknown_search_provider|missing_/);
  });
});

describe("the catalogue tells the truth about interchangeable keys", () => {
  it("is available on one key, and names both only when neither is set", async () => {
    const { describeBlock } = await import("@/lib/collect/catalogue");

    const withPerplexity = describeBlock(webSearchCollector, { PERPLEXITY_API_KEY: "k" })!;
    expect([withPerplexity.available, withPerplexity.missing]).toEqual([true, []]);

    const withBrave = describeBlock(webSearchCollector, { BRAVE_SEARCH_API_KEY: "k" })!;
    expect([withBrave.available, withBrave.missing]).toEqual([true, []]);

    // Neither: unavailable, and BOTH options named so the operator can choose an account to open.
    const withNeither = describeBlock(webSearchCollector, {})!;
    expect(withNeither.available).toBe(false);
    expect(withNeither.missing.sort()).toEqual(["BRAVE_SEARCH_API_KEY", "PERPLEXITY_API_KEY"]);
  });

  it("still treats a single-vendor source as all-or-nothing", async () => {
    const { describeBlock } = await import("@/lib/collect/catalogue");
    const { extractProviderCollector } = await import("@/lib/collect/collectors/extract-provider");
    expect(describeBlock(extractProviderCollector, {})!.missing).toEqual(["FIRECRAWL_API_KEY"]);
    expect(describeBlock(extractProviderCollector, { FIRECRAWL_API_KEY: "k" })!.available).toBe(true);
  });
});

// collect/web-search — 給一句問題，讓它去全網找。
//
// WHAT WAS MISSING: every other source needs the operator to already know the address — a URL, a
// sitemap, a feed, a registry query. None of them answers "go find who says this". That gap is what
// an operator notices first, because it is the one thing a search engine does.
//
// PRECISION COMES FROM NOT TRUSTING THE SNIPPET. This block stores NOTHING itself. It turns a query
// into result URLs and hands them back as discovered targets, so each one is fetched and extracted
// by the normal tier, passes the same quality gate, and lands with the same provenance label and
// citation as any other page. A snippet is three lines a vendor wrote about a page; storing it
// would put an unverifiable paraphrase into the knowledge base with a real URL attached to it,
// which is the most convincing kind of wrong. The snippet is kept in meta for debugging only.
//
// EACH RESULT CARRIES ITS OWN BOUNDARY. A discovered target may declare its own scope, so every hit
// is scoped to its own host. Without that, the first result's host would become the boundary for
// all of them and the rest would be dropped as out of scope.
//
// INERT WITHOUT A KEY: match() returns 0 when the provider is unconfigured, so a deployment with no
// PERPLEXITY_API_KEY behaves exactly as it did before this file existed.

import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import type { ProviderCallInit } from "@/lib/collect/net/providers";
import { registerCollector } from "@/lib/collect/registry";
import { providerConfigured } from "@/lib/collect/net/providers";

/** Which vendor answers the query. One environment variable, no vendor name in any caller. */
export function searchProviderId(env: Record<string, string | undefined> = process.env): string {
  const named = env.COLLECT_SEARCH_PROVIDER;
  if (named) return named;
  // No explicit choice: use whichever vendor actually has a key, rather than defaulting to one and
  // making the source look broken because the OTHER key is the one that was set.
  if (env.PERPLEXITY_API_KEY) return "perplexity";
  if (env.BRAVE_SEARCH_API_KEY) return "brave";
  return "perplexity";
}

/** Env vars that could make this source usable — the catalogue lists them so one can be chosen. */
export const SEARCH_KEYS = ["PERPLEXITY_API_KEY", "BRAVE_SEARCH_API_KEY"] as const;

/** One result, after each vendor's own shape has been flattened by `parseResults`. */
interface SearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string | null;
  last_updated?: string | null;
}

/**
 * Per-vendor request and response, and nothing else. Everything below this map is vendor-neutral:
 * adding a third search engine is one entry here (ADR 011 §決策 5).
 *
 *  - perplexity: POST /search, `{ results: [{title,url,snippet,date,last_updated}] }`
 *  - brave:      GET  /res/v1/web/search, `{ web: { results: [{title,url,description,age}] } }`
 */
const SEARCH_DRIVERS: Record<
  string,
  {
    request(q: { query: string; maxResults: number; domains?: string[]; recency?: string; languages?: string[] }): ProviderCallInit;
    parse(json: unknown): SearchResult[];
  }
> = {
  perplexity: {
    request: (q) => ({
      path: "/search",
      method: "POST",
      body: {
        query: q.query,
        max_results: q.maxResults,
        ...(q.domains ? { search_domain_filter: q.domains } : {}),
        ...(q.recency ? { search_recency_filter: q.recency } : {}),
        ...(q.languages ? { search_language_filter: q.languages } : {}),
      },
    }),
    parse: (json) => ((json as { results?: SearchResult[] }).results ?? []),
  },

  brave: {
    request: (q) => {
      const params = new URLSearchParams({ q: q.query, count: String(q.maxResults) });
      // Brave has no domain-filter parameter, so the restriction goes into the query itself — the
      // operator's "只找這些網域" must not be silently dropped, which would quietly widen a search
      // they deliberately narrowed.
      if (q.domains?.length) params.set("q", `${q.query} ${q.domains.map((d) => `site:${d}`).join(" OR ")}`);
      if (q.recency) {
        const freshness: Record<string, string> = { day: "pd", week: "pw", month: "pm", year: "py" };
        if (freshness[q.recency]) params.set("freshness", freshness[q.recency]);
      }
      if (q.languages?.length) params.set("search_lang", q.languages[0]);
      return { path: `/res/v1/web/search?${params.toString()}`, method: "GET" };
    },
    parse: (json) => {
      const results = (json as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } }).web?.results ?? [];
      return results.map((r) => ({ title: r.title, url: r.url, snippet: r.description, date: r.age ?? null }));
    },
  },
};

export const SEARCH_SCHEME = "search";

export function queryOf(t: Target): string {
  if (typeof t.meta?.query === "string" && t.meta.query.trim()) return t.meta.query.trim();
  if (t.uri.startsWith(`${SEARCH_SCHEME}://`)) return decodeURIComponent(t.uri.slice(`${SEARCH_SCHEME}://`.length));
  return "";
}

/**
 * Results the crawler can actually act on.
 *
 * Dropped here rather than downstream: a result with no usable https URL is not a page we failed to
 * read, it is not a page at all, and letting it reach the frontier turns a vendor's bad row into a
 * fetch error that looks like a site being down.
 */
export function usableResults(raw: SearchResult[]): Array<{ url: URL; r: SearchResult }> {
  const out: Array<{ url: URL; r: SearchResult }> = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r.url) continue;
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    // The same page can be returned twice with different tracking parameters; the orchestrator
    // canonicalizes too, but paying for a second fetch to discover that is avoidable here.
    const key = `${u.hostname}${u.pathname}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: u, r });
  }
  return out;
}

/** Domain filter as the vendor wants it: bare hostnames, at most 20. */
export function domainFilter(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const list = value
    .split(/[,\s]+/)
    .map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase())
    .filter(Boolean);
  return list.length ? list.slice(0, 20) : undefined;
}

export const webSearchCollector: CollectBlock = {
  id: "collect/web-search",
  title: "搜尋全網（給一句問題）",
  icon: "🔎",

  describe: {
    kind: "web",
    summary:
      "給一句問題，去全網找出相關頁面，再逐頁真的抓下來讀。存進知識庫的是頁面原文與出處，不是搜尋摘要。按次計費。",
    entry: "query",
    queryScheme: SEARCH_SCHEME,
    // Either key makes it work. Both are named when neither is set, so the operator can choose
    // which account to open rather than being told about one vendor.
    requiresAny: [...SEARCH_KEYS],
    metered: true,
    options: [
      { key: "maxResults", label: "取回幾筆結果", type: "number", default: 10, help: "上限 20。每一筆都會再去真的抓一次頁面。" },
      {
        key: "domains",
        label: "只找這些網域",
        type: "string",
        help: "逗號分隔，最多 20 個，例如 gov.tw, who.int。留空 = 全網。要精確就填這個——限定在權威來源比任何排序參數都有效。",
      },
      {
        key: "recency",
        label: "只要多新的內容",
        type: "select",
        default: "",
        choices: [
          { value: "", label: "不限（建庫用這個）" },
          { value: "year", label: "一年內" },
          { value: "month", label: "一個月內" },
          { value: "week", label: "一週內" },
          { value: "day", label: "一天內" },
        ],
      },
      {
        key: "language",
        label: "語言",
        type: "string",
        help: "ISO 639-1，逗號分隔，例如 zh,en。留空 = 不限。",
      },
    ],
  },

  /**
   * 3 — same tier as the other query sources. They never contend: routing is by URI scheme, and
   * `search://` is this block's alone (guarded in __tests__/collect-block-hygiene.test.ts).
   */
  match(t: Target): number {
    if (!providerConfigured(searchProviderId())) return 0;
    return t.uri.startsWith(`${SEARCH_SCHEME}://`) ? 3 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const query = queryOf(t);
    if (!query) throw Object.assign(new Error("search_query_missing"), { status: 400 });
    if (!ctx.callProvider) throw Object.assign(new Error("provider_call_unavailable"), { status: 501 });

    const providerId = searchProviderId();
    const maxResults = Math.min(Math.max(Number(t.meta?.maxResults ?? 10) || 10, 1), 20);
    const domains = domainFilter(t.meta?.domains);
    const recency = typeof t.meta?.recency === "string" && t.meta.recency ? t.meta.recency : undefined;
    const languages = typeof t.meta?.language === "string" && t.meta.language.trim()
      ? t.meta.language.split(/[,\s]+/).map((l) => l.trim()).filter(Boolean)
      : undefined;

    const driver = SEARCH_DRIVERS[providerId];
    if (!driver) throw Object.assign(new Error(`unknown_search_provider_${providerId}`), { status: 501 });

    const res = await ctx.callProvider(providerId, driver.request({ query, maxResults, domains, recency, languages }));
    const raw = driver.parse(await res.json());
    const hits = usableResults(raw);
    ctx.log(`search "${query.slice(0, 60)}" via ${providerId} -> ${raw.length} results, ${hits.length} usable`);

    return {
      // Nothing is stored from the search response itself. See the header.
      docs: [],
      discovered: hits.map(({ url, r }, i) => ({
        uri: url.toString(),
        // Its own boundary: one host each, and no path prefix, so the page is read but the crawler
        // does not wander a stranger's whole site off the back of one search hit.
        scope: { hosts: [url.hostname] },
        meta: {
          searchQuery: query,
          searchRank: i + 1,
          searchProvider: providerId,
          // Kept for a human reading a run report, never stored as content.
          searchSnippet: typeof r.snippet === "string" ? r.snippet.slice(0, 300) : undefined,
          searchDate: r.date ?? r.last_updated ?? undefined,
        },
      })) as unknown as Target[],
    };
  },
};

registerCollector(webSearchCollector);

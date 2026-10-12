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
// SEARCH_KEYS entry set behaves exactly as it did before this file existed.

import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { providerConfigured } from "@/lib/collect/net/providers";

/**
 * Re-exported, not re-implemented: these moved to lib/collect/search/drivers.ts when
 * collectors/entity-dossier.ts started needing the same vendors. Kept on this module's surface so
 * every existing importer (and every existing test) keeps working against one implementation.
 */
export { searchProviderId, SEARCH_KEYS, usableResults, domainFilter } from "@/lib/collect/search/drivers";
import { searchProviderId, usableResults, domainFilter, SEARCH_DRIVERS, SEARCH_KEYS } from "@/lib/collect/search/drivers";

export const SEARCH_SCHEME = "search";

export function queryOf(t: Target): string {
  if (typeof t.meta?.query === "string" && t.meta.query.trim()) return t.meta.query.trim();
  if (t.uri.startsWith(`${SEARCH_SCHEME}://`)) return decodeURIComponent(t.uri.slice(`${SEARCH_SCHEME}://`.length));
  return "";
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
        key: "maxDepth",
        label: "結果頁再往下跟幾層連結",
        type: "number",
        default: 0,
        help: "預設 0 = 只讀搜尋結果那幾頁，一個連結都不跟。設 1 以上等於開始爬那些網站——一個書店的作者頁會把整個書店目錄帶進來（2026-09-20 實際發生過，159 筆）。",
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
        help: "目前支援 zh（繁體中文）與 en，逗號分隔，例如 zh,en。留空 = 不限。",
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
        canonicalUri: ctx.canonicalize(url.toString()), // recomputed by the orchestrator; kept consistent here
        tier: 0,
        /**
         * ROOTS, not hops. A `search://…` target is not a page, so its results are not one link
         * away from anything, and depth 0 is what lets "read exactly these, follow nothing" be
         * expressible at all (orchestrator.ts's enqueueDiscovered).
         *
         * This field used to be missing entirely, hidden by an `as unknown as Target[]` cast: every
         * later depth comparison was against undefined, every comparison was therefore false, and
         * the crawl depth limit did not exist for anything a search found. Run
         * manual-2026-09-20051728 fetched 190 pages off ten search results and stopped only when
         * the budget ran out.
         */
        depth: 0,
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
      })),
    };
  },
};

registerCollector(webSearchCollector);

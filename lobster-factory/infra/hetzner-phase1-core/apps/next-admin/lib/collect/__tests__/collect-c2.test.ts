// C2: a whole site rather than one page, and refusals that somebody actually sees.
//
// The two collectors return only discovered targets, never documents — that is the load-bearing
// decision here, and both tests assert it directly. The report store is exercised against a stubbed
// Supabase client; the tables it writes to are verified against a real Postgres by
// packages/db/scripts/collection-local-verify.sh.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { crawl } from "@/lib/collect/orchestrator";
import { createBudget } from "@/lib/collect/budget";
import { createNullSink } from "@/lib/collect/sinks/null";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { MemoryRunStore } from "@/lib/collect/state";
import { sitemapCollector, parseSitemap, MAX_URLS_PER_SITEMAP } from "@/lib/collect/collectors/sitemap";
import { rssCollector, parseFeedLinks } from "@/lib/collect/collectors/rss";
import { httpHtmlCollector } from "@/lib/collect/collectors/http-html";
import { severityFor } from "@/lib/collect/report-store";
import type { RunReport, SinkReport, Target } from "@/lib/collect/types";

const HOST = "shop.example.com";
const ARTICLE = "退貨政策：商品到貨後七日內可申請退貨，商品需保持完整包裝與配件。".repeat(8);

const target = (uri: string, hint?: string): Target => ({
  uri,
  canonicalUri: uri,
  scope: { hosts: [HOST] },
  tier: 0,
  depth: 0,
  hint,
});

function page(body: string): string {
  return `<!doctype html><html lang="zh-TW"><head><title>退貨政策</title></head><body><main><p>${body}</p></main></body></html>`;
}

function sitemapXml(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${u}</loc></url>`)
    .join("")}</urlset>`;
}

function crawlWith(transport: typeof fetch, over: Record<string, unknown> = {}) {
  const budget = createBudget({ fetches: 100 });
  return {
    sink: createNullSink(),
    budget,
    tenantRef: "tenant-1",
    runId: `run-${Math.random()}`,
    blocks: [sitemapCollector, rssCollector, httpHtmlCollector],
    maxDepth: 3,
    fetch: createCollectFetch({
      budget,
      transport,
      resolver: async () => ["93.184.216.34"],
      rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }),
      robots: null,
    }),
    ...over,
  };
}

describe("collect/sitemap", () => {
  it("outranks the HTML tier so a sitemap is read as a sitemap", () => {
    const t = target(`https://${HOST}/sitemap.xml`);
    expect(sitemapCollector.match(t)).toBeGreaterThan(httpHtmlCollector.match(t));
    expect(sitemapCollector.match(target(`https://${HOST}/feed.xml`, "sitemap"))).toBe(2);
    expect(sitemapCollector.match(target(`https://${HOST}/faq`))).toBe(0);
  });

  it("reads a sitemap index and a urlset, and caps what one file can queue", () => {
    const index = `<sitemapindex><sitemap><loc>https://${HOST}/sitemap-1.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(index)).toEqual({ urls: [], sitemaps: [`https://${HOST}/sitemap-1.xml`] });

    const huge = sitemapXml(Array.from({ length: MAX_URLS_PER_SITEMAP + 500 }, (_, i) => `https://${HOST}/p${i}`));
    // The budget limits fetches; this limits MEMORY — a 50,000-entry frontier is persisted on every
    // flush, which turns a resumable crawl into a slow one.
    expect(parseSitemap(huge).urls).toHaveLength(MAX_URLS_PER_SITEMAP);
  });

  it("turns a sitemap into pages in the knowledge base, and stores no list", async () => {
    const pages = [`https://${HOST}/faq/returns`, `https://${HOST}/faq/shipping`];
    const transport = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/sitemap.xml")) {
        return new Response(sitemapXml(pages), { status: 200, headers: { "content-type": "application/xml" } });
      }
      return new Response(page(ARTICLE), { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const opts = crawlWith(transport);
    const r = await crawl([{ uri: `https://${HOST}/sitemap.xml` }], opts);

    const stored = (opts.sink as ReturnType<typeof createNullSink>).received;
    expect(stored.map((d) => d.uri).sort()).toEqual([...pages].sort());
    expect(stored.every((d) => !d.text.includes("<loc>"))).toBe(true); // the list itself is not a document
    expect(r.report.dirty).toHaveLength(0);
  });

  it("says plainly that it cannot read a gzipped sitemap", async () => {
    const transport = (async () =>
      new Response("\u001f\u008b binary", { status: 200, headers: { "content-type": "application/gzip" } })) as unknown as typeof fetch;
    const r = await crawl([{ uri: `https://${HOST}/sitemap.xml.gz` }], crawlWith(transport));
    // Not silently "a sitemap with zero urls" — which is what a parser fed binary would report.
    expect(r.report.dirty[0].reason).toMatch(/compressed_sitemap_unsupported|all_strategies_failed/);
  });
});

describe("collect/rss", () => {
  it("extracts entry links from both feed dialects", () => {
    const rss = `<rss><channel><item><link>https://${HOST}/a</link></item><item><link>https://${HOST}/b</link></item></channel></rss>`;
    expect(parseFeedLinks(rss)).toEqual([`https://${HOST}/a`, `https://${HOST}/b`]);

    const atom = `<feed><entry><link rel="self" href="https://${HOST}/feed"/><link rel="alternate" href="https://${HOST}/c"/></entry></feed>`;
    expect(parseFeedLinks(atom)).toEqual([`https://${HOST}/c`]); // rel=self is the feed, not an entry
  });

  it("never stores the feed's own summaries", async () => {
    // A feed summary is a TRUNCATED page. Stored, it becomes the document — and because the
    // knowledge base versions by content hash, the excerpt would then supersede the real policy.
    const feed = `<rss><channel><item><title>退貨政策</title><description>${ARTICLE.slice(0, 200)}…</description><link>https://${HOST}/faq/returns</link></item></channel></rss>`;
    const transport = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/feed")) return new Response(feed, { status: 200, headers: { "content-type": "application/rss+xml" } });
      return new Response(page(ARTICLE), { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const opts = crawlWith(transport);
    await crawl([{ uri: `https://${HOST}/feed` }], opts);

    const stored = (opts.sink as ReturnType<typeof createNullSink>).received;
    expect(stored).toHaveLength(1);
    expect(stored[0].uri).toBe(`https://${HOST}/faq/returns`);
    expect(stored[0].text).not.toContain("…"); // the excerpt's ellipsis never reaches the store
    // The whole article, not the first 200 characters of it.
    expect(stored[0].text.length).toBeGreaterThan(ARTICLE.slice(0, 200).length);
    expect(stored[0].text).toContain("需保持完整包裝與配件");
  });
});

describe("a large site inside a budget", () => {
  it("stops when the budget runs out and the next run continues from there", async () => {
    // 12,000 URLs, a budget for a fraction of them: the DoD case. What must not happen is the second
    // run starting from the top and never reaching the tail.
    const urls = Array.from({ length: 12_000 }, (_, i) => `https://${HOST}/p${i}`);
    const fetched = new Set<string>();
    const transport = (async (url: string | URL) => {
      const u = String(url);
      fetched.add(u);
      if (u.endsWith("/sitemap.xml")) {
        return new Response(sitemapXml(urls.slice(0, MAX_URLS_PER_SITEMAP)), {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response(page(ARTICLE), { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const store = new MemoryRunStore();
    const runId = "run-big";
    const first = await crawl([{ uri: `https://${HOST}/sitemap.xml` }], crawlWith(transport, {
      store,
      runId,
      budget: undefined,
      ...budgetedFetch(transport, 25),
    }));
    expect(first.report.stoppedBy).toBe("budget");
    const afterFirst = fetched.size;
    expect(afterFirst).toBeLessThan(100);

    const second = await crawl([{ uri: `https://${HOST}/sitemap.xml` }], crawlWith(transport, {
      store,
      runId,
      ...budgetedFetch(transport, 25),
    }));
    expect(second.report.stoppedBy).toBe("budget");
    // Progress, not repetition: the second run fetched pages the first one never reached.
    expect(fetched.size).toBeGreaterThan(afterFirst);
    expect(second.state.frontier.length).toBeGreaterThan(0); // and there is still a tail to resume
  });
});

/** A crawl option set whose budget and fetch share one budget object. */
function budgetedFetch(transport: typeof fetch, fetches: number) {
  const budget = createBudget({ fetches });
  return {
    budget,
    fetch: createCollectFetch({
      budget,
      transport,
      resolver: async () => ["93.184.216.34"],
      rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }),
      robots: null,
    }),
  };
}

describe("severityFor", () => {
  const report = (over: Partial<RunReport> = {}): RunReport => ({
    fetched: 10,
    outOfScope: 0,
    unhandled: [],
    gone: [],
    dirty: [],
    quarantined: [],
    disallowed: [],
    offEntity: [],
    retried: 0,
    stoppedBy: "frontier_empty",
    ...over,
  });
  const sink = (written: number): SinkReport => ({ written, skipped: 0 });

  it("stays quiet when a healthy run refused nothing", () => {
    expect(severityFor(report(), sink(10))).toBeNull();
  });

  it("stays quiet about robots doing its job", () => {
    // `disallowed` is not a failure. Alerting on it is how an alert channel gets muted.
    expect(severityFor(report({ disallowed: [{ uri: "x", reason: "robots_disallow" }] }), sink(10))).toBeNull();
  });

  it("shouts when a run stored nothing but refused pages", () => {
    expect(severityFor(report({ fetched: 3, dirty: [{ uri: "a", reason: "too_short" }] }), sink(0))).toBe("high");
  });

  it("shouts about planted instructions however few", () => {
    expect(severityFor(report({ quarantined: [{ uri: "a", reason: "injection_ignore_previous" }] }), sink(50))).toBe("high");
  });

  it("is measured about a few refusals on a working crawl", () => {
    expect(severityFor(report({ dirty: [{ uri: "a", reason: "too_short" }] }), sink(30))).toBe("low");
  });

  it("escalates when most of a site is being refused", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ uri: `u${i}`, reason: "low_text_density" }));
    expect(severityFor(report({ fetched: 6, dirty: many }), sink(6))).toBe("medium");
  });
});

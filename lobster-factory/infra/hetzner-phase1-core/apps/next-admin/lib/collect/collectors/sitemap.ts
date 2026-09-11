// collect/sitemap — read a sitemap and hand the orchestrator the URLs it lists.
//
// Returns NO documents, only discovered targets. A sitemap is a table of contents; storing it would
// put a list of links into the knowledge base, and the quality gate would rightly refuse it anyway.
//
// This is how a crawl covers a whole site without following its navigation: the site tells you what
// it considers its pages, including ones no menu links to.

import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";

/**
 * One sitemap may list 50,000 URLs (the format's own limit), and a sitemap index points at more
 * sitemaps. The cap is here, not only in the budget, because the budget is spent on FETCHES while
 * this is memory: a 50k-entry frontier per sitemap, persisted on every flush, is how a resumable
 * crawl turns into a slow one.
 */
export const MAX_URLS_PER_SITEMAP = 5_000;

/** `<loc>` values, whether this is a urlset or a sitemapindex. */
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const raw = m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .trim();
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") locs.push(u.toString());
    } catch {
      /* a malformed <loc> is not worth failing the whole sitemap for */
    }
    if (locs.length >= MAX_URLS_PER_SITEMAP) break;
  }
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

function looksLikeSitemap(uri: string): boolean {
  try {
    const p = new URL(uri).pathname.toLowerCase();
    return /sitemap[^/]*\.xml(\.gz)?$/.test(p) || p.endsWith("/sitemap.xml") || /sitemap[-_]?index/.test(p);
  } catch {
    return false;
  }
}

export const sitemapCollector: CollectBlock = {
  id: "collect/sitemap",
  title: "Sitemap（整站目錄）",
  icon: "🗺️",

  describe: {
    kind: "sitemap",
    summary: "讀網站自己的 sitemap.xml，把它列出的頁面全部收進來——包含選單連不到的頁。",
    entry: "url",
  },

  /**
   * 2 — above collect/http-html, so a sitemap is read AS a sitemap. Left to the HTML tier it would
   * be fetched, extracted into a wall of links, and refused by the quality gate: correct outcome,
   * useless result.
   */
  match(t: Target): number {
    if (t.hint === "sitemap") return 2;
    return looksLikeSitemap(t.uri) ? 2 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const res = await ctx.fetch(t.uri);
    if (res.status === 304) return { docs: [], discovered: [] };
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${t.uri}`), { status: res.status });

    const contentType = res.headers.get("content-type") ?? "";
    // .xml.gz is common and we do not decompress: say so as a status the orchestrator can classify
    // rather than handing the parser binary and reporting an empty sitemap.
    if (/gzip|application\/octet-stream/i.test(contentType) || t.uri.toLowerCase().endsWith(".gz")) {
      throw Object.assign(new Error("compressed_sitemap_unsupported"), { status: 415 });
    }

    const xml = await res.text();
    const { urls, sitemaps } = parseSitemap(xml);
    ctx.log(`sitemap ${t.uri}: ${urls.length} url(s), ${sitemaps.length} nested sitemap(s)`);

    const discovered: Target[] = [
      // Nested sitemaps carry the hint so they are recognised even when their URL is not obviously
      // a sitemap, and they do NOT count against crawl depth for the pages inside them: an index
      // three levels deep would otherwise silently truncate the site.
      ...sitemaps.map((uri) => ({
        uri,
        canonicalUri: ctx.canonicalize(uri),
        scope: t.scope,
        tier: 0,
        depth: t.depth,
        hint: "sitemap",
      })),
      ...urls.map((uri) => ({
        uri,
        canonicalUri: ctx.canonicalize(uri),
        scope: t.scope,
        tier: 0,
        depth: t.depth + 1,
      })),
    ];

    return { docs: [], discovered };
  },
};

registerCollector(sitemapCollector);

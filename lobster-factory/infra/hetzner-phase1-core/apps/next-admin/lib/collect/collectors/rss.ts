// collect/rss — read a feed and hand the orchestrator the pages it points at.
//
// Returns NO documents, deliberately (DATA_COLLECTION_PLAN.md §3, C2: "只回 discovered，不回摘要
// docs"). A feed entry carries a summary, and a summary is a TRUNCATED version of the page. Storing
// it would make the excerpt the document: the knowledge base would then hold "…七日內可申請退貨，
// 詳見全文" instead of the policy, and — because the knowledge base decides versions by content
// hash — the excerpt would supersede the real page whenever the feed was crawled last.
//
// The feed's value is that it says WHAT CHANGED, cheaply, which is what a crawl needs to stay fresh.

import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";

export const MAX_ITEMS_PER_FEED = 500;

/** Entry links from RSS (`<item><link>`) and Atom (`<entry><link href>`), in document order. */
export function parseFeedLinks(xml: string): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    const cleaned = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").trim();
    if (!cleaned) return;
    try {
      const u = new URL(cleaned);
      if ((u.protocol === "http:" || u.protocol === "https:") && !out.includes(u.toString())) {
        out.push(u.toString());
      }
    } catch {
      /* relative or malformed feed links are skipped rather than guessed at */
    }
  };

  for (const block of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1\s*>/gi)) {
    if (out.length >= MAX_ITEMS_PER_FEED) break;
    const body = block[0];
    // Atom: <link rel="alternate" href="..."/> — rel=self points at the feed itself, not an entry.
    const atom = [...body.matchAll(/<link\b[^>]*>/gi)]
      .filter((m) => !/rel\s*=\s*["']?(self|hub|replies|edit)["']?/i.test(m[0]))
      .map((m) => /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[0]))
      .find(Boolean);
    if (atom) {
      push(atom[2] ?? atom[3]);
      continue;
    }
    // RSS: <link>https://…</link>
    const rss = /<link>\s*([\s\S]*?)\s*<\/link>/i.exec(body);
    if (rss) push(rss[1]);
  }
  return out;
}

function looksLikeFeed(uri: string): boolean {
  try {
    const p = new URL(uri).pathname.toLowerCase();
    return /\.(rss|atom)$/.test(p) || /\/(rss|atom|feed)(\.xml)?\/?$/.test(p) || p.endsWith("/feed");
  } catch {
    return false;
  }
}

export const rssCollector: CollectBlock = {
  id: "collect/rss",
  title: "RSS / Atom feed",
  icon: "📡",

  /** 2 — like the sitemap tier, a feed must be read as a feed, not extracted as a page. */
  match(t: Target): number {
    if (t.hint === "feed") return 2;
    return looksLikeFeed(t.uri) ? 2 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const res = await ctx.fetch(t.uri);
    if (res.status === 304) return { docs: [], discovered: [] };
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${t.uri}`), { status: res.status });

    const xml = await res.text();
    const links = parseFeedLinks(xml);
    ctx.log(`feed ${t.uri}: ${links.length} entr(ies)`);

    return {
      docs: [],
      discovered: links.map((uri) => ({
        uri,
        canonicalUri: ctx.canonicalize(uri),
        scope: t.scope,
        tier: 0,
        depth: t.depth + 1,
      })),
    };
  },
};

registerCollector(rssCollector);

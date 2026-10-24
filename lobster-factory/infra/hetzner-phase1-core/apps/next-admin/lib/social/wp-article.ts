// A WordPress article as the start of a social post (SOCIAL_MANAGER_PLAN.md C10). Free path: the article's own excerpt,
// featured image and link (WP REST, the site's application password; read only). The AI path rewrites it per channel
// through /api/social/rewrite (lib/social/write-posts.ts; its platform map is the only one); this file prices the call
// from lib/ai/cost-model.ts (TEXT_FEATURES "syndicate") so the button shows the cost before anyone presses it.
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { MAX_WRITER_CALLS } from "./write-posts";

export interface WpArticle { title: string; excerpt: string; content: string; link: string; image: string | null }

function plain(html: string): string {
  return html.replace(/<\/p>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8220;|&#8221;/g, "\"").replace(/&nbsp;/g, " ").replace(/&hellip;|&#8230;/g, "…")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The REST answer of GET /wp-json/wp/v2/posts/{id}?_embed=wp:featuredmedia, reduced to what a post needs. */
export function articleFromWp(raw: {
  title?: { rendered?: string }; excerpt?: { rendered?: string }; content?: { rendered?: string }; link?: string;
  _embedded?: { "wp:featuredmedia"?: Array<{ source_url?: string }> };
}): WpArticle {
  const image = raw._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
  return {
    title: plain(raw.title?.rendered ?? ""),
    excerpt: plain(raw.excerpt?.rendered ?? "").replace(/\s*\[…\]\s*$/, "…"),
    content: plain(raw.content?.rendered ?? "").slice(0, 3000),
    link: raw.link ?? "",
    image: image && /^https:\/\//.test(image) ? image : null,
  };
}

/** What one rewrite costs, from the cost model: usual = one syndicate call whatever the number of channels; max = with
 *  the one shorter rewrite write-posts.ts makes when a post is over its platform's limit. */
export function rewriteCostTwd(): { usual: number; max: number } {
  const f = TEXT_FEATURES.find((x) => x.key === "syndicate");
  if (!f) throw new Error("cost-model has no syndicate feature");
  const twd = (calls: number) => Math.ceil(featureUnitCostUsd(f) * calls * TWD_RATE * 10) / 10;
  return { usual: twd(1), max: twd(MAX_WRITER_CALLS) };
}

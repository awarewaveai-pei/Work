// A WordPress article as the start of a social post (SOCIAL_MANAGER_PLAN.md C10). Free path: the article's own excerpt,
// featured image and link (WP REST, the site's application password; read only). The AI path rewrites it per channel
// through the existing /api/content/syndicate; this file maps our platforms to its keys and prices the call from
// lib/ai/cost-model.ts (TEXT_FEATURES "syndicate") so the button shows the cost before anyone presses it.
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";

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

/** /api/content/syndicate's platform keys (its PLATFORM_SPECS) for ours; x and Bluesky share the single-post spec. */
const SYNDICATE_KEY: Record<string, { ask: string; answer: string }> = {
  facebook: { ask: "facebook", answer: "facebook" },
  instagram: { ask: "instagram", answer: "instagram" },
  "instagram-standalone": { ask: "instagram", answer: "instagram" },
  threads: { ask: "threads", answer: "threads" },
  linkedin: { ask: "linkedin", answer: "linkedin" },
  "linkedin-page": { ask: "linkedin", answer: "linkedin" },
  x: { ask: "twitter", answer: "twitter_single" },
  bluesky: { ask: "twitter", answer: "twitter_single" },
  pinterest: { ask: "pinterest", answer: "pinterest" },
  tiktok: { ask: "tiktok", answer: "tiktok" },
  reddit: { ask: "reddit", answer: "reddit" },
};

export function syndicatePlatforms(platforms: string[]): string[] {
  return [...new Set(platforms.map((p) => SYNDICATE_KEY[p]?.ask).filter((k): k is string => !!k))];
}

/** Each channel's own text from syndicate's answer; a channel it did not write for keeps the shared text. */
export function textsFromSyndicate(answer: Record<string, string>, accounts: Array<{ id: string; platform: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of accounts) {
    const k = SYNDICATE_KEY[a.platform]?.answer;
    if (k && typeof answer[k] === "string" && answer[k].trim()) out[a.id] = answer[k].trim();
  }
  return out;
}

/** What one rewrite costs, from the cost model (one syndicate call whatever the number of channels). */
export function rewriteCostTwd(): number {
  const f = TEXT_FEATURES.find((x) => x.key === "syndicate");
  if (!f) throw new Error("cost-model has no syndicate feature");
  return Math.ceil(featureUnitCostUsd(f) * TWD_RATE * 10) / 10;
}

// What KIND of place is this page, for the purpose of background research?
//
// THE THIRD AXIS, and it is not the other two. quality.ts asks "did we extract the article or the
// chrome". relevance.ts asks "is this about the right entity". Both pass a bookshop's product page
// for a book the person wrote: it is a well-formed page and it names them repeatedly. It is still
// worthless in a dossier, because "this person has a book listed for sale" is not a fact anybody is
// researching (operator, 2026-09-20: "居然給我書店和 amazon 的東西??").
//
// FAILS OPEN, ALWAYS. An unknown host is `unknown` and is admitted. This file can only ever demote
// hosts somebody deliberately listed, never gatekeep by allowlist — an allowlist would silently
// throw away the local newspaper, the personal site and the government registry nobody thought to
// add, and the operator would never learn what they did not get.
//
// A LIST IS NOT A CLASSIFIER, and this one does not pretend to be. It is a short, deliberately
// incomplete set of the places that produce false positives in bulk. The URL-shape rules below
// carry more weight than the host list, because a /dp/ path is a product page on any storefront
// that ever existed, including the ones not listed here.

export type SourceClass = "retail" | "social" | "aggregator" | "reference" | "unknown";

/** Storefronts. The listing exists to sell a thing, whoever the thing is about. */
const RETAIL_HOSTS = [
  "amazon.", "amzn.", "ebay.", "etsy.", "alibaba.", "aliexpress.",
  "books.google.", "play.google.com", "apps.apple.com", "itunes.apple.com",
  "barnesandnoble.com", "waterstones.com", "bookdepository.com", "abebooks.",
  "penguin.com", "penguin.co", "penguinrandomhouse.", "harpercollins.", "hachette.",
  "kobo.com", "audible.", "goodreads.com", "bookshop.org",
  "books.com.tw", "eslite.com", "kingstone.com.tw", "momoshop.com.tw", "shopee.",
];

/** Profile pages that assert whatever the profile owner typed. */
const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "threads.net", "tiktok.com",
  "pinterest.", "reddit.com", "weibo.com", "xiaohongshu.com", "douyin.com",
  "youtube.com", "youtu.be", "vimeo.com", "medium.com", "substack.com",
  "linkedin.com", // also robots-blocked, but classed here so the reason reads correctly
];

/**
 * Pages that exist to list other pages. They mention everybody and are about nobody, which is
 * exactly the shape that slips past a name match (operator's run: a daily news round-up and a
 * different professor's staff profile both stored for one passing mention).
 */
const AGGREGATOR_PATTERNS = [
  /\/(tag|tags|topics?|category|categories|archive|archives|author|authors)\//i,
  /\/(search|results)\b/i,
  /\/page\/\d+/i,
];

const RETAIL_PATH_PATTERNS = [
  /\/dp\//i, /\/gp\/product\//i, /\/product\//i, /\/products\//i,
  /\/shop\//i, /\/store\//i, /\/cart\b/i, /\/buy\b/i, /\/isbn\b/i,
];

/** Encyclopaedias and dictionaries: useful for orientation, weak as evidence about a person. */
const REFERENCE_HOSTS = ["wikipedia.org", "wikidata.org", "britannica.com", "baike.baidu.com", "fandom.com"];

function hostMatches(host: string, needles: string[]): boolean {
  return needles.some((n) => host === n || host.includes(n));
}

/**
 * Classify one URL. Host rules first (a storefront's "author" page is retail, not an aggregator),
 * then path shape, then reference, then unknown.
 */
export function classifySource(url: string): SourceClass {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "unknown";
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname;

  if (hostMatches(host, RETAIL_HOSTS) || RETAIL_PATH_PATTERNS.some((re) => re.test(path))) return "retail";
  if (hostMatches(host, SOCIAL_HOSTS)) return "social";
  if (hostMatches(host, REFERENCE_HOSTS)) return "reference";
  if (AGGREGATOR_PATTERNS.some((re) => re.test(path))) return "aggregator";
  return "unknown";
}

/**
 * Which classes a dossier refuses by default.
 *
 * `reference` is NOT refused: a Wikipedia article is a legitimate orientation source as long as it
 * is labelled, and it is already labelled — everything collected is stamped EVIDENCE /
 * SOURCE_QUOTATION, i.e. "somebody said this", never "this is true".
 *
 * `aggregator` IS refused, because a tag page's entire content is other pages' titles: there is no
 * claim on it to attribute to anybody.
 */
export const DOSSIER_EXCLUDED_BY_DEFAULT: SourceClass[] = ["retail", "social", "aggregator"];

export function sourceClassLabel(c: SourceClass): string {
  return { retail: "購物／書店", social: "社群個人頁", aggregator: "列表／標籤頁", reference: "百科", unknown: "一般網頁" }[c];
}

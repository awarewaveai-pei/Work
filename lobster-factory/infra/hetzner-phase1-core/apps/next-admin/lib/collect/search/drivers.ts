// The search vendors themselves: one request shape and one response shape each, and nothing else.
//
// Extracted from collectors/web-search.ts when a SECOND block needed the same vendors
// (collectors/entity-dossier.ts, 2026-09-20). Two copies of a driver map is how one block ends up
// supporting a vendor the other does not, and the operator discovers it by a source silently
// collecting nothing.
//
// Everything here is vendor-specific BY DESIGN and everything above it is vendor-neutral: adding a
// third search engine is one entry in SEARCH_DRIVERS and no change anywhere else (ADR 011 §決策 5).

import type { ProviderCallInit } from "@/lib/collect/net/providers";

/** Which vendor answers the query. One environment variable, no vendor name in any caller. */
export function searchProviderId(env: Record<string, string | undefined> = process.env): string {
  const named = env.COLLECT_SEARCH_PROVIDER;
  if (named) return named;
  // No explicit choice: use whichever vendor actually has a key, rather than defaulting to one and
  // making the source look broken because the OTHER key is the one that was set.
  if (env.SERPER_API_KEY) return "serper";
  if (env.BRAVE_SEARCH_API_KEY) return "brave";
  return "serper";
}

/** Env vars that could make this source usable — the catalogue lists them so one can be chosen. */
export const SEARCH_KEYS = ["SERPER_API_KEY", "BRAVE_SEARCH_API_KEY"] as const;

/**
 * The engines a Cognitive OS claim may name (wire v2, = specs/wire/collector.v2.json `providers`). No setting can
 * add one: COLLECT_SEARCH_PROVIDER never applies to a claim.
 */
export const CLAIM_PROVIDERS = ["serper", "brave"] as const;

/**
 * The language and region each vendor documents, per OUR internal language code. The single place a
 * language reaches a vendor: a code that is not in a vendor's row is never sent raw — it throws
 * (a 422 from the vendor is a source that silently never answers, as Brave did with `zh`, 2026-10-12).
 * Values probed live against each API on that date: Brave `zh-hant`+`TW` -> 200, bare `zh` -> 422;
 * Serper proxies Google, whose documented interface languages are `zh-CN` / `zh-TW` (no bare `zh`).
 * Taiwan is the platform's audience, so `zh` is Traditional / TW everywhere it can be said.
 */
export type SearchLocale = { lang: string; region?: string };
export const SEARCH_LOCALES: Record<string, Record<string, SearchLocale>> = {
  brave: { zh: { lang: "zh-hant", region: "TW" }, en: { lang: "en", region: "US" } }, // search_lang, country
  serper: { zh: { lang: "zh-tw", region: "tw" }, en: { lang: "en", region: "us" } }, // hl, gl
};

/** Our code -> what `provider` documents; throws for a code the vendor row does not name. */
export function searchLocale(provider: string, code: string): SearchLocale {
  const hit = SEARCH_LOCALES[provider]?.[code.trim().toLowerCase()];
  if (!hit) throw Object.assign(new Error(`unsupported_search_language_${provider}_${code}`), { status: 400 });
  return hit;
}

/** One result, after each vendor's own shape has been flattened by `parseResults`. */
interface SearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string | null;
}

/**
 * Per-vendor request and response, and nothing else. Everything below this map is vendor-neutral:
 * adding a third search engine is one entry here (ADR 011 §決策 5).
 *
 *  - brave:      GET  /res/v1/web/search, `{ web: { results: [{title,url,description,age}] } }`
 *  - serper:     POST /search, `{ organic: [{title,link,snippet,date,position}] }` — shape confirmed
 *                against the live API, 2026-09-20. Recency uses Google's own tbs=qdr:{d,w,m,y}, since
 *                Serper proxies Google Search directly rather than defining its own vocabulary.
 */
export const SEARCH_DRIVERS: Record<
  string,
  {
    request(q: { query: string; maxResults: number; domains?: string[]; recency?: string; languages?: string[] }): ProviderCallInit;
    parse(json: unknown): SearchResult[];
  }
> = {
  brave: {
    request: (q) => {
      const params = new URLSearchParams({ q: q.query, count: String(q.maxResults) });
      // Brave has no domain-filter parameter, so the restriction goes into the query itself — the
      // operator's "只找這些網域" must not be silently dropped, which would quietly widen a search
      // they deliberately narrowed. Parenthesized so the operator's own query text (an unbalanced
      // quote, their own "OR"/"site:") cannot swallow or reinterpret the appended clause.
      if (q.domains?.length) params.set("q", `${q.query} (${q.domains.map((d) => `site:${d}`).join(" OR ")})`);
      if (q.recency) {
        const freshness: Record<string, string> = { day: "pd", week: "pw", month: "pm", year: "py" };
        if (freshness[q.recency]) params.set("freshness", freshness[q.recency]);
      }
      if (q.languages?.length) {
        const loc = searchLocale("brave", q.languages[0]);
        params.set("search_lang", loc.lang);
        if (loc.region) params.set("country", loc.region);
      }
      return { path: `/res/v1/web/search?${params.toString()}`, method: "GET" };
    },
    parse: (json) => {
      const results = (json as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } }).web?.results ?? [];
      return results.map((r) => ({ title: r.title, url: r.url, snippet: r.description, date: r.age ?? null }));
    },
  },

  serper: {
    request: (q) => {
      // No domain-filter parameter here either (same gap as Brave above) — fold the restriction into
      // the query itself so the operator's narrowing is never silently dropped. Parenthesized so the
      // operator's own query text cannot swallow or reinterpret the appended clause.
      const query = q.domains?.length ? `${q.query} (${q.domains.map((d) => `site:${d}`).join(" OR ")})` : q.query;
      const body: Record<string, unknown> = { q: query, num: q.maxResults };
      if (q.recency) {
        const tbs: Record<string, string> = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };
        if (tbs[q.recency]) body.tbs = tbs[q.recency];
      }
      if (q.languages?.length) {
        const loc = searchLocale("serper", q.languages[0]);
        body.hl = loc.lang;
        if (loc.region) body.gl = loc.region;
      }
      return { path: "/search", method: "POST", body };
    },
    parse: (json) => {
      const results = (json as { organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }> }).organic ?? [];
      return results.map((r) => ({ title: r.title, url: r.link, snippet: r.snippet, date: r.date ?? null }));
    },
  },
};

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

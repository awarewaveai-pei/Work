// Cold Outreach v2 -- lead source: people from a search engine's public index (SPEC D20, card C13.1).
// Nothing here writes; the results go through the ordinary inbox import (normalize, dedup, suppression, MX, score).
//
// ONLY title, snippet and link of a Serper /search result are read. No LinkedIn or Instagram page is ever fetched, and
// no profile is crawled: the search engine already indexes these public pages, and that index is all this uses.
//  - serper /search {q, num, page, gl, hl} -> { organic: [{title, link, snippet, position}], credits } (1 credit per page
//    of 10; the shape is the one collectors/web-search.ts and sources/gcis.ts already read).
//  - LinkedIn titles read "Name - Role - Company | LinkedIn"; Instagram titles read "Name (@handle) • Instagram photos
//    and videos". A result whose link is not a person's profile page (a post, a company page, a hashtag) is dropped.
// consent_source (SPEC D20, §5.3): `self_published:<link>` only when the snippet itself carries an email address -- the
// person put that contact on their own public profile, so using it needs no notice; every other candidate is
// `general_source:<link>` (a search summary of a third-party index) and its first mail carries the §8/§9 notice.
import type { ProviderCall } from "@/lib/collect/net/providers";
import type { RawLead } from "../normalize";

export const PEOPLE_MAX = 20;
export const PEOPLE_PAGE_SIZE = 10;
/** Pages per query: 2 pages of one query fill 20; with both queries each gets at most 2. */
export const PEOPLE_MAX_PAGES = 2;
/** The most Serper credits one run spends; held from a paying wallet before the first call. */
export const PEOPLE_MAX_SERPER_CREDITS = 2 * PEOPLE_MAX_PAGES;
export const PEOPLE_SOURCE_TYPE = "search";
const MAX_INPUT = 100;

export interface PeopleInput { role: string; company: string; location: string; keyword: string }
export interface PeopleLead extends RawLead { consent_source: string }
/** Counter the caller reads even when the run throws midway: what to settle. */
export interface PeopleUsage { serperCredits: number }
/** Where the next run of the same search starts, one entry per query of peopleQueries (same order); null = that query ended. */
export interface PeopleCursor { pos: Array<{ page: number; skip: number } | null> }
export interface PeopleResult { leads: PeopleLead[]; /** Results dropped: not a profile page, no name, already seen. */ skipped: number;
  /** null = every query reached its end */ next: PeopleCursor | null }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const clip = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/["“”]/g, "").slice(0, MAX_INPUT) : "");
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

/** The four fields trimmed and short, quotes removed (they delimit the phrases); null = refuse the request. At least a
 *  role (LinkedIn) or a keyword (Instagram) is needed. */
export function peopleInput(v: unknown): PeopleInput | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const input = { role: clip(o.role), company: clip(o.company), location: clip(o.location), keyword: clip(o.keyword) };
  return input.role || input.keyword ? input : null;
}

const phrase = (v: string): string => (v ? ` "${v}"` : "");
/** The search queries of one run: a LinkedIn profile query when a role is given, an Instagram profile query when a keyword is. */
export function peopleQueries(i: PeopleInput): Array<{ site: "linkedin" | "instagram"; q: string }> {
  const out: Array<{ site: "linkedin" | "instagram"; q: string }> = [];
  if (i.role) out.push({ site: "linkedin", q: `site:linkedin.com/in${phrase(i.role)}${phrase(i.company)}${phrase(i.location)}` });
  if (i.keyword) out.push({ site: "instagram", q: `site:instagram.com${phrase(i.keyword)} "@"${phrase(i.location)}` });
  return out;
}

/** One person's profile page: https://<country>.linkedin.com/in/<slug> or https://instagram.com/<handle>; the canonical form
 *  (no query, no trailing slash) or null for anything else. */
export function profileLink(site: "linkedin" | "instagram", link: unknown): string | null {
  const raw = str(link);
  let u: URL;
  try { u = new URL(raw ?? ""); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  if (site === "linkedin") {
    return (host === "linkedin.com" || host.endsWith(".linkedin.com")) && /^\/in\/[^/]+$/.test(path) ? `https://${u.hostname.toLowerCase()}${path}` : null;
  }
  return host === "instagram.com" && /^\/[A-Za-z0-9._]{1,30}$/.test(path) && !/^\/(p|reel|reels|tv|explore|stories|accounts)$/.test(path) ? `https://www.instagram.com${path}` : null;
}

/** {name, role, company} from a result title; role and company stay null when the title does not carry them. */
export function parseTitle(site: "linkedin" | "instagram", title: unknown): { name: string; role: string | null; company: string | null } | null {
  const t = str(title);
  if (!t) return null;
  if (site === "instagram") {
    const name = t.split(/\s*\(@|\s+[•·]\s+/)[0].trim();
    return name && !/^instagram$/i.test(name) ? { name, role: null, company: null } : null;
  }
  const parts = t.replace(/\s*[|·-]\s*LinkedIn\s*$/i, "").split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0];
  if (!name || /^(linkedin|sign in|log in|join)/i.test(name) || /\s(profiles?|jobs?|employees?)$/i.test(name)) return null;
  const tail = parts.slice(1);
  if (tail.length >= 2) return { name, role: tail[0], company: tail[tail.length - 1] };
  const at = tail[0]?.match(/^(.+?)\s+(?:at|@|於|在)\s+(.+)$/i);
  return at ? { name, role: at[1], company: at[2] } : { name, role: tail[0] ?? null, company: null };
}

/** One result as an inbox row, or null. The name is the lead's name (not the company: dedup falls back to the name, and
 *  two people at one company are two leads); the company goes in `industry`. */
export function resultToLead(site: "linkedin" | "instagram", r: { title?: unknown; link?: unknown; snippet?: unknown }, location: string): PeopleLead | null {
  const link = profileLink(site, r.link);
  const who = parseTitle(site, r.title);
  if (!link || !who) return null;
  const snippet = str(r.snippet) ?? "";
  const email = snippet.match(EMAIL_RE)?.[0].toLowerCase() ?? null;
  return { name: who.name, contact_name: who.name, contact_role: who.role, industry: who.company, region: location || null,
    email, social_url: link, source_type: PEOPLE_SOURCE_TYPE, source_url: link,
    consent_source: `${email ? "self_published" : "general_source"}:${link}` };
}

/** Up to `limit` (≤ PEOPLE_MAX) people from `from` on, query after query, each query at most PEOPLE_MAX_PAGES pages a run
 *  until a short page; one profile once. A page left half-used is fetched again next run and its taken results skipped.
 *  The caller's callProvider carries the grant and the budget, so a refused or exhausted run throws before anything is sent. */
export async function searchPeople(call: ProviderCall, usage: PeopleUsage, input: PeopleInput, limit = PEOPLE_MAX, from: PeopleCursor | null = null): Promise<PeopleResult> {
  const want = Math.min(Math.max(1, limit), PEOPLE_MAX);
  const leads: PeopleLead[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const queries = peopleQueries(input);
  const pos = queries.map((_, k) => (from ? from.pos[k] ?? null : { page: 1, skip: 0 }));
  for (const [k, { site, q }] of queries.entries()) {
    for (let n = 0; pos[k] && leads.length < want && n < PEOPLE_MAX_PAGES; n++) {
      const { page, skip } = pos[k]!;
      const res = await call("serper", { path: "/search", body: { q, num: PEOPLE_PAGE_SIZE, page, gl: "tw", hl: "zh-tw" } });
      const j = (await res.json()) as { organic?: unknown; credits?: unknown };
      usage.serperCredits += typeof j.credits === "number" ? j.credits : 1;
      const organic = Array.isArray(j.organic) ? (j.organic as Array<{ title?: unknown; link?: unknown; snippet?: unknown }>) : [];
      let i = skip;
      for (; i < organic.length && leads.length < want; i++) {
        const lead = resultToLead(site, organic[i], input.location);
        if (!lead || seen.has(lead.source_url!)) { skipped++; continue; }
        seen.add(lead.source_url!);
        leads.push(lead);
      }
      pos[k] = i < organic.length ? { page, skip: i } : organic.length < PEOPLE_PAGE_SIZE ? null : { page: page + 1, skip: 0 };
    }
  }
  return { leads, skipped, next: pos.some(Boolean) ? { pos } : null };
}

/** What an approved inbox row may pass on as the lead's consent_source (raw_payload is whatever an import sent; a typed
 *  self_published:… would drop the personal-data notice, meta_lead_ad… would make the lead warm). Only the two sources
 *  this app writes itself: gcis rows with `general_source:…`, search rows with `self_published:<link>` or
 *  `general_source:<link>` where <link> is the row's own source_url. Everything else = null (the notice stays). */
export function inboxConsentSource(sourceType: unknown, rawConsent: string | null, sourceUrl: string | null): string | null {
  if (!rawConsent) return null;
  if (sourceType === "gcis") return rawConsent.startsWith("general_source:") ? rawConsent : null;
  if (sourceType === PEOPLE_SOURCE_TYPE && sourceUrl) {
    return rawConsent === `self_published:${sourceUrl}` || rawConsent === `general_source:${sourceUrl}` ? rawConsent : null;
  }
  return null;
}

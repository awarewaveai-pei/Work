// Cold Outreach v2 -- lead discovery: businesses from a map search (SPEC D18, card C10). The results go through the
// ordinary inbox import (normalize, dedup against existing inbox and leads, suppression, MX, score); nothing here
// writes. Serper, not the Google Places API: Google's terms forbid storing the name, website and phone a lead list
// exists to keep.
//
//  - serper: POST /places {q, location, gl, hl, page}, `{ searchParameters, places: [{position, title, address,
//            latitude, longitude, rating, ratingCount, category, phoneNumber?, website?, cid, priceLevel?}], credits }`
//            -- shape and price confirmed against the live API, 2026-11-01: 10 places and 1 credit per page, position
//            restarts at 1 on every page. A place name in q often returns 0-1 places: the area goes in `location`,
//            and only Google's English location name is understood ("Taichung City, Taiwan"; then searchParameters
//            carries `uule`). "台中市" or "Taichung" gets no uule and silently searches all of Taiwan: Chinese county and
//            city names are mapped here, and a page without uule is refused (LocationNotRecognized).
//            `address` is sometimes absent.
//            phoneNumber and website may be missing; phoneNumber is sometimes an address; website is often a social
//            page (instagram.com/...), which is kept as social_url so it is never researched or used to dedup.
import type { ProviderCall } from "@/lib/collect/net/providers";
import { SEARCH_API_COMPARISONS } from "@/lib/ai/model-comparison";
import { TWD_RATE } from "@/lib/ai/cost-model";
import { domainOf, isPlatformHost, type RawLead } from "./normalize";

export const PLACES_PER_PAGE = 10;
/** What the operator reviews in one sitting (card C10). */
export const MAX_DISCOVER = 20;
/** Two pages fill 20 unless places without any contact were skipped; a third page tops up, never more. */
export const MAX_PAGES = 3;
export const PLACES_CREDITS_PER_PAGE = 1;
export const PLACES_SOURCE_TYPE = "serper_places";

const SERPER_USD_PER_CREDIT = (SEARCH_API_COMPARISONS.find((c) => c.vendor === "Serper")?.costPer1kQueriesUsd ?? 1) / 1000;
export const creditsUsd = (credits: number): number => credits * SERPER_USD_PER_CREDIT;
export const creditsTwd = (credits: number): number => creditsUsd(credits) * TWD_RATE;
/** The most one discovery costs: held from a paying wallet before the first call (Grant.hold). */
export const DISCOVER_MAX_USD = creditsUsd(MAX_PAGES * PLACES_CREDITS_PER_PAGE);
/** NT$ ceiling for one discovery, shown on the button before it is pressed. */
export const DISCOVER_COST_TWD = DISCOVER_MAX_USD * TWD_RATE;

const PHONE_RE = /^\+?[\d\s()-]{7,}$/;
const MAX_INPUT = 100;

export interface DiscoverInput { query: string; location: string }

// Taiwan's 22 counties and cities: Chinese name -> Google's location name. A bare name means the city where a city and
// a county share it (新竹, 嘉義).
const TW_AREAS: ReadonlyArray<[string, string, "市" | "縣"]> = [
  ["台北", "Taipei City", "市"], ["新北", "New Taipei City", "市"], ["桃園", "Taoyuan City", "市"], ["台中", "Taichung City", "市"],
  ["台南", "Tainan City", "市"], ["高雄", "Kaohsiung City", "市"], ["基隆", "Keelung City", "市"], ["新竹", "Hsinchu City", "市"],
  ["嘉義", "Chiayi City", "市"], ["新竹", "Hsinchu County", "縣"], ["苗栗", "Miaoli County", "縣"], ["彰化", "Changhua County", "縣"],
  ["南投", "Nantou County", "縣"], ["雲林", "Yunlin County", "縣"], ["嘉義", "Chiayi County", "縣"], ["屏東", "Pingtung County", "縣"],
  ["宜蘭", "Yilan County", "縣"], ["花蓮", "Hualien County", "縣"], ["台東", "Taitung County", "縣"], ["澎湖", "Penghu County", "縣"],
  ["金門", "Kinmen County", "縣"], ["連江", "Lienchiang County", "縣"],
];

/** A Taiwanese county or city typed in Chinese (台/臺, with or without 市/縣) becomes Google's location name; anything
 *  else is passed through for Google to judge. */
export function canonicalLocation(raw: string): string {
  const t = raw.trim().replace(/臺/g, "台").replace(/\s+/g, "");
  const exact = TW_AREAS.find(([zh, , kind]) => t === zh + kind);
  const bare = TW_AREAS.find(([zh]) => t === zh);
  const hit = exact ?? bare;
  return hit ? `${hit[1]}, Taiwan` : raw.trim();
}

/** Both inputs trimmed, non-empty and short; null = refuse the request. */
export function discoverInput(v: unknown): DiscoverInput | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const query = typeof o.query === "string" ? o.query.trim() : "";
  const location = typeof o.location === "string" ? o.location.trim() : "";
  if (!query || !location || query.length > MAX_INPUT || location.length > MAX_INPUT) return null;
  return { query, location: canonicalLocation(location) };
}

/** Google did not place the area: the results would be from anywhere in the country. */
export class LocationNotRecognized extends Error {
  constructor(readonly location: string, readonly credits: number) {
    super(`location_not_recognized: ${location}`);
    this.name = "LocationNotRecognized";
  }
}

interface SerperPlace { title?: unknown; address?: unknown; phoneNumber?: unknown; website?: unknown; cid?: unknown; category?: unknown }

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** One place as an inbox row. No title or no cid = not a place we can name or find again: dropped. */
export function placeToLead(p: SerperPlace): RawLead | null {
  const name = text(p.title);
  const cid = typeof p.cid === "string" || typeof p.cid === "number" ? String(p.cid).trim() : "";
  if (!name || !/^\d+$/.test(cid)) return null;
  const phone = text(p.phoneNumber);
  const site = text(p.website);
  const host = domainOf(site)?.split(":")[0] ?? null;
  const social = !!host && isPlatformHost(host);
  return {
    name,
    phone: phone && PHONE_RE.test(phone) ? phone : null,
    website: site && !social ? site : null,
    social_url: site && social ? site : null,
    industry: text(p.category),
    region: text(p.address),
    source_type: PLACES_SOURCE_TYPE,
    source_url: `https://maps.google.com/?cid=${cid}`,
  };
}

export interface DiscoverResult { leads: RawLead[]; credits: number; /** Places with no website, social page or phone. */ skipped: number }

/** Up to `limit` (≤ MAX_DISCOVER) places, page after page until a short page or MAX_PAGES; one place once (by cid). A
 *  place with no website, social page or phone cannot be contacted or researched: skipped, not an inbox row. The
 *  caller's callProvider carries the grant and the budget, so a refused or exhausted run throws before anything is sent. */
export async function discoverPlaces(callProvider: ProviderCall, input: DiscoverInput, limit = MAX_DISCOVER): Promise<DiscoverResult> {
  const want = Math.min(Math.max(1, limit), MAX_DISCOVER);
  const leads: RawLead[] = [];
  const seen = new Set<string>();
  let credits = 0;
  let skipped = 0;
  for (let page = 1; leads.length < want && page <= MAX_PAGES; page++) {
    const res = await callProvider("serper", { path: "/places",
      body: { q: input.query, location: input.location, gl: "tw", hl: "zh-tw", page } });
    const json = (await res.json()) as { places?: SerperPlace[]; credits?: unknown; searchParameters?: { uule?: unknown } };
    credits += typeof json.credits === "number" ? json.credits : PLACES_CREDITS_PER_PAGE;
    if (!json.searchParameters?.uule) throw new LocationNotRecognized(input.location, credits);
    const places = Array.isArray(json.places) ? json.places : [];
    for (const p of places) {
      const lead = placeToLead(p);
      if (!lead || seen.has(lead.source_url!) || leads.length >= want) continue;
      seen.add(lead.source_url!);
      if (!lead.website && !lead.social_url && !lead.phone) { skipped++; continue; }
      leads.push(lead);
    }
    if (places.length < PLACES_PER_PAGE) break;
  }
  return { leads, credits, skipped };
}

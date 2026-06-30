export type EventCategory = "sports" | "holiday" | "cultural" | "mega";

export interface EventFacetInput {
  title: string;
  title_zh?: string | null;
  event_date: string;
  event_end_date?: string | null;
  category: EventCategory;
  subcategory?: string | null;
  country_codes?: string[] | null;
  region?: string | null;
  marketing_window_start?: string | null;
}

export interface EventFacetSummary {
  facets: string[];
  opportunity_score: number;
}

const SPORTS_RELATED_MEGA_SUBCATEGORIES = new Set(["world_cup", "olympics", "sports_final", "sports_season"]);
const CULTURAL_HOLIDAY_SUBCATEGORIES = new Set(["holiday_major", "cultural", "religious"]);

const NATIONAL_PATTERNS = [
  "independence", "national day", "constitution", "republic day", "liberation day",
  "memorial day", "bastille", "canada day", "australia day", "victory day",
];

const COMMERCIAL_PATTERNS = [
  "black friday", "cyber monday", "singles' day", "singles day", "valentine",
  "mother's day", "mothers day", "father's day", "fathers day", "back to school",
];

const FAMILY_PATTERNS = [
  "mother's day", "mothers day", "father's day", "fathers day", "thanksgiving", "family day",
];

const CULTURAL_PATTERNS = [
  "diwali", "deepavali", "lunar new year", "chinese new year", "spring festival",
  "halloween", "christmas", "eid", "ramadan", "carnival", "day of the dead",
  "dia de muertos", "día de muertos", "pride", "dragon boat", "mid-autumn", "mid autumn",
  "lantern festival", "chuseok", "hanukkah", "songkran",
];

const RELIGIOUS_PATTERNS = [
  "christmas", "easter", "eid", "ramadan", "diwali", "deepavali", "hanukkah",
  "assumption", "saint", "all saints",
];

function haystack(event: Pick<EventFacetInput, "title" | "title_zh" | "subcategory">): string {
  return [event.title, event.title_zh ?? "", event.subcategory ?? ""].join(" ").toLowerCase();
}

function hasAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export function deriveEventFacets(event: EventFacetInput): string[] {
  const tags = new Set<string>([event.category]);
  const text = haystack(event);
  const subcategory = event.subcategory ?? "";

  if (event.category === "mega" && SPORTS_RELATED_MEGA_SUBCATEGORIES.has(subcategory)) {
    tags.add("sports");
  }
  if (event.category === "holiday" && CULTURAL_HOLIDAY_SUBCATEGORIES.has(subcategory)) {
    tags.add("cultural");
  }
  if (event.category === "cultural") {
    tags.add("holiday");
  }

  if (hasAny(text, NATIONAL_PATTERNS) || subcategory === "national") tags.add("national");
  if (hasAny(text, COMMERCIAL_PATTERNS) || subcategory === "commercial") tags.add("commercial");
  if (hasAny(text, FAMILY_PATTERNS) || subcategory === "family") tags.add("family");
  if (hasAny(text, CULTURAL_PATTERNS) || subcategory === "cultural") tags.add("cultural");
  if (hasAny(text, RELIGIOUS_PATTERNS) || subcategory === "religious") tags.add("religious");

  if ((event.country_codes ?? []).includes("global")) tags.add("global");
  if ((event.country_codes ?? []).length > 1) tags.add("multi-country");

  return [...tags].sort();
}

export function eventMatchesFacetFilter(event: EventFacetInput, filter: string | null | undefined): boolean {
  const normalized = (filter ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "全部") return true;
  return deriveEventFacets(event).includes(normalized);
}

export function eventMatchesAllFacets(event: EventFacetInput, filters: readonly string[]): boolean {
  const normalized = filters.map((filter) => filter.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return true;
  const facets = new Set(deriveEventFacets(event));
  return normalized.every((filter) => filter === "all" || filter === "全部" || facets.has(filter));
}

export function eventMatchesCountries(event: EventFacetInput, countries: readonly string[]): boolean {
  const wanted = countries.map((country) => country.trim().toUpperCase()).filter(Boolean);
  if (wanted.length === 0) return true;
  const eventCountries = new Set((event.country_codes ?? []).map((country) => country.toUpperCase()));
  if (eventCountries.has("GLOBAL")) return true;
  return wanted.some((country) => eventCountries.has(country));
}

function daysBetween(a: Date, isoDate: string | null | undefined): number {
  if (!isoDate) return 9999;
  return Math.ceil((new Date(isoDate).getTime() - a.getTime()) / 86400000);
}

export function scoreEventOpportunity(event: EventFacetInput, now = new Date()): number {
  const facets = new Set(deriveEventFacets(event));
  const daysUntilEvent = daysBetween(now, event.event_date);
  const daysUntilWindow = daysBetween(now, event.marketing_window_start ?? event.event_date);
  let score = 50;

  if (facets.has("mega")) score += 24;
  if (facets.has("commercial")) score += 20;
  if (facets.has("sports")) score += 16;
  if (facets.has("cultural")) score += 14;
  if (facets.has("family")) score += 12;
  if (facets.has("national")) score += 8;
  if (facets.has("global") || facets.has("multi-country")) score += 8;

  if (daysUntilWindow <= 0 && daysUntilEvent >= 0) score += 16;
  if (daysUntilEvent >= 0 && daysUntilEvent <= 45) score += 12;
  else if (daysUntilEvent <= 90) score += 8;
  else if (daysUntilEvent <= 180) score += 4;

  if (daysUntilEvent < -7) score -= 40;
  return Math.max(0, Math.min(100, score));
}

export function decorateEventFacets<T extends EventFacetInput>(event: T, now = new Date()): T & EventFacetSummary {
  return {
    ...event,
    facets: deriveEventFacets(event),
    opportunity_score: scoreEventOpportunity(event, now),
  };
}

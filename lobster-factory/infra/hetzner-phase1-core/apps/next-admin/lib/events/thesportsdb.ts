import { type GlobalEvent, calcLeadDays } from "./types";

// Free public API key — no account needed.
const TSDB_KEY = "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;

export interface LeagueDef {
  id: string;
  name: string;
  name_zh: string;
  subcategory: string;   // used for lead-day lookup
  country_codes: string[];
  region: string;
  emoji: string;
}

export const LEAGUES: LeagueDef[] = [
  { id: "4391", name: "NFL",              name_zh: "NFL 美式足球",    subcategory: "sports_final", country_codes: ["US"],          region: "americas", emoji: "🏈" },
  { id: "4387", name: "NBA",              name_zh: "NBA 籃球",        subcategory: "sports_final", country_codes: ["US"],          region: "americas", emoji: "🏀" },
  { id: "4424", name: "MLB",              name_zh: "MLB 棒球",        subcategory: "sports_final", country_codes: ["US", "CA"],    region: "americas", emoji: "⚾" },
  { id: "4380", name: "NHL",              name_zh: "NHL 冰上曲棍球",  subcategory: "sports_final", country_codes: ["US", "CA"],    region: "americas", emoji: "🏒" },
  { id: "4328", name: "Premier League",   name_zh: "英超",            subcategory: "sports",       country_codes: ["GB"],          region: "europe",   emoji: "⚽" },
  { id: "4480", name: "Champions League", name_zh: "歐冠",            subcategory: "sports_final", country_codes: ["EU"],          region: "europe",   emoji: "🏆" },
  { id: "4335", name: "La Liga",          name_zh: "西甲",            subcategory: "sports",       country_codes: ["ES"],          region: "europe",   emoji: "⚽" },
  { id: "4370", name: "Formula 1",        name_zh: "F1 賽車",         subcategory: "sports",       country_codes: ["global"],      region: "global",   emoji: "🏎️" },
  { id: "4424", name: "ATP Tennis",       name_zh: "網球大滿貫",      subcategory: "sports_final", country_codes: ["global"],      region: "global",   emoji: "🎾" },
];

interface TSDBEvent {
  idEvent: string;
  strEvent: string;
  strFilename?: string;
  dateEvent?: string;
  strLeague?: string;
  strSport?: string;
  strCountry?: string;
}

interface TSDBResponse {
  events: TSDBEvent[] | null;
}

function getCurrentSeason(leagueName: string, now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  // American sports: season spans two calendar years (e.g. 2024-2025)
  if (["NFL", "NBA", "NHL"].includes(leagueName)) {
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }
  // European football: similar Aug-May span
  if (["Premier League", "Champions League", "La Liga"].includes(leagueName)) {
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }
  // Baseball, F1, Tennis: single calendar year
  return String(y);
}

function getNextSeason(leagueName: string, currentSeason: string): string {
  if (currentSeason.includes("-")) {
    const [start] = currentSeason.split("-").map(Number);
    return `${start + 1}-${start + 2}`;
  }
  return String(Number(currentSeason) + 1);
}

async function fetchLeagueSeasonEvents(league: LeagueDef, season: string): Promise<GlobalEvent[]> {
  const url = `${BASE}/eventsseason.php?id=${league.id}&s=${season}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`TheSportsDB ${league.name}: HTTP ${res.status}`);
  const data = (await res.json()) as TSDBResponse;
  if (!data.events) return [];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1); // skip events more than 1 month in the past

  return data.events
    .filter(e => e.dateEvent && new Date(e.dateEvent) > cutoff)
    .map(e => ({
      title: e.strEvent,
      title_zh: `${league.name_zh} — ${e.strEvent}`,
      event_date: e.dateEvent!,
      category: "sports" as const,
      subcategory: league.subcategory,
      country_codes: league.country_codes,
      region: league.region,
      marketing_lead_days: calcLeadDays("sports", league.subcategory),
      source: "thesportsdb" as const,
      external_id: `tsdb:${season}:${e.idEvent}`,
      emoji: league.emoji,
    }));
}

export async function fetchLeagueEvents(league: LeagueDef): Promise<GlobalEvent[]> {
  const current = getCurrentSeason(league.name);
  const seasons = [current, getNextSeason(league.name, current)];
  const byId = new Map<string, GlobalEvent>();
  for (const season of seasons) {
    const events = await fetchLeagueSeasonEvents(league, season);
    for (const event of events) byId.set(event.external_id, event);
    await new Promise(r => setTimeout(r, 200));
  }
  return [...byId.values()];
}

export async function fetchAllLeagues(
  onProgress?: (msg: string) => void
): Promise<GlobalEvent[]> {
  const all: GlobalEvent[] = [];
  // Deduplicate league IDs (ATP reuses MLB's 4424 slot — filter)
  const seen = new Set<string>();
  for (const league of LEAGUES) {
    const key = `${league.id}:${league.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const events = await fetchLeagueEvents(league);
      all.push(...events);
      onProgress?.(`✓ ${league.name}: ${events.length} events`);
    } catch (err) {
      onProgress?.(`✗ ${league.name}: ${String(err)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

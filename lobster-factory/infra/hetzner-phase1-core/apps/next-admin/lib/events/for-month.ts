// The holidays and events whose marketing window touches a month, best first, as one line each for the monthly topic
// plan prompt (AUTO_CONTENT P9.2). Same table, filter and ranking as /api/tools/events/upcoming. DB errors throw, like recentTrends.
import type { SupabaseClient } from "@supabase/supabase-js";
import { compactUpcomingEvents, type UpcomingEventRow } from "@/app/api/tools/events/upcoming/compact";
import { decorateEventFacets, eventMatchesCountries } from "@/lib/events/facets";

export const EVENTS_PER_MONTH = 15;

/** month "YYYY-MM-01"; country = one ISO code ("TW"): that market's events plus worldwide ones; null = no single market, no country filter (eventMatchesCountries([]) keeps all). */
export async function eventsForMonth(sb: SupabaseClient, month: string, country: string | null, now = new Date()): Promise<string[]> {
  const [y, m] = month.split("-").map(Number);
  const start = `${month.slice(0, 7)}-01`;
  const end = `${month.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const { data, error } = await sb.from("events")
    .select("id, title, title_zh, event_date, event_end_date, category, subcategory, emoji, marketing_window_start, marketing_lead_days, country_codes, region")
    .eq("is_active", true)
    .lte("marketing_window_start", end)
    .or(`event_date.gte.${start},event_end_date.gte.${start}`)
    .order("event_date", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`events:for_month:${error.message}`);
  return compactUpcomingEvents((data ?? []) as UpcomingEventRow[])
    .map((e) => decorateEventFacets(e, now))
    .filter((e) => eventMatchesCountries(e, country ? [country] : []))
    .sort((a, b) => b.opportunity_score - a.opportunity_score || a.event_date.localeCompare(b.event_date))
    .slice(0, EVENTS_PER_MONTH)
    .map((e) => `${e.event_date.slice(5, 10)} ${e.title}${e.title_zh ? `（${e.title_zh}）` : ""}`);
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  decorateEventFacets,
  eventMatchesAllFacets,
  eventMatchesCountries,
} from "@/lib/events/facets";
import { compactUpcomingEvents, type UpcomingEventRow } from "./compact";

export const runtime = "nodejs";

const EVENT_FILTERS = ["mega", "sports", "holiday", "cultural", "national", "commercial", "family", "religious"] as const;
const EVENT_QUERY_LIMIT = 8000;

function dateParam(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function listParam(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function intParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function filterParams(searchParams: URLSearchParams): string[] {
  const values = [
    ...listParam(searchParams.get("category")),
    ...listParam(searchParams.get("tag")),
    ...listParam(searchParams.get("tags")),
  ].map((item) => item.toLowerCase());
  return [...new Set(values)].filter((item) => EVENT_FILTERS.includes(item as typeof EVENT_FILTERS[number]));
}

function countryDbFilter(countries: readonly string[]): string {
  const normalized = countries
    .map((country) => country.trim().toUpperCase())
    .filter((country) => country === "GLOBAL" || /^[A-Z]{2}$/.test(country))
    .map((country) => country === "GLOBAL" ? "global" : country);

  if (normalized.length === 0) return "";
  return [...new Set([...normalized, "global"])]
    .map((country) => `country_codes.cs.{${country}}`)
    .join(",");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const days = intParam(searchParams.get("days"), 365, 365);
  const defaultUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const from = dateParam(searchParams.get("from"), today);
  const until = dateParam(searchParams.get("until"), defaultUntil);
  const filters = filterParams(searchParams);
  const countries = [
    ...listParam(searchParams.get("country")),
    ...listParam(searchParams.get("countries")),
  ];
  const sort = searchParams.get("sort") === "date" ? "date" : "opportunity";
  const limit = intParam(searchParams.get("limit"), 50, 500);
  const offset = intParam(searchParams.get("offset"), 0, 5000);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ events: [] });
  }

  const db = createClient(supabaseUrl, supabaseKey);
  const countriesFilter = countryDbFilter(countries);
  let query = db
    .from("events")
    .select("id, title, title_zh, event_date, event_end_date, category, subcategory, emoji, marketing_window_start, marketing_lead_days, country_codes, region, synced_at")
    .eq("is_active", true)
    .lte("event_date", until)
    .or(`event_date.gte.${from},event_end_date.gte.${from}`)
    .order("event_date", { ascending: true })
    .limit(EVENT_QUERY_LIMIT);
  if (countriesFilter) query = query.or(countriesFilter);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ events: [], error: error.message }, { status: 500 });
  }

  const allEvents = compactUpcomingEvents((data ?? []) as UpcomingEventRow[])
    .map((event) => decorateEventFacets(event));
  const filteredEvents = allEvents.filter((event) =>
    eventMatchesAllFacets(event, filters) && eventMatchesCountries(event, countries)
  );
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (sort === "date") return a.event_date.localeCompare(b.event_date) || b.opportunity_score - a.opportunity_score;
    return b.opportunity_score - a.opportunity_score || a.event_date.localeCompare(b.event_date);
  });

  const facetCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  let lastSyncedAt: string | null = null;
  for (const event of allEvents) {
    for (const facet of event.facets) facetCounts[facet] = (facetCounts[facet] ?? 0) + 1;
    for (const country of event.country_codes ?? []) countryCounts[country] = (countryCounts[country] ?? 0) + 1;
    if (event.synced_at && (!lastSyncedAt || event.synced_at > lastSyncedAt)) lastSyncedAt = event.synced_at;
  }

  return NextResponse.json({
    events: sortedEvents.slice(offset, offset + limit),
    meta: {
      from,
      until,
      days,
      sort,
      filters,
      countries,
      total: sortedEvents.length,
      limit,
      offset,
      facets: facetCounts,
      country_counts: countryCounts,
      last_synced_at: lastSyncedAt,
    },
  });
}

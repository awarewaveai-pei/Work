import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { compactUpcomingEvents, type UpcomingEventRow } from "./compact";

export const runtime = "nodejs";

const EVENT_CATEGORIES = ["mega", "sports", "holiday", "cultural"] as const;
type EventCategory = typeof EVENT_CATEGORIES[number];

function dateParam(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function categoryParam(value: string | null): EventCategory | null {
  return EVENT_CATEGORIES.includes(value as EventCategory) ? (value as EventCategory) : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const defaultUntil = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const from = dateParam(searchParams.get("from"), today);
  const until = dateParam(searchParams.get("until"), defaultUntil);
  const category = categoryParam(searchParams.get("category"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ events: [] });
  }

  const db = createClient(supabaseUrl, supabaseKey);
  let query = db
    .from("events")
    .select("id, title, title_zh, event_date, event_end_date, category, emoji, marketing_window_start, marketing_lead_days, country_codes, region")
    .eq("is_active", true)
    .or(`event_date.gte.${from},event_end_date.gte.${from}`)
    .lte("marketing_window_start", until)
    .order("marketing_window_start", { ascending: true })
    .order("event_date", { ascending: true })
    .limit(category ? 200 : 300);

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ events: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: compactUpcomingEvents((data ?? []) as UpcomingEventRow[]).slice(0, 100) });
}

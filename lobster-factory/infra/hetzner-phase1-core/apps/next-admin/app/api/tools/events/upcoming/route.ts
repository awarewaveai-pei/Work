import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from  = searchParams.get("from")  ?? new Date().toISOString().slice(0, 10);
  const until = searchParams.get("until") ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ events: [] });
  }

  const db = createClient(supabaseUrl, supabaseKey);
  const { data } = await db
    .from("events")
    .select("id, title, title_zh, event_date, category, emoji, marketing_window_start, marketing_lead_days")
    .eq("is_active", true)
    .gte("marketing_window_start", from)
    .lte("marketing_window_start", until)
    .order("marketing_window_start", { ascending: true })
    .limit(100);

  return NextResponse.json({ events: data ?? [] });
}

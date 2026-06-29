import { createClient } from "@supabase/supabase-js";
import { type GlobalEvent, addDays } from "./types";
import { fetchAllCountries } from "./calendarific";
import { fetchAllLeagues } from "./thesportsdb";
import { HARDCODED_EVENTS } from "./hardcoded";

export interface SyncResult {
  upserted: number;
  skipped: number;
  errors: string[];
  log: string[];
}

function buildUpsertRow(e: GlobalEvent) {
  const start = addDays(e.event_date, -e.marketing_lead_days);
  const end = addDays(e.event_end_date ?? e.event_date, 7);
  return {
    title: e.title,
    title_zh: e.title_zh ?? null,
    event_date: e.event_date,
    event_end_date: e.event_end_date ?? null,
    category: e.category,
    subcategory: e.subcategory ?? null,
    country_codes: e.country_codes,
    region: e.region ?? null,
    marketing_window_start: start,
    marketing_window_end: end,
    marketing_lead_days: e.marketing_lead_days,
    source: e.source,
    external_id: e.external_id,
    emoji: e.emoji ?? null,
    is_active: true,
    synced_at: new Date().toISOString(),
  };
}

export async function syncGlobalEvents(opts: {
  calendarificApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  onProgress?: (msg: string) => void;
}): Promise<SyncResult> {
  const { calendarificApiKey, supabaseUrl, supabaseServiceKey, onProgress } = opts;
  const log: string[] = [];
  const errors: string[] = [];
  const emit = (msg: string) => { log.push(msg); onProgress?.(msg); };

  const db = createClient(supabaseUrl, supabaseServiceKey);

  // ── Collect from all sources ──────────────────────────────────────────────
  emit("📅 Fetching Calendarific holidays…");
  const thisYear = new Date().getFullYear();
  const nextYear = thisYear + 1;
  const [cal1, cal2] = await Promise.all([
    fetchAllCountries(calendarificApiKey, thisYear, emit),
    fetchAllCountries(calendarificApiKey, nextYear, emit),
  ]);

  emit("🏆 Fetching TheSportsDB events…");
  const sports = await fetchAllLeagues(emit);

  emit("📌 Loading hardcoded mega-events…");
  const hardcoded = HARDCODED_EVENTS;

  const all: GlobalEvent[] = [...cal1, ...cal2, ...sports, ...hardcoded];
  emit(`✅ Total collected: ${all.length} events`);

  // ── Deduplicate by external_id (last write wins for updated data) ─────────
  const byId = new Map<string, GlobalEvent>();
  for (const e of all) byId.set(e.external_id, e);
  const deduped = [...byId.values()];
  emit(`🔑 After dedup: ${deduped.length} unique events`);

  // ── Upsert in batches of 100 ──────────────────────────────────────────────
  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH).map(buildUpsertRow);
    const { error } = await db
      .from("events")
      .upsert(batch, { onConflict: "external_id" });
    if (error) {
      const msg = `Batch ${i}–${i + batch.length}: ${error.message}`;
      errors.push(msg);
      emit(`❌ ${msg}`);
    } else {
      upserted += batch.length;
    }
  }

  emit(`✅ Sync complete — upserted ${upserted}, errors: ${errors.length}`);
  return { upserted, skipped: all.length - deduped.length, errors, log };
}

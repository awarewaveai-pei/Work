import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type GlobalEvent, addDays } from "./types";
import { fetchAllCountries } from "./calendarific";
import { fetchAllLeagues } from "./thesportsdb";
import { HARDCODED_EVENTS } from "./hardcoded";
import { buildCuratedEvents } from "./curated";

export interface SyncResult {
  upserted: number;
  skipped: number;
  skippedFresh?: boolean;
  lastSyncedAt?: string | null;
  nextSyncDueAt?: string;
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

function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 7);
}

function nextMonthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

async function latestSyncedAt(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db
    .from("events")
    .select("synced_at")
    .not("synced_at", "is", null)
    .order("synced_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const first = data?.[0] as { synced_at?: unknown } | undefined;
  return typeof first?.synced_at === "string" ? first.synced_at : null;
}

export async function syncGlobalEvents(opts: {
  calendarificApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  force?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<SyncResult> {
  const { calendarificApiKey, supabaseUrl, supabaseServiceKey, force = false, onProgress } = opts;
  const log: string[] = [];
  const errors: string[] = [];
  const emit = (msg: string) => { log.push(msg); onProgress?.(msg); };

  const db = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const lastSyncedAt = await latestSyncedAt(db);
  const nextSyncDueAt = nextMonthStart(now);
  if (!force && lastSyncedAt && monthKey(lastSyncedAt) === monthKey(now)) {
    emit(`⏭️ Events already synced this month (${lastSyncedAt}); next monthly sync due ${nextSyncDueAt}`);
    return { upserted: 0, skipped: 0, skippedFresh: true, lastSyncedAt, nextSyncDueAt, errors, log };
  }

  // ── Collect from all sources ──────────────────────────────────────────────
  emit("📅 Fetching Calendarific holidays…");
  const thisYear = now.getFullYear();
  const nextYear = thisYear + 1;
  const [cal1, cal2] = await Promise.all([
    fetchAllCountries(calendarificApiKey, thisYear, emit),
    fetchAllCountries(calendarificApiKey, nextYear, emit),
  ]);

  emit("🏆 Fetching TheSportsDB events…");
  const sports = await fetchAllLeagues(emit);

  emit("📌 Loading hardcoded mega-events…");
  const hardcoded = HARDCODED_EVENTS;

  emit("🧭 Loading curated annual events…");
  const curated = buildCuratedEvents([thisYear, nextYear]);

  const all: GlobalEvent[] = [...cal1, ...cal2, ...sports, ...hardcoded, ...curated];
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
  return { upserted, skipped: all.length - deduped.length, skippedFresh: false, lastSyncedAt, nextSyncDueAt, errors, log };
}

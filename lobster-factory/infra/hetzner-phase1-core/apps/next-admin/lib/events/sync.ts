import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type GlobalEvent, addDays } from "./types";
import { fetchAllCountries } from "./calendarific";
import { fetchAllLeagues } from "./thesportsdb";
import { HARDCODED_EVENTS } from "./hardcoded";
import { buildCuratedEvents } from "./curated";
import { EVENT_SOURCE_COUNTRIES } from "./countries";

export interface SyncResult {
  upserted: number;
  skipped: number;
  pruned?: number;
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

async function deactivateEventsByExternalId(
  db: SupabaseClient,
  externalIds: string[],
  syncedAt: string,
): Promise<{ pruned: number; error?: string }> {
  const BATCH = 200;
  let pruned = 0;
  for (let i = 0; i < externalIds.length; i += BATCH) {
    const batch = externalIds.slice(i, i + BATCH);
    const { error } = await db
      .from("events")
      .update({ is_active: false, synced_at: syncedAt })
      .in("external_id", batch);

    if (error) {
      return { pruned, error: error.message };
    }
    pruned += batch.length;
  }
  return { pruned };
}

async function pruneStaleCuratedEvents(
  db: SupabaseClient,
  currentExternalIds: Set<string>,
  syncedAt: string,
): Promise<{ pruned: number; error?: string }> {
  const { data, error } = await db
    .from("events")
    .select("external_id")
    .eq("source", "hardcoded")
    .eq("is_active", true)
    .like("external_id", "curated:%");

  if (error) {
    return { pruned: 0, error: `Prune stale curated events: ${error.message}` };
  }

  const staleIds = (data ?? [])
    .map((row: { external_id?: unknown }) => row.external_id)
    .filter((externalId): externalId is string =>
      typeof externalId === "string" && !currentExternalIds.has(externalId),
    );

  if (staleIds.length === 0) {
    return { pruned: 0 };
  }

  const result = await deactivateEventsByExternalId(db, staleIds, syncedAt);
  if (result.error) {
    return { pruned: result.pruned, error: `Prune stale curated events: ${result.error}` };
  }

  return result;
}

function countryFromCalendarificExternalId(externalId: string): string | null {
  const match = /^cal:([^:]+):/.exec(externalId);
  return match?.[1]?.toUpperCase() ?? null;
}

async function pruneStaleCalendarificCountries(
  db: SupabaseClient,
  currentCountries: Set<string>,
  syncedAt: string,
): Promise<{ pruned: number; error?: string }> {
  const { data, error } = await db
    .from("events")
    .select("external_id")
    .eq("source", "calendarific")
    .eq("is_active", true)
    .like("external_id", "cal:%")
    .limit(10000);

  if (error) {
    return { pruned: 0, error: `Prune stale Calendarific countries: ${error.message}` };
  }

  const staleIds = (data ?? [])
    .map((row: { external_id?: unknown }) => row.external_id)
    .filter((externalId): externalId is string => {
      if (typeof externalId !== "string") return false;
      const country = countryFromCalendarificExternalId(externalId);
      return !!country && !currentCountries.has(country);
    });

  if (staleIds.length === 0) {
    return { pruned: 0 };
  }

  const result = await deactivateEventsByExternalId(db, staleIds, syncedAt);
  if (result.error) {
    return { pruned: result.pruned, error: `Prune stale Calendarific countries: ${result.error}` };
  }

  return result;
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

  const syncedAt = new Date().toISOString();
  const currentCuratedIds = new Set(curated.map((event) => event.external_id));
  const currentCalendarificCountries = new Set(EVENT_SOURCE_COUNTRIES.map((country) => country.code.toUpperCase()));
  const pruneResults = [
    await pruneStaleCuratedEvents(db, currentCuratedIds, syncedAt),
    await pruneStaleCalendarificCountries(db, currentCalendarificCountries, syncedAt),
  ];
  const pruned = pruneResults.reduce((sum, result) => sum + result.pruned, 0);
  for (const result of pruneResults) {
    if (result.error) {
      errors.push(result.error);
      emit(`Prune skipped: ${result.error}`);
    }
  }
  if (pruned > 0) emit(`Pruned ${pruned} stale events`);

  emit(`✅ Sync complete — upserted ${upserted}, pruned ${pruned}, errors: ${errors.length}`);
  return {
    upserted,
    skipped: all.length - deduped.length,
    pruned,
    skippedFresh: false,
    lastSyncedAt,
    nextSyncDueAt,
    errors,
    log,
  };
}

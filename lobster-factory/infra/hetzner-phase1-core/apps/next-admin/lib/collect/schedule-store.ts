// Data access for collection_schedules (migration 0081) — the per-tenant "does this crawl itself"
// switch, mirroring sources-store.ts's shape and its degrade-safely-to-empty conventions.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { Schedule } from "@/lib/collect/schedule";

export interface StoredSchedule extends Schedule {
  organizationId: string;
  lastRunKey: string | null;
  updatedBy: string | null;
}

interface Row {
  organization_id: string;
  enabled: boolean;
  frequency: "daily" | "weekly";
  hour_utc: number;
  day_of_week_utc: number;
  last_run_at: string | null;
  last_run_key: string | null;
  updated_by: string | null;
}

function toSchedule(r: Row): StoredSchedule {
  return {
    organizationId: r.organization_id,
    enabled: r.enabled,
    frequency: r.frequency,
    hourUtc: r.hour_utc,
    dayOfWeekUtc: r.day_of_week_utc,
    lastRunAt: r.last_run_at,
    lastRunKey: r.last_run_key,
    updatedBy: r.updated_by,
  };
}

export async function getSchedule(organizationId: string): Promise<StoredSchedule | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("collection_schedules").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error || !data) return null;
  return toSchedule(data as Row);
}

/** Every tenant with scheduling turned on — what the due-run sweep iterates. */
export async function listEnabledSchedules(): Promise<StoredSchedule[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb.from("collection_schedules").select("*").eq("enabled", true);
  if (error || !data) return [];
  return (data as Row[]).map(toSchedule);
}

export interface UpsertScheduleInput {
  organizationId: string;
  enabled: boolean;
  frequency: "daily" | "weekly";
  hourUtc: number;
  dayOfWeekUtc: number;
  /** "role:source", same shape as collection_sources.approved_by. */
  updatedBy: string;
}

export interface WriteResult {
  ok: boolean;
  schedule?: StoredSchedule;
  errors: string[];
}

/** An operator's config write — CHECK constraints in the migration are the real gate, this only
 * narrows the error message before it reaches Postgres. */
export async function upsertSchedule(input: UpsertScheduleInput): Promise<WriteResult> {
  if (input.hourUtc < 0 || input.hourUtc > 23) return { ok: false, errors: ["hour_utc_out_of_range"] };
  if (input.dayOfWeekUtc < 0 || input.dayOfWeekUtc > 6) return { ok: false, errors: ["day_of_week_utc_out_of_range"] };
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, errors: ["no_supabase_client"] };

  const { data, error } = await sb
    .from("collection_schedules")
    .upsert(
      {
        organization_id: input.organizationId,
        enabled: input.enabled,
        frequency: input.frequency,
        hour_utc: input.hourUtc,
        day_of_week_utc: input.dayOfWeekUtc,
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    )
    .select("*")
    .single();
  if (error || !data) return { ok: false, errors: [`write_failed:${error?.message ?? "no_row"}`] };
  return { ok: true, schedule: toSchedule(data as Row), errors: [] };
}

/** Called once a scheduled run has actually been dispatched — never before, so a crashed dispatch
 * is retried on the NEXT heartbeat instead of being silently marked done. */
export async function recordScheduleRun(organizationId: string, runKey: string): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) return;
  await sb
    .from("collection_schedules")
    .update({ last_run_at: new Date().toISOString(), last_run_key: runKey, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}

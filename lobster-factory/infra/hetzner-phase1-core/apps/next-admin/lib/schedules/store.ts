// Data access for client_schedules (migration 0097) — one row per (client, job). No row = the job's
// registry default (lib/schedules/jobs.ts), which is always "off" (AGENTS.md 自動化預設 OFF).
// Reads and run bookkeeping THROW on a DB failure: for a scheduler, "no rows" must never stand in for
// "could not read" (that is how automation silently stops while the heartbeat stays green).

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { Frequency, Schedule } from "@/lib/schedules/schedule";

export interface StoredSchedule extends Schedule {
  organizationId: string;
  jobKey: string;
  lastRunKey: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface Row {
  organization_id: string;
  job_key: string;
  enabled: boolean;
  frequency: Frequency;
  hour_utc: number;
  day_of_week_utc: number;
  last_run_at: string | null;
  last_run_key: string | null;
  last_error: string | null;
  last_error_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

function toSchedule(r: Row): StoredSchedule {
  return {
    organizationId: r.organization_id,
    jobKey: r.job_key,
    enabled: r.enabled,
    frequency: r.frequency,
    hourUtc: r.hour_utc,
    dayOfWeekUtc: r.day_of_week_utc,
    lastRunAt: r.last_run_at,
    lastRunKey: r.last_run_key,
    lastError: r.last_error,
    lastErrorAt: r.last_error_at,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/** Every stored row, optionally for one client — what the schedules page renders. */
function client() {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("schedules_db:no_supabase_client");
  return sb;
}

export async function listSchedules(organizationId?: string): Promise<StoredSchedule[]> {
  let q = client().from("client_schedules").select("*");
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw new Error(`schedules_db:list:${error.message}`);
  return ((data ?? []) as Row[]).map(toSchedule);
}

/** Every (client, job) with scheduling turned on — what the due-run sweep iterates. */
export async function listEnabledSchedules(): Promise<StoredSchedule[]> {
  const { data, error } = await client().from("client_schedules").select("*").eq("enabled", true);
  if (error) throw new Error(`schedules_db:list_enabled:${error.message}`);
  return ((data ?? []) as Row[]).map(toSchedule);
}

export interface UpsertScheduleInput {
  organizationId: string;
  jobKey: string;
  enabled: boolean;
  frequency: Frequency;
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

/** An operator's config write — the migration's CHECKs are the real gate; this only narrows the
 * error message before it reaches Postgres. */
export async function upsertSchedule(input: UpsertScheduleInput): Promise<WriteResult> {
  if (input.hourUtc < 0 || input.hourUtc > 23) return { ok: false, errors: ["hour_utc_out_of_range"] };
  if (input.dayOfWeekUtc < 0 || input.dayOfWeekUtc > 6) return { ok: false, errors: ["day_of_week_utc_out_of_range"] };
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, errors: ["no_supabase_client"] };

  const { data, error } = await sb
    .from("client_schedules")
    .upsert(
      {
        organization_id: input.organizationId,
        job_key: input.jobKey,
        enabled: input.enabled,
        frequency: input.frequency,
        hour_utc: input.hourUtc,
        day_of_week_utc: input.dayOfWeekUtc,
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,job_key" },
    )
    .select("*")
    .single();
  if (error || !data) return { ok: false, errors: [`write_failed:${error?.message ?? "no_row"}`] };
  return { ok: true, schedule: toSchedule(data as Row), errors: [] };
}

/**
 * Takes one firing: true only for the caller whose update moved last_run_key to runKey (one key per
 * client, job and UTC day). A retried or overlapping heartbeat gets false and does not run the job a
 * second time — the Trigger task retries after 300 s while a crawl may run for 10 minutes.
 */
export async function claimScheduleRun(organizationId: string, jobKey: string, runKey: string): Promise<boolean> {
  const { data, error } = await client()
    .from("client_schedules")
    .update({ last_run_key: runKey })
    .eq("organization_id", organizationId)
    .eq("job_key", jobKey)
    .or(`last_run_key.is.null,last_run_key.neq.${runKey}`)
    .select("organization_id");
  if (error) throw new Error(`schedules_db:claim:${error.message}`);
  return (data ?? []).length === 1;
}

/** After the job's run() resolved — never before. Clears the last error; updated_at stays the
 * config-change time. */
export async function recordScheduleRun(organizationId: string, jobKey: string): Promise<void> {
  const { error } = await client()
    .from("client_schedules")
    .update({ last_run_at: new Date().toISOString(), last_error: null, last_error_at: null })
    .eq("organization_id", organizationId)
    .eq("job_key", jobKey);
  if (error) throw new Error(`schedules_db:record_run:${error.message}`);
}

/** After run() threw. last_run_at is left alone, so isDueNow() does not treat the firing as done. */
export async function recordScheduleError(organizationId: string, jobKey: string, error: string): Promise<void> {
  const r = await client()
    .from("client_schedules")
    .update({ last_error: error.slice(0, 200), last_error_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("job_key", jobKey);
  if (r.error) throw new Error(`schedules_db:record_error:${r.error.message}`);
}

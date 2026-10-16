// Site-watch inside the schedules table. Its engine stays its own (0091: buckets, leases, per-page state);
// this only maps site_watch_targets to a ScheduleCell and writes through console.ts's locked
// site_watch_update_config — the same path the client page's card used.
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteWatchEnabled } from "@/lib/site-watch/config";
import { CONFIGURABLE_FREQUENCIES, SITE_WATCH_DEFAULTS, auditSiteWatch, parseConfigInput, updateConfig } from "@/lib/site-watch/console";
import { FREQUENCY_LABEL } from "@/lib/site-watch/labels";
import { pagesForSiteUrl } from "@/lib/site-watch/pages";
import type { JobMeta, ScheduleCell } from "../types";

export const SITE_WATCH_JOB: JobMeta = {
  key: "site_watch",
  label: "網站巡檢",
  description: "定期檢查客戶網站是否正常，並比對畫面變化。",
  cost: "沒有付費 API；R2 儲存費可忽略。",
  frequencies: CONFIGURABLE_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] ?? f, usesHour: f === "daily", usesDay: false })),
};

export interface WatchOrg {
  id: string;
  status: string | null;
  siteUrl: unknown;
}

interface TargetRow {
  id: string;
  organization_id: string;
  enabled: boolean;
  frequency: string;
  hour_utc: number;
  version: number;
  updated_by: string | null;
  updated_at: string | null;
  last_completed_bucket_start: string | null;
}

interface StateRow {
  target_id: string;
  kind: string;
  failure_streak: number;
  last_failure_code: string | null;
  alert_state: string;
  updated_at: string;
}

export async function siteWatchCells(sb: SupabaseClient, orgs: WatchOrg[]): Promise<ScheduleCell[]> {
  if (!orgs.length) return [];
  const t = await sb
    .from("site_watch_targets")
    .select("id, organization_id, enabled, frequency, hour_utc, version, updated_by, updated_at, last_completed_bucket_start")
    .in("organization_id", orgs.map((o) => o.id));
  if (t.error) throw new Error(`site_watch_db:schedule_cells:${t.error.message}`);
  const targets = (t.data ?? []) as TargetRow[];

  let states: StateRow[] = [];
  if (targets.length) {
    const s = await sb
      .from("site_watch_page_state")
      .select("target_id, kind, failure_streak, last_failure_code, alert_state, updated_at")
      .in("target_id", targets.map((x) => x.id));
    if (s.error) throw new Error(`site_watch_db:schedule_states:${s.error.message}`);
    states = (s.data ?? []) as StateRow[];
  }

  const globallyOn = siteWatchEnabled();
  return orgs.map((org) => {
    const target = targets.find((x) => x.organization_id === org.id);
    const hasPages = pagesForSiteUrl(org.siteUrl).length > 0;
    const active = org.status === "active";
    const failing = target ? states.filter((s) => s.target_id === target.id && (s.failure_streak > 0 || s.alert_state !== "none")) : [];
    return {
      jobKey: SITE_WATCH_JOB.key,
      organizationId: org.id,
      stored: !!target,
      // No row: what site_watch_sync_targets will create — on, but only for an active client with a site URL.
      enabled: target ? target.enabled : SITE_WATCH_DEFAULTS.enabled && active && hasPages,
      frequency: target?.frequency ?? SITE_WATCH_DEFAULTS.frequency,
      hourUtc: target?.hour_utc ?? SITE_WATCH_DEFAULTS.hour_utc,
      dayOfWeekUtc: 0,
      lastRunAt: target?.last_completed_bucket_start ?? null,
      lastError: failing.length ? failing.map((s) => `${s.kind}:${s.last_failure_code ?? s.alert_state}`).join("; ") : null,
      lastErrorAt: failing.length ? failing.reduce((m, s) => (s.updated_at > m ? s.updated_at : m), failing[0].updated_at) : null,
      updatedBy: target?.updated_by ?? null,
      updatedAt: target?.updated_at ?? null,
      version: target?.version ?? 0,
      unavailable: !globallyOn ? "網站巡檢已在全系統關閉" : !hasPages ? "此客戶尚未設定網站網址" : !active ? "此客戶目前未啟用" : null,
    };
  });
}

export type SiteWatchWrite = { ok: true } | { ok: false; status: 400 | 409; error: string };

/** body: { expectedVersion, enabled, frequency, hourUtc } — the same contract as the old card's PATCH. */
export async function writeSiteWatchCell(
  sb: SupabaseClient,
  orgId: string,
  body: Record<string, unknown>,
  actor: { role: string; source: string },
): Promise<SiteWatchWrite> {
  const input = parseConfigInput(body);
  if ("error" in input) return { ok: false, status: 400, error: input.error };
  const result = await updateConfig(sb, orgId, input, `${actor.role}:${actor.source}`);
  if ("error" in result) return { ok: false, status: 409, error: result.error };
  await auditSiteWatch(sb, orgId, actor, "site_watch_config_updated", {
    enabled: result.target.enabled,
    frequency: result.target.frequency,
    hourUtc: result.target.hour_utc,
    version: result.target.version,
  });
  return { ok: true };
}

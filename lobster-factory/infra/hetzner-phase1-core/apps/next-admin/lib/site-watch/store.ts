// All site-watch DB access. Every state write goes through a fenced function of migration 0091;
// this file never writes the site_watch_* tables directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertIncidentAtomic } from "@/lib/ops-inbox/upsertIncidentAtomic";
import type { IncidentDraft } from "@/lib/ops-inbox/types";
import type { SiteWatchFrequency } from "./runKey";

export type CheckKind = "availability" | "visual";
export type NotifyPhase = "alert" | "recovery";
export type NotifyOutcome = "sent" | "rejected" | "uncertain" | "skipped";

export interface TargetRow {
  id: string;
  organization_id: string;
  enabled: boolean;
  frequency: SiteWatchFrequency;
  hour_utc: number;
  last_completed_run_key: string | null;
  last_completed_bucket_start: string | null;
  version: number;
  updated_by: string | null;
  updated_at: string;
}

export interface OrgRef {
  id: string;
  slug: string;
  name: string;
  status: string;
  siteUrl: unknown;
}

export interface PageStateRow {
  target_id: string;
  page_id: string;
  kind: CheckKind;
  page_url: string;
  failure_streak: number;
  last_failure_code: string | null;
  last_message: string | null;
  episode_id: string | null;
  alert_state: "none" | "pending" | "uncertain" | "sent" | "skipped";
  recovery_state: "none" | "pending_resolve" | "pending_send" | "uncertain";
  recovery_reason: "recovered" | "disabled" | "page_removed" | null;
  incident_id: string | null;
  baseline_set_at: string | null;
  baseline_sha256: string | null;
  updated_at: string;
}

export interface CheckRecord {
  targetId: string;
  gen: number;
  runKey: string;
  pageId: string;
  pageUrl: string;
  ok: boolean;
  httpStatus: number | null;
  failureCode: string | null;
  finalUrl: string | null;
  consoleErrorCount: number;
  pageErrorCount: number;
  errorsSample: string[];
  timingMs: number | null;
  visual: "baseline_created" | "match" | "diff" | "skipped" | null;
  visualNote: string | null;
  diffRatio: number | null;
  evidenceKey: string | null;
  diffKey: string | null;
  skippedBuckets: number;
  message: string | null;
  baselineSha256: string | null;
}

export interface SiteWatchStore {
  syncTargets(): Promise<number>;
  listSchedulable(): Promise<TargetRow[]>;
  pendingNotificationTargets(): Promise<string[]>;
  loadTarget(targetId: string): Promise<{ target: TargetRow; org: OrgRef } | null>;
  pageStates(targetId: string): Promise<PageStateRow[]>;
  claim(targetId: string, windowS: number): Promise<number | null>;
  renew(targetId: string, gen: number, windowS: number): Promise<number | null>;
  release(targetId: string, gen: number): Promise<void>;
  recordCheck(r: CheckRecord): Promise<"fenced" | "duplicate" | "recorded">;
  completeRun(targetId: string, gen: number, runKey: string, bucketStart: Date): Promise<boolean>;
  retirePages(targetId: string, gen: number, keep: string[]): Promise<number>;
  attachIncident(targetId: string, gen: number, s: PageStateRow, incidentId: string): Promise<boolean>;
  notifyBegin(targetId: string, gen: number, s: PageStateRow, phase: NotifyPhase): Promise<boolean>;
  notifyFinish(targetId: string, gen: number, s: PageStateRow, phase: NotifyPhase, outcome: NotifyOutcome): Promise<boolean>;
  resolveForRecovery(targetId: string, gen: number, s: PageStateRow): Promise<"fenced" | "stale" | "pending_send" | "closed_by_operator">;
  upsertIncident(draft: IncidentDraft & { fingerprint: string }): Promise<string>;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`site_watch_db:${what}:${res.error.message}`);
  return res.data;
}

const TARGET_COLUMNS =
  "id, organization_id, enabled, frequency, hour_utc, last_completed_run_key, last_completed_bucket_start, version, updated_by, updated_at";

export function createSupabaseStore(sb: SupabaseClient): SiteWatchStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> =>
    must((await sb.rpc(fn, args)) as { data: T; error: { message: string } | null }, fn);
  const stateArgs = (targetId: string, gen: number, s: PageStateRow) => ({
    p_target: targetId,
    p_gen: gen,
    p_page: s.page_id,
    p_kind: s.kind,
    p_episode: s.episode_id,
  });

  return {
    syncTargets: () => rpc<number>("site_watch_sync_targets", {}),

    async listSchedulable() {
      const res = await sb
        .from("site_watch_targets")
        .select(`${TARGET_COLUMNS}, organizations!inner(status)`)
        .eq("enabled", true)
        .eq("organizations.status", "active");
      return (must(res, "list_schedulable") ?? []) as unknown as TargetRow[];
    },

    async pendingNotificationTargets() {
      const ids = await rpc<string[] | null>("site_watch_targets_with_pending_notifications", {});
      return ids ?? [];
    },

    async loadTarget(targetId) {
      const res = await sb
        .from("site_watch_targets")
        .select(`${TARGET_COLUMNS}, organizations!inner(id, slug, name, status, metadata)`)
        .eq("id", targetId)
        .maybeSingle();
      const row = must(res, "load_target") as (TargetRow & { organizations: Record<string, any> }) | null;
      if (!row) return null;
      const o = row.organizations;
      const { organizations: _drop, ...target } = row;
      return {
        target: target as TargetRow,
        org: { id: o.id, slug: o.slug, name: o.name, status: o.status, siteUrl: o.metadata?.client_config?.site_url },
      };
    },

    async pageStates(targetId) {
      const res = await sb.from("site_watch_page_state").select("*").eq("target_id", targetId);
      return (must(res, "page_states") ?? []) as PageStateRow[];
    },

    claim: (targetId, windowS) => rpc<number | null>("site_watch_claim", { p_target: targetId, p_window_s: windowS }),
    renew: (targetId, gen, windowS) =>
      rpc<number | null>("site_watch_renew", { p_target: targetId, p_gen: gen, p_window_s: windowS }),
    async release(targetId, gen) {
      await rpc<boolean>("site_watch_release", { p_target: targetId, p_gen: gen });
    },

    recordCheck: (r) =>
      rpc("site_watch_record_check", {
        p_target: r.targetId,
        p_gen: r.gen,
        p_run_key: r.runKey,
        p_page_id: r.pageId,
        p_page_url: r.pageUrl,
        p_ok: r.ok,
        p_http_status: r.httpStatus,
        p_failure_code: r.failureCode,
        p_final_url: r.finalUrl,
        p_console_error_count: r.consoleErrorCount,
        p_page_error_count: r.pageErrorCount,
        p_errors_sample: r.errorsSample,
        p_timing_ms: r.timingMs,
        p_visual: r.visual,
        p_visual_note: r.visualNote,
        p_diff_ratio: r.diffRatio,
        p_evidence_key: r.evidenceKey,
        p_diff_key: r.diffKey,
        p_skipped_buckets: r.skippedBuckets,
        p_message: r.message,
        p_baseline_sha256: r.baselineSha256,
      }),

    completeRun: (targetId, gen, runKey, bucketStart) =>
      rpc("site_watch_complete_run", {
        p_target: targetId,
        p_gen: gen,
        p_run_key: runKey,
        p_bucket_start: bucketStart.toISOString(),
      }),

    retirePages: (targetId, gen, keep) =>
      rpc("site_watch_retire_pages", { p_target: targetId, p_gen: gen, p_keep: keep }),

    attachIncident: (targetId, gen, s, incidentId) =>
      rpc("site_watch_attach_incident", { ...stateArgs(targetId, gen, s), p_incident: incidentId }),

    notifyBegin: (targetId, gen, s, phase) =>
      rpc("site_watch_notify_begin", { ...stateArgs(targetId, gen, s), p_phase: phase }),

    notifyFinish: (targetId, gen, s, phase, outcome) =>
      rpc("site_watch_notify_finish", { ...stateArgs(targetId, gen, s), p_phase: phase, p_outcome: outcome }),

    resolveForRecovery: (targetId, gen, s) => rpc("site_watch_resolve_for_recovery", stateArgs(targetId, gen, s)),

    async upsertIncident(draft) {
      // isReopen=true: a new episode on a page reuses that page's incident row (conflict key is
      // fingerprint+environment); the SQL function only reopens rows that are resolved/ignored.
      const { data, error } = await upsertIncidentAtomic(sb, draft, true);
      if (error || !data) throw new Error(`site_watch_db:upsert_incident:${error ?? "empty"}`);
      return data.id;
    },
  };
}

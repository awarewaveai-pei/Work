// Operator-facing reads/writes behind /api/ops/clients/[slug]/site-watch*. Writes go through the
// locked functions of migration 0091 (site_watch_update_config / site_watch_accept_baseline).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { siteWatchBucket, siteWatchEnabled } from "./config";
import type { SiteWatchObjects } from "./objects";
import { pagesForSiteUrl } from "./pages";
import type { SiteWatchFrequency } from "./runKey";
import { baselineKey } from "./storage";
import type { PageStateRow, TargetRow } from "./store";

export interface ConsoleOrg {
  id: string;
  slug: string;
  name: string;
  siteUrl: unknown;
}

export async function orgBySlug(sb: SupabaseClient, slug: string): Promise<ConsoleOrg | null> {
  const { data, error } = await sb.from("organizations").select("id, slug, name, metadata").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, slug: data.slug, name: data.name, siteUrl: (data.metadata as any)?.client_config?.site_url };
}

/** Same audit trail as every other tenant-config write in this console (ops_audit_events). */
export async function auditSiteWatch(
  sb: SupabaseClient,
  orgId: string,
  actor: { role: string; source: string },
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb.from("ops_audit_events").insert({
    organization_id: orgId,
    actor_role: actor.role,
    event_type: event,
    target_type: "organizations",
    target_id: orgId,
    trace_id: crypto.randomUUID(),
    payload: { ...payload, role_source: actor.source },
  });
  if (error) console.warn(`[site-watch] audit ${event} failed: ${error.message}`);
}

/** Slice 1 exposes the clock-driven frequencies; update_only needs the wp-update hook (slice 2). */
export const CONFIGURABLE_FREQUENCIES: SiteWatchFrequency[] = ["hourly", "every_6h", "daily"];

/** What site_watch_sync_targets (0091) creates for an active client with a site URL. */
export const SITE_WATCH_DEFAULTS: { enabled: boolean; frequency: SiteWatchFrequency; hour_utc: number } = {
  enabled: true,
  frequency: "daily",
  hour_utc: 22,
};

export interface ResultRow {
  id: string;
  run_key: string;
  page_id: string;
  page_url: string;
  ok: boolean;
  http_status: number | null;
  failure_code: string | null;
  console_error_count: number;
  page_error_count: number;
  errors_sample: string[];
  timing_ms: number | null;
  visual_status: string | null;
  visual_note: string | null;
  diff_ratio: number | null;
  evidence_key: string | null;
  diff_key: string | null;
  skipped_buckets: number;
  created_at: string;
}

export interface SiteWatchOverview {
  globallyEnabled: boolean;
  storageConfigured: boolean;
  /** null = no row yet: the next heartbeat's sync creates one with the defaults below. */
  target: Pick<TargetRow, "enabled" | "frequency" | "hour_utc" | "version" | "updated_by" | "updated_at" | "last_completed_run_key"> | null;
  defaults: { enabled: boolean; frequency: SiteWatchFrequency; hour_utc: number };
  watchedPages: Array<{ pageId: string; url: string }>;
  pageStates: PageStateRow[];
  recent: ResultRow[];
}

export async function loadOverview(sb: SupabaseClient, org: { id: string; siteUrl: unknown }): Promise<SiteWatchOverview> {
  const t = await sb.from("site_watch_targets").select("*").eq("organization_id", org.id).maybeSingle();
  if (t.error) throw new Error(`site_watch_db:overview_target:${t.error.message}`);
  const target = t.data as TargetRow | null;
  let pageStates: PageStateRow[] = [];
  let recent: ResultRow[] = [];
  if (target) {
    const [s, r] = await Promise.all([
      sb.from("site_watch_page_state").select("*").eq("target_id", target.id),
      sb.from("site_watch_results").select("*").eq("target_id", target.id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (s.error) throw new Error(`site_watch_db:overview_states:${s.error.message}`);
    if (r.error) throw new Error(`site_watch_db:overview_results:${r.error.message}`);
    pageStates = (s.data ?? []) as PageStateRow[];
    recent = (r.data ?? []) as ResultRow[];
  }
  return {
    globallyEnabled: siteWatchEnabled(),
    storageConfigured: !!siteWatchBucket(),
    target: target
      ? {
          enabled: target.enabled,
          frequency: target.frequency,
          hour_utc: target.hour_utc,
          version: target.version,
          updated_by: target.updated_by,
          updated_at: target.updated_at,
          last_completed_run_key: target.last_completed_run_key,
        }
      : null,
    defaults: SITE_WATCH_DEFAULTS,
    watchedPages: pagesForSiteUrl(org.siteUrl).map((p) => ({ pageId: p.pageId, url: p.url })),
    pageStates,
    recent,
  };
}

export interface ConfigInput {
  expectedVersion: number;
  enabled: boolean;
  frequency: SiteWatchFrequency;
  hourUtc: number;
}

export function parseConfigInput(body: Record<string, unknown>): ConfigInput | { error: string } {
  const { expectedVersion, enabled, frequency, hourUtc } = body;
  if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 0) return { error: "expected_version_required" };
  if (typeof enabled !== "boolean") return { error: "enabled_required" };
  if (!CONFIGURABLE_FREQUENCIES.includes(frequency as SiteWatchFrequency)) return { error: "frequency_invalid" };
  if (!Number.isInteger(hourUtc) || (hourUtc as number) < 0 || (hourUtc as number) > 23) return { error: "hour_utc_out_of_range" };
  return { expectedVersion: expectedVersion as number, enabled, frequency: frequency as SiteWatchFrequency, hourUtc: hourUtc as number };
}

export async function updateConfig(
  sb: SupabaseClient,
  orgId: string,
  input: ConfigInput,
  actor: string,
): Promise<{ ok: true; target: TargetRow } | { ok: false; error: "version_conflict" }> {
  const { data, error } = await sb.rpc("site_watch_update_config", {
    p_org: orgId,
    p_expected_version: input.expectedVersion,
    p_enabled: input.enabled,
    p_frequency: input.frequency,
    p_hour_utc: input.hourUtc,
    p_actor: actor,
  });
  if (error) throw new Error(`site_watch_db:update_config:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as TargetRow | undefined;
  return row ? { ok: true, target: row } : { ok: false, error: "version_conflict" };
}

/**
 * C6 "接受為新基準": the page's most recent diff screenshot becomes its baseline. Object first, row
 * second — a crash between leaves the new image under an unchanged row, which the next check simply
 * compares against (no false alert, no lost state).
 */
export async function acceptLatestAsBaseline(
  sb: SupabaseClient,
  objects: SiteWatchObjects | null,
  orgId: string,
  pageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!objects) return { ok: false, error: "storage_unconfigured" };
  const t = await sb.from("site_watch_targets").select("id").eq("organization_id", orgId).maybeSingle();
  if (t.error || !t.data) return { ok: false, error: "target_not_found" };
  const r = await sb
    .from("site_watch_results")
    .select("evidence_key")
    .eq("target_id", t.data.id)
    .eq("page_id", pageId)
    .eq("visual_status", "diff")
    .not("evidence_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (r.error || !r.data?.evidence_key) return { ok: false, error: "no_diff_screenshot" };
  const img = await objects.get(r.data.evidence_key);
  if (!img) return { ok: false, error: "screenshot_missing" };
  if (!(await objects.put(baselineKey(orgId, pageId), img, "image/jpeg"))) return { ok: false, error: "storage_error" };
  const sha = createHash("sha256").update(img).digest("hex");
  const { data, error } = await sb.rpc("site_watch_accept_baseline", { p_target: t.data.id, p_page: pageId, p_sha256: sha });
  if (error) throw new Error(`site_watch_db:accept_baseline:${error.message}`);
  return data === true ? { ok: true } : { ok: false, error: "page_not_found" };
}

/**
 * C12 read path: images are only ever served through this authenticated lookup, keyed by row ids —
 * never by a caller-supplied object key, so one client's page can never be used to read another's.
 */
export async function readImage(
  sb: SupabaseClient,
  objects: SiteWatchObjects | null,
  orgId: string,
  q: { resultId?: string; pageId?: string; which: "evidence" | "diff" | "baseline" },
): Promise<Buffer | null> {
  if (!objects) return null;
  const t = await sb.from("site_watch_targets").select("id").eq("organization_id", orgId).maybeSingle();
  if (t.error || !t.data) return null;
  if (q.which === "baseline") {
    if (!q.pageId || !/^[0-9a-f]{16}$/.test(q.pageId)) return null;
    const s = await sb
      .from("site_watch_page_state")
      .select("baseline_set_at")
      .eq("target_id", t.data.id)
      .eq("page_id", q.pageId)
      .eq("kind", "visual")
      .maybeSingle();
    if (s.error || !s.data?.baseline_set_at) return null;
    return objects.get(baselineKey(orgId, q.pageId));
  }
  if (!q.resultId) return null;
  const r = await sb
    .from("site_watch_results")
    .select("evidence_key, diff_key")
    .eq("target_id", t.data.id)
    .eq("id", q.resultId)
    .maybeSingle();
  if (r.error || !r.data) return null;
  const key = q.which === "diff" ? r.data.diff_key : r.data.evidence_key;
  return key ? objects.get(key) : null;
}

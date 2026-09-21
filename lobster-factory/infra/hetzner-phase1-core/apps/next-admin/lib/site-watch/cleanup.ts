// C9 daily cleanup: result rows > 30 days, then objects nothing references any more.
// Claimed at most once per UTC day (site_watch_claim_daily_cleanup). A failed delete is simply found
// again tomorrow — no retry queue.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORPHAN_GRACE_MS, RETENTION_DAYS } from "./config";
import type { SiteWatchObjects } from "./objects";
import { SITE_WATCH_PREFIX, parseKey } from "./storage";

export interface CleanupResult {
  claimed: boolean;
  purgedRows: number;
  deletedObjects: number;
  failedDeletes: number;
  skippedObjects: string | null;
}

const PAGE = 1000;

async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`site_watch_db:cleanup_select:${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function runDailyCleanup(sb: SupabaseClient, objects: SiteWatchObjects | null, now: Date): Promise<CleanupResult> {
  const res: CleanupResult = { claimed: false, purgedRows: 0, deletedObjects: 0, failedDeletes: 0, skippedObjects: null };
  const claim = await sb.rpc("site_watch_claim_daily_cleanup");
  if (claim.error) throw new Error(`site_watch_db:claim_cleanup:${claim.error.message}`);
  if (claim.data !== true) return res;
  res.claimed = true;

  const purge = await sb.rpc("site_watch_purge_results", { p_days: RETENTION_DAYS });
  if (purge.error) throw new Error(`site_watch_db:purge:${purge.error.message}`);
  res.purgedRows = Number(purge.data ?? 0);

  if (!objects) {
    res.skippedObjects = "storage_unconfigured";
    return res;
  }
  const listed = await objects.list(SITE_WATCH_PREFIX);
  if (!listed) {
    res.skippedObjects = "list_failed";
    return res;
  }

  // Read the references AFTER listing: an object written after the list is not in it, and one listed
  // before its row committed is protected by the grace period.
  const results = await selectAll<{ evidence_key: string | null; diff_key: string | null }>((a, b) =>
    sb.from("site_watch_results").select("evidence_key, diff_key").or("evidence_key.not.is.null,diff_key.not.is.null").range(a, b),
  );
  const referenced = new Set(results.flatMap((r) => [r.evidence_key, r.diff_key]).filter((k): k is string => !!k));
  // A many-to-one embed arrives as an object at runtime; the generated type says array — accept both.
  type Embed = { organization_id: string } | Array<{ organization_id: string }>;
  const baselines = await selectAll<{ page_id: string; site_watch_targets: Embed }>((a, b) =>
    sb
      .from("site_watch_page_state")
      .select("page_id, site_watch_targets!inner(organization_id)")
      .eq("kind", "visual")
      .not("baseline_set_at", "is", null)
      .range(a, b) as unknown as PromiseLike<{ data: Array<{ page_id: string; site_watch_targets: Embed }> | null; error: { message: string } | null }>,
  );
  const orgOf = (e: Embed) => (Array.isArray(e) ? e[0]?.organization_id : e.organization_id);
  const liveBaselines = new Set(baselines.map((r) => `${orgOf(r.site_watch_targets)}/${r.page_id}`));

  for (const obj of listed) {
    const parsed = parseKey(obj.key);
    // Unknown layout or unknown age: never delete what we cannot account for.
    if (!parsed || !obj.lastModified || now.getTime() - obj.lastModified.getTime() < ORPHAN_GRACE_MS) continue;
    const orphan =
      parsed.kind === "baseline" ? !liveBaselines.has(`${parsed.orgId}/${parsed.pageId}`) : !referenced.has(obj.key);
    if (!orphan) continue;
    if (await objects.remove(obj.key)) res.deletedObjects++;
    else res.failedDeletes++;
  }
  return res;
}

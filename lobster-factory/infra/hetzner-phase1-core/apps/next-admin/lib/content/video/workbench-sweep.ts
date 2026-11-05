/**
 * workbench-sweep.ts -- deletes workbench objects that never got a media_assets row.
 *
 * Why: app/api/internal/video/workbench/assets/route.ts puts `video/workbench/<org>/<sha>.<ext>` BEFORE it inserts the row
 * and never deletes on failure (a concurrent request may be committing the same content-addressed key). This scheduled
 * sweep is the only deleter. Invariant: delete only keys under WORKBENCH_PREFIX, older than MIN_AGE_MS, with no
 * media_assets.object_key equal to them (the route stores the raw key there). Any doubt (unknown age, lookup error) = keep.
 */
import { getSupabaseWriteClient } from "../../supabase-server";
import { isR2Configured, r2DeleteObject, r2ListObjects } from "../../storage/r2";

export const WORKBENCH_PREFIX = "video/workbench/";
export const MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_DELETES_PER_RUN = 200;
/** Time the delete loop may run; the reconcile cron's curl gives the whole request 120 s. */
export const DEFAULT_BUDGET_MS = 60_000;
const LOOKUP_BATCH = 50;

/** checked === referenced + young + deleted + failed + deferred (self-checked; mismatch returns ok:false). */
export interface WorkbenchSweepResult {
  ok: boolean;
  /** Set when the sweep did nothing on purpose (config missing): ok stays true. */
  skipped?: string;
  /** Objects listed under WORKBENCH_PREFIX. */
  checked: number;
  /** Old enough but a media_assets row points at it (including one that appeared between the two lookups). */
  referenced: number;
  /** Younger than 24 h, or last_modified unknown. */
  young: number;
  deleted: number;
  /** R2 list or delete failed for the key; makes the sweep ok:false. */
  failed: number;
  /** Deletable but over MAX_DELETES_PER_RUN or past the time budget; next run takes them. */
  deferred: number;
  error?: string;
}

const empty = (): WorkbenchSweepResult => ({ ok: true, checked: 0, referenced: 0, young: 0, deleted: 0, failed: 0, deferred: 0 });

type Db = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;

/** PostgREST caps a response (max_rows, lobster-factory/infra/supabase/docker-compose.yml); one key may have many version rows. */
export const LOOKUP_ROW_CAP = 1000;
/** Each R2 call is bounded so one stuck request cannot push the sweep past the cron's curl -m 120. */
export const R2_CALL_TIMEOUT_MS = 10_000;
/** One batched pass: which of `keys` have a media_assets row. null = lookup failed.
 *  Invariant: an incomplete answer never makes a key unreferenced -- a capped page marks its whole slice referenced. */
async function referencedKeys(db: Db, keys: string[]): Promise<Set<string> | null> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += LOOKUP_BATCH) {
    const slice = keys.slice(i, i + LOOKUP_BATCH);
    const { data, error } = await db.from("media_assets").select("object_key").in("object_key", slice).limit(LOOKUP_ROW_CAP);
    if (error) return null;
    const rows = (data ?? []) as { object_key: string }[];
    if (rows.length >= LOOKUP_ROW_CAP) { for (const k of slice) found.add(k); continue; }
    for (const r of rows) found.add(r.object_key);
  }
  return found;
}

export async function sweepWorkbenchOrphans(
  now: Date = new Date(),
  { budgetMs = DEFAULT_BUDGET_MS, clock = Date.now }: { budgetMs?: number; clock?: () => number } = {},
): Promise<WorkbenchSweepResult> {
  const deadline = clock() + budgetMs;
  if (!isR2Configured()) return { ...empty(), skipped: "R2 env not set" };
  const db = getSupabaseWriteClient();
  if (!db) return { ...empty(), skipped: "supabase not set" };
  const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";

  const listed = await r2ListObjects(bucket, WORKBENCH_PREFIX);
  if ("error" in listed) return { ...empty(), ok: false, error: listed.error };
  const objects = listed.objects.filter((o) => o.key.startsWith(WORKBENCH_PREFIX));

  const cutoff = now.getTime() - MIN_AGE_MS;
  const old = objects.filter((o) => o.lastModified !== null && o.lastModified.getTime() <= cutoff).map((o) => o.key);
  const young = objects.length - old.length;

  const refs = await referencedKeys(db, old);
  if (!refs) return { ...empty(), ok: false, checked: objects.length, young, error: "media_assets lookup failed" };
  const unreferenced = old.filter((k) => !refs.has(k));
  const batch = unreferenced.slice(0, MAX_DELETES_PER_RUN);

  // A same-bytes re-upload refreshes the object but not the listed age: look again right before deleting.
  const recheck = await referencedKeys(db, batch);
  if (!recheck) return { ...empty(), ok: false, checked: objects.length, young, error: "media_assets recheck failed" };

  // R2 has no conditional delete: re-read this key's age right before DELETE, so a same-bytes upload in flight (it
  // rewrites the object first, then inserts its row) shows up as young and is kept. Residual window = one LIST->DELETE.
  let deleted = 0, failed = 0, refreshed = 0, rechecked = 0, timedOut = 0;
  for (const key of batch) {
    if (clock() >= deadline) { timedOut++; continue; }
    if (recheck.has(key)) { rechecked++; continue; }
    const fresh = await r2ListObjects(bucket, key, { timeoutMs: R2_CALL_TIMEOUT_MS });
    const now = "error" in fresh ? undefined : fresh.objects.find((o) => o.key === key);
    if ("error" in fresh) { failed++; continue; }
    if (!now) { deleted++; continue; }   // already gone
    if (now.lastModified === null || now.lastModified.getTime() > cutoff) { refreshed++; continue; }
    const r = await r2DeleteObject(bucket, key, { timeoutMs: R2_CALL_TIMEOUT_MS });
    if (r.ok) deleted++; else failed++;
  }

  // Invariant: any list/delete error = ok:false (alertable); a row that appeared at recheck is referenced, not a failure.
  const result: WorkbenchSweepResult = {
    ok: failed === 0, checked: objects.length, referenced: old.length - unreferenced.length + rechecked, young: young + refreshed, deleted, failed,
    deferred: unreferenced.length - batch.length + timedOut,
    ...(failed > 0 ? { error: `r2_errors: ${failed}` } : {}),
  };
  const sum = result.referenced + result.young + result.deleted + result.failed + result.deferred;
  if (sum !== result.checked) return { ...result, ok: false, error: `classification_mismatch: sum=${sum} checked=${result.checked}` };
  return result;
}

// One target, one lease: claim → (due? check each page) → notification step → release.
// Called once per target per heartbeat by /api/internal/site-watch/run/[targetId].
//
// Failure attribution: a SITE problem is a recorded check (→ streak → Telegram). A MONITOR problem
// (renderer down, DB error) is never recorded as a site failure — the run stays incomplete, the same
// bucket retries next heartbeat, and the error surfaces through the caller (Trigger.dev run + Sentry).
import { createHash } from "node:crypto";
import { VISUAL_DIFF_RATIO, leaseWindowSeconds } from "./config";
import { compareScreenshots } from "./diff";
import { LeaseLost, runNotifications, type NotifyStepResult, type TextNotifier } from "./notify";
import { pagesForSiteUrl, type WatchedPage } from "./pages";
import { RendererUnavailable, type SnapshotResult } from "./rendererClient";
import { bucketFor, skippedBuckets } from "./runKey";
import { baselineKey, evidenceKeys } from "./storage";
import type { CheckRecord, OrgRef, PageStateRow, SiteWatchStore, TargetRow } from "./store";

export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<boolean>;
  /** null = not found (or unreadable); the caller decides what a missing object means. */
  get(key: string): Promise<Buffer | null>;
}

export interface RunnerDeps {
  store: SiteWatchStore;
  snapshot: (url: string) => Promise<SnapshotResult>;
  /** null = no private bucket configured: visual comparison is skipped, availability still runs. */
  objects: ObjectStore | null;
  notifier: TextNotifier | null;
  publicUrl: string;
  /** C10 kill switch, re-read before every page. */
  enabled: () => boolean;
  now: () => Date;
}

export type RunStatus = "kill_switch" | "not_found" | "leased" | "not_due" | "ran" | "stopped" | "lease_lost" | "renderer_unavailable";

export interface RunTargetResult {
  targetId: string;
  status: RunStatus;
  runKey?: string;
  pages: Array<{ pageId: string; ok: boolean; failureCode: string | null; visual: CheckRecord["visual"] }>;
  notifications: NotifyStepResult[];
  error?: string;
}

/** Due-now for the heartbeat's selection. The runner re-checks under its lease; this is only a hint. */
export function isDue(target: Pick<TargetRow, "id" | "frequency" | "hour_utc" | "last_completed_run_key">, now: Date): boolean {
  const b = bucketFor(target.id, target.frequency, target.hour_utc, now);
  return !!b && b.key !== target.last_completed_run_key;
}

export async function runTarget(targetId: string, deps: RunnerDeps): Promise<RunTargetResult> {
  const result: RunTargetResult = { targetId, status: "not_due", pages: [], notifications: [] };
  if (!deps.enabled()) return { ...result, status: "kill_switch" };

  const loaded = await deps.store.loadTarget(targetId);
  if (!loaded) return { ...result, status: "not_found" };
  const { target, org } = loaded;
  const monitored = target.enabled && org.status === "active";
  const pages = monitored ? pagesForSiteUrl(org.siteUrl) : [];
  const windowS = leaseWindowSeconds(Math.max(1, pages.length));

  const gen = await deps.store.claim(targetId, windowS);
  if (gen === null) return { ...result, status: "leased" };

  try {
    if (monitored && (await deps.store.retirePages(targetId, gen, pages.map((p) => p.pageId))) < 0) throw new LeaseLost();

    const bucket = monitored ? bucketFor(target.id, target.frequency, target.hour_utc, deps.now()) : null;
    if (bucket && pages.length > 0 && bucket.key !== target.last_completed_run_key) {
      result.runKey = bucket.key;
      const lastStart = target.last_completed_bucket_start ? new Date(target.last_completed_bucket_start) : null;
      const skipped = skippedBuckets(lastStart, bucket);
      const states = await deps.store.pageStates(targetId);
      let complete = true;
      try {
        for (const page of pages) {
          if (!deps.enabled()) {
            complete = false;
            result.status = "stopped";
            break;
          }
          if ((await deps.store.renew(targetId, gen, windowS)) === null) throw new LeaseLost();
          const visualState = states.find((s) => s.page_id === page.pageId && s.kind === "visual");
          const rec = await checkPage(deps, org, page, visualState, { targetId, gen, runKey: bucket.key, skipped });
          const written = await deps.store.recordCheck(rec);
          if (written === "fenced") throw new LeaseLost();
          result.pages.push({ pageId: page.pageId, ok: rec.ok, failureCode: rec.failureCode, visual: rec.visual });
        }
      } catch (e) {
        if (!(e instanceof RendererUnavailable)) throw e;
        complete = false;
        result.status = "renderer_unavailable";
        result.error = e.message;
      }
      if (complete) {
        if (!(await deps.store.completeRun(targetId, gen, bucket.key, bucket.start))) throw new LeaseLost();
        result.status = "ran";
      }
    }

    // I2: owed messages are resumed on every heartbeat, due or not — unless the kill switch is off.
    if (deps.enabled()) {
      result.notifications = await runNotifications(
        { store: deps.store, notifier: deps.notifier, publicUrl: deps.publicUrl, targetId, gen, windowS, org },
        await deps.store.pageStates(targetId),
      );
    }
    return result;
  } catch (e) {
    if (e instanceof LeaseLost) return { ...result, status: "lease_lost" };
    throw e;
  } finally {
    await deps.store.release(targetId, gen).catch(() => {});
  }
}

async function checkPage(
  deps: RunnerDeps,
  org: OrgRef,
  page: WatchedPage,
  visualState: PageStateRow | undefined,
  run: { targetId: string; gen: number; runKey: string; skipped: number },
): Promise<CheckRecord> {
  const snap = await deps.snapshot(page.url);
  const ok = snap.failureCode === null;
  const shot = snap.screenshotBase64 ? Buffer.from(snap.screenshotBase64, "base64") : null;
  const now = deps.now();

  const rec: CheckRecord = {
    targetId: run.targetId,
    gen: run.gen,
    runKey: run.runKey,
    pageId: page.pageId,
    pageUrl: page.url,
    ok,
    httpStatus: snap.status || null,
    failureCode: snap.failureCode,
    finalUrl: snap.finalUrl || null,
    consoleErrorCount: snap.consoleErrors.length,
    pageErrorCount: snap.pageErrors.length,
    errorsSample: [...snap.pageErrors, ...snap.consoleErrors].slice(0, 10),
    timingMs: snap.timingMs,
    visual: null,
    visualNote: null,
    diffRatio: null,
    evidenceKey: null,
    diffKey: null,
    skippedBuckets: run.skipped,
    message: snap.detail,
    baselineSha256: null,
  };

  if (!ok) {
    if (shot && deps.objects) {
      const keys = evidenceKeys(org.id, page.pageId, now);
      if (await deps.objects.put(keys.shot, shot, "image/jpeg")) rec.evidenceKey = keys.shot;
    }
    return rec;
  }
  if (!shot) return { ...rec, visual: "skipped", visualNote: snap.screenshotSkipped ?? "no_screenshot" };
  if (!deps.objects) return { ...rec, visual: "skipped", visualNote: "storage_unconfigured" };

  const bKey = baselineKey(org.id, page.pageId);
  const baseline = visualState?.baseline_set_at ? await deps.objects.get(bKey) : null;
  if (!baseline) {
    if (!(await deps.objects.put(bKey, shot, "image/jpeg"))) return { ...rec, visual: "skipped", visualNote: "storage_error" };
    return {
      ...rec,
      visual: "baseline_created",
      visualNote: visualState?.baseline_set_at ? "baseline_missing_recreated" : null,
      baselineSha256: createHash("sha256").update(shot).digest("hex"),
    };
  }

  let diff;
  try {
    diff = await compareScreenshots(baseline, shot);
  } catch (e) {
    return { ...rec, visual: "skipped", visualNote: `compare_failed:${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
  rec.diffRatio = diff.ratio;
  if (diff.ratio <= VISUAL_DIFF_RATIO) return { ...rec, visual: "match" };

  const keys = evidenceKeys(org.id, page.pageId, now);
  if (await deps.objects.put(keys.shot, shot, "image/jpeg")) rec.evidenceKey = keys.shot;
  if (await deps.objects.put(keys.diff, diff.diffImage, "image/jpeg")) rec.diffKey = keys.diff;
  return { ...rec, visual: "diff", visualNote: `與基準圖差異 ${(diff.ratio * 100).toFixed(1)}%` };
}

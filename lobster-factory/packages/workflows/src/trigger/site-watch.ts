/**
 * site-watch: client-site monitoring heartbeat (agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md).
 *
 * Deliberately thin, same as collect-scheduled-crawl.ts: no scheduling logic here. next-admin's
 * /api/internal/site-watch/due stamps the watchdog heartbeat, decides which targets are due or owe
 * a notification, and each target then runs in its own child (C4: no route call loops over clients).
 * next-admin has to do the work anyway — the renderer is only reachable on its docker network.
 *
 * Set on Trigger worker: SITE_WATCH_INGEST_TOKEN, AWAREWAVE_WEBHOOK_BASE_URL (trigger.config.ts).
 * Kill switch SITE_WATCH_ENABLED lives in next-admin (default OFF): until an operator turns it on,
 * every heartbeat only stamps liveness and returns no targets.
 */

import { logger, schedules, task } from "@trigger.dev/sdk";
import { postSiteWatchCleanup, postSiteWatchDue, postSiteWatchRun, siteWatchConfigured } from "../lib/siteWatch/post";
import { captureWorkflowException } from "../observability/sentry";

export const siteWatchRun = task({
  id: "site-watch-run",
  // One attempt: a crashed run is retried by the next heartbeat once its lease expires (C3), and an
  // SDK retry inside the same lease window would only be refused as "leased".
  retry: { maxAttempts: 1 },
  // The renderer takes one snapshot at a time with a queue of 20, and the caller gives up at 150s.
  // Unthrottled, first enable or the daily 22:00 bucket fans every target out at once: most get 503
  // busy or time out while the renderer keeps shooting pages nobody waits for (plan §6.2 R6).
  // Queued here, each child waits its turn at zero cost.
  queue: { concurrencyLimit: 2 },
  maxDuration: 400,
  run: async (payload: { targetId: string }) => {
    try {
      const res = await postSiteWatchRun(payload.targetId);
      const r = res.result;
      logger.info("site-watch-run", { targetId: r.targetId, status: r.status, runKey: r.runKey, pages: r.pages, notifications: r.notifications });
      // The monitor itself failed: never a verdict on the site (C5), so it must be loud HERE.
      if (r.status === "renderer_unavailable") {
        throw new Error(`site-watch renderer_unavailable for target ${r.targetId}: ${r.error ?? "unknown"}`);
      }
      return r;
    } catch (error) {
      captureWorkflowException(error, { workflowId: "site-watch-run", route: "task.run", tags: { targetId: payload.targetId } });
      throw error;
    }
  },
});

export const siteWatchHeartbeat = schedules.task({
  id: "site-watch-heartbeat",
  // :05, off the collect heartbeat's :00. Daily targets (hour_utc 22) run at 22:05 UTC = 06:05 Taipei.
  cron: "5 * * * *",
  // A retry after the children were triggered would trigger them again; the next hour is the retry.
  retry: { maxAttempts: 1 },
  run: async () => {
    // Not rolled out on this worker yet (any Trigger deploy ships this schedule, rollout or not).
    // Not an error to page on every hour: once next-admin is live, the watchdog's heartbeat probe
    // reports the missing stamps (scripts/check-site-watch-health.ps1).
    if (!siteWatchConfigured()) {
      logger.warn("site-watch-heartbeat: SITE_WATCH_INGEST_TOKEN not set on this worker; skipped");
      return { configured: false };
    }
    try {
      const due = await postSiteWatchDue();
      if (due.targets.length > 0) {
        await siteWatchRun.batchTrigger(due.targets.map((targetId) => ({ payload: { targetId } })));
      }
      const cleanup = await postSiteWatchCleanup();
      logger.info("site-watch-heartbeat", {
        enabled: due.enabled,
        synced: due.synced,
        due: due.due ?? 0,
        owed: due.owed ?? 0,
        triggered: due.targets.length,
        cleanup: cleanup.result,
      });
      return { enabled: due.enabled, triggered: due.targets.length, cleanup: cleanup.result };
    } catch (error) {
      captureWorkflowException(error, { workflowId: "site-watch-heartbeat", route: "task.run" });
      throw error;
    }
  },
});

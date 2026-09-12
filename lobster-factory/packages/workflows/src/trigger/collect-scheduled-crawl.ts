/**
 * Hourly heartbeat for automated data collection (migration 0081 collection_schedules).
 *
 * Deliberately thin: this task owns NO scheduling logic of its own. It exists only to poke
 * next-admin once an hour; next-admin's /api/internal/collect/run-due-schedules decides which
 * tenants are actually due (lib/collect/schedule.ts's isDueNow) and runs them. Keeping the decision
 * in one place (next-admin, next to the crawler and its own test suite) means there is exactly one
 * codebase to update when the due-check logic changes, not two that can drift apart.
 *
 * Set on Trigger worker: COLLECT_SCHEDULE_INGEST_TOKEN, AWAREWAVE_WEBHOOK_BASE_URL
 * (e.g. https://app.aware-wave.com) — same env-var pattern as record-tenant-integration.ts.
 *
 * Every tenant defaults to collection_schedules.enabled = false (AGENTS.md "自動化預設 OFF"), so
 * this firing every hour, forever, does nothing observable until an operator turns a tenant on via
 * PATCH /api/ops/clients/[slug]/collection-schedule.
 */

import { schedules, logger } from "@trigger.dev/sdk";
import { postRunDueSchedules } from "../lib/collection/postRunDueSchedules";
import { captureWorkflowException } from "../observability/sentry";

export const collectScheduledCrawl = schedules.task({
  id: "collect-scheduled-crawl",
  cron: "0 * * * *",
  run: async () => {
    try {
      const result = await postRunDueSchedules();
      logger.info("collect-scheduled-crawl: swept", { checked: result.checked, due: result.due });
      return result;
    } catch (error) {
      captureWorkflowException(error, { workflowId: "collect-scheduled-crawl", route: "task.run" });
      throw error;
    }
  },
});

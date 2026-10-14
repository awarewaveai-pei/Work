/**
 * Hourly heartbeat for every client's routine jobs (migration 0097 client_schedules;
 * agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md).
 *
 * Deliberately thin: this task owns NO scheduling logic. It pokes next-admin once an hour;
 * /api/internal/schedules/run-due decides which (client, job) rows are due, claims them and runs
 * them after answering — so this task returns in seconds even when a crawl takes ten minutes.
 *
 * Set on Trigger worker: SCHEDULE_INGEST_TOKEN, AWAREWAVE_WEBHOOK_BASE_URL (e.g. https://app.aware-wave.com).
 *
 * Every job defaults to off (AGENTS.md "自動化預設 OFF"), so this firing hourly does nothing until an
 * operator ticks a cell on /ops/schedules.
 */

import { schedules, logger } from "@trigger.dev/sdk";
import { postRunDue } from "../lib/schedules/postRunDue";
import { captureWorkflowException } from "../observability/sentry";

export const schedulesHeartbeat = schedules.task({
  id: "schedules-heartbeat",
  cron: "0 * * * *",
  run: async () => {
    try {
      const result = await postRunDue();
      logger.info("schedules-heartbeat: swept", { checked: result.checked, due: result.due, started: result.started });
      return result;
    } catch (error) {
      captureWorkflowException(error, { workflowId: "schedules-heartbeat", route: "task.run" });
      throw error;
    }
  },
});

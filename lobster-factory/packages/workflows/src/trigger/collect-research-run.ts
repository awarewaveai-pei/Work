/**
 * One Cognitive OS research collection run (RESEARCH_LINES_MASTER_PLAN §12.7 I-b -> I-c). Triggered by next-admin's
 * /api/internal/collect/runs; hands the run straight back to next-admin's runs/execute, where the crawler and its
 * tests live. This task decides nothing.
 *
 * One attempt: the grant reference can be exchanged once, so an SDK retry would only be refused (409) — a run that
 * fails is re-requested from Cognitive OS as a new run.
 *
 * Set on Trigger worker: COLLECT_RESEARCH_EXECUTE_TOKEN, AWAREWAVE_WEBHOOK_BASE_URL (e.g. https://app.aware-wave.com).
 */

import { logger, task } from "@trigger.dev/sdk";
import { postResearchRunExecute, type ResearchRunPayload } from "../lib/collection/postResearchRunExecute";
import { captureWorkflowException } from "../observability/sentry";

export const collectResearchRun = task({
  id: "collect-research-run",
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 2 },
  maxDuration: 400,
  run: async (payload: ResearchRunPayload) => {
    try {
      const result = await postResearchRunExecute(payload);
      logger.info("collect-research-run", { projectId: payload.project_id, runId: payload.run_id, status: result.status, report: result.report });
      return result;
    } catch (error) {
      captureWorkflowException(error, { workflowId: "collect-research-run", route: "task.run", tags: { runId: payload.run_id } });
      throw error;
    }
  },
});

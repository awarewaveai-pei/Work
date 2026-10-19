import { schedules, logger } from "@trigger.dev/sdk";
import { postExpire } from "../lib/entitlements/postExpire";
import { captureWorkflowException } from "../observability/sentry";

export const entitlementsExpire = schedules.task({
  id: "entitlements-expire",
  cron: "0 1 * * *",
  run: async () => {
    try {
      const result = await postExpire();
      logger.info("entitlements-expire: swept", { expired: result.expired });
      return result;
    } catch (error) {
      captureWorkflowException(error, { workflowId: "entitlements-expire", route: "task.run" });
      throw error;
    }
  },
});

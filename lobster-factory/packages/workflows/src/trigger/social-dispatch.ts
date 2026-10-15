/**
 * Every 5 minutes: poke next-admin's POST /api/internal/social/dispatch, which sends due social posts to Postiz and
 * reads their results back (SOCIAL_MANAGER_PLAN.md C5). All logic lives in next-admin (lib/social/dispatch.ts); this
 * task only calls it. Whether it sends at all (SOCIAL_DISPATCH_ENABLED / SOCIAL_DISPATCH_MODE) is next-admin's
 * setting, not this worker's.
 *
 * Token: SOCIAL_DISPATCH_TOKEN, synced by scripts/lobster-trigger-deploy.ps1 from the RUNNING next-admin (so Trigger
 * never holds a token next-admin does not accept). Unset -> skip quietly.
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { captureWorkflowException } from "../observability/sentry";

export async function postSocialDispatch(token: string): Promise<Record<string, unknown>> {
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/internal/social/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(290_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`social/dispatch ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export const socialDispatch = schedules.task({
  id: "social-dispatch",
  cron: "*/5 * * * *",
  // The next tick is the retry; a send is leased in the database, so a retry never sends twice.
  retry: { maxAttempts: 1 },
  maxDuration: 300,
  run: async () => {
    const token = process.env.SOCIAL_DISPATCH_TOKEN?.trim();
    if (!token) {
      logger.warn("social-dispatch: SOCIAL_DISPATCH_TOKEN not set on this worker; skipped");
      return { configured: false };
    }
    try {
      return { configured: true, ...(await postSocialDispatch(token)) };
    } catch (error) {
      captureWorkflowException(error, { workflowId: "social-dispatch", route: "task.run" });
      throw error;
    }
  },
});

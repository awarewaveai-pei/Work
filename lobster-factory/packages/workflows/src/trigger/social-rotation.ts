/**
 * Daily at 00:05 UTC: poke next-admin's POST /api/internal/social/rotation, which turns the next 7 days of every active
 * rotation list into scheduled posts (SOCIAL_MANAGER_PLAN.md C7; logic in next-admin lib/social/rotation.ts, once per
 * slot by migration 0101). Same token and same on/off switch as social-dispatch: SOCIAL_DISPATCH_TOKEN, synced by
 * scripts/lobster-trigger-deploy.ps1 from the RUNNING next-admin. Unset -> skip quietly.
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { captureWorkflowException } from "../observability/sentry";

export async function postSocialRotation(token: string): Promise<Record<string, unknown>> {
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/internal/social/rotation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`social/rotation ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export const socialRotation = schedules.task({
  id: "social-rotation",
  cron: "5 0 * * *",
  // A rerun the same day adds nothing (a slot is materialised once), so the next day is the retry.
  retry: { maxAttempts: 2 },
  run: async () => {
    const token = process.env.SOCIAL_DISPATCH_TOKEN?.trim();
    if (!token) {
      logger.warn("social-rotation: SOCIAL_DISPATCH_TOKEN not set on this worker; skipped");
      return { configured: false };
    }
    try {
      return { configured: true, ...(await postSocialRotation(token)) };
    } catch (error) {
      captureWorkflowException(error, { workflowId: "social-rotation", route: "task.run" });
      throw error;
    }
  },
});

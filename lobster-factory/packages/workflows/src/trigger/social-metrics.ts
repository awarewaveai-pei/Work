/**
 * Daily at 19:30 UTC (03:30 Taiwan): poke next-admin's POST /api/internal/social/metrics, which snapshots every connected
 * channel's numbers for 數據分析 (SOCIAL_MANAGER_PLAN.md C24; logic in next-admin lib/social/metrics.ts). Same token and
 * on/off switch as social-rotation: SOCIAL_DISPATCH_TOKEN, synced by scripts/lobster-trigger-deploy.ps1 from the RUNNING
 * next-admin. Unset -> skip quietly. 19:30 UTC is before the host's 20:00 UTC reboot and after next-admin's 03:00 Taiwan
 * deploy.
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { captureWorkflowException } from "../observability/sentry";

export async function postSocialMetrics(token: string): Promise<Record<string, unknown>> {
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/internal/social/metrics`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`social/metrics ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export const socialMetrics = schedules.task({
  id: "social-metrics",
  cron: "30 19 * * *",
  // a rerun fetches the same days again and overwrites them (snapshot merge), so retrying is safe
  retry: { maxAttempts: 2 },
  run: async () => {
    const token = process.env.SOCIAL_DISPATCH_TOKEN?.trim();
    if (!token) {
      logger.warn("social-metrics: SOCIAL_DISPATCH_TOKEN not set on this worker; skipped");
      return { configured: false };
    }
    try {
      return { configured: true, ...(await postSocialMetrics(token)) };
    } catch (error) {
      captureWorkflowException(error, { workflowId: "social-metrics", route: "task.run" });
      throw error;
    }
  },
});

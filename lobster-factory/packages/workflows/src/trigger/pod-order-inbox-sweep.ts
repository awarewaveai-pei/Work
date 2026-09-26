/**
 * Every 10 minutes: poke next-admin's POST /api/internal/pod-orders/sweep, which replays paid Woo
 * orders still waiting in pod_order_inbox (deferred by a system mode, a failed Printful call due for
 * retry, or a claim whose worker died). All inbox logic lives in next-admin
 * (lib/studio/pod-order-inbox.ts); this task only calls it.
 *
 * Token: POD_INBOX_SWEEP_TOKEN, synced by scripts/lobster-trigger-deploy.ps1 from the RUNNING
 * next-admin (so Trigger never holds a token next-admin does not accept). Unset -> skip quietly; the AO
 * smoke check reports orders whose retry went overdue (scripts/lib/pod-order-inbox-probe.ps1).
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { captureWorkflowException } from "../observability/sentry";

export function podInboxSweepConfigured(): boolean {
  return !!process.env.POD_INBOX_SWEEP_TOKEN?.trim();
}

export async function postPodInboxSweep(): Promise<{ ok: boolean; scheduled?: boolean }> {
  const token = process.env.POD_INBOX_SWEEP_TOKEN?.trim();
  if (!token) throw new Error("POD_INBOX_SWEEP_TOKEN is required on Trigger worker");
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/internal/pod-orders/sweep`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`pod-orders/sweep ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as { ok: boolean; scheduled?: boolean };
}

export const podOrderInboxSweep = schedules.task({
  id: "pod-order-inbox-sweep",
  cron: "*/10 * * * *",
  // The next tick is the retry; the route itself is idempotent (optimistic claims).
  retry: { maxAttempts: 1 },
  run: async () => {
    if (!podInboxSweepConfigured()) {
      logger.warn("pod-order-inbox-sweep: POD_INBOX_SWEEP_TOKEN not set on this worker; skipped");
      return { configured: false };
    }
    try {
      return { configured: true, ...(await postPodInboxSweep()) };
    } catch (error) {
      captureWorkflowException(error, { workflowId: "pod-order-inbox-sweep", route: "task.run" });
      throw error;
    }
  },
});

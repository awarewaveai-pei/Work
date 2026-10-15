/**
 * Every 5 minutes: poke next-admin's POST /api/internal/cs/sweep, which hands Chatwoot messages whose
 * AI pipeline never finished (cut off after the webhook answered) to a human. All logic lives in
 * next-admin (lib/cs/sweep.ts); this task only calls it.
 *
 * Token: CS_SWEEP_TOKEN, synced by scripts/lobster-trigger-deploy.ps1 from the RUNNING next-admin (so
 * Trigger never holds a token next-admin does not accept). Unset -> skip quietly.
 */
import { logger, schedules } from "@trigger.dev/sdk";
import { captureWorkflowException } from "../observability/sentry";

export async function postCsSweep(token: string): Promise<{ ok: boolean; handedOff: number; failed: number }> {
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/internal/cs/sweep`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`cs/sweep ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as { ok: boolean; handedOff: number; failed: number };
}

export const csInboundSweep = schedules.task({
  id: "cs-inbound-sweep",
  cron: "*/5 * * * *",
  // The next tick is the retry; the route only closes a claim after its handoff went through.
  retry: { maxAttempts: 1 },
  run: async () => {
    const token = process.env.CS_SWEEP_TOKEN?.trim();
    if (!token) {
      logger.warn("cs-inbound-sweep: CS_SWEEP_TOKEN not set on this worker; skipped");
      return { configured: false };
    }
    try {
      return { configured: true, ...(await postCsSweep(token)) };
    } catch (error) {
      captureWorkflowException(error, { workflowId: "cs-inbound-sweep", route: "task.run" });
      throw error;
    }
  },
});

// Calls next-admin's due-schedule sweep (all scheduling logic lives there — see that route's own
// header for why). Mirrors postTenantIntegrationWebhook.ts's shape exactly: a dedicated bearer
// token, never OPS_INBOX_INGEST_TOKEN, so a leak here cannot forge anything on the other endpoints
// that token guards (and vice versa).

export type RunDueSchedulesResult = {
  ok: boolean;
  checked: number;
  due: number;
  results: Array<{ organizationId: string; runKey: string; written: number; error?: string }>;
};

export async function postRunDueSchedules(): Promise<RunDueSchedulesResult> {
  const token = process.env.COLLECT_SCHEDULE_INGEST_TOKEN?.trim();
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  if (!token) {
    throw new Error("COLLECT_SCHEDULE_INGEST_TOKEN is required on Trigger worker");
  }

  const url = `${base}/api/internal/collect/run-due-schedules`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`run-due-schedules ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as RunDueSchedulesResult;
}

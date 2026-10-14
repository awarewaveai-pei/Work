// Calls next-admin's schedules sweep (all scheduling logic lives there — see that route's own header).
// A dedicated bearer token, never OPS_INBOX_INGEST_TOKEN, so a leak here cannot forge anything on the
// other endpoints that token guards (and vice versa).

export type RunDueResult = {
  ok: boolean;
  checked: number;
  due: number;
  /** Run keys claimed by this sweep; next-admin runs them after answering. */
  started: string[];
  claimErrors: string[];
};

export async function postRunDue(): Promise<RunDueResult> {
  const token = process.env.SCHEDULE_INGEST_TOKEN?.trim();
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  if (!token) {
    throw new Error("SCHEDULE_INGEST_TOKEN is required on Trigger worker");
  }

  const res = await fetch(`${base}/api/internal/schedules/run-due`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`schedules/run-due ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as RunDueResult;
}

/**
 * After enqueueing `ops_action_runs`, optionally wake Trigger.dev so `dispatch-action-run`
 * runs immediately instead of waiting for the cron schedule (~1 min).
 *
 * Env:
 *   TRIGGER_SECRET_KEY — required to kick (same key as workflow deploy / Trigger dashboard)
 *   TRIGGER_API_URL — Management API base, default https://api.trigger.dev (cloud).
 *     Self-host example: https://trigger.aware-wave.com (confirm path matches your Trigger release).
 */

export type DispatcherKickResult =
  | { attempted: false; reason: "no_secret" }
  | { attempted: true; ok: boolean; httpStatus: number; detail?: string };

export async function kickActionRunDispatcher(): Promise<DispatcherKickResult> {
  const secret = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!secret) {
    return { attempted: false, reason: "no_secret" };
  }

  const base = (process.env.TRIGGER_API_URL?.trim() || "https://api.trigger.dev").replace(/\/$/, "");
  const url = `${base}/api/v1/tasks/dispatch-action-run/trigger`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: {} }),
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        attempted: true,
        ok: false,
        httpStatus: res.status,
        detail: text.slice(0, 500),
      };
    }

    return { attempted: true, ok: true, httpStatus: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      attempted: true,
      ok: false,
      httpStatus: 0,
      detail: msg,
    };
  }
}

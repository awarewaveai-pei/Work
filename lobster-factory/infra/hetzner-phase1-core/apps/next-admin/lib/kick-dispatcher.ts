/**
 * After enqueueing `ops_action_runs`, optionally wake Trigger.dev so `dispatch-action-run`
 * runs immediately instead of waiting for the cron schedule (~1 min).
 *
 * Env (checked in order):
 *   TRIGGER_SECRET_KEY   — dedicated Management API key (preferred)
 *   TRIGGER_ACCESS_TOKEN — project access token (tr_prod_*); accepted by Trigger.dev v4 Management API
 *   TRIGGER_API_URL      — Management API base, default https://api.trigger.dev (cloud).
 *     Self-host example: https://trigger.aware-wave.com
 */

export type DispatcherKickResult =
  | { attempted: false; reason: "no_secret" }
  | { attempted: true; ok: boolean; httpStatus: number; detail?: string };

export async function kickActionRunDispatcher(): Promise<DispatcherKickResult> {
  const secret = (
    process.env.TRIGGER_SECRET_KEY?.trim() ||
    process.env.TRIGGER_ACCESS_TOKEN?.trim()
  );
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

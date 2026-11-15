/**
 * One status read of a running Replicate prediction, for every poll loop in this app. The read changes nothing, so a
 * failure that may pass (429, 5xx, network, a body that is not JSON) returns null and the caller reads again on its next
 * tick, bounded by its own deadline. Replicate keeps running and billing the prediction meanwhile: 2026-11-15 two
 * FLUX 2 Max runs succeeded and were charged while one 502 on this read ended ours with nothing delivered.
 * Only our own abort throws; any other answer is returned.
 */
export type PredictionRead<T> = { ok: true; prediction: T } | { ok: false; status: number } | null;

export async function readPrediction<T>(url: string, token: string, signal: AbortSignal): Promise<PredictionRead<T>> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, prediction: (await res.json()) as T };
  } catch (e) {
    if (signal.aborted) throw e;
    return null;
  }
}

/**
 * Status of a tarot batch's Trigger.dev run (self-hosted Trigger on ks-aw-01, TRIGGER_API_URL), so a run that
 * failed or was killed ends its job without waiting for deadline_at. Best-effort: any failure returns null and
 * the stored deadline (lib/tarot/batch-store.ts summarizeBatch) remains the backstop.
 */
export async function fetchTriggerRunStatus(runId: string): Promise<string | null> {
  const apiUrl = process.env.TRIGGER_API_URL?.trim();
  const token = process.env.TRIGGER_ACCESS_TOKEN?.trim() || process.env.TRIGGER_SECRET_KEY?.trim();
  if (!apiUrl || !token || !/^run_[A-Za-z0-9]+$/.test(runId)) return null;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v3/runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: unknown };
    return typeof data.status === "string" ? data.status : null;
  } catch {
    return null;
  }
}

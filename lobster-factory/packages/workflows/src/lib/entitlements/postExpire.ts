export async function postExpire(): Promise<{ ok: true; expired: number }> {
  const token = process.env.SCHEDULE_INGEST_TOKEN?.trim();
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  if (!token) throw new Error("SCHEDULE_INGEST_TOKEN is required on Trigger worker");
  const response = await fetch(`${base}/api/internal/entitlements/expire`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`entitlements/expire ${response.status}`);
  const result = await response.json() as { ok?: boolean; expired?: number };
  if (result.ok !== true || !Number.isSafeInteger(result.expired) || result.expired! < 0) {
    throw new Error("invalid entitlements/expire response");
  }
  return result as { ok: true; expired: number };
}

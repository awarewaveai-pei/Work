/**
 * Global in-memory daily image-generation quota.
 * Resets at UTC midnight. Appropriate for single-instance SG deployment.
 * Set TAROT_DAILY_LIMIT env var to override (default 300).
 */

interface DayBucket { key: string; count: number }
const bucket: DayBucket = { key: "", count: 0 };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getLimit(): number {
  const v = parseInt(process.env.TAROT_DAILY_LIMIT ?? "300", 10);
  return Number.isFinite(v) && v > 0 ? v : 300;
}

export function checkAndConsumeQuota(): { ok: boolean; count: number; limit: number } {
  const today = todayKey();
  if (bucket.key !== today) { bucket.key = today; bucket.count = 0; }
  const limit = getLimit();
  if (bucket.count >= limit) return { ok: false, count: bucket.count, limit };
  bucket.count++;
  return { ok: true, count: bucket.count, limit };
}

export function getQuotaStatus(): { count: number; limit: number; remaining: number } {
  const today = todayKey();
  if (bucket.key !== today) { bucket.key = today; bucket.count = 0; }
  const limit = getLimit();
  return { count: bucket.count, limit, remaining: Math.max(0, limit - bucket.count) };
}

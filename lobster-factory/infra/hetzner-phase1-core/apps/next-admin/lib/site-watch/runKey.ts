// C2 run buckets. Each bucket runs at most once; only the CURRENT bucket runs (a monitor checks now —
// re-running yesterday is meaningless); a stall across buckets is reported as skipped_buckets.
// Why not lib/schedules/schedule.ts: it only knows daily|weekly (:11) and its run key is date-only.

export type SiteWatchFrequency = "hourly" | "every_6h" | "daily" | "update_only";

export interface RunBucket {
  key: string;
  start: Date;
  lengthMs: number;
}

const HOUR = 3600 * 1000;

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The bucket `now` falls in, or null for update_only (never due by the clock).
 * daily: the 24h window starting at hour_utc, so a heartbeat that missed hour_utc still runs within
 * the same window, and a heartbeat right after midnight still belongs to the previous window.
 */
export function bucketFor(targetId: string, frequency: SiteWatchFrequency, hourUtc: number, now: Date): RunBucket | null {
  const t = now.getTime();
  switch (frequency) {
    case "hourly": {
      const start = new Date(Math.floor(t / HOUR) * HOUR);
      return { key: `sw-${targetId}-${ymd(start)}${String(start.getUTCHours()).padStart(2, "0")}`, start, lengthMs: HOUR };
    }
    case "every_6h": {
      const start = new Date(Math.floor(t / (6 * HOUR)) * 6 * HOUR);
      return { key: `sw-${targetId}-${ymd(start)}-q${start.getUTCHours() / 6}`, start, lengthMs: 6 * HOUR };
    }
    case "daily": {
      const shifted = new Date(t - hourUtc * HOUR);
      const day = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
      return { key: `sw-${targetId}-d${ymd(shifted)}`, start: new Date(day + hourUtc * HOUR), lengthMs: 24 * HOUR };
    }
    case "update_only":
      return null;
  }
}

/** Whole buckets between the last completed one and the current one (0 when none or unknown). */
export function skippedBuckets(lastStart: Date | null, current: RunBucket): number {
  if (!lastStart) return 0;
  const n = Math.floor((current.start.getTime() - lastStart.getTime()) / current.lengthMs) - 1;
  return Math.max(0, n);
}

// Pure "is this tenant's crawl due right now?" logic (migration 0081 collection_schedules).
//
// Kept separate from schedule-store.ts (which reads the DB) and the API route that calls this
// (which does the actual fan-out): a scheduling bug is a date-arithmetic bug, and date arithmetic
// deserves tests that run in milliseconds against a fixed clock, not tests that need a database.
//
// day encoding: JS Date#getUTCDay() (0=Sunday..6=Saturday) everywhere in this module and in the
// collection_schedules table — the same encoding in both places means never translating between
// them, which is exactly the class of bug ("off by one weekday") that a translation table invites.

export interface Schedule {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hourUtc: number;
  /** Only consulted when frequency === "weekly". */
  dayOfWeekUtc: number;
  /** ISO 8601, or null if this schedule has never fired. */
  lastRunAt: string | null;
}

function isSameUtcDate(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True exactly during the one hour, once per cadence, that this schedule should fire.
 *
 * Called from an hourly heartbeat (Trigger.dev cron, `0 * * * *`), so "current UTC hour equals
 * hourUtc" is true for a whole hour — the lastRunAt check is what stops a heartbeat that fires
 * twice in the same hour (a retry, a redeploy overlap) from running the crawl twice. It is deliberately
 * NOT millisecond-precise: a schedule set for hour 3 and checked at 03:47 is still due.
 */
export function isDueNow(schedule: Schedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (now.getUTCHours() !== schedule.hourUtc) return false;
  if (schedule.frequency === "weekly" && now.getUTCDay() !== schedule.dayOfWeekUtc) return false;
  if (!schedule.lastRunAt) return true;

  const last = new Date(schedule.lastRunAt);
  if (Number.isNaN(last.getTime())) return true; // an unparseable timestamp must not wedge the schedule off forever

  if (schedule.frequency === "daily") return !isSameUtcDate(last, now);
  // weekly: a full week (minus a small guard band) must have passed. Not "different ISO week",
  // which would treat Sunday-then-Monday as two different weeks one calendar day apart.
  return now.getTime() - last.getTime() >= 6 * DAY_MS;
}

/** A stable, sortable run key for one scheduled firing — `scheduled-<org 8 chars>-<UTC date>`. */
export function scheduledRunKey(organizationId: string, now: Date): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `scheduled-${organizationId.slice(0, 8)}-${date}`;
}

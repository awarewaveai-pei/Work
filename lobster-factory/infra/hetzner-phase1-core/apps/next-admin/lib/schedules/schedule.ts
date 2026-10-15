// Pure "is this (client, job) due right now?" logic for client_schedules (migration 0097).
//
// Kept separate from store.ts (which reads the DB) and the sweep route that calls this: a scheduling
// bug is a date-arithmetic bug, and date arithmetic deserves tests against a fixed clock, not a database.
//
// day encoding: JS Date#getUTCDay() (0=Sunday..6=Saturday) here and in the table -- one encoding, no
// translation table to get off by one.

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

/** A stable run key for one scheduled firing — `scheduled-<job>-<org 8 chars>-<UTC date>`. */
export function scheduledRunKey(organizationId: string, jobKey: string, now: Date): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `scheduled-${jobKey}-${organizationId.slice(0, 8)}-${date}`;
}

/** Taipei is UTC+8 all year (no DST). The table shows and edits Taipei time; the row stores UTC. */
const TAIPEI_OFFSET_H = 8;

export function taipeiFromUtc(dayOfWeekUtc: number, hourUtc: number): { day: number; hour: number } {
  const h = hourUtc + TAIPEI_OFFSET_H;
  return { day: h >= 24 ? (dayOfWeekUtc + 1) % 7 : dayOfWeekUtc, hour: h % 24 };
}

export function utcFromTaipei(dayTaipei: number, hourTaipei: number): { dayOfWeekUtc: number; hourUtc: number } {
  const h = hourTaipei - TAIPEI_OFFSET_H;
  return { dayOfWeekUtc: h < 0 ? (dayTaipei + 6) % 7 : dayTaipei, hourUtc: (h + 24) % 24 };
}

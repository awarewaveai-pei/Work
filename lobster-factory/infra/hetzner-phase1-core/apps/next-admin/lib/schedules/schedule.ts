// Pure "is this (client, job) due right now?" logic for client_schedules (migration 0097).
//
// Kept separate from store.ts (which reads the DB) and the sweep route that calls this: a scheduling
// bug is a date-arithmetic bug, and date arithmetic deserves tests against a fixed clock, not a database.
//
// day encoding: JS Date#getUTCDay() (0=Sunday..6=Saturday) here and in the table -- one encoding, no
// translation table to get off by one.

/** client_schedules.frequency (0097; every_5m since 0121; monthly/quarterly/yearly since 0123). */
export type Frequency = "daily" | "weekly" | "every_5m" | "monthly" | "quarterly" | "yearly";

/** Frequencies that fire once per calendar period on `dayOfMonth` (quarterly: in Jan/Apr/Jul/Oct; yearly: in January). */
export const PERIODIC: readonly Frequency[] = ["monthly", "quarterly", "yearly"];

export interface Schedule {
  enabled: boolean;
  frequency: Frequency;
  hourUtc: number;
  /** Only consulted when frequency === "weekly". */
  dayOfWeekUtc: number;
  /** 1-28, a TAIPEI calendar day (0123): only consulted for monthly / quarterly / yearly. */
  dayOfMonth: number;
  /** ISO 8601, or null if this schedule has never fired. */
  lastRunAt: string | null;
}

function isSameUtcDate(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Monthly / quarterly / yearly: a firing missed on its day (host down, run failed) still fires on the next days, this
 *  many days counted from dayOfMonth, at the same hour, once per period. The window never crosses into the next month
 *  (that would serve the next period's send): a day 27 / 28 schedule gets fewer retry days in February. */
export const CATCH_UP_DAYS = 3;
/** every_5m: a firing less than this after the last one is the same firing seen twice (cron and heartbeat overlap). */
const EVERY_5M_GAP_MS = 4.5 * 60 * 1000;

/**
 * True exactly during the one hour, once per cadence, that this schedule should fire.
 *
 * Called every 5 minutes (host cron; the hourly Trigger.dev heartbeat until retired), so "current UTC hour equals
 * hourUtc" is true for a whole hour — the lastRunAt check is what stops a heartbeat that fires
 * twice in the same hour (a retry, a redeploy overlap) from running the crawl twice. It is deliberately
 * NOT millisecond-precise: a schedule set for hour 3 and checked at 03:47 is still due.
 */
export function isDueNow(schedule: Schedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (schedule.frequency === "every_5m") {
    const last = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : NaN;
    return Number.isNaN(last) || now.getTime() - last >= EVERY_5M_GAP_MS;
  }
  if (now.getUTCHours() !== schedule.hourUtc) return false;
  if (PERIODIC.includes(schedule.frequency)) return periodicDue(schedule, now);
  if (schedule.frequency === "weekly" && now.getUTCDay() !== schedule.dayOfWeekUtc) return false;
  if (!schedule.lastRunAt) return true;

  const last = new Date(schedule.lastRunAt);
  if (Number.isNaN(last.getTime())) return true; // an unparseable timestamp must not wedge the schedule off forever

  if (schedule.frequency === "daily") return !isSameUtcDate(last, now);
  // weekly: a full week (minus a small guard band) must have passed. Not "different ISO week",
  // which would treat Sunday-then-Monday as two different weeks one calendar day apart.
  return now.getTime() - last.getTime() >= 6 * DAY_MS;
}

/** Taipei wall clock as UTC fields (Taipei has no DST). */
const taipeiClock = (d: Date) => new Date(d.getTime() + TAIPEI_OFFSET_H * 3_600_000);

/** Which calendar period (Taipei) `d` falls in, for this frequency: "2026-10" / "2026-Q3" / "2026". */
function periodKey(frequency: Frequency, d: Date): string {
  const t = taipeiClock(d);
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  return frequency === "monthly" ? `${y}-${m + 1}` : frequency === "quarterly" ? `${y}-Q${Math.floor(m / 3) + 1}` : `${y}`;
}

/** Monthly / quarterly / yearly, already at the right hour: inside the period's window (its month, dayOfMonth up to
 *  CATCH_UP_DAYS days on) and not yet run in this period. A failed run leaves lastRunAt alone, so the next day retries. */
function periodicDue(schedule: Schedule, now: Date): boolean {
  const t = taipeiClock(now);
  const month = t.getUTCMonth(), day = t.getUTCDate();
  if (schedule.frequency === "quarterly" && month % 3 !== 0) return false;
  if (schedule.frequency === "yearly" && month !== 0) return false;
  if (day < schedule.dayOfMonth || day >= schedule.dayOfMonth + CATCH_UP_DAYS) return false;
  if (!schedule.lastRunAt) return true;
  const last = new Date(schedule.lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  return periodKey(schedule.frequency, last) !== periodKey(schedule.frequency, now);
}

/** A stable run key for one scheduled firing — `scheduled-<job>-<org 8 chars>-<UTC date>`, plus the 5-minute
 *  slot `HHmm` for every_5m (the claim then allows one run per slot instead of one per day). */
export function scheduledRunKey(organizationId: string, jobKey: string, now: Date, frequency: Frequency = "daily"): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const slot = frequency === "every_5m"
    ? `-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes() - (now.getUTCMinutes() % 5)).padStart(2, "0")}`
    : "";
  return `scheduled-${jobKey}-${organizationId.slice(0, 8)}-${date}${slot}`;
}

/** The clock schedules are set in (the page edits Taipei time). */
export const SCHEDULE_TZ = "Asia/Taipei";

/** Thrown by a job's run() when the moment is right by the schedule's clock but not yet by the job's own (a brand
 *  behind Taipei whose month has not ended). The sweep records nothing: no run, no error, no incident; the claim is
 *  per UTC day, so the next due day (CATCH_UP_DAYS) tries again. */
export class NotDueYet extends Error {
  constructor(why: string) { super(why); this.name = "NotDueYet"; }
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

// Wall-clock dates in a brand's time zone (organizations.default_timezone): "YYYY-MM-DD" + "HH:MM" <-> instants.
// One copy for the server (rotation slots, lib/social/rotation.ts) and the page (app/(shell)/tools/social/model.ts).

export interface ZonedParts { date: string; time: string; minutes: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** An instant as the brand sees it. */
export function zoned(iso: string | Date, tz: string): ZonedParts {
  const parts = Object.fromEntries(fmt(tz).formatToParts(typeof iso === "string" ? new Date(iso) : iso).map((p) => [p.type, p.value]));
  const hh = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hh}:${parts.minute}`, minutes: Number(hh) * 60 + Number(parts.minute) };
}

/** The instant of a wall-clock date and time in the zone (DST: the zone's own offset at that moment). */
export function instantAt(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const want = Date.UTC(y, m - 1, d, hh, mm);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = zoned(new Date(t), tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const seen = Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60);
    if (seen === want) break;
    t += want - seen;
  }
  return new Date(t).toISOString();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 1 = Monday .. 7 = Sunday (social_lists.weekdays uses the same numbering). */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** An IANA zone this runtime knows: zoned() and instantAt() throw on anything else, so a stored zone is checked first. */
export function isTimeZone(tz: string): boolean {
  if (!tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---- the zone a person READS times in (2026-11-13) ----------------------------------------------------------------
// A post's time is an instant (UTC in the database). The organisation's zone (organizations.default_timezone) is the
// zone of the RULES: repeat series, auto-publish list slots, report days, and the composer's date and time inputs. The
// display zone only changes how instants are shown; it never takes part in making one, so switching it cannot move a post.

/** The display choices, one button each: "org" = the organisation's own zone, whatever it is. */
export const DISPLAY_ZONES = ["org", "Asia/Taipei", "UTC"] as const;
export type DisplayZone = (typeof DISPLAY_ZONES)[number];
export const isDisplayZone = (v: unknown): v is DisplayZone => typeof v === "string" && (DISPLAY_ZONES as readonly string[]).includes(v);
/** The zone the page shows times in. */
export const viewZone = (choice: DisplayZone, orgTz: string): string => (choice === "org" ? orgTz : choice);
/** A wall-clock time read in one zone, as the same instant's date and time in another (a calendar cell -> the composer). */
export function rezone(date: string, time: string, from: string, to: string): { date: string; time: string } {
  const z = zoned(instantAt(date, time, from), to);
  return { date: z.date, time: z.time };
}

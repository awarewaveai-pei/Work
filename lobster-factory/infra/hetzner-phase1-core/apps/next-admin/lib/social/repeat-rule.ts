// Repeat series ("週期性安排", migration 0105): the shape social_posts.repeat holds and the times it makes. Pure, so the
// server (store.ts / rotation.ts make the children) and the page (C22's calendar) compute the same instants.
import { addDays, instantAt, weekday, zoned } from "./time";

export interface RepeatRule { freq: "day" | "week" | "month"; days?: number[]; mday?: number; end: "never" | "count"; count?: number }

/** How far ahead the children are made (SOCIAL_MANAGER_PLAN.md C20 item 4). */
export const REPEAT_DAYS = 60;

export class RepeatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepeatError";
  }
}

const KEYS = new Set(["freq", "days", "mday", "end", "count"]);
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** The rule as stored, or RepeatError. Same rule as 0105 social_repeat_ok, which refuses the rest anyway. */
export function parseRepeat(v: unknown): RepeatRule {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new RepeatError("repeat must be an object");
  const r = v as Record<string, unknown>;
  const extra = Object.keys(r).filter((k) => !KEYS.has(k));
  if (extra.length) throw new RepeatError(`repeat has unknown keys: ${extra.join(", ")}`);
  if (r.freq !== "day" && r.freq !== "week" && r.freq !== "month") throw new RepeatError("repeat.freq must be day, week or month");
  if (r.end !== "never" && r.end !== "count") throw new RepeatError("repeat.end must be never or count");
  const out: RepeatRule = { freq: r.freq, end: r.end };
  if (r.days !== undefined && r.days !== null) {
    if (!Array.isArray(r.days) || r.days.length > 7 || r.days.some((d) => !int(d, 1, 7))) throw new RepeatError("repeat.days must be weekdays 1 (Mon) .. 7 (Sun)");
    out.days = [...new Set(r.days as number[])].sort((x, y) => x - y);
  }
  if (r.freq === "week" && !out.days?.length) throw new RepeatError("a weekly repeat needs at least one day");
  if (r.mday !== undefined && r.mday !== null) {
    if (!int(r.mday, 1, 31)) throw new RepeatError("repeat.mday must be 1..31");
    out.mday = r.mday as number;
  }
  if (r.freq === "month" && out.mday === undefined) throw new RepeatError("a monthly repeat needs repeat.mday");
  if (r.count !== undefined && r.count !== null) {
    if (!int(r.count, 1, 1000)) throw new RepeatError("repeat.count must be 1..1000");
    out.count = r.count as number;
  }
  if (r.end === "count" && out.count === undefined) throw new RepeatError("repeat.end=count needs repeat.count");
  return out;
}

function matches(rule: RepeatRule, date: string): boolean {
  if (rule.freq === "day") return true;
  if (rule.freq === "week") return (rule.days ?? []).includes(weekday(date));
  return Number(date.slice(8, 10)) === rule.mday;
}

const MAX_DAYS = 20_000;   // a series anchored years back still counts from its first day; never an endless loop

/** The children's times: the days from the template's own day on that match the rule, at the template's wall-clock
 *  time in `tz`, after the template, later than `now`, at most `days` ahead. end=count counts matching days from the
 *  template's day (the template is the first when its day matches; the mock's occurrence loop counts the same way). */
export function repeatSlots(rule: RepeatRule, anchorIso: string, tz: string, now: Date, days = REPEAT_DAYS): string[] {
  const start = zoned(anchorIso, tz);
  const anchor = Date.parse(anchorIso);
  const horizon = now.getTime() + days * 86_400_000;
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < MAX_DAYS; i++) {
    const date = addDays(start.date, i);
    const at = instantAt(date, start.time, tz);
    const t = Date.parse(at);
    if (t > horizon) break;
    if (!matches(rule, date)) continue;
    n++;
    if (rule.end === "count" && n > (rule.count ?? 0)) break;
    if (t > anchor && t > now.getTime()) out.push(at);
  }
  return out;
}

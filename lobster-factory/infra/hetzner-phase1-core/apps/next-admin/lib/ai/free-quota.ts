/**
 * Free-quota usage for /ops/costs. Counts come from rows we already write (ai_call_logs for Gemini, co_verified_emails
 * for the email verifiers), so they cover calls made through this app only. A read that fails is `used: null`, never 0.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_LITE_MODEL } from "./gemini-models";
import { FREE_QUOTAS, type FreeQuota } from "./cost-model";

export interface QuotaUsage { quota: FreeQuota; used: number | null }

const PACIFIC = "America/Los_Angeles";

function partsOf(instant: number, tz: string, time: boolean): Record<string, number> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    ...(time ? { hour: "numeric", minute: "numeric", second: "numeric" } : {}),
  });
  return Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, Number(x.value)]));
}

/** Offset of `tz` from UTC at an instant, in ms (negative west of UTC). */
function tzOffsetMs(instant: number, tz: string): number {
  const p = partsOf(instant, tz, true);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** UTC instant of 00:00 US Pacific on `now`'s Pacific calendar day (DST-aware). */
export function pacificDayStartIso(now: Date): string {
  const p = partsOf(now.getTime(), PACIFIC, false);
  const utcMidnight = Date.UTC(p.year, p.month - 1, p.day);
  // 08:00 UTC is 00:00 or 01:00 Pacific on that date, before any 02:00 DST switch, so it carries the offset midnight has.
  return new Date(utcMidnight - tzOffsetMs(utcMidnight + 8 * 3600_000, PACIFIC)).toISOString();
}

export const utcDayStartIso = (now: Date): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
export const utcMonthStartIso = (now: Date): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** Start of the window in which this quota's usage counts. */
export function quotaWindowStartIso(q: FreeQuota, now: Date): string {
  if (q.id === "gemini_lite") return pacificDayStartIso(now);
  return q.period === "day" ? utcDayStartIso(now) : utcMonthStartIso(now);
}

/** Verifier usage: the call ledger (ai_call_logs, exact from 2026-11-06) or the stored verdicts (co_verified_emails, covers
 *  the earlier days), whichever is larger. Both read failing = unknown, never 0. */
export const verifierUsed = (ledger: number | null, stored: number | null): number | null =>
  ledger === null && stored === null ? null : Math.max(ledger ?? 0, stored ?? 0);

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count: n, error } = await q;
    return error || n === null ? null : n;
  } catch {
    return null;
  }
}

async function countUsed(db: SupabaseClient, q: FreeQuota, since: string): Promise<number | null> {
  if (q.id === "gemini_lite") {
    return count(db.from("ai_call_logs").select("id", { count: "exact", head: true }).like("model", `${GEMINI_LITE_MODEL}%`).gte("created_at", since));
  }
  const models = q.id === "hunter" ? ["hunter.verify", "hunter.find"] : [`${q.id}.verify`];
  const [ledger, stored] = await Promise.all([
    count(db.from("ai_call_logs").select("id", { count: "exact", head: true }).in("model", models).gte("created_at", since)),
    count(db.from("co_verified_emails").select("email", { count: "exact", head: true }).eq("provider", q.id).gte("verified_at", since)),
  ]);
  return verifierUsed(ledger, stored);
}

export async function loadFreeQuotaUsage(db: SupabaseClient, now: Date): Promise<QuotaUsage[]> {
  return Promise.all(FREE_QUOTAS.map(async (quota) => ({ quota, used: await countUsed(db, quota, quotaWindowStartIso(quota, now)) })));
}

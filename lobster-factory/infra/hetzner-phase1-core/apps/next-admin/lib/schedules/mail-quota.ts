// 「寄信額度提醒」: reads a Resend account's own usage counter and notifies once when the day or the month reaches
// MAIL_QUOTA_ALERT_RATIO of its limit. Which account an organization sends through: lib/mail/resend-accounts.ts (the one
// map); organizations sharing an account read the same number and share one notice (fingerprint per account, not org).
// API: GET https://api.resend.com/usage (docs: resend.com/docs/api-reference/usage) -> emails.daily / emails.monthly
// { used, limit (null = no cap on the plan), resets_at }. An unreadable counter throws: never read as 0 sent.
import type { JobMeta } from "./types";
import type { Notice } from "./stop-notice";
import { resendAccountFor, resendKey, sharedWith, type ResendAccount } from "@/lib/mail/resend-accounts";

export const MAIL_QUOTA_JOB_KEY = "mail_quota_watch";
/** Notify at 80% of the daily or monthly limit (operator 2026-11-26; not a per-client setting). */
export const MAIL_QUOTA_ALERT_RATIO = 0.8;
const USAGE_URL = "https://api.resend.com/usage";

export const MAIL_QUOTA_JOB: Pick<JobMeta, "key" | "label" | "description" | "cost" | "frequencies"> = {
  key: MAIL_QUOTA_JOB_KEY,
  label: "寄信額度提醒",
  description: `隨時查這家公司寄信用的 Resend 帳號今天和這個月寄了幾封；到上限的 ${MAIL_QUOTA_ALERT_RATIO * 100}% 就通知（每日、每月額度各自一天最多通知一次）。幾家公司共用同一個帳號時，看到的是同一個數字，並寫明和誰共用。`,
  cost: "免費（只讀 Resend 的用量，不寄信、不用 AI）。",
  // every_5m: the free plan's 100 a day can be used up within an hour; a once-a-day look would come too late
  frequencies: [{ value: "every_5m", label: "每 5 分鐘", usesHour: false, usesDay: false }],
};

type Env = Record<string, string | undefined>;

/** Why it cannot run for this organization; null = it can. */
export function mailQuotaUnavailable(orgSlug: string | null | undefined, env: Env): string | null {
  const account = resendAccountFor(orgSlug);
  if (!account) return "沒有對應的寄信帳號";
  if (!resendKey(account, env)) return `主機沒有設定${account.label}的金鑰`;
  return null;
}

export interface QuotaPeriod { used: number; limit: number | null }
export interface MailUsage { daily: QuotaPeriod; monthly: QuotaPeriod }

function period(p: unknown): QuotaPeriod | null {
  const o = p as { used?: unknown; limit?: unknown } | null;
  if (!o || typeof o.used !== "number" || !Number.isFinite(o.used)) return null;
  if (o.limit !== null && (typeof o.limit !== "number" || !Number.isFinite(o.limit) || o.limit <= 0)) return null;
  return { used: o.used, limit: o.limit as number | null };
}

/** One read of the account's counter. Throws on timeout, non-2xx or a body without the numbers; the key never enters a message. */
export async function fetchMailUsage(key: string, fetchImpl: typeof fetch = fetch): Promise<MailUsage> {
  let res: Response;
  try {
    res = await fetchImpl(USAGE_URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new Error(`mail_quota_watch:unreachable:${e instanceof Error ? e.name : "error"}`);
  }
  const body = (await res.json().catch(() => null)) as { name?: string; emails?: { daily?: unknown; monthly?: unknown } } | null;
  if (!res.ok) throw new Error(`mail_quota_watch:http_${res.status}:${String(body?.name ?? "none").slice(0, 60)}`);
  const daily = period(body?.emails?.daily);
  const monthly = period(body?.emails?.monthly);
  if (!daily || !monthly) throw new Error("mail_quota_watch:unreadable_body");
  return { daily, monthly };
}

const PERIOD_TEXT = { daily: "今日", monthly: "本月" } as const;

export function quotaNotice(account: ResendAccount, names: string[], which: "daily" | "monthly", p: QuotaPeriod, utcDay: string): Notice {
  const who = names.join("、");
  const pct = Math.floor((p.used / p.limit!) * 100);
  return {
    jobKey: MAIL_QUOTA_JOB_KEY,
    // per account, period and UTC day: the organizations on one account share it. Resend's docs disagree on the daily window
    // (knowledge base: UTC calendar day; /usage page: rolling 24 h); a UTC-day key notifies at most once a day either way
    fingerprint: `${MAIL_QUOTA_JOB_KEY}:${account.id}:${which}:${utcDay}`,
    title: `寄信額度快用完：${account.label}${PERIOD_TEXT[which]}已寄 ${p.used}/${p.limit}（${pct}%）`,
    message: `${account.label}（${who} 共用）${PERIOD_TEXT[which]}已寄 ${p.used} 封，上限 ${p.limit} 封（${pct}%）。\n到上限後這個帳號的信都寄不出去。\n用量可到 Resend 後台的 Usage 頁查看。`,
    raw: { account: account.id, period: which, used: p.used, limit: p.limit },
  };
}

export interface MailQuotaDeps {
  orgSlug: string | null;
  env: Env;
  fetch?: typeof fetch;
  /** Display names by slug; a missing one shows the slug. */
  orgNames(slugs: readonly string[]): Promise<Map<string, string>>;
  /** True = this fingerprint was already raised (an ops_incidents row exists). */
  alreadyNotified(fingerprint: string): Promise<boolean>;
  raise(n: Notice): Promise<void>;
  now?: Date;
}

const show = (p: QuotaPeriod) => `${p.used}/${p.limit ?? "不限"}`;

export async function runMailQuotaWatch(d: MailQuotaDeps): Promise<string> {
  const account = resendAccountFor(d.orgSlug);
  // same answer as unavailable(): a row left enabled on an organization without an account is skipped, not an incident
  // every 5 minutes (cs_chatwoot_baseline does the same); a missing key is a host fault and is raised
  if (!account) return "skipped: 沒有對應的寄信帳號";
  const why = mailQuotaUnavailable(d.orgSlug, d.env);
  if (why) throw new Error(`mail_quota_watch:not_configured:${why}`);
  const usage = await fetchMailUsage(resendKey(account, d.env)!, d.fetch);
  const names = await d.orgNames(account.orgSlugs);
  const name = (s: string) => names.get(s) ?? s;
  const utcDay = (d.now ?? new Date()).toISOString().slice(0, 10);
  const raised: string[] = [];
  for (const which of ["daily", "monthly"] as const) {
    const p = usage[which];
    if (p.limit === null || p.used < p.limit * MAIL_QUOTA_ALERT_RATIO) continue;
    const n = quotaNotice(account, account.orgSlugs.map(name), which, p, utcDay);
    if (await d.alreadyNotified(n.fingerprint)) continue;
    await d.raise(n);
    raised.push(PERIOD_TEXT[which]);
  }
  const others = sharedWith(account, d.orgSlug!).map(name);
  const head = `${account.label}${others.length ? `（與 ${others.join("、")} 共用）` : ""}`;
  return `${head}今日 ${show(usage.daily)}、本月 ${show(usage.monthly)}${raised.length ? `；已通知${raised.join("、")}達 ${MAIL_QUOTA_ALERT_RATIO * 100}%` : ""}`;
}

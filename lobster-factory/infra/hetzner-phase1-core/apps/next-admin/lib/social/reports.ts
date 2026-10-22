// 報表管理 (SOCIAL_MANAGER_PLAN.md C25): saved reports (0105 social_reports; PDF only in V1 = the page prints), the numbers
// a report shows, and the monthly send. Every number comes from lib/social/metrics.ts: summarize() for sums and rates,
// loadAnalytics() for the posts of the period -- nothing is added up here.
import { nextAdminProducts, productHost } from "@/lib/portal/doors";
import { sendMail } from "@/lib/mail/resend";
import { selectAll } from "@/lib/supabase-paging";
import { loadAnalytics, periodOf, summarize, type AnalyticsAccount, type AnalyticsPost, type DayRow, type Summary } from "./metrics";
import { presetPeriod, spanDays } from "./report-period";
import { SocialStoreError, db, fail, listBrands, listMembers } from "./store";
import { addDays, instantAt, zoned } from "./time";

/** What a report can hold. 受眾 (age, region) is V2; the mock's other four are here. */
export const REPORT_PARTS = ["sum", "plat", "top", "cmp"] as const;
export type ReportPart = (typeof REPORT_PARTS)[number];
export const COLOURS = ["a", "b", "c", "d", "e"] as const;
export type ReportColour = (typeof COLOURS)[number];
/** the longest period a report may cover: the daily rows it reads stay one bounded query */
export const MAX_DAYS = 93;
export const MONTHLY_JOB = "social_monthly_report";

export interface Report {
  id: string; name: string; period_from: string; period_to: string; format: "pdf"; colour: ReportColour;
  account_ids: string[]; sections: ReportPart[]; created_at: string; created_by: string;
}
export type ReportSpec = Pick<Report, "name" | "period_from" | "period_to" | "colour" | "account_ids" | "sections">;
const COLUMNS = "id, name, period_from, period_to, format, colour, account_ids, sections, created_at, created_by";

export async function listReports(brandId: string): Promise<Report[]> {
  const { data, error } = await db().from("social_reports").select(COLUMNS).eq("organization_id", brandId).order("created_at", { ascending: false }).limit(50);
  if (error) fail(error, "reports");
  return (data ?? []) as Report[];
}

/** One report and the brand it belongs to; the caller checks the caller's role on that brand. */
export async function getReport(id: string): Promise<(Report & { organization_id: string }) | null> {
  const { data, error } = await db().from("social_reports").select(`${COLUMNS}, organization_id`).eq("id", id).maybeSingle();
  if (error) fail(error, "report");
  return (data as (Report & { organization_id: string }) | null) ?? null;
}

export async function createReport(brandId: string, spec: ReportSpec, actor: string): Promise<string> {
  const { data, error } = await db().rpc("social_create_report", { p_org: brandId, p_report: spec, p_actor: actor });
  if (error) fail(error, "create report");
  return data as string;
}

export async function deleteReport(brandId: string, id: string, actor: string): Promise<void> {
  const { error } = await db().rpc("social_delete_report", { p_org: brandId, p_report_id: id, p_actor: actor });
  if (error) fail(error, "delete report");
}

// ---- the numbers --------------------------------------------------------------------------------------------------

export interface ReportData {
  brand: { id: string; name: string; tz: string };
  /** from..to = the report's days, prevFrom..prevTo = the same number of days before them */
  period: { from: string; to: string; prevFrom: string; prevTo: string; days: string[] };
  accounts: AnalyticsAccount[];
  total: Summary;
  perAccount: Array<{ account_id: string; kpis: Summary["kpis"] }>;
  gaps: Array<{ account_id: string; reason: string }>;
  /** channels that collect but have no daily row in the period: "nothing collected yet", which is not "the platform gives no number" */
  empty: string[];
  top: AnalyticsPost[];
}

export const TOP_POSTS = 5;

/** The numbers for `from`..`to` (brand-local days, all over) on the given channels. */
export async function loadReportData(brand: { id: string; name: string; default_timezone: string }, accountIds: readonly string[], from: string, to: string, now = new Date()): Promise<ReportData> {
  // a channel disabled after the report was made stays in it: a saved report (and the link already mailed) must not change later
  const n = spanDays(from, to);
  if (!(n >= 1 && n <= MAX_DAYS)) throw new SocialStoreError(400, `a report covers 1 to ${MAX_DAYS} days`);
  const tz = brand.default_timezone;
  if (to >= zoned(now, tz).date) throw new SocialStoreError(400, "a report covers whole days: the last day must be before today");
  const p = periodOf(addDays(to, 1), n);   // periodOf ends the day before the date it is given

  const sb = db();
  const { data: accs, error } = await sb.from("social_accounts").select("id, platform, label, status, picture, handle").eq("organization_id", brand.id).order("platform");
  if (error) fail(error, "accounts");
  const accounts = ((accs ?? []) as AnalyticsAccount[]).filter((a) => accountIds.includes(a.id));
  const ids = accounts.map((a) => a.id);
  const rows = ids.length ? await selectAll((f, t) => sb.from("social_metrics_daily").select("account_id, day, followers, reach, impressions, engagement, posts")
    .in("account_id", ids).gte("day", p.prevFrom).lte("day", p.to).order("day").order("account_id").range(f, t), (e) => { throw new SocialStoreError(500, `metrics: ${e.message}`); }) as DayRow[] : [];

  // the period's posts with their numbers: loadAnalytics reads "the n days before the date of `now`", so ask it as of the
  // morning after the last day
  // one call per chosen channel: its 200-post cap then applies to that channel, not to the brand's newest 200 on every channel
  const asOf = new Date(instantAt(addDays(to, 1), "12:00", tz));
  // (loadAnalytics lists only enabled channels and answers 404 for a disabled one: its posts are left out, its numbers stay)
  const per = (await Promise.all(ids.map((id) => loadAnalytics(brand.id, tz, id, n, asOf).catch((e) => { if (e instanceof SocialStoreError && e.status === 404) return null; throw e; })))).filter((x) => x !== null);
  const byPost = new Map<string, AnalyticsPost>();
  for (const a of per) for (const x of a.posts) if (!byPost.has(x.id)) byPost.set(x.id, x);
  const num = (v: number | null) => v ?? -1;
  const top = [...byPost.values()].filter((x) => x.account_ids.some((id) => ids.includes(id)))
    .sort((x, y) => num(y.reach) - num(x.reach) || num(y.engagement) - num(x.engagement)).slice(0, TOP_POSTS);
  return {
    brand: { id: brand.id, name: brand.name, tz },
    period: { from: p.from, to: p.to, prevFrom: p.prevFrom, prevTo: p.prevTo, days: p.days },
    accounts, total: summarize(rows, ids, p), perAccount: ids.map((id) => ({ account_id: id, kpis: summarize(rows, [id], p).kpis })),
    gaps: per.flatMap((a) => a.gaps).map((g) => ({ account_id: g.account_id, reason: g.reason })), empty: per.flatMap((a) => a.empty), top,
  };
}

// ---- the monthly send ---------------------------------------------------------------------------------------------

/** Days of a month, counted from the 1st, in which a missed run still sends last month's report (a heartbeat that was down on the 1st). */
const CATCH_UP_DAYS = 3;
const ACTOR = "system:social_monthly_report";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The job's body (lib/schedules/jobs.ts): on the 1st to 3rd of the brand's month, once per month, make last month's report over
 *  every channel and mail its link to the brand's owners and clients. The enable switch is the brand's client_schedules row. */
export async function runMonthlyReport(brandId: string, now = new Date()): Promise<string> {
  const [brand] = await listBrands([brandId]);
  if (!brand) throw new Error(`monthly_report:no brand ${brandId}`);
  const today = zoned(now, brand.default_timezone).date;
  if (Number(today.slice(8)) > CATCH_UP_DAYS) return "skipped: 只在每月 1–3 號寄";
  const { from, to } = presetPeriod(today, "lastm");
  const name = `${from.slice(0, 7)} 月報（自動寄出）`;
  // this job's own report for that month, whatever it was called later and however many reports the brand has made since
  const { data: done, error: e0 } = await db().from("social_reports").select("id").eq("organization_id", brandId).eq("created_by", ACTOR).eq("period_from", from).limit(1);
  if (e0) throw new Error(`monthly_report:lookup ${e0.message}`);
  if (done?.length) return `skipped: ${name} 已經做過`;

  const { data, error } = await db().from("social_accounts").select("id").eq("organization_id", brandId).neq("status", "disabled");
  if (error) throw new Error(`monthly_report:accounts ${error.message}`);
  const account_ids = (data ?? []).map((r: { id: string }) => r.id);
  if (!account_ids.length) return "skipped: 沒有頻道";
  const emails = (await listMembers(brandId)).filter((m) => (m.role === "owner" || m.role === "client") && m.email).map((m) => m.email as string);
  if (!emails.length) return "skipped: 沒有可寄的擁有者或客戶";
  const product = nextAdminProducts().find((p) => p.key === "social");
  if (!product) throw new Error("monthly_report:social product not registered");

  const id = await createReport(brandId, { name, period_from: from, period_to: to, colour: "a", account_ids, sections: [...REPORT_PARTS] }, ACTOR);
  const link = `https://${productHost(product)}/reports/${id}`;
  const results = await Promise.all(emails.map((email) => sendMail({
    to: email, subject: `${brand.name} ${from.slice(0, 7)} 社群成效報告`,
    text: `${brand.name} ${from} 到 ${to} 的社群成效報告做好了：\n${link}\n\n登入後打開連結，按「列印」再選「另存為 PDF」就能存下來。`,
    html: `<p>${esc(brand.name)} ${from} 到 ${to} 的社群成效報告做好了：</p><p><a href="${link}">${link}</a></p><p>登入後打開連結，按「列印」再選「另存為 PDF」就能存下來。</p>`,
  })));
  const sent = results.filter((r) => r.ok).length;
  if (!sent) {
    // nobody got it: take the report back so tomorrow's run (inside the catch-up days) tries again instead of skipping
    const why = results.map((r) => ("error" in r ? r.error : "ok")).join(",");
    try { await deleteReport(brandId, id, ACTOR); } catch (e) { throw new Error(`monthly_report:mail failed ${why}; and the report ${id} could not be taken back: ${e instanceof Error ? e.message : e}`); }
    throw new Error(`monthly_report:mail failed ${why}`);
  }
  // some got it: the report stays (the link works for them) and the failure is raised, not recorded as a success; tomorrow's run
  // skips this month, so the missed people need a resend by hand
  if (sent < emails.length) {
    const failed = results.flatMap((r, i) => ("error" in r ? [`${emails[i]}:${r.error}`] : []));
    throw new Error(`monthly_report:partial ${sent}/${emails.length} sent, not delivered: ${failed.join(",")}; report ${id}`);
  }
  return `sent ${name} to ${sent}/${emails.length}`;
}

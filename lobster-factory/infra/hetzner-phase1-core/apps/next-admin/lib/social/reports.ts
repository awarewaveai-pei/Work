// 報表管理 (SOCIAL_MANAGER_PLAN.md C25): saved reports (0105 social_reports; PDF only in V1 = the page prints), the numbers
// a report shows, and the weekly / monthly / quarterly / yearly sends. Every number comes from lib/social/metrics.ts: summarize() for sums and rates,
// loadAnalytics() for the posts of the period -- nothing is added up here.
import { nextAdminProducts, productHost } from "@/lib/portal/doors";
import { sendMail } from "@/lib/mail/resend";
import { selectAll } from "@/lib/supabase-paging";
import { loadAnalytics, periodOf, summarize, type AnalyticsAccount, type AnalyticsPost, type DayRow, type Summary } from "./metrics";
import { MAX_DAYS, REPORT_JOBS, presetPeriod, spanDays, type ReportKind } from "./report-period";
import { SocialStoreError, db, fail, listBrands, listMembers } from "./store";
import { addDays, instantAt, zoned } from "./time";
import { NotDueYet, SCHEDULE_TZ } from "@/lib/schedules/schedule";

/** What a report can hold. 受眾 (age, region) is V2; the mock's other four are here. */
export const REPORT_PARTS = ["sum", "plat", "top", "cmp"] as const;
export type ReportPart = (typeof REPORT_PARTS)[number];
export const COLOURS = ["a", "b", "c", "d", "e"] as const;
export type ReportColour = (typeof COLOURS)[number];
// REPORT_JOBS lives in the pure report-period.ts so the browser page can list the sends without importing this server module
export { MAX_DAYS, REPORT_JOBS, type ReportKind } from "./report-period";
export const MONTHLY_JOB = REPORT_JOBS.monthly.job;

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
  // every post of the period (no cap): a year can hold more than the 200 newest the analytics page shows, and the top
  // posts must be the period's best, not the best of its last weeks
  const per = (await Promise.all(ids.map((id) => loadAnalytics(brand.id, tz, id, n, asOf, Number.POSITIVE_INFINITY).catch((e) => { if (e instanceof SocialStoreError && e.status === 404) return null; throw e; })))).filter((x) => x !== null);
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

// ---- the scheduled sends -------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "2026-10-12～2026-10-18" / "2026-09" / "2026 Q3" / "2025" */
function periodLabel(kind: ReportKind, from: string, to: string): string {
  if (kind === "weekly") return `${from}～${to}`;
  if (kind === "monthly") return from.slice(0, 7);
  if (kind === "quarterly") return `${from.slice(0, 4)} Q${Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1}`;
  return from.slice(0, 4);
}

/** A report job's body (lib/schedules/jobs.ts): make the last whole week / month / quarter / year's report over every channel and
 *  mail its link to the brand's owners and clients, once per period. WHEN it runs is the brand's client_schedules row (send day,
 *  hour, on/off; isDueNow retries a missed day); this only decides WHAT and never sends one period twice. */
export async function runPeriodReport(kind: ReportKind, brandId: string, now = new Date()): Promise<string> {
  const { job: tag, preset, noun } = REPORT_JOBS[kind];
  // one actor per job: "this job's own report for that period" is looked up by it (monthly keeps its original actor)
  const ACTOR = `system:${tag}`;
  const [brand] = await listBrands([brandId]);
  if (!brand) throw new Error(`${tag}:no brand ${brandId}`);
  const brandToday = zoned(now, brand.default_timezone).date;
  // month / quarter / year: the last whole one by the schedule's clock (the send day the operator picked, Taipei time); a
  // brand behind Taipei may not have finished it -- then not yet, and a catch-up day sends it (a period is never skipped).
  // week: a weekday schedule has no catch-up days, so it reports the brand's own last whole week (a brand behind Taipei
  // gets it a week later, never skips one).
  const { from, to } = presetPeriod(kind === "weekly" ? brandToday : zoned(now, SCHEDULE_TZ).date, preset);
  if (to >= brandToday) throw new NotDueYet(`${tag}: ${to} is not over yet in ${brand.default_timezone}`);
  const label = periodLabel(kind, from, to);
  const name = `${label} ${noun}（自動寄出）`;
  // this job's own report for that month, whatever it was called later and however many reports the brand has made since
  const { data: done, error: e0 } = await db().from("social_reports").select("id").eq("organization_id", brandId).eq("created_by", ACTOR).eq("period_from", from).limit(1);
  if (e0) throw new Error(`${tag}:lookup ${e0.message}`);
  if (done?.length) return `skipped: ${name} 已經做過`;

  const { data, error } = await db().from("social_accounts").select("id").eq("organization_id", brandId).neq("status", "disabled");
  if (error) throw new Error(`${tag}:accounts ${error.message}`);
  const account_ids = (data ?? []).map((r: { id: string }) => r.id);
  if (!account_ids.length) return "skipped: 沒有頻道";
  const emails = (await listMembers(brandId)).filter((m) => (m.role === "owner" || m.role === "client") && m.email).map((m) => m.email as string);
  if (!emails.length) return "skipped: 沒有可寄的擁有者或客戶";
  const product = nextAdminProducts().find((p) => p.key === "social");
  if (!product) throw new Error(`${tag}:social product not registered`);

  const id = await createReport(brandId, { name, period_from: from, period_to: to, colour: "a", account_ids, sections: [...REPORT_PARTS] }, ACTOR);
  const link = `https://${productHost(product)}/reports/${id}`;
  const results = await Promise.all(emails.map((email) => sendMail({
    to: email, subject: `${brand.name} ${label} 社群${noun}`,
    text: `${brand.name} ${from} 到 ${to} 的社群${noun}做好了：\n${link}\n\n登入後打開連結，按「列印」再選「另存為 PDF」就能存下來。`,
    html: `<p>${esc(brand.name)} ${from} 到 ${to} 的社群${noun}做好了：</p><p><a href="${link}">${link}</a></p><p>登入後打開連結，按「列印」再選「另存為 PDF」就能存下來。</p>`,
  })));
  const sent = results.filter((r) => r.ok).length;
  if (!sent) {
    // nobody got it: take the report back so the next due run (isDueNow's catch-up days, or next week) tries again
    const why = results.map((r) => ("error" in r ? r.error : "ok")).join(",");
    try { await deleteReport(brandId, id, ACTOR); } catch (e) { throw new Error(`${tag}:mail failed ${why}; and the report ${id} could not be taken back: ${e instanceof Error ? e.message : e}`); }
    throw new Error(`${tag}:mail failed ${why}`);
  }
  // some got it: the report stays (the link works for them) and the failure is raised, not recorded as a success; the next run
  // skips this period, so the missed people need a resend by hand
  if (sent < emails.length) {
    const failed = results.flatMap((r, i) => ("error" in r ? [`${emails[i]}:${r.error}`] : []));
    throw new Error(`${tag}:partial ${sent}/${emails.length} sent, not delivered: ${failed.join(",")}; report ${id}`);
  }
  return `sent ${name} to ${sent}/${emails.length}`;
}

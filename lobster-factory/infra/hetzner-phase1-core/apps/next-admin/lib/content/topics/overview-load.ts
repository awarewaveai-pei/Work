// Server-side loader for the auto-content control page (AUTO_CONTENT P9.3): every query runs once here, none per row or per
// cell, and the client only draws. One client at a time (ADR 020): no client = nothing is read; a client sees only their own
// sites (the caller passes effectiveOrgId's answer and its mayRead on every site, not a front-end filter).
// A failed query throws: a table built from a half-read set would show "nothing wrong" for a site it never read.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContentDefaults } from "@/lib/content/brand-voice";
import { eventsForMonth } from "@/lib/events/for-month";
import { loadSpendRows } from "@/lib/ai/spend-loader";
import { summarizeSpend, taipeiMonthStartIso } from "@/lib/ai/spend-report";
import { planDueDeps } from "./plan-due";
import { recentTopicActual } from "./actual-cost";
import type { TopicActual } from "./cost";
import { trendGeosFor } from "./plan";
import { buildOverview, hasProblem, type OverviewRow } from "./overview";
import { monthKey, taipeiParts, type TopicSource, type TopicStatus } from "./store";

/** Step ① of a site: what the daily trend collection left for its market, and the events in this month's marketing window. */
export interface TrendCell {
  /** The site's market has no trending source (B9): the plan runs on brand and knowledge base alone. */
  noMarket: boolean;
  lastFetchedOn: string | null;
  count30: number;
  sources: string[];
  events: number;
}
export interface OverviewData {
  /** The client these numbers are for (lower case); null = no client picked, nothing was read. */
  organizationId: string | null;
  month: string; rows: OverviewRow[]; cells: Record<string, TrendCell>; spendNote: string | null;
  /** organizationId -> (formats key -> median real spend of the last 30 days' finished topics, N3); a combination without 5 topics is absent. */
  actual: Record<string, Record<string, TopicActual>>;
}

const JOB = "content_pipeline";
const fail = (what: string, e: { message: string }): never => { throw new Error(`content_overview:${what}:${e.message}`); };

async function geoStat(sb: SupabaseClient, geo: string, sinceDay: string) {
  const last = await sb.from("content_trends").select("fetched_on").eq("geo", geo).order("fetched_on", { ascending: false }).limit(1);
  if (last.error) fail("trend_last", last.error);
  const lastFetchedOn = ((last.data ?? [])[0] as { fetched_on: string } | undefined)?.fetched_on ?? null;
  const n = await sb.from("content_trends").select("id", { count: "exact", head: true }).eq("geo", geo).gte("fetched_on", sinceDay);
  if (n.error) fail("trend_count", n.error);
  let sources: string[] = [];
  if (lastFetchedOn) {
    const s = await sb.from("content_trends").select("source").eq("geo", geo).eq("fetched_on", lastFetchedOn);
    if (s.error) fail("trend_sources", s.error);
    sources = [...new Set(((s.data ?? []) as Array<{ source: string }>).map((r) => r.source))].sort();
  }
  return { lastFetchedOn, count30: n.count ?? 0, sources };
}

/** `organizationId` = the current client (the caller resolves it with effectiveOrgId: a client account always gets its own);
 *  null = none picked, and nothing is read. `mayRead(orgId)` is the caller's authorization (canAccessOrg for its request):
 *  only those organizations' sites are read further. */
export async function loadOverview(sb: SupabaseClient, organizationId: string | null, mayRead: (organizationId: string) => boolean, now = new Date()): Promise<OverviewData> {
  const month = monthKey(taipeiParts(now.toISOString()).month);
  const org = organizationId?.trim().toLowerCase() || null;
  if (!org) return { organizationId: null, month, rows: [], cells: {}, spendNote: null, actual: {} };

  const siteRes = await sb.from("wp_sites").select("id, name, organization_id, content_defaults, content_plan_attempted_at, organizations(name)").eq("active", true).eq("organization_id", org);
  if (siteRes.error) fail("sites", siteRes.error);
  const sites = ((siteRes.data ?? []) as unknown as Array<{
    id: string; name: string; organization_id: string; content_defaults: SiteContentDefaults | null; content_plan_attempted_at: string | null;
    // many-to-one = one object at runtime; the untyped client infers an array
    organizations: { name: string } | { name: string }[] | null;
  }>).filter((s) => mayRead(s.organization_id));
  const orgIds = [...new Set(sites.map((s) => s.organization_id))];
  const siteIds = sites.map((s) => s.id);
  if (!sites.length) return { organizationId: org, month, rows: [], cells: {}, spendNote: null, actual: {} };

  const schedRes = await sb.from("client_schedules").select("organization_id, enabled, daily_limit, last_error").eq("job_key", JOB).in("organization_id", orgIds);
  if (schedRes.error) fail("schedules", schedRes.error);

  // PostgREST caps one response (default 1000 rows): page until a page comes back empty
  const topics: Array<{ site_id: string; status: TopicStatus; source: TopicSource }> = [];
  for (let from = 0; ; ) {
    const t = await sb.from("content_topics").select("site_id, status, source").eq("month", month).in("site_id", siteIds).order("id").range(from, from + 999);
    if (t.error) fail("topics", t.error);
    const page = (t.data ?? []) as typeof topics;
    if (!page.length) break;
    topics.push(...page);
    from += page.length;
  }

  // N3: what a topic really costs here; a failed read gives null and the page shows the price list (never blocks the page)
  const actual: Record<string, Record<string, TopicActual>> = {};
  await Promise.all(orgIds.map(async (o) => { actual[o] = await recentTopicActual(sb, o, now); }));

  const canPlan: Record<string, boolean> = {};
  await Promise.all(orgIds.map(async (o) => { canPlan[o] = await planDueDeps(sb, o, "page:content_overview").canPlan(); }));

  // same rows and same sum as /ops/costs (spend-loader + summarizeSpend.byOrg)
  const spend = await loadSpendRows(sb, taipeiMonthStartIso(now, 0));
  const spendUsd: Record<string, number> = {};
  for (const b of summarizeSpend(spend.rows).byOrg) if (b.key) spendUsd[b.key] = b.usd;
  const spendNote = spend.error ? `花費讀取失敗：${spend.error}（數字偏低）` : spend.truncated ? "花費資料超過讀取上限（數字偏低）" : null;

  const rows = buildOverview({
    sites: sites.map((s) => {
      const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations;
      return { id: s.id, name: s.name, organizationId: s.organization_id, orgName: org?.name ?? s.organization_id, defaults: s.content_defaults, attemptedAt: s.content_plan_attempted_at };
    }),
    schedules: ((schedRes.data ?? []) as Array<{ organization_id: string; enabled: boolean; daily_limit: number | null; last_error: string | null }>)
      .map((r) => ({ organizationId: r.organization_id, enabled: r.enabled, dailyLimit: r.daily_limit, lastError: r.last_error })),
    topics: topics.map((t) => ({ siteId: t.site_id, status: t.status, source: t.source })),
    canPlan, spendUsd,
  });

  const sinceDay = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const geosOf = (s: (typeof sites)[number]) => trendGeosFor(s.content_defaults?.targetCountry);
  const stats = new Map<string, Awaited<ReturnType<typeof geoStat>>>();
  await Promise.all([...new Set(sites.flatMap(geosOf))].map(async (g) => { stats.set(g, await geoStat(sb, g, sinceDay)); }));
  // one market = that market's events plus worldwide ones; none or all markets = no country filter (as proposeMonth)
  const eventKeys = [...new Set(sites.map((s) => { const g = geosOf(s); return g.length === 1 ? g[0] : ""; }))];
  const events = new Map<string, number>();
  await Promise.all(eventKeys.map(async (k) => { events.set(k, (await eventsForMonth(sb, month, k || null, now)).length); }));

  const cells: Record<string, TrendCell> = {};
  for (const s of sites) {
    const geos = geosOf(s);
    const got = geos.map((g) => stats.get(g)!);
    cells[s.id] = {
      noMarket: geos.length === 0,
      lastFetchedOn: got.map((g) => g.lastFetchedOn).filter((d): d is string => !!d).sort().at(-1) ?? null,
      count30: got.reduce((n, g) => n + g.count30, 0),
      sources: [...new Set(got.flatMap((g) => g.sources))].sort(),
      events: events.get(geos.length === 1 ? geos[0] : "") ?? 0,
    };
  }
  return { organizationId: org, month, rows, cells, spendNote, actual };
}

/** One client of the staff landing list: a client with a content problem, found from the problem rows. */
export interface ClientProblem { organizationId: string; slug: string; name: string; lastError: string | null; failedTopics: number }
export const PROBLEM_LIST_MAX = 50;

/** The clients that have a content problem (a schedule error, or a failed topic this month), in a constant number of queries:
 *  it starts from the problem rows (few), not from the client list. `notOpened` (a per-client entitlement call) is not read
 *  here; the client's own overview page shows it. `mayRead` = the caller's canAccessOrg; only clients with an active site
 *  count. At most PROBLEM_LIST_MAX are returned, by name, with `more` set when there were others. A failed query throws. */
export async function loadClientProblems(sb: SupabaseClient, mayRead: (organizationId: string) => boolean, now = new Date()): Promise<{ clients: ClientProblem[]; more: boolean }> {
  const month = monthKey(taipeiParts(now.toISOString()).month);

  const schedRes = await sb.from("client_schedules").select("organization_id, last_error").eq("job_key", JOB).not("last_error", "is", null);
  if (schedRes.error) fail("problem_schedules", schedRes.error);
  const lastError = new Map(((schedRes.data ?? []) as Array<{ organization_id: string; last_error: string | null }>)
    .filter((r) => r.last_error).map((r) => [r.organization_id.toLowerCase(), r.last_error]));

  const failedSites = new Map<string, number>();
  for (let from = 0; ; ) {
    const t = await sb.from("content_topics").select("site_id").eq("month", month).eq("status", "failed").order("id").range(from, from + 999);
    if (t.error) fail("problem_topics", t.error);
    const page = (t.data ?? []) as Array<{ site_id: string }>;
    if (!page.length) break;
    for (const r of page) failedSites.set(r.site_id, (failedSites.get(r.site_id) ?? 0) + 1);
    from += page.length;
  }
  if (!lastError.size && !failedSites.size) return { clients: [], more: false };

  // an active site per problem: wp_sites narrows both kinds to clients that still have something running
  const siteRes = await sb.from("wp_sites").select("id, organization_id").eq("active", true)
    .or([lastError.size ? `organization_id.in.(${[...lastError.keys()].join(",")})` : "", failedSites.size ? `id.in.(${[...failedSites.keys()].join(",")})` : ""].filter(Boolean).join(","));
  if (siteRes.error) fail("problem_sites", siteRes.error);
  const sites = (siteRes.data ?? []) as Array<{ id: string; organization_id: string }>;
  const failed = new Map<string, number>();
  for (const s of sites) { const n = failedSites.get(s.id); if (n) failed.set(s.organization_id.toLowerCase(), (failed.get(s.organization_id.toLowerCase()) ?? 0) + n); }

  const ids = [...new Set(sites.map((s) => s.organization_id.toLowerCase()))]
    .filter((o) => hasProblem({ lastError: lastError.get(o) ?? null, failed: failed.get(o) ?? 0, notOpened: false }))
    .filter(mayRead);
  if (!ids.length) return { clients: [], more: false };
  const orgRes = await sb.from("organizations").select("id, slug, name").in("id", ids);
  if (orgRes.error) fail("problem_orgs", orgRes.error);
  const clients = ((orgRes.data ?? []) as Array<{ id: string; slug: string; name: string | null }>)
    .map((o): ClientProblem => ({ organizationId: o.id.toLowerCase(), slug: o.slug, name: o.name || o.slug, lastError: lastError.get(o.id.toLowerCase()) ?? null, failedTopics: failed.get(o.id.toLowerCase()) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  return { clients: clients.slice(0, PROBLEM_LIST_MAX), more: clients.length > PROBLEM_LIST_MAX };
}

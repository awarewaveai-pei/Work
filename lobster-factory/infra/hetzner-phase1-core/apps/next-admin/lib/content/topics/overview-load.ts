// Server-side loader for the auto-content control page (AUTO_CONTENT P9.3): every query runs once here, none per row or per
// cell, and the client only draws. A client sees only their own sites (canAccessOrg on every site, not a front-end filter).
// A failed query throws: a table built from a half-read set would show "nothing wrong" for a site it never read.
import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessOrg } from "@/lib/tenant-guard";
import type { SiteContentDefaults } from "@/lib/content/brand-voice";
import { eventsForMonth } from "@/lib/events/for-month";
import { loadSpendRows } from "@/lib/ai/spend-loader";
import { summarizeSpend, taipeiMonthStartIso } from "@/lib/ai/spend-report";
import { planDueDeps } from "./plan-due";
import { trendGeosFor } from "./plan";
import { buildOverview, type OverviewRow } from "./overview";
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
export interface OverviewData { month: string; rows: OverviewRow[]; cells: Record<string, TrendCell>; spendNote: string | null }

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

export async function loadOverview(sb: SupabaseClient, req: Request | { headers: Headers }, now = new Date()): Promise<OverviewData> {
  const month = monthKey(taipeiParts(now.toISOString()).month);

  const siteRes = await sb.from("wp_sites").select("id, name, organization_id, content_defaults, content_plan_attempted_at, organizations(name)").eq("active", true).not("organization_id", "is", null);
  if (siteRes.error) fail("sites", siteRes.error);
  const sites = ((siteRes.data ?? []) as unknown as Array<{
    id: string; name: string; organization_id: string; content_defaults: SiteContentDefaults | null; content_plan_attempted_at: string | null;
    // many-to-one = one object at runtime; the untyped client infers an array
    organizations: { name: string } | { name: string }[] | null;
  }>).filter((s) => canAccessOrg(req, s.organization_id));
  const orgIds = [...new Set(sites.map((s) => s.organization_id))];
  const siteIds = sites.map((s) => s.id);
  if (!sites.length) return { month, rows: [], cells: {}, spendNote: null };

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
  return { month, rows, cells, spendNote };
}

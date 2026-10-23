/**
 * Spend report SSOT — every money figure on /ops/costs (月報, 真實花費, 流水帳) is computed
 * here from ONE row set: `ai_call_logs`. Pure functions only; loading lives in spend-loader.ts.
 *
 * Invariant (spend-report.test.ts): every row lands in exactly one bucket of every breakdown and in
 * exactly one ledger group, so ledger total == real-spend total == sum of monthly totals for the
 * same rows. Do not add a second cost source (ai_image_jobs was one: never completed, always $0,
 * while image/video spend was already logged here — 2026-10-23).
 */

export type SpendKind = "text" | "image" | "video";

export interface SpendRow {
  id: string;
  created_at: string;
  route: string;
  model: string;
  vendor: string | null;
  cost_usd: number | string;
  kind: string | null;
  tool: string | null;
  job_id: string | null;
  organization_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  metadata: Record<string, unknown> | null;
}

export interface Bucket {
  key: string;
  count: number;
  usd: number;
}

export interface SpendSummary {
  count: number;
  totalUsd: number;
  inTok: number;
  outTok: number;
  /** Rows priced with the fallback rate (model missing from cost-model.ts) — figure is a guess. */
  fallbackPricedCount: number;
  fallbackPricedUsd: number;
  /** Rows logged with cost 0 (paid call with no rate) — real spend is missing from the total. */
  zeroCostCount: number;
  byKind: Bucket[];
  byVendor: Bucket[];
  byModel: Bucket[];
  byTool: Bucket[];
  byRoute: (Bucket & { kind: SpendKind; inTok: number; outTok: number })[];
  byOrg: Bucket[];
}

/** Rows written before migration 0046 have kind NULL (= text); video motion was logged as "image". */
export function spendKind(r: Pick<SpendRow, "kind" | "route">): SpendKind {
  if (r.route.startsWith("video/")) return "video";
  if (r.kind === "image" || r.kind === "video") return r.kind;
  return "text";
}

/** Feature = the tool column when present, else the route's first meaningful segment. */
export function spendFeature(r: Pick<SpendRow, "tool" | "route">): string {
  if (r.tool) return r.tool;
  const parts = r.route.replace(/^\/?(api\/)?/, "").split("/");
  if (parts[0] === "tools" && parts[1]) return parts[1];
  return parts[0] || "unknown";
}

export const usdOf = (r: Pick<SpendRow, "cost_usd">) => Number(r.cost_usd) || 0;

/** Taiwan has no DST, so a fixed +8h shift gives the Asia/Taipei calendar month. */
export function taipeiMonth(iso: string): string {
  return new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 7);
}

/** UTC instant of 00:00 Asia/Taipei on the 1st of the month `monthsBack` months before `now`'s month. */
export function taipeiMonthStartIso(now: Date, monthsBack: number): string {
  const t = new Date(now.getTime() + 8 * 3600_000);
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - monthsBack, 1) - 8 * 3600_000;
  return new Date(start).toISOString();
}

function add(map: Map<string, Bucket>, key: string, usd: number) {
  const b = map.get(key) ?? { key, count: 0, usd: 0 };
  b.count += 1;
  b.usd += usd;
  map.set(key, b);
}

const sorted = (m: Map<string, Bucket>) => [...m.values()].sort((a, b) => b.usd - a.usd || b.count - a.count);

export function summarizeSpend(rows: SpendRow[]): SpendSummary {
  const kind = new Map<string, Bucket>(), vendor = new Map<string, Bucket>(), model = new Map<string, Bucket>();
  const tool = new Map<string, Bucket>(), org = new Map<string, Bucket>();
  const route = new Map<string, Bucket & { kind: SpendKind; inTok: number; outTok: number }>();
  let totalUsd = 0, inTok = 0, outTok = 0, fallbackPricedCount = 0, fallbackPricedUsd = 0, zeroCostCount = 0;

  for (const r of rows) {
    const usd = usdOf(r);
    const k = spendKind(r);
    totalUsd += usd;
    inTok += r.input_tokens ?? 0;
    outTok += r.output_tokens ?? 0;
    if (r.metadata && r.metadata.rate_fallback === true) { fallbackPricedCount += 1; fallbackPricedUsd += usd; }
    if (usd === 0) zeroCostCount += 1;
    add(kind, k, usd);
    add(vendor, r.vendor ?? "unknown", usd);
    add(model, r.model || "unknown", usd);
    add(tool, spendFeature(r), usd);
    add(org, r.organization_id ?? "", usd);
    const rk = `${k}|${r.route}`;
    const rb = route.get(rk) ?? { key: r.route, kind: k, count: 0, usd: 0, inTok: 0, outTok: 0 };
    rb.count += 1; rb.usd += usd; rb.inTok += r.input_tokens ?? 0; rb.outTok += r.output_tokens ?? 0;
    route.set(rk, rb);
  }

  return {
    count: rows.length, totalUsd, inTok, outTok, fallbackPricedCount, fallbackPricedUsd, zeroCostCount,
    byKind: sorted(kind), byVendor: sorted(vendor), byModel: sorted(model), byTool: sorted(tool), byOrg: sorted(org),
    byRoute: [...route.values()].sort((a, b) => b.usd - a.usd || b.count - a.count),
  };
}

export interface LedgerGroup {
  /** job_id, or `row:<id>` for a call that was not part of a multi-call job. */
  key: string;
  isJob: boolean;
  tool: string;
  startedAt: string;
  totalUsd: number;
  rows: SpendRow[];
}

/** Every row joins exactly one group; rows without job_id are their own single-row group. */
export function groupLedger(rows: SpendRow[]): LedgerGroup[] {
  const map = new Map<string, LedgerGroup>();
  for (const r of rows) {
    const key = r.job_id ?? `row:${r.id}`;
    const g = map.get(key) ?? { key, isJob: r.job_id != null, tool: spendFeature(r), startedAt: r.created_at, totalUsd: 0, rows: [] };
    g.rows.push(r);
    g.totalUsd += usdOf(r);
    if (Date.parse(r.created_at) < Date.parse(g.startedAt)) g.startedAt = r.created_at;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export interface MonthReport {
  month: string; // YYYY-MM, Asia/Taipei
  summary: SpendSummary;
}

/** Newest month first. Every row lands in exactly one month. */
export function monthlyReports(rows: SpendRow[]): MonthReport[] {
  const byMonth = new Map<string, SpendRow[]>();
  for (const r of rows) {
    const m = taipeiMonth(r.created_at);
    const list = byMonth.get(m) ?? [];
    list.push(r);
    byMonth.set(m, list);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({ month, summary: summarizeSpend(list) }));
}

/** DB timestamps carry `+00:00`, JS ISO strings `Z` — compare instants, never strings. */
export function rowsSince(rows: SpendRow[], sinceIso: string): SpendRow[] {
  const since = Date.parse(sinceIso);
  return rows.filter((r) => Date.parse(r.created_at) >= since);
}

// ── Live monitoring (真實花費) ─────────────────────────────────────────────────
// 月報 answers "what did a closed month cost, and for whom"; this answers "how fast is it burning
// now, and is anything off". Same rows, different question — no vendor/client tables here.

const DAY_MS = 86400_000;
const TPE_MS = 8 * 3600_000;

/** Asia/Taipei calendar day, YYYY-MM-DD. */
export function taipeiDay(iso: string): string {
  return new Date(Date.parse(iso) + TPE_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 Asia/Taipei, `daysBack` days before `now`'s Taipei day. */
export function taipeiDayStartIso(now: Date, daysBack: number): string {
  const key = taipeiDay(now.toISOString());
  return new Date(Date.parse(`${key}T00:00:00Z`) - TPE_MS - daysBack * DAY_MS).toISOString();
}

/** A day counts as a spike when it is ≥ SPIKE_RATIO × its baseline AND ≥ the floor (so cents never alarm). */
export const DAY_SPIKE_RATIO = 3;
export const DAY_SPIKE_FLOOR_USD = 0.5;
export const ROUTE_SPIKE_RATIO = 3;
export const ROUTE_SPIKE_FLOOR_USD = 0.2;

export interface Tally { usd: number; count: number }

export type SpendAnomaly =
  | { type: "day_spike"; day: string; usd: number; baselineUsd: number }
  | { type: "route_spike"; route: string; kind: SpendKind; usd: number; baselineUsd: number }
  | { type: "fallback_priced"; count: number; usd: number }
  | { type: "zero_cost"; count: number };

export interface LiveSpend {
  today: Tally;
  last7: Tally;
  monthToDate: Tally;
  month: string;
  /** Linear pace: month-to-date ÷ elapsed fraction of the month. An estimate, labelled as one. */
  projectedMonthUsd: number;
  prevMonth: { month: string; usd: number } | null;
  /** Last 30 Taipei days, oldest first, zero days included; sums to `last30`. */
  daily: (Tally & { day: string })[];
  last30: Tally;
  /** Top routes over the last 7 days with the 7 days before, to show direction. */
  topRoutes7: { route: string; kind: SpendKind; usd: number; count: number; prevUsd: number }[];
  anomalies: SpendAnomaly[];
}

function tally(rows: SpendRow[]): Tally {
  return { usd: rows.reduce((s, r) => s + usdOf(r), 0), count: rows.length };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** `rows` must reach back to the start of the previous Taipei month (page.tsx loads 12 months). */
export function liveSpend(rows: SpendRow[], now: Date): LiveSpend {
  const todayKey = taipeiDay(now.toISOString());
  const dayStart = (key: string) => Date.parse(`${key}T00:00:00Z`) - TPE_MS;
  const todayStart = dayStart(todayKey);

  // Daily totals for 44 days: 30 shown + 14 of history for the oldest shown day's baseline.
  const byDay = new Map<string, Tally>();
  for (const r of rows) {
    const d = taipeiDay(r.created_at);
    const t = byDay.get(d) ?? { usd: 0, count: 0 };
    t.usd += usdOf(r); t.count += 1;
    byDay.set(d, t);
  }
  const keyAt = (offset: number) => new Date(todayStart + TPE_MS - offset * DAY_MS).toISOString().slice(0, 10);
  const dayTally = (offset: number) => byDay.get(keyAt(offset)) ?? { usd: 0, count: 0 };

  const daily = Array.from({ length: 30 }, (_, i) => ({ day: keyAt(29 - i), ...dayTally(29 - i) }));
  const last30 = daily.reduce((s, d) => ({ usd: s.usd + d.usd, count: s.count + d.count }), { usd: 0, count: 0 });

  const since = (ms: number) => rows.filter((r) => Date.parse(r.created_at) >= ms);
  const today = tally(since(todayStart));
  const last7Rows = since(todayStart - 6 * DAY_MS);
  const last7 = tally(last7Rows);

  const month = todayKey.slice(0, 7);
  const monthStart = Date.parse(`${month}-01T00:00:00Z`) - TPE_MS;
  const [y, m] = month.split("-").map(Number);
  const nextMonthStart = Date.UTC(y, m, 1) - TPE_MS;
  const monthToDate = tally(since(monthStart));
  const elapsed = Math.max((now.getTime() - monthStart) / (nextMonthStart - monthStart), 1 / 31 / 24);
  const projectedMonthUsd = monthToDate.usd / elapsed;

  const prevKey = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const prevRows = rows.filter((r) => taipeiMonth(r.created_at) === prevKey);
  const prevMonth = prevRows.length ? { month: prevKey, usd: tally(prevRows).usd } : null;

  // Routes: last 7 days vs the 7 before.
  const routeKey = (r: SpendRow) => `${spendKind(r)}|${r.route}`;
  const prev7Rows = rows.filter((r) => { const t = Date.parse(r.created_at); return t >= todayStart - 13 * DAY_MS && t < todayStart - 6 * DAY_MS; });
  const prevByRoute = new Map<string, number>();
  for (const r of prev7Rows) prevByRoute.set(routeKey(r), (prevByRoute.get(routeKey(r)) ?? 0) + usdOf(r));
  const curByRoute = new Map<string, { route: string; kind: SpendKind; usd: number; count: number }>();
  for (const r of last7Rows) {
    const k = routeKey(r);
    const e = curByRoute.get(k) ?? { route: r.route, kind: spendKind(r), usd: 0, count: 0 };
    e.usd += usdOf(r); e.count += 1;
    curByRoute.set(k, e);
  }
  const topRoutes7 = [...curByRoute.entries()]
    .map(([k, e]) => ({ ...e, prevUsd: prevByRoute.get(k) ?? 0 }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5);

  const anomalies: SpendAnomaly[] = [];
  // Day spikes over the last 7 days, each against the median of the 14 days before it.
  for (let off = 6; off >= 0; off--) {
    const d = dayTally(off);
    const baselineUsd = median(Array.from({ length: 14 }, (_, i) => dayTally(off + 1 + i).usd));
    if (d.usd >= DAY_SPIKE_FLOOR_USD && d.usd >= DAY_SPIKE_RATIO * baselineUsd) {
      anomalies.push({ type: "day_spike", day: keyAt(off), usd: d.usd, baselineUsd });
    }
  }
  // Route spikes today against that route's daily average over the previous 7 days.
  const todayRows = since(todayStart);
  const todayByRoute = new Map<string, { route: string; kind: SpendKind; usd: number }>();
  for (const r of todayRows) {
    const k = routeKey(r);
    const e = todayByRoute.get(k) ?? { route: r.route, kind: spendKind(r), usd: 0 };
    e.usd += usdOf(r);
    todayByRoute.set(k, e);
  }
  const prevWeek = rows.filter((r) => { const t = Date.parse(r.created_at); return t >= todayStart - 7 * DAY_MS && t < todayStart; });
  const prevWeekByRoute = new Map<string, number>();
  for (const r of prevWeek) prevWeekByRoute.set(routeKey(r), (prevWeekByRoute.get(routeKey(r)) ?? 0) + usdOf(r));
  for (const [k, e] of todayByRoute) {
    const baselineUsd = (prevWeekByRoute.get(k) ?? 0) / 7;
    if (e.usd >= ROUTE_SPIKE_FLOOR_USD && e.usd >= ROUTE_SPIKE_RATIO * baselineUsd) {
      anomalies.push({ type: "route_spike", route: e.route, kind: e.kind, usd: e.usd, baselineUsd });
    }
  }
  // Untrustworthy figures in the last 30 days.
  const q = summarizeSpend(since(todayStart - 29 * DAY_MS));
  if (q.fallbackPricedCount > 0) anomalies.push({ type: "fallback_priced", count: q.fallbackPricedCount, usd: q.fallbackPricedUsd });
  if (q.zeroCostCount > 0) anomalies.push({ type: "zero_cost", count: q.zeroCostCount });

  return { today, last7, monthToDate, month, projectedMonthUsd, prevMonth, daily, last30, topRoutes7, anomalies };
}

/**
 * Spend report SSOT — every money figure on /ops/costs (① 真實花費, ⑤ 流水帳, ⑥ 月報) is computed
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

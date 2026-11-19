/**
 * Automatic layer of the accounting FX (fx-rates.ts): daily NT$/USD closing rate from the Central Bank of the ROC
 * (Taiwan) open data, stored in `fx_daily_rates`; 月報 averages each month's days.
 *
 * Source choice (2026-11-19): Bank of Taiwan's rate CSV (rate.bot.com.tw/xrt/flcsv/...) answers every automated
 * request with a JS "Challenge Validation" page (HTTP 200 text/html) — we do not get past bot checks, so it is not used.
 * CBC open data: no key, JSON, `GET https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01` (~1.3 MB, all days since
 * 1993). Use BP01D01, NOT BP01D01en: the English file stopped at 2012-05-31. Shape as fetched 2026-11-19:
 *   { meta: { last_updated, ... }, data: { structure: { Table1: [{ data: "新台幣NTD/USD" }, ...18 cols] },
 *     dataSets: [["20261030", "32.478", ...], ...] } }   — col 0 = YYYYMMDD, col i+1 = Table1[i]; "-" = no value.
 * The file is refreshed about monthly (last_updated 2026-11-02 held rows to 2026-10-30), so the running month usually
 * has no days yet and falls back until the next refresh; closed months are what the books need.
 * CBC has one interbank closing rate, about NT$0.1 off Bank of Taiwan's spot sell; actual paid amounts are reconciled
 * against vendor bills (FX2), not this figure.
 * A failed fetch or a changed shape throws — never a silent 32.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { autoMonthComplete, MIN_AUTO_DAYS, MIN_LAST_DAY } from "./fx-rates";
import { taipeiMonth, taipeiMonthStartIso } from "./spend-report";

export const CBC_FX_URL = "https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01";
export const CBC_SOURCE = "cbc_close";
/** Days kept in sync on every run: the current Taipei month and the 12 before it (the first run backfills them). */
export const SYNC_MONTHS_BACK = 12;

export interface CbcDay {
  day: string; // YYYY-MM-DD
  rate: number;
  raw: string;
}

/** Pure: the CBC BP01 JSON → USD days. Throws when the shape is not the one documented above. */
export function parseCbcBp01(json: unknown): CbcDay[] {
  const data = (json as { data?: { structure?: { Table1?: unknown }; dataSets?: unknown } } | null)?.data;
  const cols = data?.structure?.Table1;
  const rows = data?.dataSets;
  if (!Array.isArray(cols) || !Array.isArray(rows)) throw new Error("cbc_shape: data.structure.Table1 / data.dataSets missing");
  const idx = cols.findIndex((c) => typeof (c as { data?: unknown })?.data === "string" && (c as { data: string }).data.includes("NTD/USD"));
  if (idx < 0) throw new Error("cbc_shape: no NTD/USD column");
  const out: CbcDay[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || typeof r[0] !== "string" || !/^\d{8}$/.test(r[0])) throw new Error(`cbc_shape: bad row ${JSON.stringify(r).slice(0, 80)}`);
    const v = r[idx + 1];
    if (v === "-" || v === "" || v == null) continue; // no quote that day
    const rate = Number(v);
    // A NT$/USD rate outside 10..100 means the columns moved, not that the currency did.
    if (!Number.isFinite(rate) || rate < 10 || rate > 100) throw new Error(`cbc_shape: NTD/USD ${String(v)} on ${r[0]}`);
    out.push({ day: `${r[0].slice(0, 4)}-${r[0].slice(4, 6)}-${r[0].slice(6, 8)}`, rate, raw: JSON.stringify(r) });
  }
  if (out.length === 0) throw new Error("cbc_shape: no NTD/USD rows");
  return out;
}

export async function fetchCbcDays(fetchImpl: typeof fetch = fetch): Promise<CbcDay[]> {
  const res = await fetchImpl(CBC_FX_URL, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!res.ok) throw new Error(`cbc_http_${res.status}`);
  const text = (await res.text()).replace(/^\s+/, ""); // a leading BOM is whitespace to \s
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`cbc_not_json: ${text.slice(0, 60)}`);
  }
  return parseCbcBp01(json);
}

export interface FxSyncResult {
  upserted: number;
  latestDay: string | null;
}

/** Fetch once and upsert every day of the sync window (idempotent: re-running rewrites the same rows).
 *  Stale data is a failure, not a success with fewer rows: the running month may legitimately be empty (CBC refreshes
 *  about monthly), but once a month has closed its days must be there — otherwise 月報 shows that closed month at 32
 *  while the job stays green (Codex review 2026-11-19). */
export async function syncCbcRates(sb: SupabaseClient, now: Date, fetchImpl: typeof fetch = fetch): Promise<FxSyncResult> {
  const since = `${taipeiMonth(taipeiMonthStartIso(now, SYNC_MONTHS_BACK))}-01`;
  const days = (await fetchCbcDays(fetchImpl)).filter((d) => d.day >= since);
  if (days.length === 0) throw new Error(`cbc_no_days_since_${since}`);
  const latestDay = days.reduce((m, d) => (d.day > m ? d.day : m), days[0].day);
  const closedMonth = taipeiMonth(taipeiMonthStartIso(now, 1));
  const closed = days.filter((d) => d.day.startsWith(closedMonth));
  const closedLast = closed.reduce((m, d) => (d.day > m ? d.day : m), closed[0]?.day ?? `${closedMonth}-01`);
  if (!autoMonthComplete({ days: closed.length, lastDay: closedLast })) {
    throw new Error(`cbc_stale: ${closedMonth} has ${closed.length} rows, newest ${closed.length ? closedLast : "none"} (needs ≥${MIN_AUTO_DAYS} rows reaching day ${MIN_LAST_DAY})（央行尚未公布完上月資料）`);
  }
  const fetchedAt = now.toISOString();
  const { error } = await sb.from("fx_daily_rates").upsert(
    days.map((d) => ({ day: d.day, rate: d.rate, source: CBC_SOURCE, raw: d.raw, fetched_at: fetchedAt })),
    { onConflict: "day" },
  );
  if (error) throw new Error(`fx_daily_rates_upsert: ${error.message}`);
  return { upserted: days.length, latestDay };
}

/** The fx_fetch_cbc job (host clock and the 月報「立刻抓匯率」button): sync, and on failure keep one incident per month open (same fingerprint) so
 *  a missing rate is never silent. Returns the error instead of throwing; callers answer non-2xx on it. */
export async function runFxFetch(sb: SupabaseClient, now: Date, fetchImpl: typeof fetch = fetch): Promise<FxSyncResult | { error: string }> {
  try {
    return await syncCbcRates(sb, now, fetchImpl);
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e).slice(0, 300);
    const fingerprint = `schedule:fx_fetch_cbc:${taipeiMonth(now.toISOString())}`;
    const r = await ingestIncident(sb, {
      source: "schedule", external_id: fingerprint, fingerprint, signal_type: "error", severity: "medium", service: "schedules",
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      title: "會計匯率抓取失敗（央行開放資料）",
      message: `${error}（月報該月改用人工匯率或標示預設 32；修好後在 /ops/costs 月報按「立刻抓匯率」補）`,
      raw: { job_key: "fx_fetch_cbc", url: CBC_FX_URL, error }, tags: { job_key: "fx_fetch_cbc" }, client_slug: null,
    });
    if (r.error) console.error(`[fx_fetch_cbc] incident not written: ${r.error}`);
    return { error };
  }
}

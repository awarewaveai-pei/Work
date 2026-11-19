/**
 * Accounting FX for /ops/costs 月報 and its CSV. Pure functions; loading lives in fx-loader.ts.
 *
 * Invariant: a month's NT$ = that month's USD total × rateFor(month). Layers, first hit wins:
 *   1. manual  — newest `fx_rates` row for the month (append-only audit trail; never updated)
 *   2. auto    — arithmetic mean of that month's `fx_daily_rates` (external fact, with day count)
 *   3. fallback — TWD_RATE (the quoting rate), flagged so the page says the month has no accounting rate.
 * Quotes, estimates, caps and button prices keep using TWD_RATE directly; nothing here touches them.
 */
import { TWD_RATE } from "./cost-model";

export type ManualFxSource = "bot_monthly_avg" | "card_statement" | "other";
export const MANUAL_FX_SOURCES: ManualFxSource[] = ["bot_monthly_avg", "card_statement", "other"];

export const SOURCE_LABEL: Record<ManualFxSource, string> = {
  bot_monthly_avg: "臺銀月平均",
  card_statement: "信用卡帳單",
  other: "其他",
};

/** One `fx_rates` row (manual). `month` = 1st of the Asia/Taipei month, YYYY-MM-DD. */
export interface FxRate {
  id: string;
  month: string;
  base: string;
  quote: string;
  rate: number | string;
  source: ManualFxSource;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** One automatically fetched day (fx_daily_rates). `day` = YYYY-MM-DD. */
export interface FxDaily {
  day: string;
  rate: number | string;
}

export interface MonthFx {
  rate: number;
  /** `auto_partial`: fewer than MIN_AUTO_DAYS days — the running month, or a closed month the CBC file has not finished —
   *  shown but not bookable. `unavailable`: a rate table could not be read, so the real rate is unknown; TWD_RATE, not bookable. */
  source: "manual" | "auto_monthly_avg" | "auto_partial" | "fallback" | "unavailable";
  fallback: boolean;
  /** unavailable only: the read error */
  error?: string;
  /** manual only */
  manualSource?: ManualFxSource;
  createdAt?: string;
  createdBy?: string | null;
  note?: string | null;
  /** auto only: how many days were averaged */
  days?: number;
}

/** YYYY-MM key of a `month` / `day` date column. Dates are already Taipei calendar dates, so no shift. */
export const monthKey = (date: string) => date.slice(0, 7);

/** Newest manual row per month (by created_at instant, not string). */
export function latestRateByMonth(rows: FxRate[]): Map<string, FxRate> {
  const out = new Map<string, FxRate>();
  for (const r of rows) {
    const k = monthKey(r.month);
    const cur = out.get(k);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) out.set(k, r);
  }
  return out;
}

/** A month's automatic average counts only with at least this many trading days. Taiwan has 14–23 a month: the CBC file
 *  holds 14 for 2026-02 (New Year holiday), so the floor is 10 and the month-end rule below does the real work. Fewer =
 *  the month is still running or the CBC file has not finished it, so the average is shown as partial and never booked
 *  (Codex review 2026-11-19: one published day must not become a month). */
export const MIN_AUTO_DAYS = 10;
/** …and its newest day must fall on or after this day of the month: a file that stops mid-month can still hold 15 days
 *  (Codex review round 4). Taiwan's last trading day is on or after the 25th in every month. */
export const MIN_LAST_DAY = 25;

export interface AutoMonth { rate: number; days: number; /** YYYY-MM-DD */ lastDay: string }

/** Complete enough to book: at least MIN_AUTO_DAYS days and the month traded through to its end. */
export const autoMonthComplete = (a: Pick<AutoMonth, "days" | "lastDay">) => a.days >= MIN_AUTO_DAYS && Number(a.lastDay.slice(8, 10)) >= MIN_LAST_DAY;

/** Mean of each month's daily rates, with the day count and newest day. */
export function dailyAverageByMonth(rows: FxDaily[]): Map<string, AutoMonth> {
  const acc = new Map<string, { sum: number; days: number; lastDay: string }>();
  for (const r of rows) {
    const v = Number(r.rate);
    if (!(v > 0)) continue;
    const k = monthKey(r.day);
    const a = acc.get(k) ?? { sum: 0, days: 0, lastDay: r.day };
    a.sum += v; a.days += 1;
    if (r.day > a.lastDay) a.lastDay = r.day;
    acc.set(k, a);
  }
  // 4 decimals: the CSV prints this rate, and rate × USD must be reproducible by hand from the printed figure.
  return new Map([...acc].map(([k, a]) => [k, { rate: Number((a.sum / a.days).toFixed(4)), days: a.days, lastDay: a.lastDay }]));
}

/** A failed read of either table (fx-loader.ts): the layer is unknown, not empty. */
export interface FxReadErrors {
  manual?: string;
  daily?: string;
}

export interface FxTable {
  manual: Map<string, FxRate>;
  auto: Map<string, AutoMonth>;
  errors: FxReadErrors;
}

export function buildFxTable(manual: FxRate[], daily: FxDaily[] = [], errors: FxReadErrors = {}): FxTable {
  return { manual: latestRateByMonth(manual), auto: dailyAverageByMonth(daily), errors };
}

/** `month` = YYYY-MM (Asia/Taipei). A layer that could not be read makes the month `unavailable`: a month with a manual
 *  rate must never show as "not filled in" or quietly drop to the automatic average because `fx_rates` was unreadable. */
export function rateFor(month: string, t: FxTable): MonthFx {
  const unavailable = (error: string): MonthFx => ({ rate: TWD_RATE, source: "unavailable", fallback: true, error });
  if (t.errors.manual) return unavailable(t.errors.manual);
  const m = t.manual.get(month);
  if (m) {
    return { rate: Number(m.rate), source: "manual", fallback: false, manualSource: m.source, createdAt: m.created_at, createdBy: m.created_by, note: m.note };
  }
  if (t.errors.daily) return unavailable(t.errors.daily);
  const a = t.auto.get(month);
  if (a) return autoMonthComplete(a)
    ? { rate: a.rate, source: "auto_monthly_avg", fallback: false, days: a.days }
    : { rate: a.rate, source: "auto_partial", fallback: true, days: a.days };
  return { rate: TWD_RATE, source: "fallback", fallback: true };
}

/** Rate shown to 4 decimals, trailing zeros dropped (31.8500 → 31.85). */
export const fmtRate = (r: number) => String(Number(r.toFixed(4)));

/** Name of the automatic layer's figure, shown on 月報 and in the CSV. */
export const AUTO_FX_LABEL = "央行銀行間收盤月平均";

/** YYYY-MM-DD in Asia/Taipei. */
const taipeiDate = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);

/** "<rate>（<basis>）" — the same words on the page and in the CSV, so the two cannot describe a month differently. */
export function describeFx(fx: MonthFx): string {
  if (fx.source === "manual") {
    const src = fx.manualSource ? SOURCE_LABEL[fx.manualSource] : "人工";
    return `${fmtRate(fx.rate)}（人工：${src}${fx.createdAt ? `，${taipeiDate(fx.createdAt)} 填` : ""}）`;
  }
  if (fx.source === "auto_monthly_avg") return `${fmtRate(fx.rate)}（${AUTO_FX_LABEL}，${fx.days} 天）`;
  if (fx.source === "auto_partial") return `${fmtRate(fx.rate)}（${AUTO_FX_LABEL}只有 ${fx.days} 天，未滿 ${MIN_AUTO_DAYS} 天或未到月底，資料不全不可入帳）`;
  if (fx.source === "unavailable") return `${fmtRate(fx.rate)}（匯率表讀取失敗，不可入帳：${fx.error}）`;
  return `${fmtRate(fx.rate)}（預設，尚未填會計匯率）`;
}

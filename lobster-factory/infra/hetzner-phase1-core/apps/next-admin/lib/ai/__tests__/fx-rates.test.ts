import { describe, expect, it } from "vitest";
import { buildFxTable, describeFx, MIN_AUTO_DAYS, rateFor, type FxRate } from "../fx-rates";
import { TWD_RATE } from "../cost-model";
import { taipeiMonth } from "../spend-report";

const manual = (p: Partial<FxRate>): FxRate => ({
  id: "x", month: "2026-10-01", base: "USD", quote: "TWD", rate: "31.85", source: "card_statement",
  note: null, created_by: "owner:u1", created_at: "2026-11-02T00:00:00Z", ...p,
});
/** `rates[i]` becomes day i+1 of `month`. */
const days = (month: string, rates: number[]) => rates.map((rate, i) => ({ day: `${month}-${String(i + 1).padStart(2, "0")}`, rate }));
/** A complete month: MIN_AUTO_DAYS days, the last of them on the 28th (past MIN_LAST_DAY). */
const full = (month: string, rate: number) => [...days(month, Array.from({ length: MIN_AUTO_DAYS - 1 }, () => rate)), { day: `${month}-28`, rate }];

describe("accounting rate per month", () => {
  it("the newest manual row of a month wins, whatever order the rows arrive in", () => {
    const t = buildFxTable([
      manual({ id: "new", rate: "31.2", created_at: "2026-11-19T03:00:00+00:00" }),
      manual({ id: "old", rate: "30.9", created_at: "2026-11-19T02:00:00Z" }),
    ]);
    expect(rateFor("2026-10", t)).toMatchObject({ source: "manual", rate: 31.2, fallback: false });
  });

  it("manual beats the daily average, the daily average beats the fallback", () => {
    const t = buildFxTable([manual({ month: "2026-10-01", rate: "31.85" })], [...full("2026-10", 32), ...full("2026-09", 30)]);
    expect(rateFor("2026-10", t)).toMatchObject({ source: "manual", rate: 31.85 });
    expect(rateFor("2026-09", t)).toMatchObject({ source: "auto_monthly_avg", rate: 30, days: MIN_AUTO_DAYS, fallback: false });
    expect(rateFor("2026-08", t)).toEqual({ rate: TWD_RATE, source: "fallback", fallback: true });
  });

  it("the monthly average is the arithmetic mean of the days to 4 decimals, with the day count", () => {
    // days 01–08 at 31, 09–14 at 33, and the 28th at 33: 15 days reaching month end
    const t = buildFxTable([], [...days("2026-10", [31, 31, 31, 31, 31, 31, 31, 31, 33, 33, 33, 33, 33, 33]), { day: "2026-10-28", rate: 33 }]);
    expect(rateFor("2026-10", t)).toMatchObject({ source: "auto_monthly_avg", days: 15 });
    expect(rateFor("2026-10", t).rate).toBe(31.9333); // (8×31 + 7×33)/15 — printed in the CSV, so it must be the figure one can multiply by hand
  });

  it("a month with fewer than MIN_AUTO_DAYS days, or one that stops before the 25th, is partial: shown with its day count, never bookable", () => {
    // one published day must not become a month's rate (Codex review 2026-11-19)
    const one = buildFxTable([], days("2026-11", [31]));
    expect(rateFor("2026-11", one)).toEqual({ rate: 31, source: "auto_partial", fallback: true, days: 1 });
    expect(describeFx(rateFor("2026-11", one))).toContain("不可入帳");
    // 15 days that end on the 15th: the file stopped mid-month (Codex review round 4)
    const midMonth = buildFxTable([], days("2026-10", Array.from({ length: MIN_AUTO_DAYS }, () => 32)));
    expect(rateFor("2026-10", midMonth)).toMatchObject({ source: "auto_partial", fallback: true, days: MIN_AUTO_DAYS });
  });

  it("a table that could not be read makes the month unavailable (not 'not filled in', not the next layer)", () => {
    const daily = full("2026-10", 31);
    // fx_rates unreadable: October may well have a manual rate, so even the daily average must not be used
    const noManual = buildFxTable([], daily, { manual: "timeout" });
    expect(rateFor("2026-10", noManual)).toEqual({ rate: TWD_RATE, source: "unavailable", fallback: true, error: "timeout" });
    expect(describeFx(rateFor("2026-10", noManual))).toContain("不可入帳");
    // fx_daily_rates unreadable: a month with a manual rate is still fine, the others are unavailable rather than fallback
    const noDaily = buildFxTable([manual({ month: "2026-10-01" })], [], { daily: "boom" });
    expect(rateFor("2026-10", noDaily).source).toBe("manual");
    expect(rateFor("2026-09", noDaily)).toMatchObject({ source: "unavailable", error: "boom" });
  });

  it("a month is keyed by its Taipei calendar month, the same key 月報 uses", () => {
    // 2026-09-30 16:30Z = 2026-10-01 00:30 Taipei: 月報 puts it in October, so October's rate must convert it.
    const t = buildFxTable([manual({ month: "2026-10-01", rate: "31.5" })]);
    expect(rateFor(taipeiMonth("2026-09-30T16:30:00Z"), t).rate).toBe(31.5);
    expect(rateFor(taipeiMonth("2026-09-30T15:30:00Z"), t).fallback).toBe(true);
  });

  it("the basis is written out: who/when for manual, day count for auto, a warning for fallback", () => {
    const t = buildFxTable([manual({ created_at: "2026-11-18T17:00:00Z" })], full("2026-09", 31.42));
    expect(describeFx(rateFor("2026-10", t))).toBe("31.85（人工：信用卡帳單，2026-11-19 填）");
    expect(describeFx(rateFor("2026-09", t))).toContain(`${MIN_AUTO_DAYS} 天`);
    expect(describeFx(rateFor("2026-08", t))).toContain("尚未填會計匯率");
  });
});

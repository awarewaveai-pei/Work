import { describe, expect, it } from "vitest";
import { isDueNow, scheduledRunKey, taipeiFromUtc, utcFromTaipei, type Schedule } from "@/lib/schedules/schedule";

const base: Schedule = { enabled: true, frequency: "daily", hourUtc: 3, dayOfWeekUtc: 1, lastRunAt: null };

describe("isDueNow", () => {
  it("is never due when disabled, even at the exact hour", () => {
    expect(isDueNow({ ...base, enabled: false }, new Date("2026-09-14T03:05:00Z"))).toBe(false);
  });

  it("daily: fires the first time at the target hour with no prior run", () => {
    expect(isDueNow(base, new Date("2026-09-14T03:05:00Z"))).toBe(true);
  });

  it("daily: not due outside the target hour", () => {
    expect(isDueNow(base, new Date("2026-09-14T04:00:00Z"))).toBe(false);
    expect(isDueNow(base, new Date("2026-09-14T02:59:00Z"))).toBe(false);
  });

  it("daily: not due again the same UTC day, even hours later within the same hour-of-day next check", () => {
    const ranEarlierToday = { ...base, lastRunAt: "2026-09-14T03:02:00Z" };
    expect(isDueNow(ranEarlierToday, new Date("2026-09-14T03:50:00Z"))).toBe(false);
  });

  it("daily: due again the next UTC day at the same hour", () => {
    const ranYesterday = { ...base, lastRunAt: "2026-09-14T03:02:00Z" };
    expect(isDueNow(ranYesterday, new Date("2026-09-15T03:05:00Z"))).toBe(true);
  });

  it("weekly: not due on the wrong day of week, even at the right hour", () => {
    // 2026-09-14 is a Monday (dayOfWeekUtc=1); Tuesday is day 2.
    const weekly: Schedule = { ...base, frequency: "weekly", dayOfWeekUtc: 1 };
    expect(isDueNow(weekly, new Date("2026-09-15T03:05:00Z"))).toBe(false); // Tuesday
    expect(isDueNow(weekly, new Date("2026-09-14T03:05:00Z"))).toBe(true); // Monday
  });

  it("weekly: not due again until ~6 days have passed", () => {
    const weekly: Schedule = { ...base, frequency: "weekly", dayOfWeekUtc: 1, lastRunAt: "2026-09-14T03:05:00Z" };
    expect(isDueNow(weekly, new Date("2026-09-16T03:05:00Z"))).toBe(false); // 2 days later, still Wed not Mon anyway
    expect(isDueNow(weekly, new Date("2026-09-21T03:05:00Z"))).toBe(true); // next Monday, 7 days later
  });

  it("an unparseable lastRunAt does not permanently disable the schedule", () => {
    expect(isDueNow({ ...base, lastRunAt: "not-a-date" }, new Date("2026-09-14T03:05:00Z"))).toBe(true);
  });

  it("scheduledRunKey is stable for the same org+job+day and differs by day and by job", () => {
    const org = "11111111-1111-4111-8111-111111111111";
    const a = scheduledRunKey(org, "collect_crawl", new Date("2026-09-14T03:05:00Z"));
    const b = scheduledRunKey(org, "collect_crawl", new Date("2026-09-14T23:59:00Z"));
    const c = scheduledRunKey(org, "collect_crawl", new Date("2026-09-15T00:01:00Z"));
    expect(a).toBe("scheduled-collect_crawl-11111111-20260914");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(scheduledRunKey(org, "other_job", new Date("2026-09-14T03:05:00Z"))).not.toBe(a);
  });
});

describe("every_5m (the host cron calls run-due every 5 minutes)", () => {
  const five: Schedule = { ...base, frequency: "every_5m", hourUtc: 0 };
  it("ignores hour and day, and is due with no prior run", () => {
    expect(isDueNow(five, new Date("2026-09-15T17:40:00Z"))).toBe(true);
  });
  it("a firing within 4.5 minutes of the last run is the same firing seen twice", () => {
    const ran = { ...five, lastRunAt: "2026-09-15T17:40:10Z" };
    expect(isDueNow(ran, new Date("2026-09-15T17:43:00Z"))).toBe(false);
    expect(isDueNow(ran, new Date("2026-09-15T17:45:00Z"))).toBe(true);
  });
  it("the run key names the 5-minute slot, so the claim allows one run per slot", () => {
    const org = "aaaaaaaa-0000-4000-8000-000000000001";
    const k = (t: string) => scheduledRunKey(org, "content_pipeline", new Date(t), "every_5m");
    expect(k("2026-09-15T17:40:00Z")).toBe("scheduled-content_pipeline-aaaaaaaa-20260915-1740");
    expect(k("2026-09-15T17:44:59Z")).toBe(k("2026-09-15T17:40:00Z"));
    expect(k("2026-09-15T17:45:00Z")).not.toBe(k("2026-09-15T17:44:59Z"));
    expect(scheduledRunKey(org, "collect_crawl", new Date("2026-09-15T17:40:00Z"))).toBe("scheduled-collect_crawl-aaaaaaaa-20260915");
  });
});

describe("Taipei <-> UTC (the table edits Taipei time, the row stores UTC)", () => {
  it("Monday 03 UTC is Monday 11 Taipei; Sunday 20 UTC is Monday 04 Taipei", () => {
    expect(taipeiFromUtc(1, 3)).toEqual({ day: 1, hour: 11 });
    expect(taipeiFromUtc(0, 20)).toEqual({ day: 1, hour: 4 });
    expect(taipeiFromUtc(6, 16)).toEqual({ day: 0, hour: 0 });
  });

  it("round-trips every weekday and hour", () => {
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const u = utcFromTaipei(d, h);
        expect(taipeiFromUtc(u.dayOfWeekUtc, u.hourUtc)).toEqual({ day: d, hour: h });
      }
    }
  });
});

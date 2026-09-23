// C2 run buckets (SITE_WATCH_MASTER_PLAN.md §4.2): each bucket runs at most once, only the current
// bucket runs, a stall is reported as skipped_buckets. Acceptance matrix #7 and #12.
import { describe, expect, it } from "vitest";
import { isDue } from "@/lib/site-watch/runner";
import { bucketFor, skippedBuckets } from "@/lib/site-watch/runKey";

const T = "00000000-0000-0000-0000-00000000000a";
const at = (iso: string) => new Date(iso);
const key = (freq: Parameters<typeof bucketFor>[1], hour: number, iso: string) => bucketFor(T, freq, hour, at(iso))!.key;

describe("bucketFor — key formats", () => {
  it("hourly: one bucket per UTC hour", () => {
    expect(key("hourly", 22, "2026-09-23T13:59:59Z")).toBe(`sw-${T}-2026092313`);
    expect(key("hourly", 22, "2026-09-23T14:00:00Z")).toBe(`sw-${T}-2026092314`);
  });

  it("every_6h: quarters of the UTC day", () => {
    expect(key("every_6h", 22, "2026-09-23T05:59:59Z")).toBe(`sw-${T}-20260923-q0`);
    expect(key("every_6h", 22, "2026-09-23T06:00:00Z")).toBe(`sw-${T}-20260923-q1`);
    expect(key("every_6h", 22, "2026-09-23T23:59:59Z")).toBe(`sw-${T}-20260923-q3`);
  });

  it("daily: the 24h window starts at hour_utc, so just after midnight still belongs to yesterday", () => {
    expect(key("daily", 22, "2026-09-23T22:05:00Z")).toBe(`sw-${T}-d20260923`);
    expect(key("daily", 22, "2026-09-24T00:05:00Z")).toBe(`sw-${T}-d20260923`);
    expect(key("daily", 22, "2026-09-24T21:59:59Z")).toBe(`sw-${T}-d20260923`);
    expect(key("daily", 22, "2026-09-24T22:00:00Z")).toBe(`sw-${T}-d20260924`);
    const b = bucketFor(T, "daily", 22, at("2026-09-24T03:00:00Z"))!;
    expect(b.start.toISOString()).toBe("2026-09-23T22:00:00.000Z");
    expect(b.lengthMs).toBe(24 * 3600 * 1000);
  });

  it("daily across a month and a year boundary", () => {
    expect(key("daily", 22, "2026-10-01T00:30:00Z")).toBe(`sw-${T}-d20260930`);
    expect(key("daily", 22, "2027-01-01T01:00:00Z")).toBe(`sw-${T}-d20261231`);
    expect(key("daily", 0, "2026-12-31T23:59:59Z")).toBe(`sw-${T}-d20261231`);
  });

  it("update_only is never due by the clock", () => {
    expect(bucketFor(T, "update_only", 22, at("2026-09-23T22:05:00Z"))).toBeNull();
    expect(isDue({ id: T, frequency: "update_only", hour_utc: 22, last_completed_run_key: null }, at("2026-09-23T22:05:00Z"))).toBe(false);
  });
});

describe("matrix #7 — daily target, 24 hourly heartbeats from 22:05", () => {
  it("runs once; the other 23 heartbeats of the same window are not due", () => {
    const target = { id: T, frequency: "daily" as const, hour_utc: 22, last_completed_run_key: null as string | null };
    let runs = 0;
    for (let i = 0; i < 24; i++) {
      const now = new Date(Date.parse("2026-09-23T22:05:00Z") + i * 3600 * 1000);
      if (isDue(target, now)) {
        runs++;
        target.last_completed_run_key = bucketFor(T, "daily", 22, now)!.key;
      }
    }
    expect(runs).toBe(1);
  });

  it("failures at 22:00 and 23:00 are made up at 00:05 the next day — still under the previous day's key", () => {
    const target = { id: T, frequency: "daily" as const, hour_utc: 22, last_completed_run_key: `sw-${T}-d20260922` };
    // 22:05 and 23:05 on the 23rd did not complete (renderer down): nothing recorded as completed.
    const makeUp = at("2026-09-24T00:05:00Z");
    expect(isDue(target, makeUp)).toBe(true);
    expect(bucketFor(T, "daily", 22, makeUp)!.key).toBe(`sw-${T}-d20260923`);
  });
});

describe("matrix #12 — three days without a heartbeat", () => {
  it("the current bucket runs once and reports the two skipped in between", () => {
    const lastStart = at("2026-09-20T22:00:00Z");
    const current = bucketFor(T, "daily", 22, at("2026-09-23T22:05:00Z"))!;
    expect(skippedBuckets(lastStart, current)).toBe(2);
    const target = { id: T, frequency: "daily" as const, hour_utc: 22, last_completed_run_key: current.key };
    expect(isDue(target, at("2026-09-23T23:05:00Z"))).toBe(false);
  });

  it("hourly and 6-hourly count skipped buckets in their own unit; no history or adjacent bucket = 0", () => {
    expect(skippedBuckets(at("2026-09-23T10:00:00Z"), bucketFor(T, "hourly", 0, at("2026-09-23T13:30:00Z"))!)).toBe(2);
    expect(skippedBuckets(at("2026-09-23T00:00:00Z"), bucketFor(T, "every_6h", 0, at("2026-09-23T18:30:00Z"))!)).toBe(2);
    expect(skippedBuckets(null, bucketFor(T, "hourly", 0, at("2026-09-23T13:30:00Z"))!)).toBe(0);
    expect(skippedBuckets(at("2026-09-23T12:00:00Z"), bucketFor(T, "hourly", 0, at("2026-09-23T13:30:00Z"))!)).toBe(0);
  });
});

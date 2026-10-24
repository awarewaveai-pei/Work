// store.ts's own Supabase call shapes — separate from schedule.test.ts, which covers the pure
// isDueNow() date arithmetic with no database involved at all.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], client: null as unknown }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => db.client,
}));

const { listSchedules, listEnabledSchedules, upsertSchedule, setScheduleEnabled, claimScheduleRun, recordScheduleRun, recordScheduleError } = await import("@/lib/schedules/store");

function matches(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

function fakeClient(rows: Record<string, unknown>[]) {
  return {
    from() {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      let orNotKey: string | null = null; // the claim's `last_run_key.is.null,last_run_key.neq.<key>`
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return api;
        },
        update: (p: Record<string, unknown>) => {
          patch = p;
          return api;
        },
        or: (expr: string) => {
          const m = expr.match(/^last_run_key\.is\.null,last_run_key\.neq\.(.+)$/);
          if (!m) throw new Error(`fake client: unexpected or(${expr})`);
          orNotKey = m[1];
          return api;
        },
        then: (resolve: (v: { data: unknown; error: null }) => void) => {
          const hit = rows.filter((r) => matches(r, filters) && (orNotKey === null || r.last_run_key == null || r.last_run_key !== orNotKey));
          if (patch) hit.forEach((r) => Object.assign(r, patch));
          resolve({ data: hit, error: null });
        },
        upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
          const keys = opts.onConflict.split(",");
          const idx = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          const stored = { ...(idx >= 0 ? rows[idx] : {}), ...row };
          if (idx >= 0) rows[idx] = stored;
          else rows.push(stored);
          return { select: () => ({ single: () => Promise.resolve({ data: stored, error: null }) }) };
        },
      };
      return api;
    },
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const base = { frequency: "daily" as const, hourUtc: 3, dayOfWeekUtc: 1, dayOfMonth: 1, updatedBy: "owner:test" };

beforeEach(() => {
  db.rows = [];
  db.client = fakeClient(db.rows);
});

describe("schedules store", () => {
  it("upsertSchedule rejects an out-of-range hour before ever touching the client", async () => {
    const r = await upsertSchedule({ ...base, organizationId: ORG, jobKey: "collect_crawl", enabled: true, hourUtc: 99 });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("hour_utc_out_of_range");
    expect(db.rows).toHaveLength(0);
  });

  it("one client can hold one row per job; the same (client, job) upserts in place", async () => {
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "collect_crawl", enabled: true });
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "other_job", enabled: false });
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "collect_crawl", enabled: true, frequency: "weekly", dayOfWeekUtc: 2 });

    const rows = await listSchedules(ORG);
    expect(rows).toHaveLength(2);
    expect(rows.find((s) => s.jobKey === "collect_crawl")).toMatchObject({ enabled: true, frequency: "weekly", dayOfWeekUtc: 2 });
  });

  it("a write that leaves out the send day keeps the row's day (a page loaded before 0123)", async () => {
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "social_monthly_report", enabled: true, frequency: "monthly", dayOfMonth: 15 });
    const { dayOfMonth: _omit, ...noDay } = base;
    await upsertSchedule({ ...noDay, organizationId: ORG, jobKey: "social_monthly_report", enabled: false, frequency: "monthly" });
    expect((await listSchedules(ORG))[0]).toMatchObject({ enabled: false, dayOfMonth: 15 });
  });

  it("setScheduleEnabled flips only the switch: a send day and hour set elsewhere survive; no row = the job's defaults", async () => {
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "social_monthly_report", enabled: true, frequency: "monthly", hourUtc: 5, dayOfMonth: 15 });
    const defaults = { frequency: "monthly" as const, hourUtc: 1, dayOfWeekUtc: 1, dayOfMonth: 1 };
    await setScheduleEnabled(ORG, "social_monthly_report", false, "editor:social", defaults);
    expect((await listSchedules(ORG))[0]).toMatchObject({ enabled: false, hourUtc: 5, dayOfMonth: 15 });
    await setScheduleEnabled(ORG_B, "social_monthly_report", true, "editor:social", defaults);
    expect((await listSchedules(ORG_B))[0]).toMatchObject({ enabled: true, frequency: "monthly", hourUtc: 1, dayOfMonth: 1 });
  });

  it("listEnabledSchedules excludes disabled rows", async () => {
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "collect_crawl", enabled: true });
    await upsertSchedule({ ...base, organizationId: ORG_B, jobKey: "collect_crawl", enabled: false });

    const enabled = await listEnabledSchedules();
    expect(enabled.map((s) => s.organizationId)).toEqual([ORG]);
  });

  it("claimScheduleRun has exactly one winner per (client, job, run key)", async () => {
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "collect_crawl", enabled: true });
    expect(await claimScheduleRun(ORG, "collect_crawl", "scheduled-collect_crawl-11111111-20260914")).toBe(true);
    expect(await claimScheduleRun(ORG, "collect_crawl", "scheduled-collect_crawl-11111111-20260914")).toBe(false);
    expect(await claimScheduleRun(ORG, "collect_crawl", "scheduled-collect_crawl-11111111-20260915")).toBe(true);
  });

  it("an error is recorded without last_run_at, and the next success clears it", async () => {
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "collect_crawl", enabled: true });
    await upsertSchedule({ ...base, organizationId: ORG, jobKey: "other_job", enabled: true });

    await recordScheduleError(ORG, "collect_crawl", "boom");
    let row = (await listSchedules(ORG)).find((s) => s.jobKey === "collect_crawl");
    expect(row).toMatchObject({ lastError: "boom", lastRunAt: undefined });
    expect(row?.lastErrorAt).toBeTruthy();

    await recordScheduleRun(ORG, "collect_crawl");
    row = (await listSchedules(ORG)).find((s) => s.jobKey === "collect_crawl");
    expect(row).toMatchObject({ lastError: null, lastErrorAt: null, enabled: true });
    expect(row?.lastRunAt).toBeTruthy();
    // the other job of the same client is untouched
    expect((await listSchedules(ORG)).find((s) => s.jobKey === "other_job")?.lastRunAt).toBeUndefined();
  });

  it("without a Supabase client every read and run write throws — 'no rows' never stands in for 'could not read'", async () => {
    db.client = null;
    await expect(listSchedules()).rejects.toThrow(/no_supabase_client/);
    await expect(listEnabledSchedules()).rejects.toThrow(/no_supabase_client/);
    await expect(claimScheduleRun(ORG, "collect_crawl", "x")).rejects.toThrow(/no_supabase_client/);
    await expect(recordScheduleRun(ORG, "collect_crawl")).rejects.toThrow(/no_supabase_client/);
  });
});

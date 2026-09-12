// schedule-store.ts's own Supabase call shapes — separate from collect-schedule.test.ts, which
// covers the pure isDueNow() date arithmetic with no database involved at all.

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], client: null as unknown }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => db.client,
}));

const { getSchedule, listEnabledSchedules, upsertSchedule, recordScheduleRun } = await import("@/lib/collect/schedule-store");

function matches(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

function fakeClient(rows: Record<string, unknown>[]) {
  return {
    from() {
      const state = { filters: {} as Record<string, unknown> };
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          state.filters[k] = v;
          return api;
        },
        maybeSingle: () => {
          const found = rows.find((r) => matches(r, state.filters));
          return Promise.resolve({ data: found ?? null, error: null });
        },
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: rows.filter((r) => matches(r, state.filters)), error: null }),
        upsert: (row: Record<string, unknown>) => {
          const idx = rows.findIndex((r) => r.organization_id === row.organization_id);
          const stored = { ...(idx >= 0 ? rows[idx] : {}), ...row };
          if (idx >= 0) rows[idx] = stored;
          else rows.push(stored);
          return { select: () => ({ single: () => Promise.resolve({ data: stored, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (k: string, v: unknown) => {
            const row = rows.find((r) => r[k] === v);
            if (row) Object.assign(row, patch);
            return Promise.resolve({ data: row ?? null, error: null });
          },
        }),
      };
      return api;
    },
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  db.rows = [];
  db.client = fakeClient(db.rows);
});

describe("schedule-store", () => {
  it("upsertSchedule rejects an out-of-range hour before ever touching the client", async () => {
    const r = await upsertSchedule({ organizationId: ORG, enabled: true, frequency: "daily", hourUtc: 99, dayOfWeekUtc: 1, updatedBy: "owner:test" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("hour_utc_out_of_range");
  });

  it("upsertSchedule writes, and getSchedule reads the same row back mapped to camelCase", async () => {
    const written = await upsertSchedule({ organizationId: ORG, enabled: true, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 2, updatedBy: "owner:test" });
    expect(written.ok).toBe(true);

    const read = await getSchedule(ORG);
    expect(read).toMatchObject({ organizationId: ORG, enabled: true, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 2 });
  });

  it("listEnabledSchedules excludes disabled rows", async () => {
    await upsertSchedule({ organizationId: ORG, enabled: true, frequency: "daily", hourUtc: 3, dayOfWeekUtc: 1, updatedBy: "a" });
    await upsertSchedule({ organizationId: "22222222-2222-4222-8222-222222222222", enabled: false, frequency: "daily", hourUtc: 3, dayOfWeekUtc: 1, updatedBy: "a" });

    const enabled = await listEnabledSchedules();
    expect(enabled.map((s) => s.organizationId)).toEqual([ORG]);
  });

  it("recordScheduleRun stamps lastRunAt/lastRunKey without touching enabled/frequency", async () => {
    await upsertSchedule({ organizationId: ORG, enabled: true, frequency: "daily", hourUtc: 3, dayOfWeekUtc: 1, updatedBy: "a" });
    await recordScheduleRun(ORG, "scheduled-11111111-20260914");

    const after = await getSchedule(ORG);
    expect(after?.lastRunKey).toBe("scheduled-11111111-20260914");
    expect(after?.enabled).toBe(true);
  });

  it("degrades to empty/no-op when there is no Supabase client, never throwing", async () => {
    db.client = null;
    expect(await getSchedule(ORG)).toBeNull();
    expect(await listEnabledSchedules()).toEqual([]);
    await expect(recordScheduleRun(ORG, "x")).resolves.toBeUndefined();
  });
});

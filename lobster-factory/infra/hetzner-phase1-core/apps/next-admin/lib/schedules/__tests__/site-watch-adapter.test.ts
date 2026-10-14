// adapters/site-watch.ts: site_watch_targets <-> ScheduleCell, and the write going through the real
// console.ts parse + locked RPC (the RPC itself is faked here; 0091's contract test covers its SQL).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteWatchCells, writeSiteWatchCell } from "@/lib/schedules/adapters/site-watch";

const ORG_A = "11111111-1111-4111-8111-111111111111"; // has a target row, one failing page
const ORG_B = "22222222-2222-4222-8222-222222222222"; // active + site URL, no row yet
const ORG_C = "33333333-3333-4333-8333-333333333333"; // no site URL

function fakeSb(opts: { rpcRow?: Record<string, unknown> | null } = {}) {
  const calls = { rpc: [] as Array<[string, Record<string, unknown>]>, audits: [] as Record<string, unknown>[] };
  const tables: Record<string, Record<string, unknown>[]> = {
    site_watch_targets: [
      { id: "t-a", organization_id: ORG_A, enabled: true, frequency: "hourly", hour_utc: 5, version: 4, updated_by: "admin:claims", updated_at: "2026-10-10T00:00:00Z", last_completed_bucket_start: "2026-10-14T19:00:00Z" },
    ],
    site_watch_page_state: [
      { target_id: "t-a", kind: "availability", failure_streak: 2, last_failure_code: "http_503", alert_state: "sent", updated_at: "2026-10-14T19:05:00Z" },
      { target_id: "t-a", kind: "visual", failure_streak: 0, last_failure_code: null, alert_state: "none", updated_at: "2026-10-14T18:05:00Z" },
    ],
  };
  const sb = {
    from(table: string) {
      if (table === "ops_audit_events") return { insert: (row: Record<string, unknown>) => (calls.audits.push(row), Promise.resolve({ error: null })) };
      return {
        select: () => ({
          in: (col: string, values: unknown[]) => Promise.resolve({ data: (tables[table] ?? []).filter((r) => values.includes(r[col])), error: null }),
        }),
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.rpc.push([fn, args]);
      return Promise.resolve({ data: opts.rpcRow === undefined ? [] : opts.rpcRow ? [opts.rpcRow] : [], error: null });
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

beforeEach(() => {
  process.env.SITE_WATCH_ENABLED = "true";
});
afterEach(() => {
  delete process.env.SITE_WATCH_ENABLED;
});

describe("siteWatchCells", () => {
  const orgs = [
    { id: ORG_A, status: "active", siteUrl: "https://a.example" },
    { id: ORG_B, status: "active", siteUrl: "https://b.example" },
    { id: ORG_C, status: "active", siteUrl: "" },
  ];

  it("maps a stored target, a not-yet-synced client and a client without a URL", async () => {
    const { sb } = fakeSb();
    const [a, b, c] = await siteWatchCells(sb, orgs);
    expect(a).toMatchObject({
      jobKey: "site_watch", stored: true, enabled: true, frequency: "hourly", hourUtc: 5, version: 4,
      lastRunAt: "2026-10-14T19:00:00Z", lastError: "availability:http_503", lastErrorAt: "2026-10-14T19:05:00Z", unavailable: null,
    });
    // what site_watch_sync_targets will create: on, daily 22 UTC, version 0 for the first write
    expect(b).toMatchObject({ stored: false, enabled: true, frequency: "daily", hourUtc: 22, version: 0, lastError: null, unavailable: null });
    expect(c).toMatchObject({ stored: false, enabled: false, unavailable: "客戶設定沒有網站網址" });
  });

  it("the global switch off marks every cell as not running", async () => {
    delete process.env.SITE_WATCH_ENABLED;
    const { sb } = fakeSb();
    const cells = await siteWatchCells(sb, orgs);
    expect(cells.every((x) => x.unavailable === "SITE_WATCH_ENABLED 未開")).toBe(true);
  });
});

describe("writeSiteWatchCell", () => {
  const actor = { role: "admin", source: "claims" };

  it("rejects a frequency the card never offered, before any RPC", async () => {
    const { sb, calls } = fakeSb();
    const r = await writeSiteWatchCell(sb, ORG_A, { expectedVersion: 4, enabled: true, frequency: "weekly", hourUtc: 3 }, actor);
    expect(r).toEqual({ ok: false, status: 400, error: "frequency_invalid" });
    expect(calls.rpc).toHaveLength(0);
  });

  it("a version conflict (RPC returns no row) is a 409 and writes no audit", async () => {
    const { sb, calls } = fakeSb({ rpcRow: null });
    const r = await writeSiteWatchCell(sb, ORG_A, { expectedVersion: 3, enabled: false, frequency: "daily", hourUtc: 22 }, actor);
    expect(r).toEqual({ ok: false, status: 409, error: "version_conflict" });
    expect(calls.audits).toHaveLength(0);
  });

  it("a write goes through site_watch_update_config with the version and is audited", async () => {
    const { sb, calls } = fakeSb({ rpcRow: { enabled: false, frequency: "daily", hour_utc: 22, version: 5 } });
    const r = await writeSiteWatchCell(sb, ORG_A, { expectedVersion: 4, enabled: false, frequency: "daily", hourUtc: 22 }, actor);
    expect(r).toEqual({ ok: true });
    expect(calls.rpc[0]).toEqual([
      "site_watch_update_config",
      { p_org: ORG_A, p_expected_version: 4, p_enabled: false, p_frequency: "daily", p_hour_utc: 22, p_actor: "admin:claims" },
    ]);
    expect(calls.audits[0]).toMatchObject({ organization_id: ORG_A, event_type: "site_watch_config_updated", actor_role: "admin" });
  });
});

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSiteMonth, loadSiteMonth, loadSubscriptionUsage } from "../codex-usage";
import { TWD_RATE } from "../cost-model";

describe("buildSiteMonth", () => {
  it("counts 訂閱 and API articles side by side per site; unknown topics go to 未指定 last", () => {
    const rows = [
      { model: "sub-codex", cost_usd: 0, job_id: "t1" },
      { model: "sub-claude-opus", cost_usd: "0", job_id: "t1" },
      { model: "claude-opus-4-7", cost_usd: 0.5, job_id: "t1" },
      { model: "claude-opus-4-7", cost_usd: 1, job_id: "t2" },
      { model: "sub-codex", cost_usd: 0, job_id: null },
    ];
    const out = buildSiteMonth(rows, new Map([["t1", "s1"], ["t2", "s2"]]), new Map([["s1", "站一"], ["s2", "站二"]]));
    expect(out.map((r) => r.name)).toEqual(["站一", "站二", "未指定"]);
    expect(out[0]).toMatchObject({ sub: 2, api: 1 });
    expect(out[0].apiTwd).toBeCloseTo(0.5 * TWD_RATE);
    expect(out[2]).toMatchObject({ siteId: null, sub: 1, api: 0, apiTwd: 0 });
  });
});

/** A db whose every query settles to `result`; chainable like PostgREST's builder. */
function fakeDb(result: { data?: unknown; count?: number | null; error: unknown }): SupabaseClient {
  const q: any = new Proxy({}, { get: (_t, k) => (k === "then" ? (f: (v: unknown) => unknown) => f(result) : () => q) });
  return { from: () => q } as unknown as SupabaseClient;
}

describe("read failures are not 0", () => {
  it("loadSubscriptionUsage: every count and the latest reading are null", async () => {
    const u = await loadSubscriptionUsage(fakeDb({ data: null, count: null, error: { message: "down" } }), new Date());
    expect(u.images).toEqual({ last24h: null, last7d: null });
    expect(u.textCodex.last7d).toBeNull();
    expect(u.textClaude.last24h).toBeNull();
    expect(u.latest).toBeNull();
  });
  it("loadSubscriptionUsage: a real 0 stays 0", async () => {
    const u = await loadSubscriptionUsage(fakeDb({ data: null, count: 0, error: null }), new Date());
    expect(u.textClaude).toEqual({ last24h: 0, last7d: 0 });
  });
  it("loadSiteMonth: a failed read is null, not an empty table", async () => {
    expect(await loadSiteMonth(fakeDb({ data: null, error: { message: "down" } }), "2026-11-01T00:00:00Z")).toBeNull();
  });
});

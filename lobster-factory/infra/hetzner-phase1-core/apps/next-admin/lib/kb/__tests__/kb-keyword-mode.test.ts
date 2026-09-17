// setKeywordMode (lib/kb/db.ts) — K2i's per-document override. The CHECK constraint (migration
// 0086) already rejects a bad value at the DB layer; this function rejects it BEFORE that, so a typo
// or a stale client build never even reaches a network round-trip for a write that could only fail.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: unknown };

const state = vi.hoisted(() => ({ queue: [] as Resp[], calls: [] as Array<Record<string, unknown>> }));

let client: { from: (table: string) => Record<string, unknown> } | null;
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => client,
}));

function fakeClient() {
  return {
    from: (table: string) => {
      const rec: Record<string, unknown> = { table, eqs: [] as Array<[string, unknown]> };
      state.calls.push(rec);
      const chain: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => { rec.patch = patch; return chain; },
        eq: (k: string, v: unknown) => { (rec.eqs as Array<[string, unknown]>).push([k, v]); return chain; },
        select: () => Promise.resolve(state.queue.shift() ?? { data: null, error: null }),
      };
      return chain;
    },
  };
}

const { setKeywordMode } = await import("@/lib/kb/db");

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.queue = [];
  state.calls = [];
  client = fakeClient();
});

describe("setKeywordMode", () => {
  it("rejects an invalid mode before any DB call", async () => {
    // @ts-expect-error deliberately invalid input, matching what an un-validated request body could send
    expect(await setKeywordMode(ORG, "s1", "bogus")).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("writes a valid mode and reports success when a row matched", async () => {
    state.queue.push({ data: [{ id: "s1" }], error: null });
    expect(await setKeywordMode(ORG, "s1", "exact")).toBe(true);
    const call = state.calls[0];
    expect(call.patch).toMatchObject({ keyword_mode: "exact" });
    expect(call.eqs).toEqual([["organization_id", ORG], ["id", "s1"]]);
  });

  it("returns false when the WHERE clause matched nothing (stale/foreign id)", async () => {
    state.queue.push({ data: [], error: null });
    expect(await setKeywordMode(ORG, "gone", "fuzzy")).toBe(false);
  });

  it("degrades to false with no Supabase client", async () => {
    client = null;
    expect(await setKeywordMode(ORG, "s1", "inherit")).toBe(false);
  });
});

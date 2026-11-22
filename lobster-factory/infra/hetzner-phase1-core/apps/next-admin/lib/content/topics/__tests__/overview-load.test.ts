// K8 (ADR 020): the auto-content numbers are read for one picked client; none picked = no query at all.
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOverview } from "../overview-load";

describe("loadOverview", () => {
  it("no client picked: returns an empty overview for no client and reads nothing", async () => {
    const from = vi.fn();
    const mayRead = vi.fn(() => true);
    const o = await loadOverview({ from } as unknown as SupabaseClient, null, mayRead);
    expect(o).toMatchObject({ organizationId: null, rows: [], cells: {}, actual: {} });
    expect(from).not.toHaveBeenCalled();
    expect(mayRead).not.toHaveBeenCalled();
  });

  it("a picked client: the sites query is narrowed to it (and the answer names it, lower case)", async () => {
    const eqs: Array<[string, unknown]> = [];
    const q = { select: () => q, eq: (c: string, v: unknown) => { eqs.push([c, v]); return q; }, then: (r: (v: unknown) => void) => r({ data: [], error: null }) };
    const o = await loadOverview({ from: () => q } as unknown as SupabaseClient, "ABCDEF00-0000-4000-8000-000000000001", () => true);
    expect(eqs).toContainEqual(["organization_id", "abcdef00-0000-4000-8000-000000000001"]);
    expect(o.organizationId).toBe("abcdef00-0000-4000-8000-000000000001");
  });
});

// K10: the clients landing list starts from the problem rows, in a constant number of queries, with the overview's own rule.
import { loadClientProblems, PROBLEM_LIST_MAX } from "../overview-load";
import { buildOverview } from "../overview";

function fakeDb(tables: Record<string, unknown[]>) {
  const calls: string[] = [];
  const from = (t: string) => {
    calls.push(t);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "not", "or"]) q[m] = () => q;
    q.range = (a: number) => ({ then: (r: (v: unknown) => void) => r({ data: a === 0 ? tables[t] ?? [] : [], error: null }) });
    q.then = (r: (v: unknown) => void) => r({ data: tables[t] ?? [], error: null });
    return q;
  };
  return { sb: { from } as unknown as SupabaseClient, calls };
}
const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b";

describe("loadClientProblems", () => {
  it("nothing wrong: reads only the two problem tables", async () => {
    const { sb, calls } = fakeDb({});
    expect(await loadClientProblems(sb, () => true)).toEqual({ clients: [], more: false });
    expect(calls).toEqual(["client_schedules", "content_topics"]);
  });

  it("gives the same problem as the overview row for the same data (one shared rule)", async () => {
    const { sb } = fakeDb({
      client_schedules: [{ organization_id: A, last_error: "boom" }],
      content_topics: [{ site_id: "s2" }],
      wp_sites: [{ id: "s1", organization_id: A }, { id: "s2", organization_id: B }],
      organizations: [{ id: A, slug: "a", name: "甲" }, { id: B, slug: "b", name: "乙" }],
    });
    const got = await loadClientProblems(sb, () => true);
    const rows = buildOverview({
      sites: [{ id: "s1", name: "s1", organizationId: A, orgName: "甲", defaults: null, attemptedAt: null }, { id: "s2", name: "s2", organizationId: B, orgName: "乙", defaults: null, attemptedAt: null }],
      schedules: [{ organizationId: A, enabled: true, dailyLimit: null, lastError: "boom" }],
      topics: [{ siteId: "s2", status: "failed", source: "plan" }], canPlan: { [A]: true, [B]: true }, spendUsd: {},
    });
    expect(rows.every((r) => r.problem)).toBe(true);
    expect(got.clients.map((c) => [c.slug, c.lastError, c.failedTopics]).sort()).toEqual([["a", "boom", 0], ["b", null, 1]]);
  });

  it("the query count is the same for 3 or 120 problem clients, and the list is capped with more=true", async () => {
    const run = async (n: number) => {
      const ids = Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
      const { sb, calls } = fakeDb({
        client_schedules: ids.map((o) => ({ organization_id: o, last_error: "x" })), content_topics: [],
        wp_sites: ids.map((o, i) => ({ id: `s${i}`, organization_id: o })),
        organizations: ids.map((o, i) => ({ id: o, slug: `c${i}`, name: `客戶${i}` })),
      });
      return { out: await loadClientProblems(sb, () => true), n: calls.length };
    };
    const small = await run(3), big = await run(120);
    expect(big.n).toBe(small.n);
    expect(big.out.clients).toHaveLength(PROBLEM_LIST_MAX);
    expect(big.out.more).toBe(true);
    expect(small.out.more).toBe(false);
  });

  it("a client the caller may not read is left out", async () => {
    const { sb } = fakeDb({
      client_schedules: [{ organization_id: A, last_error: "x" }], content_topics: [],
      wp_sites: [{ id: "s1", organization_id: A }], organizations: [{ id: A, slug: "a", name: "甲" }],
    });
    expect(await loadClientProblems(sb, () => false)).toEqual({ clients: [], more: false });
  });
});

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

// K10: the clients landing list reads many clients in a constant number of queries and uses the overview's own problem rule.
import { loadClientProblems } from "../overview-load";
import { buildOverview } from "../overview";

function fakeDb(tables: Record<string, unknown[]>) {
  const calls: string[] = [];
  const from = (t: string) => {
    calls.push(t);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
    q.range = (a: number) => ({ then: (r: (v: unknown) => void) => r({ data: a === 0 ? tables[t] ?? [] : [], error: null }) });
    q.then = (r: (v: unknown) => void) => r({ data: tables[t] ?? [], error: null });
    return q;
  };
  return { sb: { from } as unknown as SupabaseClient, calls };
}
const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b";

describe("loadClientProblems", () => {
  it("empty input reads nothing", async () => {
    const { sb, calls } = fakeDb({});
    expect(await loadClientProblems(sb, [], () => true)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("gives the same problem as the overview row for the same data (one shared rule)", async () => {
    const { sb } = fakeDb({
      wp_sites: [{ id: "s1", organization_id: A }, { id: "s2", organization_id: B }],
      client_schedules: [{ organization_id: A, last_error: "boom" }, { organization_id: B, last_error: null }],
      content_topics: [],
    });
    const got = await loadClientProblems(sb, [A, B], () => true);
    const rows = buildOverview({
      sites: [{ id: "s1", name: "s1", organizationId: A, orgName: "A", defaults: null, attemptedAt: null }, { id: "s2", name: "s2", organizationId: B, orgName: "B", defaults: null, attemptedAt: null }],
      schedules: [{ organizationId: A, enabled: true, dailyLimit: null, lastError: "boom" }, { organizationId: B, enabled: true, dailyLimit: null, lastError: null }],
      topics: [], canPlan: { [A]: true, [B]: true }, spendUsd: {},
    });
    for (const o of [A, B]) expect(got.find((g) => g.organizationId === o)!.problem).toBe(rows.find((r) => r.organizationId === o)!.problem);
    expect(got.find((g) => g.organizationId === A)!.problem).toBe(true);
  });

  it("the number of queries does not grow with the number of clients, and failed topics count per client", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const { sb, calls } = fakeDb({
      wp_sites: ids.map((o, i) => ({ id: `s${i}`, organization_id: o })),
      client_schedules: [], content_topics: [{ site_id: "s3" }, { site_id: "s3" }],
    });
    const got = await loadClientProblems(sb, ids, () => true);
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(got).toHaveLength(40);
    expect(got.find((g) => g.organizationId === ids[3])).toMatchObject({ failedTopics: 2, problem: true });
    expect(got.filter((g) => g.problem)).toHaveLength(1);
  });

  it("a client the caller may not read is not read", async () => {
    const { sb, calls } = fakeDb({});
    expect(await loadClientProblems(sb, [A], () => false)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

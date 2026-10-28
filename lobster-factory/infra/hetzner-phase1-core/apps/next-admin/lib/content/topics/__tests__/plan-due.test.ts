// The schedule's monthly proposal (AUTO_CONTENT P9.2): B1 one proposal per Taipei month, B2 claim before the paid call,
// B3 one site per firing, B4 only ai_pick approves, B8 no entitlement = skip. All deps are fakes: no DB, no model.
import { beforeEach, describe, expect, it, vi } from "vitest";

const g = vi.hoisted(() => ({ grantFor: vi.fn(async (_k: string) => ({ granted: true })) }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: g.grantFor, runForOrg: async (_o: string, _a: string, fn: () => unknown) => fn() }));
vi.mock("../plan", () => ({ planAsker: () => async () => "{}", proposeMonth: vi.fn(async () => []) }));

import { EntitlementRequired } from "@/lib/entitlements/can";
import { PLAN_RETRY_MS, planDueDeps, planIfDue, type PlanDueDeps } from "../plan-due";

const NOW = new Date("2026-11-01T00:30:00Z");
const topic = (id: string) => ({ id, organization_id: "o", status: "proposed", version: 1 }) as never;

function deps(over: Partial<PlanDueDeps> = {}): { [K in keyof PlanDueDeps]: ReturnType<typeof vi.fn> } & PlanDueDeps {
  return {
    canPlan: vi.fn(async () => true),
    sites: vi.fn(async () => [{ id: "s1", defaults: {} }]),
    hasProposal: vi.fn(async () => false),
    claimAttempt: vi.fn(async () => true),
    propose: vi.fn(async () => [topic("t1"), topic("t2")]),
    approve: vi.fn(async (t) => t),
    ...over,
  } as never;
}

describe("planIfDue", () => {
  it("1. claims the attempt before the paid call (B2)", async () => {
    const d = deps();
    expect(await planIfDue(d, NOW)).toBe("planned site=s1 month=2026-11-01 topics=2 approved=0");
    expect(d.propose).toHaveBeenCalledTimes(1);
    expect(d.claimAttempt.mock.invocationCallOrder[0]).toBeLessThan(d.propose.mock.invocationCallOrder[0]);
  });

  it("2. a month that already has a proposal plans nothing (B1)", async () => {
    const d = deps({ hasProposal: vi.fn(async () => true) });
    expect(await planIfDue(d, NOW)).toBeNull();
    expect(d.propose).not.toHaveBeenCalled();
  });

  it("3. a lost claim (tried within 24 h) does not propose (B2)", async () => {
    const d = deps({ claimAttempt: vi.fn(async () => false) });
    expect(await planIfDue(d, NOW)).toBeNull();
    expect(d.propose).not.toHaveBeenCalled();
  });

  it("4. a failed proposal fails the firing", async () => {
    await expect(planIfDue(deps({ propose: vi.fn(async () => { throw new Error("content_plan:unreadable_answer"); }) }), NOW)).rejects.toThrow("unreadable_answer");
  });

  it("5. two sites due: only one is proposed in a firing (B3)", async () => {
    const d = deps({ sites: vi.fn(async () => [{ id: "a", defaults: {} }, { id: "b", defaults: {} }]) });
    await planIfDue(d, NOW);
    expect(d.propose).toHaveBeenCalledTimes(1);
    expect(d.propose).toHaveBeenCalledWith("a", "2026-11-01");
  });

  it("6. only topicMode=ai_pick approves; publishMode never does (B4)", async () => {
    const run = async (defaults: object) => { const d = deps({ sites: vi.fn(async () => [{ id: "s1", defaults }]) }); const r = await planIfDue(d, NOW); return [d.approve.mock.calls.length, r] as const; };
    expect(await run({ topicMode: "ai_pick" })).toEqual([2, "planned site=s1 month=2026-11-01 topics=2 approved=2"]);
    for (const defaults of [{ topicMode: "human_pick" }, {}, { topicMode: "AI_PICK" }, { publishMode: "ai_review_auto" }]) expect((await run(defaults))[0]).toBe(0);
  });

  it("7. the month is the Taipei month, at both edges of 11/1", async () => {
    for (const iso of ["2026-11-01T00:30:00Z", "2026-10-31T17:00:00Z"]) {
      const d = deps();
      await planIfDue(d, new Date(iso));
      expect(d.hasProposal).toHaveBeenCalledWith("s1", "2026-11-01");
    }
  });

  it("8. no entitlement: nothing claimed, nothing spent, null; nothing to do: permission not even asked (B8)", async () => {
    const d = deps({ canPlan: vi.fn(async () => false) });
    expect(await planIfDue(d, NOW)).toBeNull();
    expect(d.claimAttempt).not.toHaveBeenCalled();
    expect(d.propose).not.toHaveBeenCalled();
    const done = deps({ hasProposal: vi.fn(async () => true) });
    await planIfDue(done, NOW);
    expect(done.canPlan).not.toHaveBeenCalled();
  });
});

/** A query builder that records every call and answers with `result`. */
function fakeSb(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "neq", "or", "update", "limit", "order"]) q[k] = (...a: unknown[]) => { calls.push([k, a]); return q; };
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(res);
  return { sb: { from: vi.fn(() => q) } as never, calls };
}

describe("planDueDeps", () => {
  beforeEach(() => g.grantFor.mockClear());

  it("9. canPlan: only EntitlementRequired means skip; any other error is a failure (B8)", async () => {
    const d = planDueDeps({} as never, "o", "schedule:content_pipeline");
    expect(await d.canPlan()).toBe(true);
    expect(g.grantFor).toHaveBeenCalledWith("content.plan");
    g.grantFor.mockRejectedValueOnce(new EntitlementRequired("no_credit"));
    expect(await d.canPlan()).toBe(false);
    g.grantFor.mockRejectedValueOnce(new Error("db down"));
    await expect(d.canPlan()).rejects.toThrow("db down");
  });

  it("hasProposal asks for a non-manual topic of this site and month", async () => {
    const { sb, calls } = fakeSb({ data: [{ id: "t" }] });
    expect(await planDueDeps(sb, "o", "a").hasProposal("s1", "2026-11-01")).toBe(true);
    expect(calls.filter(([k]) => ["eq", "neq"].includes(k))).toEqual([["eq", ["site_id", "s1"]], ["eq", ["month", "2026-11-01"]], ["neq", ["source", "manual"]]]);
    expect(await planDueDeps(fakeSb({ data: [] }).sb, "o", "a").hasProposal("s1", "2026-11-01")).toBe(false);
    await expect(planDueDeps(fakeSb({ error: { message: "x" } }).sb, "o", "a").hasProposal("s1", "m")).rejects.toThrow("content_plan_due:has_proposal:x");
  });

  it("claimAttempt writes the mark only where it is null or older than 24 h; one row back = claimed", async () => {
    const { sb, calls } = fakeSb({ data: [{ id: "s1" }] });
    expect(await planDueDeps(sb, "o", "a").claimAttempt("s1", NOW)).toBe(true);
    const cutoff = new Date(NOW.getTime() - PLAN_RETRY_MS).toISOString();
    expect(calls.find(([k]) => k === "update")![1][0]).toEqual({ content_plan_attempted_at: NOW.toISOString() });
    expect(calls.find(([k]) => k === "or")![1][0]).toBe(`content_plan_attempted_at.is.null,content_plan_attempted_at.lt.${cutoff}`);
    expect(await planDueDeps(fakeSb({ data: [] }).sb, "o", "a").claimAttempt("s1", NOW)).toBe(false);
  });
});

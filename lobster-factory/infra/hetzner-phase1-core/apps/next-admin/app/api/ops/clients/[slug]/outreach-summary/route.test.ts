// GET /api/ops/clients/[slug]/outreach-summary: unknown client is 404; a failed read marks only that block as an error
// (never a 0); spend totals only this organization's outreach/* rows of the Taipei month.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "2bf60452-3d4d-47c2-9970-b9046ed1a35a";
type Res = { data?: unknown; count?: number; error: { message: string } | null };
const state = vi.hoisted(() => ({
  orgFound: true,
  verdictInfraError: false,
  failTable: null as string | null,
  logs: [] as Array<{ cost_usd: string | number; metadata: Record<string, unknown> }>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const done = (): Res => {
        if (table === state.failTable) return { error: { message: "boom" } };
        if (table === "organizations") return { data: state.orgFound ? { id: ORG } : null, error: null };
        if (table === "co_sender_accounts") return { data: [{ id: "s1", email: "a@b.c", send_mode: "auto", daily_limit: 20, warmup_stage: "full", health_status: "healthy", auto_draft: true, is_active: true }, { id: "s2", email: "d@b.c", send_mode: "draft", daily_limit: 20, warmup_stage: "full", health_status: "healthy", auto_draft: true, is_active: true }], error: null };
        if (table === "ai_call_logs") return { data: state.logs, error: null };
        return { count: 3, error: null };
      };
      for (const m of ["select", "eq", "gte", "like", "in", "order", "range", "maybeSingle"]) {
        q[m] = (...args: unknown[]) => { state.calls.push({ table, method: m, args }); return q; };
      }
      q.then = (resolve: (r: Res) => unknown) => resolve(done());
      return q;
    },
  }),
}));
vi.mock("@/lib/entitlements/subject", () => ({
  resolveSubject: async () => ({ orgId: ORG, kind: "customer" }),
  requestActor: () => "ops:admin",
}));
vi.mock("@/lib/entitlements/runtime", () => ({ runtimeGateDependencies: () => ({}) }));
vi.mock("@/lib/entitlements/can", () => ({
  verdictOf: async (_s: unknown, key: string) => {
    if (state.verdictInfraError) return { allowed: false, reason: "infrastructure_error" };
    return key === "outreach.draft" ? { allowed: true, reason: null } : { allowed: false, reason: "no_entitlement" };
  },
}));
vi.mock("@/lib/outreach/sender-pool", () => ({ todayClaims: async (_sb: unknown, ids: string[]) => new Map(ids.map((id) => [id, 7])) }));

const { GET } = await import("./route");
const ctx = { params: Promise.resolve({ slug: "soulful" }) };
const req = (kind = "staff") => new Request("http://localhost/api/ops/clients/soulful/outreach-summary", { headers: { "x-ops-claims-role": "viewer", "x-ops-user-kind": kind } });

beforeEach(() => {
  state.orgFound = true;
  state.failTable = null;
  state.verdictInfraError = false;
  state.logs = [];
  state.calls = [];
});

describe("GET outreach-summary", () => {
  it("is 404 for an unknown client and 403 for a client identity", async () => {
    state.orgFound = false;
    expect((await GET(req(), ctx)).status).toBe(404);
    expect((await GET(req("client"), ctx)).status).toBe(403);
  });

  it("reports a failed read as an error for that block only, never as 0", async () => {
    state.failTable = "co_replies";
    const body = await (await GET(req(), ctx)).json();
    expect(body.counts).toEqual({ ok: false, error: "co_replies: boom" });
    expect(body.senders.ok).toBe(true);
    expect(body.senders.senders.map((s: { today_claims: number | null }) => s.today_claims)).toEqual([7, null]);
    expect(body.spend.ok).toBe(true);
    expect(body.features.features.map((f: { key: string; allowed: boolean }) => [f.key, f.allowed]).slice(0, 2)).toEqual([["outreach.draft", true], ["outreach.qa", false]]);
  });

  it("sums only this organization's outreach routes of the Taipei month, and counts the free rows", async () => {
    state.logs = [{ cost_usd: "0.5", metadata: {} }, { cost_usd: 0.25, metadata: {} }, { cost_usd: 0, metadata: { free: true } }];
    const body = await (await GET(req(), ctx)).json();
    expect(body.spend).toEqual({ ok: true, usd: 0.75, twd: 24, calls: 3, free: 1 });
    const spendCalls = state.calls.filter((c) => c.table === "ai_call_logs");
    expect(spendCalls).toContainEqual({ table: "ai_call_logs", method: "eq", args: ["organization_id", ORG] });
    expect(spendCalls).toContainEqual({ table: "ai_call_logs", method: "like", args: ["route", "outreach/%"] });
    expect(spendCalls.find((c) => c.method === "gte")?.args[0]).toBe("created_at");
    expect(spendCalls.find((c) => c.method === "gte")?.args[1]).toBe(body.monthStart);
  });

  it("shows an entitlement check that could not run as a failed block, not as 未開通", async () => {
    state.verdictInfraError = true;
    const body = await (await GET(req(), ctx)).json();
    expect(body.features.ok).toBe(false);
  });

  it("counts inbox rows still awaiting review and replies of kind reply only", async () => {
    await GET(req(), ctx);
    const inbox = state.calls.find((c) => c.table === "co_lead_inbox" && c.method === "in");
    expect(inbox?.args).toEqual(["inbox_status", ["pending", "high_quality", "needs_data"]]);
    const kinds = state.calls.filter((c) => c.table === "co_replies" && c.method === "eq" && c.args[0] === "kind").map((c) => c.args[1]);
    expect(kinds.sort()).toEqual(["bounce", "reply"]);
  });
});

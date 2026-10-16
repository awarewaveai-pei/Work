// PATCH /api/ops/clients/[slug]/cs-intents: L2 only after a passed exam (plan §5.2), and a save
// writes exactly the fields it was sent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  graduated: false,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: "org-1" }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/ops-audit", () => ({ recordOpsAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/cs", async () => {
  const cfg = await import("@/lib/cs/intent-config");
  return {
    ...cfg,
    loadIntent: vi.fn(async () => ({ key: "courses", graduated: state.graduated })),
    updateIntent: vi.fn(async (_o: string, _k: string, f: Record<string, unknown>) => { state.updates.push(f); return "ok"; }),
    upsertIntent: vi.fn(async () => true),
    deleteIntent: vi.fn(async () => true),
  };
});

const { PATCH } = await import("./route");

const ctx = { params: Promise.resolve({ slug: "soulful" }) };
const req = (body: unknown, role = "admin") =>
  new Request("http://localhost/api/ops/clients/soulful/cs-intents", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-ops-claims-role": role },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.graduated = false;
  state.updates = [];
});

describe("PATCH cs-intents", () => {
  it("refuses L2 for an intent that has not passed its exam, and writes nothing", async () => {
    const res = await PATCH(req({ key: "courses", answerLevel: "L2", canaryPct: 100 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("not_graduated");
    expect(state.updates).toEqual([]);
  });

  it("sets L2 on a graduated intent, writing only the level and the share", async () => {
    state.graduated = true;
    const res = await PATCH(req({ key: "courses", answerLevel: "L2", canaryPct: 100 }), ctx);
    expect(res.status).toBe(200);
    expect(state.updates).toEqual([{ answerLevel: "L2", canaryPct: 100 }]);
  });

  it("refuses a role below owner/admin", async () => {
    const res = await PATCH(req({ key: "courses", answerLevel: "L1" }, "viewer"), ctx);
    expect(res.status).toBe(403);
    expect(state.updates).toEqual([]);
  });
});

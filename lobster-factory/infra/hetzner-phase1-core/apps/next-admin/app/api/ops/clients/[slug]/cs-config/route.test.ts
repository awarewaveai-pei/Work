// GET/PATCH /api/ops/clients/[slug]/cs-config. Focused on the K2i addition (kbKeywordModeDefault)
// and its interaction with the pre-existing csEnabled kill-switch on the same endpoint/JSON blob —
// no prior test file existed for this route.

import { describe, expect, it, vi, beforeEach } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  updateCalls: [] as Array<Record<string, unknown>>,
  auditCalls: [] as Array<Record<string, unknown>>,
}));

const sb = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table === "organizations") {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: ORG, metadata: state.metadata }, error: null }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => { state.updateCalls.push(patch); return Promise.resolve({ error: null }); },
        }),
      };
    }
    if (table === "cs_intents") {
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
    }
    if (table === "cs_knowledge_sources") {
      return { select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) };
    }
    if (table === "ops_audit_events") {
      return { insert: (payload: Record<string, unknown>) => { state.auditCalls.push(payload); return Promise.resolve({ error: null }); } };
    }
    throw new Error(`unexpected table: ${table}`);
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { GET, PATCH } = await import("./route");

function ctx() {
  return { params: Promise.resolve({ slug: "acme" }) };
}
function req(method: string, opts: { role?: string; body?: unknown } = {}): Request {
  return new Request(`http://localhost/api/ops/clients/acme/cs-config`, {
    method,
    headers: { "content-type": "application/json", ...(opts.role ? { "x-ops-claims-role": opts.role } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.metadata = {};
  state.updateCalls = [];
  state.auditCalls = [];
});

describe("GET", () => {
  it("defaults kbKeywordModeDefault to fuzzy when unset — today's only behaviour, pre-K2i", async () => {
    const res = await GET(req("GET"), ctx());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, csEnabled: true, kbKeywordModeDefault: "fuzzy" });
  });

  it("reads a tenant that already opted into exact", async () => {
    state.metadata = { client_config: { kbKeywordModeDefault: "exact" } };
    const res = await GET(req("GET"), ctx());
    const body = await res.json();
    expect(body.kbKeywordModeDefault).toBe("exact");
  });
});

describe("PATCH", () => {
  it("sets kbKeywordModeDefault alone, without touching csEnabled", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { kbKeywordModeDefault: "exact" } }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, kbKeywordModeDefault: "exact", csEnabled: true });
    expect(state.updateCalls[0]).toMatchObject({ metadata: { client_config: { kbKeywordModeDefault: "exact" } } });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]).toMatchObject({ event_type: "cs_kb_keyword_default_changed" });
  });

  it("sets csEnabled alone, without requiring kbKeywordModeDefault", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { csEnabled: false } }), ctx());
    expect(res.status).toBe(200);
    expect(state.auditCalls[0]).toMatchObject({ event_type: "cs_killswitch_toggled" });
  });

  it("sets the tenant knowledge floor, rejects one outside 0.2–0.8, and null clears it", async () => {
    let res = await PATCH(req("PATCH", { role: "admin", body: { kbMinRetrievalScore: 0.4 } }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, kbMinRetrievalScore: 0.4 });
    expect(state.updateCalls[0]).toMatchObject({ metadata: { client_config: { kbMinRetrievalScore: 0.4 } } });
    expect(state.auditCalls[0]).toMatchObject({ event_type: "cs_kb_min_retrieval_score_changed" });

    res = await PATCH(req("PATCH", { role: "admin", body: { kbMinRetrievalScore: 0.95 } }), ctx());
    expect(res.status).toBe(400);

    state.metadata = { client_config: { kbMinRetrievalScore: 0.4 } };
    res = await PATCH(req("PATCH", { role: "admin", body: { kbMinRetrievalScore: null } }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, kbMinRetrievalScore: null });
    const written = state.updateCalls.at(-1) as { metadata: { client_config: Record<string, unknown> } };
    expect("kbMinRetrievalScore" in written.metadata.client_config).toBe(false);
  });

  it("rejects a body with neither field", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: {} }), ctx());
    expect(res.status).toBe(400);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("treats an invalid kbKeywordModeDefault value as absent, not as a silent accept", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { kbKeywordModeDefault: "bogus" } }), ctx());
    expect(res.status).toBe(400);
  });

  it("rejects a viewer role — write gate", async () => {
    const res = await PATCH(req("PATCH", { role: "viewer", body: { kbKeywordModeDefault: "exact" } }), ctx());
    expect(res.status).toBe(403);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("preserves the other field's already-stored value when only one is patched", async () => {
    state.metadata = { client_config: { csEnabled: false, kbKeywordModeDefault: "exact" } };
    const res = await PATCH(req("PATCH", { role: "admin", body: { csEnabled: true } }), ctx());
    const body = await res.json();
    expect(body).toMatchObject({ csEnabled: true, kbKeywordModeDefault: "exact" });
  });
});

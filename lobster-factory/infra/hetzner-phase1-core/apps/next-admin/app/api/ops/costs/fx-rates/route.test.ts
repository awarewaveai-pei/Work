import { describe, expect, it, vi, beforeEach } from "vitest";

const insert = vi.hoisted(() => vi.fn());
const sb = vi.hoisted(() => ({
  from: vi.fn(() => ({
    insert: (row: unknown) => { insert(row); return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }; },
    select: () => ({ gte: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
  })),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));
const runFxFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/fx-cbc", () => ({ runFxFetch }));

const { GET, POST } = await import("./route");
const { POST: FETCH } = await import("./fetch/route");

const ORG = "11111111-1111-4111-8111-111111111111";
const body = { month: "2026-10", rate: 31.85, source: "card_statement", note: "10 月帳單" };
function req(headers: Record<string, string>, method = "POST"): Request {
  return new Request("http://localhost/api/ops/costs/fx-rates", {
    method, headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("/api/ops/costs/fx-rates", () => {
  it("a customer account can neither read nor write the accounting rates", async () => {
    const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-claims-role": "owner" };
    expect((await POST(req(client))).status).toBe(403);
    expect((await GET(req(client, "GET"))).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
    expect((await FETCH(req(client))).status).toBe(403);
    expect(runFxFetch).not.toHaveBeenCalled();
  });

  it("an owner appends one row with the actor recorded", async () => {
    const res = await POST(req({ "x-ops-claims-role": "owner", "x-ops-user-id": "u1" }));
    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({ month: "2026-10-01", rate: 31.85, source: "card_statement", note: "10 月帳單", created_by: "owner:u1" });
  });
});

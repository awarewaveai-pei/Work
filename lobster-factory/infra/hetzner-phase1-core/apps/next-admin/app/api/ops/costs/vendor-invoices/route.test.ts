import { describe, expect, it, vi, beforeEach } from "vitest";

const insert = vi.hoisted(() => vi.fn());
const sb = vi.hoisted(() => ({
  from: vi.fn(() => ({
    insert: (row: unknown) => { insert(row); return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }; },
    select: () => ({ gte: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
  })),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { GET, POST } = await import("./route");

const ORG = "11111111-1111-4111-8111-111111111111";
const body = { month: "2026-10", vendor: "OpenAI", invoice_usd: 100, paid_twd: 3245, payment_method: "card" };
function req(headers: Record<string, string>, method = "POST"): Request {
  return new Request("http://localhost/api/ops/costs/vendor-invoices", {
    method, headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("/api/ops/costs/vendor-invoices", () => {
  it("a customer account can neither read nor write the vendor bills", async () => {
    const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-claims-role": "owner" };
    expect((await POST(req(client))).status).toBe(403);
    expect((await GET(req(client, "GET"))).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });
});

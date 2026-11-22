import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/systems/store", () => ({ readPending: async () => { reads.n++; return { refresh: true, requestedAt: "2026-11-22T01:00:00.000Z", proposals: [] }; } }));

const { GET } = await import("./route");
const TOKEN = "systems-ingest-token-long-enough";
const req = (auth: string | null) =>
  new Request("http://localhost/api/internal/systems/pending", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  reads.n = 0;
  process.env.SYSTEMS_INGEST_TOKEN = TOKEN;
});

describe("GET /api/internal/systems/pending", () => {
  it("no token, a wrong token or an unset SYSTEMS_INGEST_TOKEN is 401 and reads nothing", async () => {
    expect((await GET(req(null))).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    delete process.env.SYSTEMS_INGEST_TOKEN;
    expect((await GET(req(`Bearer ${TOKEN}`))).status).toBe(401);
    expect(reads.n).toBe(0);
  });

  it("the right token gets the 契約 3 JSON", async () => {
    const r = await GET(req(`Bearer ${TOKEN}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ refresh: true, requested_at: "2026-11-22T01:00:00.000Z", proposals: [] });
  });
});

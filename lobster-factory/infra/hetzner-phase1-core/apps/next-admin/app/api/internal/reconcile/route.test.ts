import { afterEach, describe, expect, it, vi } from "vitest";

const runChecks = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/lib/reconcile/pointers", () => ({ runChecks }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));

const { GET } = await import("./route");
const TOKEN = "reconcile-test-token-long-enough";
const req = (auth?: string) => new Request("http://localhost/api/internal/reconcile", { headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  delete process.env.RECONCILE_TOKEN;
  runChecks.mockClear();
});

describe("GET /api/internal/reconcile", () => {
  it("fails closed when RECONCILE_TOKEN is unset", async () => {
    expect((await GET(req(`Bearer ${TOKEN}`))).status).toBe(401);
    expect(runChecks).not.toHaveBeenCalled();
  });

  it("refuses a wrong token and runs the checks for the right one", async () => {
    process.env.RECONCILE_TOKEN = TOKEN;
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    const res = await GET(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(runChecks).toHaveBeenCalledTimes(1);
  });
});

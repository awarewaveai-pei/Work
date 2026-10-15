import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sweepUnfinishedClaims = vi.hoisted(() => vi.fn(async () => ({ handedOff: 0, failed: 0 })));
vi.mock("@/lib/cs/sweep", () => ({ sweepUnfinishedClaims }));

const { POST } = await import("./route");

const TOKEN = "cs-sweep-token";
const call = (auth?: string) =>
  POST(new Request("http://x/api/internal/cs/sweep", { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.CS_SWEEP_TOKEN = TOKEN;
  sweepUnfinishedClaims.mockClear();
});
afterEach(() => {
  delete process.env.CS_SWEEP_TOKEN;
});

describe("POST /api/internal/cs/sweep", () => {
  it("rejects a missing or wrong token without sweeping", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect(sweepUnfinishedClaims).not.toHaveBeenCalled();
  });

  it("fails closed when CS_SWEEP_TOKEN is unset", async () => {
    delete process.env.CS_SWEEP_TOKEN;
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(401);
  });

  it("sweeps and reports", async () => {
    sweepUnfinishedClaims.mockResolvedValueOnce({ handedOff: 2, failed: 0 });
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, handedOff: 2, failed: 0 });
  });

  it("any failed claim fails the run (non-2xx)", async () => {
    sweepUnfinishedClaims.mockResolvedValueOnce({ handedOff: 2, failed: 1 });
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, handedOff: 2, failed: 1 });
  });

  it("claim list unreadable: 500, never a green no-op", async () => {
    sweepUnfinishedClaims.mockRejectedValueOnce(new Error("cs_unfinished_claims: db down"));
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});

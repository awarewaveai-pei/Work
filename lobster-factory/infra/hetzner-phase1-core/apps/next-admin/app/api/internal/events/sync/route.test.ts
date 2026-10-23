import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const syncEventsResponse = vi.hoisted(() => vi.fn(async () => NextResponse.json({ ok: true })));
vi.mock("@/lib/events/sync-response", () => ({ syncEventsResponse, forceParam: () => false }));

const { POST } = await import("./route");
const KEY = "ops-sync-test-key-long-enough";
const req = (key?: string) => new Request("http://127.0.0.1:3002/api/internal/events/sync", {
  method: "POST", headers: key ? { "x-ops-sync-key": key } : {},
});

afterEach(() => {
  delete process.env.OPS_PROXY_SHARED_SECRET;
  syncEventsResponse.mockClear();
});

describe("POST /api/internal/events/sync", () => {
  it("fails closed when the secret is unset", async () => {
    expect((await POST(req(KEY))).status).toBe(401);
    expect(syncEventsResponse).not.toHaveBeenCalled();
  });

  it("refuses a wrong key and runs for the right one", async () => {
    process.env.OPS_PROXY_SHARED_SECRET = KEY;
    expect((await POST(req("wrong"))).status).toBe(401);
    expect(syncEventsResponse).not.toHaveBeenCalled();
    expect((await POST(req(KEY))).status).toBe(200);
    expect(syncEventsResponse).toHaveBeenCalledTimes(1);
  });
});

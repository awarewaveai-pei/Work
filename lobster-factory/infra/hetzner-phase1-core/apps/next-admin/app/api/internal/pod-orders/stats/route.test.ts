// Read-only inbox buckets for the AO smoke check: same bearer as the sweep, fail closed, no writes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPodOrderInboxStats = vi.hoisted(() => vi.fn(async () => ({ ok: true, deferred: 1 })));
vi.mock("@/lib/studio/pod-order-inbox", () => ({ getPodOrderInboxStats }));
const fakeDb = vi.hoisted(() => ({}));
const getSupabaseWriteClient = vi.hoisted(() => vi.fn((): unknown => fakeDb));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { GET } from "./route";

const TOKEN = "s".repeat(64);
const call = (auth?: string) => GET(new Request("http://x/api/internal/pod-orders/stats", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.POD_INBOX_SWEEP_TOKEN = TOKEN;
  getPodOrderInboxStats.mockClear();
});
afterEach(() => {
  delete process.env.POD_INBOX_SWEEP_TOKEN;
});

describe("GET /api/internal/pod-orders/stats", () => {
  it("valid token: the inbox buckets under podOrderInbox (the shape the smoke probe reads)", async () => {
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, podOrderInbox: { ok: true, deferred: 1 } });
    expect(getPodOrderInboxStats).toHaveBeenCalledWith(fakeDb);
  });

  it("wrong or missing token, or token unset on the server: 401 and nothing read", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call()).status).toBe(401);
    delete process.env.POD_INBOX_SWEEP_TOKEN;
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(401);
    expect(getPodOrderInboxStats).not.toHaveBeenCalled();
  });
});

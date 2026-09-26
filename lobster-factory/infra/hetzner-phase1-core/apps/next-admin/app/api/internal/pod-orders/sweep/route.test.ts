// The 10-minute pod_order_inbox replay entry point: own bearer token, fail closed when unset, and the
// drain runs after the response (next/server after()).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const drainPodOrderInbox = vi.hoisted(() => vi.fn(async () => ({ processed: 0, blocked: false })));
vi.mock("@/lib/studio/pod-order-inbox", () => ({ drainPodOrderInbox }));
const fakeDb = vi.hoisted(() => ({}));
const getSupabaseWriteClient = vi.hoisted(() => vi.fn((): unknown => fakeDb));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown | Promise<unknown>>);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterCallbacks.push(fn) }));

import { POST } from "./route";

const TOKEN = "t".repeat(64);
const call = (auth?: string) => POST(new Request("http://x/api/internal/pod-orders/sweep", { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.POD_INBOX_SWEEP_TOKEN = TOKEN;
  afterCallbacks.length = 0;
  drainPodOrderInbox.mockClear();
  getSupabaseWriteClient.mockReturnValue(fakeDb);
});
afterEach(() => {
  delete process.env.POD_INBOX_SWEEP_TOKEN;
});

describe("POST /api/internal/pod-orders/sweep", () => {
  it("valid token: 200 at once, drain after the response", async () => {
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, scheduled: true });
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
    for (const fn of afterCallbacks) await fn();
    expect(drainPodOrderInbox).toHaveBeenCalledWith(fakeDb);
  });

  it.each([[undefined], ["Bearer wrong"], [`Basic ${TOKEN}`]])("missing or wrong credentials (%s): 401, nothing scheduled", async (auth) => {
    const res = await call(auth);
    expect(res.status).toBe(401);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("token unset on the server: 401 to everyone (fail closed)", async () => {
    delete process.env.POD_INBOX_SWEEP_TOKEN;
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(401);
  });

  it("no DB client: 503, nothing scheduled", async () => {
    getSupabaseWriteClient.mockReturnValueOnce(null);
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(503);
    expect(afterCallbacks).toHaveLength(0);
  });
});

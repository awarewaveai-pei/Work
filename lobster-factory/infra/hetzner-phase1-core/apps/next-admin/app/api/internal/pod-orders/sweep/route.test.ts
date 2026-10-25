// The 10-minute pod_order_inbox replay entry point: own bearer token, fail closed when unset, and the
// answer carries the drain's result (a failed drain must not look green on /ops/schedules).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const drainPodOrderInbox = vi.hoisted(() => vi.fn(async () => ({ processed: 0, blocked: false })));
vi.mock("@/lib/studio/pod-order-inbox", () => ({ drainPodOrderInbox }));
const fakeDb = vi.hoisted(() => ({}));
const getSupabaseWriteClient = vi.hoisted(() => vi.fn((): unknown => fakeDb));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { POST } from "./route";

const TOKEN = "t".repeat(64);
const call = (auth?: string) => POST(new Request("http://x/api/internal/pod-orders/sweep", { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.POD_INBOX_SWEEP_TOKEN = TOKEN;
  drainPodOrderInbox.mockClear();
  getSupabaseWriteClient.mockReturnValue(fakeDb);
});
afterEach(() => {
  delete process.env.POD_INBOX_SWEEP_TOKEN;
});

describe("POST /api/internal/pod-orders/sweep", () => {
  it("valid token: drains, then answers 200 with the result", async () => {
    const res = await call(`Bearer ${TOKEN}`);
    expect(drainPodOrderInbox).toHaveBeenCalledWith(fakeDb);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 0, blocked: false });
  });

  it("a drain that errors answers 500 ok:false, so the host clock row turns red", async () => {
    drainPodOrderInbox.mockResolvedValueOnce({ processed: 0, blocked: false, error: "db down" } as never);
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "db down" });
  });

  it.each([[undefined], ["Bearer wrong"], [`Basic ${TOKEN}`]])("missing or wrong credentials (%s): 401, nothing scheduled", async (auth) => {
    const res = await call(auth);
    expect(res.status).toBe(401);
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
  });

  it("token unset on the server: 401 to everyone (fail closed)", async () => {
    delete process.env.POD_INBOX_SWEEP_TOKEN;
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(401);
  });

  it("no DB client: 503, nothing scheduled", async () => {
    getSupabaseWriteClient.mockReturnValueOnce(null);
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(503);
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
  });
});
